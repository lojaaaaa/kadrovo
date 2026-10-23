import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseSoundSettings,
  setSoundSettings,
  unlockSound,
  playSound,
} from './sound';
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('sound preferences', () => {
  it('recovers from invalid storage and bounds the volume', () => {
    expect(parseSoundSettings('{broken')).toEqual({
      enabled: true,
      volume: 0.3,
    });
    expect(parseSoundSettings('{"enabled":false,"volume":9}')).toEqual({
      enabled: false,
      volume: 1,
    });
    expect(parseSoundSettings('{"enabled":true,"volume":-1}').volume).toBe(0);
    expect(parseSoundSettings('{"enabled":"yes","volume":0.8}').volume).toBe(
      0.3,
    );
  });
  it('deduplicates events, respects mute/hidden tabs and tolerates disabled storage', () => {
    const start = vi.fn(),
      gain = {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      };
    const oscillator = () => ({
      frequency: gain,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start,
      stop: vi.fn(),
    });
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        createGain() {
          return { gain, connect: vi.fn(), disconnect: vi.fn() };
        }
        createOscillator() {
          return oscillator();
        }
      },
    );
    setSoundSettings({ enabled: true, volume: 0.3 });
    unlockSound();
    playSound('correct', 'round-test');
    playSound('correct', 'round-test');
    expect(start).toHaveBeenCalledTimes(3);
    setSoundSettings({ enabled: false, volume: 0.3 });
    playSound('click');
    expect(start).toHaveBeenCalledTimes(3);
    setSoundSettings({ enabled: true, volume: 0.3 });
    vi.stubGlobal('document', { hidden: true });
    playSound('tick');
    expect(start).toHaveBeenCalledTimes(3);
  });
});
