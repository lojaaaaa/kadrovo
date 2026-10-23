// One-off operator tool. Inputs and progress remain in ignored .data/.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const base = process.env.TARGET_URL;
if (!base || !base.startsWith('https://'))
  throw new Error('TARGET_URL must use HTTPS');
const token = (await readFile('.data/transfer-token', 'utf8')).trim();
const titles = JSON.parse(
  await readFile('.data/catalog-transfer.json', 'utf8'),
);
let done;
try {
  done = new Set(
    JSON.parse(await readFile('.data/transfer-progress.json', 'utf8')),
  );
} catch {
  done = new Set();
}
async function post(path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(base + '/api/internal/catalog/' + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      if (r.ok) return;
      if (r.status >= 400 && r.status < 500)
        throw Object.assign(new Error('Transfer rejected: HTTP ' + r.status), {
          permanent: true,
        });
      throw new Error('Transfer temporarily unavailable: HTTP ' + r.status);
    } catch (error) {
      if (error.permanent || attempt === 4) throw error;
      await delay(1500 * 2 ** attempt);
    }
  }
}
let index = 0;
async function worker() {
  for (;;) {
    const t = titles[index++];
    if (!t) return;
    if (done.has(t.id)) continue;
    const files = [...new Set(t.puzzles.flatMap((p) => p.stageFiles))];
    for (const key of files) {
      if (!/^[a-f0-9-]{36}\/[0-4]\.webp$/.test(key))
        throw new Error('Invalid image path');
      const bytes = await readFile('.data/deploy-content/' + key);
      await post('file', { key, base64: bytes.toString('base64') });
    }
    await post('title', t);
    done.add(t.id);
    await writeFile('.data/transfer-progress.json', JSON.stringify([...done]));
    if (done.size % 25 === 0)
      console.log('Transferred titles:', done.size, '/', titles.length);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log('Catalog transfer complete:', done.size);
