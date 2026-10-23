import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { contentDirectory } from './publish';
const schema = z.object({
  lastAttempt: z.number(),
  index: z.number().int().min(0).max(2),
  cursors: z.record(z.string(), z.string().max(8000)),
  blocked: z
    .object({ until: z.number(), fingerprint: z.string(), status: z.number() })
    .optional(),
});
export type SyncCheckpoint = z.infer<typeof schema>;
export const credentialFingerprint = (provider: string, key: string) =>
  provider + ':' + createHash('sha256').update(key).digest('hex');
export function markBlocked(
  state: SyncCheckpoint,
  fingerprint: string,
  error: unknown,
  now = Date.now(),
) {
  const status =
    error instanceof Error
      ? Number(error.message.match(/HTTP\s+(401|402|403|429)\b/)?.[1])
      : 0;
  if (!status) return false;
  state.lastAttempt = now;
  state.blocked = { until: now + 24 * 60 * 60 * 1000, fingerprint, status };
  return true;
}
export function checkpointReady(
  state: SyncCheckpoint,
  fingerprint: string,
  now = Date.now(),
) {
  if (state.blocked) {
    if (state.blocked.fingerprint === fingerprint && state.blocked.until > now)
      return false;
    delete state.blocked;
    state.lastAttempt = 0;
  }
  return true;
}
export async function readCheckpoint(): Promise<SyncCheckpoint> {
  try {
    return schema.parse(
      JSON.parse(
        await readFile(join(contentDirectory(), 'sync-state.json'), 'utf8'),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { lastAttempt: 0, index: 0, cursors: {} };
  }
}
export async function saveCheckpoint(state: SyncCheckpoint) {
  const dir = contentDirectory();
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'sync-state.json');
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(state));
  await rename(temp, file);
}
