import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CatalogStore } from '../content/store';
import { AuthService } from '../auth/auth.service';
const base = process.env.QUEUE_TEST_BASE ?? 'http://gateway';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const store = new CatalogStore();
const auth = new AuthService(store);
const actors: { id: string; cookie: string }[] = [];
async function call(
  actor: (typeof actors)[number],
  path: string,
  method = 'GET',
  body?: unknown,
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      Cookie: actor.cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
async function main() {
  try {
    for (let i = 0; i < 2; i++) {
      const account = await store.db.account.create({
        data: { nickname: `Queue QA ${randomUUID().slice(0, 8)}` },
      });
      actors.push({
        id: account.id,
        cookie: `filmless_session=${await auth.issue(account.id)}`,
      });
    }
    const [a, b] = actors as [(typeof actors)[number], (typeof actors)[number]];
    await call(a, 'battle/quick', 'POST', { kind: 'duel' });
    await call(a, 'battle', 'POST');
    await call(b, 'battle/quick', 'POST', { kind: 'duel' });
    assert.equal((await call(a, 'battle')).status, 'waiting');
    assert.equal((await call(a, 'battle/quick')).status, 'idle');
    assert.equal((await call(b, 'battle/quick')).status, 'waiting');
    await call(a, 'battle', 'DELETE');
    await call(b, 'battle/quick', 'DELETE');
    await call(a, 'battle', 'POST');
    await call(a, 'battle/quick', 'POST', { kind: 'duel' });
    await call(b, 'battle', 'POST');
    assert.equal((await call(a, 'battle')).status, 'idle');
    assert.equal((await call(a, 'battle/quick')).status, 'waiting');
    assert.equal((await call(b, 'battle')).status, 'waiting');
    console.log(
      'Two-account HTTP isolation passed in both directions: ranked and unranked never match each other; old searches are removed.',
    );
  } finally {
    for (const actor of actors)
      for (const path of ['battle', 'battle/quick'])
        await call(actor, path, 'DELETE').catch(() => undefined);
    await store.db.account.deleteMany({
      where: { id: { in: actors.map((a) => a.id) } },
    });
    auth.onModuleDestroy();
    await store.onModuleDestroy();
  }
}
void main().catch((error) => {
  console.error(
    'Queue isolation failed:',
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database]')
      : 'Unknown error',
  );
  process.exitCode = 1;
});
