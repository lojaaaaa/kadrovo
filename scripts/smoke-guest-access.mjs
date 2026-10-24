import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { io } = require('socket.io-client');
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const sockets = [];
async function actor() {
  const r = await fetch(base + '/api/experience');
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
async function request(cookie, path, method = 'GET', body, status = 200) {
  const r = await fetch(base + '/api/' + path, {
    method,
    headers: {
      cookie,
      Origin: base,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
const summary = (c) => request(c, 'experience');
function connected(session) {
  const socket = io(base, {
    auth: { code: session.code, token: session.token },
    transports: ['websocket'],
    autoConnect: false,
  });
  sockets.push(socket);
  socket.on('room:snapshot', (value) => (socket.latest = value));
  socket.connect();
  return socket;
}
async function playing(socket) {
  for (let i = 0; i < 150; i++) {
    if (socket.latest?.game?.phase === 'playing') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Game did not start');
}
async function leave(socket) {
  assert.deepEqual(await socket.timeout(5000).emitWithAck('room:leave'), {
    ok: true,
  });
  socket.disconnect();
}
try {
  const a = await actor(),
    b = await actor();
  for (let n = 0; n < 5; n++) {
    const session = await request(
      a,
      'rooms',
      'POST',
      {
        nickname: 'Guest test',
        format: 'solo',
        mode: 'frames',
        category: 'movies',
        source: 'catalog',
        totalRounds: 3,
        roundSeconds: 15,
      },
      201,
    );
    const socket = connected(session);
    await playing(socket);
    assert.equal((await summary(a)).access.soloRemaining, 4 - n);
    await leave(socket);
  }
  const denied = await request(
    a,
    'rooms',
    'POST',
    {
      nickname: 'Guest test',
      format: 'solo',
      mode: 'frames',
      category: 'movies',
      source: 'catalog',
    },
    403,
  );
  assert.equal(denied.code, 'GUEST_LIMIT');
  assert.equal(denied.loginUrl, '/account?reason=guest-solo');
  assert.equal((await summary(a)).access.soloRemaining, 0);
  await request(a, 'battle', 'POST', undefined, 401);
  const publicDenied = await request(
    a,
    'rooms',
    'POST',
    {
      nickname: 'Guest test',
      format: 'party',
      visibility: 'public',
      mode: 'frames',
      category: 'movies',
      source: 'catalog',
    },
    403,
  );
  assert.equal(publicDenied.code, 'ACCOUNT_REQUIRED');
  await request(a, 'battle/quick', 'POST', { kind: 'duel' }, 201);
  await request(a, 'battle/quick', 'DELETE');
  assert.equal((await summary(a)).access.onlineRemaining, 3);
  for (let n = 0; n < 3; n++) {
    await request(a, 'battle/quick', 'POST', { kind: 'duel' }, 201);
    const second = await request(
      b,
      'battle/quick',
      'POST',
      { kind: 'duel' },
      201,
    );
    const first = await request(a, 'battle/quick');
    assert.equal(first.status, 'matched');
    assert.equal(second.status, 'matched');
    const one = connected(first.session),
      two = connected(second.session);
    await Promise.all([playing(one), playing(two)]);
    assert.equal((await summary(a)).access.onlineRemaining, 2 - n);
    assert.equal((await summary(b)).access.onlineRemaining, 2 - n);
    await leave(one);
    await leave(two);
  }
  const blocked = await request(
    a,
    'battle/quick',
    'POST',
    { kind: 'duel' },
    403,
  );
  assert.equal(blocked.code, 'GUEST_LIMIT');
  assert.equal(blocked.loginUrl, '/account?reason=guest-online');
  assert.equal((await summary(a)).access.onlineRemaining, 0);
  const company = await Promise.all(Array.from({ length: 4 }, () => actor()));
  for (const cookie of company.slice(0, 2))
    await request(cookie, 'battle/quick', 'POST', { kind: 'group' }, 201);
  await new Promise((resolve) => setTimeout(resolve, 8200));
  assert.equal((await request(company[0], 'battle/quick')).status, 'waiting');
  for (const cookie of company.slice(2))
    await request(cookie, 'battle/quick', 'POST', { kind: 'group' }, 201);
  assert.equal((await request(company[0], 'battle/quick')).required, 3);
  await new Promise((resolve) => setTimeout(resolve, 8200));
  const gathered = await Promise.all(
    company.map((cookie) => request(cookie, 'battle/quick')),
  );
  assert(gathered.every((s) => s.status === 'matched'));
  assert.equal(new Set(gathered.map((s) => s.session.code)).size, 1);
  const companySockets = gathered.map((s) => connected(s.session));
  await Promise.all(companySockets.map(playing));
  assert.equal(companySockets[0].latest.game.standings.length, 4);
  assert.equal(companySockets[0].latest.minimumPlayers, 3);
  for (const socket of companySockets) await leave(socket);
  console.log(
    'Guest access passed: company waits with two and gathers four; five solo starts, three unranked matches, cancellation is free, limits survive reload, public/ranked require login.',
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
