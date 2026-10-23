import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { clearTimeout } from 'node:timers';
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { io } = require('socket.io-client');
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const sockets = [];
let latest, personal, other;
const seen = new Set();
const listeners = new Set();
async function post(path, body) {
  const r = await fetch(`${base}/api/rooms${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 201);
  return r.json();
}
function connect(s) {
  const socket = io(base, {
    auth: { code: s.code, token: s.token },
    transports: ['websocket'],
    autoConnect: false,
  });
  sockets.push(socket);
  return socket;
}
function waitFor(predicate, ms = 8000) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        clearTimeout(timer);
        listeners.delete(check);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error('Game state timeout'));
    }, ms);
    listeners.add(check);
  });
}
function notify() {
  for (const f of listeners) f();
}
const emit = (s, event, body) =>
  body === undefined
    ? s.timeout(5000).emitWithAck(event)
    : s.timeout(5000).emitWithAck(event, body);
try {
  const host = await post('', {
    nickname: 'Тест игры',
    category: 'movies',
    mode: 'mix',
    roundSeconds: 30,
  });
  const guest = await post(`/${host.code}/join`, { nickname: 'Второй игрок' });
  const a = connect(host),
    b = connect(guest);
  b.on('room:snapshot', (state) => {
    other = state;
    notify();
  });
  a.on('room:snapshot', (s) => {
    latest = s;
    if (s.game)
      seen.add(`${s.game.roundNumber}:${s.game.phase}:${s.game.stage}`);
    notify();
  });
  a.on('game:personal', (s) => {
    personal = s;
    notify();
  });
  a.connect();
  b.connect();
  await waitFor(() => latest?.players.every((p) => p.connected));
  assert.equal((await emit(b, 'game:start')).ok, false);
  await emit(a, 'room:ready', { ready: true });
  await emit(b, 'room:ready', { ready: true });
  assert.deepEqual(await emit(a, 'game:start'), { ok: true });
  await waitFor(() => latest?.game?.phase === 'playing');
  const matchId = latest.game.matchId,
    roundId = latest.game.roundId;
  assert.equal(latest.game.answer, undefined);
  await waitFor(() => other?.game?.phase === 'playing');
  const opponentDeadline = other.game.endsAt;
  assert.equal((await emit(a, 'game:hint', { roundId, stage: 1 })).ok, true);
  await waitFor(() => latest.game.stage === 1);
  assert.equal(latest.game.possibleScore, 16);
  assert.equal(other.game.stage, 0);
  assert.equal(other.game.endsAt, opponentDeadline);
  const ownDeadline = latest.game.endsAt;
  assert.equal((await emit(a, 'game:hint', { roundId, stage: 0 })).ok, true);
  await waitFor(() => latest.game.stage === 0);
  assert.equal(latest.game.endsAt, ownDeadline);
  assert.equal(latest.game.possibleScore, 16);
  assert.match(latest.game.image, /^data:image\/png;base64,/);
  assert.equal(
    (await emit(a, 'game:search', { query: 'НАЧ' })).titles[0].name,
    'Начало',
  );
  assert.equal(
    (
      await emit(a, 'game:answer', {
        roundId,
        commandId: randomUUID(),
        titleId: 'demo-4',
      })
    ).status,
    'incorrect',
  );
  await waitFor(() => personal?.nextAllowedAt > Date.now());
  const cooldown = personal.nextAllowedAt;
  a.disconnect();
  a.connect();
  await waitFor(() => a.connected && personal?.nextAllowedAt === cooldown);
  assert.equal(
    (
      await emit(a, 'game:answer', {
        roundId,
        commandId: randomUUID(),
        titleId: 'demo-1',
      })
    ).status,
    'cooldown',
  );
  await delay(Math.max(0, cooldown - Date.now() + 50));
  let correctId, accepted;
  for (const titleId of ['demo-1', 'demo-2', 'demo-3']) {
    const command = { roundId, commandId: randomUUID(), titleId };
    const result = await emit(a, 'game:answer', command);
    if (result.status === 'correct') {
      correctId = titleId;
      accepted = result;
      assert.deepEqual(await emit(a, 'game:answer', command), result);
      break;
    }
    assert.equal(result.status, 'incorrect');
    await delay(Math.max(0, result.nextAllowedAt - Date.now() + 50));
  }
  assert.ok(correctId);
  assert.equal(latest.game.phase, 'playing');
  assert.equal(
    latest.game.standings.find((p) => p.playerId === host.playerId).score,
    accepted.score,
  );
  assert.equal(
    (
      await emit(b, 'game:answer', {
        roundId,
        commandId: randomUUID(),
        titleId: correctId,
      })
    ).status,
    'correct',
  );
  await waitFor(() => latest.game.phase === 'reveal');
  for (let round = 2; round <= 3; round++) {
    await waitFor(
      () =>
        latest.game.phase === 'playing' && latest.game.roundNumber === round,
    );
    const id = latest.game.roundId;
    for (let stage = 1; stage <= 4; stage++) {
      assert.equal(
        (await emit(a, 'game:hint', { roundId: id, stage })).ok,
        true,
      );
      assert.equal(
        (await emit(b, 'game:hint', { roundId: id, stage })).ok,
        true,
      );
      await waitFor(
        () => latest.game.stage === stage && other.game.stage === stage,
      );
    }
    assert.equal(latest.game.possibleScore, 4);
    await waitFor(() => latest.game.phase === 'reveal', 15000);
  }
  await waitFor(() => latest.game.phase === 'finished', 5000);
  assert.equal(latest.game.roundNumber, 3);
  for (let round = 1; round <= 3; round++)
    assert.ok(seen.has(`${round}:reveal:4`));
  assert.equal(
    (
      await emit(a, 'game:answer', {
        roundId,
        commandId: randomUUID(),
        titleId: correctId,
      })
    ).ok,
    false,
  );
  await emit(a, 'room:ready', { ready: true });
  await emit(b, 'room:ready', { ready: true });
  assert.deepEqual(await emit(a, 'game:start'), { ok: true });
  assert.notEqual(latest.game.matchId, matchId);
  assert.ok(latest.game.standings.every((p) => p.score === 0));
  await emit(a, 'room:leave');
  await emit(b, 'room:leave');
  console.log(
    'Full game smoke passed: personal hints, time penalties, reveals, final scores and rematch.',
  );
} finally {
  for (const s of sockets) s.disconnect();
}
