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
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const sockets = [];
async function actor() {
  const r = await fetch(base + '/api/experience');
  assert.equal(r.status, 200, await r.text().then((t) => t.slice(0, 100)));
  return r.headers.get('set-cookie')?.split(';')[0] ?? '';
}
async function request(cookie, path, body) {
  const r = await fetch(base + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie,
      Origin: base,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(path + ': ' + JSON.stringify(data));
  return data;
}
async function connect(session) {
  const s = io(base, {
    auth: { code: session.code, token: session.token },
    transports: ['websocket'],
    autoConnect: false,
  });
  sockets.push(s);
  s.on('room:snapshot', (snap) => (s.latest = snap));
  s.connect();
  await wait(() => s.latest?.game);
  return s;
}
async function wait(fn) {
  for (let n = 0; n < 150; n++) {
    const v = fn();
    if (v) return v;
    await delay(100);
  }
  throw new Error('Timeout');
}
async function ack(s, event, data) {
  const r = await s.timeout(5000).emitWithAck(event, data);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
}
async function skipAll(s) {
  for (let n = 0; n < 100; n++) {
    const g = s.latest.game;
    if (g.phase === 'finished') return g;
    if (g.phase === 'playing')
      await ack(s, 'game:skip', { roundId: g.roundId });
    await delay(200);
  }
  throw new Error('Match did not finish');
}
try {
  const a = await actor(),
    b = await actor();
  assert.notEqual(a, b);
  const session = await request(a, 'rooms', {
    format: 'solo',
    nickname: 'Проверка',
    category: 'movies',
    mode: 'frames',
    source: 'catalog',
    answerMode: 'choices',
    totalRounds: 3,
    roundSeconds: 15,
  });
  const s = await connect(session);
  assert.equal(s.latest.game.choices.length, 4);
  assert.equal(s.latest.game.history, undefined);
  const end = await skipAll(s);
  assert.equal(end.history.length, 3);
  assert.equal(new Set(end.history.map((r) => r.title.id)).size, 3);
  const summary = await request(a, 'experience');
  assert(summary.seen >= 3);
  const titleId = end.history[0].title.id;
  await request(a, 'experience/watchlist', { titleId });
  assert(
    (await request(a, 'experience')).watchlist.some((t) => t.id === titleId),
  );
  const challenge = await request(a, 'experience/challenge', {
    code: session.code,
    token: session.token,
  });
  const same = await request(a, 'experience/challenge', {
    code: session.code,
    token: session.token,
  });
  assert.equal(same.id, challenge.id);
  const preview = await request(b, 'experience/challenge/' + challenge.id);
  assert.equal(preview.rounds, 3);
  assert(!('titleIds' in preview));
  const joined = await request(b, 'experience/challenge/' + challenge.id, {
    nickname: 'Друг',
  });
  const other = await connect(joined);
  const otherEnd = await skipAll(other);
  assert.deepEqual(
    otherEnd.history.map((r) => r.title.id),
    end.history.map((r) => r.title.id),
  );
  await delay(800); // allow DB writes, no provider calls
  const after = await request(b, 'experience/challenge/' + challenge.id);
  assert(after.played);
  assert.equal(after.results.length, 2);
  const daily = await request(a, 'rooms/daily', {});
  const dailyAgain = await request(a, 'rooms/daily', {});
  assert.equal(daily.code, dailyAgain.code);
  const ds = await connect(daily);
  await ack(ds, 'game:hint', { roundId: ds.latest.game.roundId, stage: 1 });
  await delay(300);
  const shortened = ds.latest.game.endsAt;
  ds.disconnect();
  const recovered = await request(a, 'rooms/daily', {});
  assert.equal(recovered.code, daily.code);
  const d2 = await connect(recovered);
  assert.equal(d2.latest.game.endsAt, shortened);
  await skipAll(d2);
  await delay(400);
  const dailyProgress = await request(a, 'experience');
  assert(dailyProgress.daily.some((v) => v.day === daily.day));
  await ack(d2, 'room:leave');
  d2.disconnect();
  const restored = await request(a, 'rooms/daily', {});
  const d3 = await connect(restored);
  assert.equal(d3.latest.game.phase, 'finished');
  console.log(
    'Passed: personal exposure, all-round review, watchlist, identical async challenge, first result, daily reconnect and recreated room checkpoint.',
  );
} finally {
  for (const s of sockets) {
    if (s.connected)
      await s
        .timeout(3000)
        .emitWithAck('room:leave')
        .catch(() => undefined);
    s.disconnect();
  }
}
