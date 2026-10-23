import { clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { io } = require('socket.io-client');
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const sockets = [];
async function post(path, body) {
  const response = await fetch(`${base}/api/rooms${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  return response.json();
}
function connect(session) {
  const socket = io(base, {
    auth: { code: session.code, token: session.token },
    transports: ['websocket'],
    autoConnect: false,
  });
  sockets.push(socket);
  return socket;
}
function snapshot(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('room:snapshot', listener);
      reject(new Error('Snapshot timeout'));
    }, 8000);
    function listener(value) {
      if (predicate(value)) {
        clearTimeout(timer);
        socket.off('room:snapshot', listener);
        resolve(value);
      }
    }
    socket.on('room:snapshot', listener);
  });
}
try {
  const host = await post('', {
    nickname: 'Проверка',
    category: 'movies',
    mode: 'mix',
    roundSeconds: 30,
  });
  const guest = await post(`/${host.code}/join`, { nickname: 'Гость' });
  const a = connect(host),
    b = connect(guest);
  const joined = snapshot(
    a,
    (s) => s.players.length === 2 && s.players.every((p) => p.connected),
  );
  a.connect();
  b.connect();
  const initial = await joined;
  assert.equal(initial.hostId, host.playerId);
  assert.equal(initial.roundSeconds, 30);
  for (const query of ['матриа', 'мартрица', 'Матрица']) {
    const search = await a.timeout(5000).emitWithAck('game:search', { query });
    assert.equal(search.ok, true);
    assert.equal(search.titles[0]?.name, 'Матрица');
    assert.ok(search.titles.every((title) => title.category === 'movies'));
    assert.ok(search.titles.every((title) => !('poster' in title)));
  }
  assert.ok(!JSON.stringify(initial).includes(host.token));
  const ready = snapshot(
    a,
    (s) => s.players.find((p) => p.id === guest.playerId)?.ready,
  );
  assert.deepEqual(
    await b.timeout(5000).emitWithAck('room:ready', { ready: true }),
    { ok: true },
  );
  await ready;
  const offline = snapshot(
    a,
    (s) => !s.players.find((p) => p.id === guest.playerId)?.connected,
  );
  b.disconnect();
  await offline;
  const rejoined = snapshot(
    a,
    (s) => s.players.find((p) => p.id === guest.playerId)?.connected,
  );
  b.connect();
  assert.equal((await rejoined).players.length, 2);
  const transferred = snapshot(
    b,
    (s) => s.hostId === guest.playerId && s.players.length === 1,
  );
  assert.deepEqual(await a.timeout(5000).emitWithAck('room:leave'), {
    ok: true,
  });
  await transferred;
  await b.timeout(5000).emitWithAck('room:leave');
  console.log(
    'Room smoke passed: create, join, WebSocket, ready, reconnect, host transfer, leave.',
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
