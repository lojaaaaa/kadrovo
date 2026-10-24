'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import {
  getSoundSettings,
  getServerSoundSettings,
  subscribeSound,
  setSoundSettings,
  installSoundEvents,
  unlockSound,
  playSound,
} from '@/lib/sound';
export function SoundControls() {
  const settings = useSyncExternalStore(
    subscribeSound,
    getSoundSettings,
    getServerSoundSettings,
  );
  useEffect(() => installSoundEvents(), []);
  return (
    <aside
      data-sound-settings
      className="relative z-30 flex shrink-0 items-center gap-1 rounded-xl border bg-background p-1"
      aria-label="Настройки звука"
    >
      <Button
        size="icon"
        variant="ghost"
        aria-label={settings.enabled ? 'Выключить звук' : 'Включить звук'}
        aria-pressed={settings.enabled}
        onClick={() => {
          setSoundSettings({ ...settings, enabled: !settings.enabled });
          unlockSound();
          playSound('click');
        }}
      >
        {settings.enabled && settings.volume > 0 ? <Volume2 /> : <VolumeX />}
      </Button>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center px-2 py-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
          <span className="sr-only">Громкость</span>
          <ChevronDown className="size-3" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border bg-background p-4 shadow-lg">
          <label htmlFor="sound-volume" className="text-sm">
            Эффекты · {Math.round(settings.volume * 100)}%
          </label>
          <input
            id="sound-volume"
            aria-label="Громкость эффектов"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.volume * 100)}
            className="mt-3 w-full accent-primary"
            onChange={(e) =>
              setSoundSettings({
                ...settings,
                volume: Number(e.target.value) / 100,
              })
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={!settings.enabled || !settings.volume}
            onClick={() => {
              unlockSound();
              playSound('correct');
            }}
          >
            Проверить звук
          </Button>
        </div>
      </details>
    </aside>
  );
}
