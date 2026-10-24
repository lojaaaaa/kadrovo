import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
async function actor() {
  const r = await fetch(base + '/api/experience');
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie')?.split(';')[0] ?? '';
}
async function call(cookie, body, status = 200, origin = base) {
  const r = await fetch(base + '/api/chronology', {
    method: 'POST',
    headers: { cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
const a = await actor(),
  b = await actor();
const start = { action: 'start', commandId: randomUUID() };
let game = await call(a, start, 201);
assert.deepEqual(await call(a, start, 201), game);
assert.equal(game.total, 10);
assert.equal(game.challenger.year, undefined);
await call(b, { action: 'resume', sessionId: game.sessionId }, 404);
await call(a, { action: 'start' }, 403, 'https://untrusted.example');
await call(
  a,
  {
    action: 'answer',
    sessionId: game.sessionId,
    pairId: game.pairId,
    choice: 'earlier',
    commandId: randomUUID(),
    score: 1000,
  },
  400,
);
const seen = new Set([game.anchor.name]);
for (let round = 1; round <= 10; round++) {
  assert.equal(game.round, round);
  assert(!seen.has(game.challenger.name));
  seen.add(game.challenger.name);
  const answer = {
    action: 'answer',
    sessionId: game.sessionId,
    pairId: game.pairId,
    choice: 'earlier',
    commandId: randomUUID(),
  };
  const revealed = await call(a, answer, 201);
  assert.equal(typeof revealed.challenger.year, 'number');
  assert(revealed.score >= 0 && revealed.score <= round);
  assert.deepEqual(await call(a, answer, 201), revealed);
  await call(a, { ...answer, commandId: randomUUID() }, 409);
  if (round === 10) {
    assert.equal(revealed.phase, 'finished');
    break;
  }
  const next = {
    action: 'next',
    sessionId: game.sessionId,
    pairId: game.pairId,
  };
  game = await call(a, next, 201);
  assert.deepEqual(await call(a, next, 201), game);
  assert.equal(game.challenger.year, undefined);
}
console.log(
  'Chronology: 10 pairs, ownership, hidden years, one attempt, idempotency, CSRF and score validation passed.',
);
