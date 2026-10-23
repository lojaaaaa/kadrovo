import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// A single public origin keeps cookies, OAuth and Socket.IO on the same host.
const env = {
  ...process.env,
  WEB_ORIGIN: process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL,
  API_HOST: '127.0.0.1',
  API_PORT: '3001',
  HOSTNAME: '127.0.0.1',
  CONTENT_DIR: process.env.CONTENT_DIR || '/app/data/content',
  TRUST_PROXY: '1',
};
if (!env.DATABASE_URL || !env.WEB_ORIGIN) {
  throw new Error(
    'DATABASE_URL and WEB_ORIGIN (or RENDER_EXTERNAL_URL) are required',
  );
}
await mkdir(env.CONTENT_DIR, { recursive: true });
const migration = spawn('pnpm', ['--filter', '@filmless/api', 'db:migrate'], {
  env,
  stdio: 'inherit',
});
await new Promise((resolve, reject) => {
  migration.on('error', reject);
  migration.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`Migration failed: ${code}`)),
  );
});
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 8000);
  timer.unref();
  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once('exit', resolve);
        }),
    ),
  ).then(() => process.exit(code));
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
for (const [command, args] of [
  ['node', ['apps/api/dist/main.js']],
  ['pnpm', ['--filter', '@filmless/web', 'start']],
  [
    'caddy',
    [
      'run',
      '--config',
      '/app/infra/Caddyfile.render',
      '--adapter',
      'caddyfile',
    ],
  ],
]) {
  const child = spawn(command, args, { env, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
