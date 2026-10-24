import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomsService } from './rooms.service';
const input = {
  nickname: 'Хозяин',
  category: 'animation',
  mode: 'mix',
} as const;
afterEach(() => vi.useRealTimers());
describe('rooms', () => {
  it('does not expose credentials and refuses a foreign token', () => {
    const service = new RoomsService();
    const a = service.create(input);
    const b = service.create(input);
    expect(() => service.authenticate(a.code, b.token)).toThrow();
    expect(JSON.stringify(service.snapshot(a.code))).not.toContain(a.token);
    expect(JSON.stringify(service.snapshot(a.code))).not.toContain('tokenHash');
  });
  it('preserves identity after reconnect and handles multiple tabs', () => {
    const s = new RoomsService();
    const a = s.create(input);
    s.connect(a.code, a.token, 'one');
    s.connect(a.code, a.token, 'two');
    s.ready(a.code, a.token, true);
    s.disconnect(a.code, 'one');
    expect(s.snapshot(a.code).players[0]).toMatchObject({
      ready: true,
      connected: true,
    });
    s.disconnect(a.code, 'two');
    expect(s.snapshot(a.code).players[0]).toMatchObject({
      ready: false,
      connected: false,
    });
    expect(s.connect(a.code, a.token, 'three')).toBe(a.playerId);
    expect(s.snapshot(a.code).players).toHaveLength(1);
  });
  it('enforces capacity and unique nicknames', () => {
    const s = new RoomsService();
    const a = s.create(input);
    expect(() => s.join(a.code, 'хозяин')).toThrow();
    for (let i = 0; i < 7; i++) s.join(a.code, `Игрок ${i}`);
    expect(() => s.join(a.code, 'Лишний')).toThrow();
  });
  it('transfers host on explicit departure and revokes membership', () => {
    const s = new RoomsService();
    const a = s.create(input);
    const b = s.join(a.code, 'Друг');
    s.leave(a.code, a.token);
    expect(s.snapshot(a.code).hostId).toBe(b.playerId);
    expect(() => s.authenticate(a.code, a.token)).toThrow();
    s.leave(b.code, b.token);
    expect(() => s.snapshot(a.code)).toThrow();
  });
  it('removes an abandoned party after a reconnect grace period', () => {
    vi.useFakeTimers();
    try {
      const s = new RoomsService();
      const a = s.create(input);
      s.connect(a.code, a.token, 'socket-a');
      s.disconnect(a.code, 'socket-a');
      vi.advanceTimersByTime(30000);
      s.connect(a.code, a.token, 'socket-b');
      vi.advanceTimersByTime(31000);
      expect(s.snapshot(a.code).players).toHaveLength(1);
      s.disconnect(a.code, 'socket-b');
      vi.advanceTimersByTime(60001);
      expect(() => s.snapshot(a.code)).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
  it('expires rooms after two hours', () => {
    vi.useFakeTimers();
    const s = new RoomsService();
    const a = s.create(input);
    vi.advanceTimersByTime(7200001);
    expect(() => s.snapshot(a.code)).toThrow();
  });
});

it('lists only public custom lobbies and never exposes membership tokens', () => {
  const rooms = new RoomsService();
  const privateRoom = rooms.create({
    nickname: 'Private',
    category: 'movies',
    mode: 'frames',
  });
  const publicRoom = rooms.create({
    nickname: 'Public',
    category: 'movies',
    mode: 'frames',
    visibility: 'public',
  });
  const list = rooms.directory();
  expect(list.map((r) => r.code)).toEqual([publicRoom.code]);
  expect(JSON.stringify(list)).not.toContain(privateRoom.code);
  expect(JSON.stringify(list)).not.toContain(publicRoom.token);
});
