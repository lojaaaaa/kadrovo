export type SoundCue =
  | 'click'
  | 'correct'
  | 'incorrect'
  | 'round'
  | 'hint'
  | 'tick'
  | 'reveal'
  | 'finish'
  | 'whoosh'
  | 'skip'
  | 'streak'
  | 'urgent';
type Settings = { enabled: boolean; volume: number };
const defaults: Settings = { enabled: true, volume: 0.3 };
let settings = defaults;
const listeners = new Set<() => void>();
let context: AudioContext | undefined;
let master: GainNode | undefined;
const played = new Set<string>();
const storageKey = 'filmless:sound';
const notes: Record<SoundCue, number[]> = {
  click: [640],
  correct: [523, 659, 784],
  incorrect: [220, 165],
  round: [392, 523],
  hint: [740],
  tick: [440],
  reveal: [523, 392],
  finish: [523, 659, 784, 1047],
  whoosh: [580, 420],
  skip: [300, 240],
  streak: [523, 659, 784, 1047, 1318],
  urgent: [660, 880],
};
export function parseSoundSettings(raw: string | null): Settings {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (
      typeof data?.enabled === 'boolean' &&
      typeof data?.volume === 'number' &&
      Number.isFinite(data.volume)
    )
      return {
        enabled: data.enabled,
        volume: Math.min(1, Math.max(0, data.volume)),
      };
  } catch {
    /* Invalid saved preference is harmless. */
  }
  return defaults;
}
function applyVolume() {
  if (context && master)
    master.gain.setValueAtTime(
      settings.enabled && !document.hidden ? settings.volume : 0,
      context.currentTime,
    );
}
export const subscribeSound = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSoundSettings = () => settings;
export const getServerSoundSettings = () => defaults;
export function setSoundSettings(next: Settings) {
  settings = {
    enabled: next.enabled,
    volume: Math.min(1, Math.max(0, next.volume)),
  };
  applyVolume();
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    /* Still works without storage. */
  }
  for (const listener of listeners) listener();
}
export function loadSoundSettings() {
  try {
    settings = parseSoundSettings(localStorage.getItem(storageKey));
  } catch {
    settings = defaults;
  }
  applyVolume();
  for (const listener of listeners) listener();
}
// Called only from a user gesture, never from a timer or server event.
export function unlockSound() {
  if (!settings.enabled) return;
  try {
    context ??= new AudioContext();
    if (!master) {
      master = context.createGain();
      master.connect(context.destination);
      applyVolume();
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch {
    /* Unsupported/blocked audio must never interrupt the game. */
  }
}
export function playSound(cue: SoundCue, key?: string) {
  if (key) {
    if (played.has(key)) return;
    played.add(key);
    if (played.size > 256) played.delete(played.values().next().value!);
  }
  if (
    !settings.enabled ||
    !settings.volume ||
    document.hidden ||
    !context ||
    !master ||
    context.state !== 'running'
  )
    return;
  try {
    const duration = cue === 'click' || cue === 'tick' ? 0.045 : 0.11;
    notes[cue].forEach((frequency, i) => {
      const oscillator = context!.createOscillator(),
        gain = context!.createGain();
      const start = context!.currentTime + i * 0.095;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(master!);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    });
  } catch {
    /* Audio is optional feedback. */
  }
}
export function installSoundEvents() {
  loadSoundSettings();
  const gesture = () => unlockSound();
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button, a, [role="option"]');
    if (
      !button ||
      button.hasAttribute('disabled') ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.closest('[data-sound-settings]')
    )
      return;
    unlockSound();
    playSound('click');
  };
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) loadSoundSettings();
  };
  document.addEventListener('pointerdown', gesture);
  document.addEventListener('keydown', gesture);
  document.addEventListener('click', click);
  document.addEventListener('visibilitychange', applyVolume);
  window.addEventListener('storage', storage);
  return () => {
    document.removeEventListener('pointerdown', gesture);
    document.removeEventListener('keydown', gesture);
    document.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', applyVolume);
    window.removeEventListener('storage', storage);
  };
}
