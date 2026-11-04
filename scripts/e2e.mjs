// npm run e2e — fresh-seeds a dedicated DB, starts the stack (API :4000 + Vite :5173 by default), runs
// docs/modules/core.spec.mjs and every docs/modules/<key>.spec.mjs against it, prints a pass/fail table and
// stops the stack. Exit code 1 when any spec fails.
//
//   npm run e2e                               # all specs
//   npm run e2e -- listings chat              # a subset (core always runs first unless --no-core)
//   E2E_KEEP_DB=1 npm run e2e                 # reuse server/data/e2e.db instead of re-seeding
//   PORT=4300 VITE_PORT=5300 npm run e2e      # other ports (specs read WEB_PORT)
//
// Env passed to the server: GEOCODE_OFFLINE=1 (no Nominatim), RATE_LIMIT_DISABLED=1 (specs hammer the API).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(process.env.PORT || 4000);
const WEB_PORT = Number(process.env.VITE_PORT || process.env.WEB_PORT || 5173);
const DB_PATH = process.env.E2E_DB || 'server/data/e2e.db';
const MODULES = ['listings', 'wanted', 'chat', 'verify', 'map', 'shuttle', 'market', 'buddy', 'billing', 'admin'];
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const noCore = process.argv.includes('--no-core');
const specs = [...(noCore ? [] : ['core']), ...(args.length ? MODULES.filter((m) => args.includes(m)) : MODULES)];
const LOG_DIR = path.join(ROOT, 'server', 'data', 'e2e-logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const baseEnv = { ...process.env, GEOCODE_OFFLINE: '1', RATE_LIMIT_DISABLED: '1', DB_PATH, PORT: String(API_PORT), VITE_PORT: String(WEB_PORT), VITE_API_TARGET: `http://127.0.0.1:${API_PORT}`, WEB_PORT: String(WEB_PORT), FORCE_COLOR: '0' };
const children = [];

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
function run(cmd, argv, { env = baseEnv, log, background = false } = {}) {
  const out = log ? fs.openSync(path.join(LOG_DIR, log), 'w') : 'inherit';
  const child = spawn(cmd, argv, { cwd: ROOT, env, stdio: ['ignore', out, out], detached: background });
  if (background) children.push(child);
  return child;
}
function wait(child) {
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}
async function waitHttp(url, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function stopAll() {
  for (const c of children) {
    try { process.kill(-c.pid, 'SIGTERM'); } catch {}
  }
}
process.on('SIGINT', () => { stopAll(); process.exit(130); });

for (const p of [API_PORT, WEB_PORT]) {
  if (!(await portFree(p))) { console.error(`[e2e] port ${p} is busy — stop the running stack first (or set PORT / VITE_PORT)`); process.exit(2); }
}

if (!process.env.E2E_KEEP_DB) {
  for (const f of fs.readdirSync(path.join(ROOT, path.dirname(DB_PATH)))) if (f.startsWith(path.basename(DB_PATH))) fs.rmSync(path.join(ROOT, path.dirname(DB_PATH), f));
}
console.log(`[e2e] seeding ${DB_PATH}`);
if (await wait(run('npm', ['run', 'seed', '--silent'], { log: 'seed.log' })) !== 0) { console.error('[e2e] seed failed — see server/data/e2e-logs/seed.log'); process.exit(1); }

console.log(`[e2e] starting API :${API_PORT} and web :${WEB_PORT}`);
run('npm', ['start', '-w', 'server'], { env: { ...baseEnv, NODE_ENV: 'development' }, log: 'server.log', background: true });
run('npx', ['vite', '--config', 'web/vite.config.ts', '--port', String(WEB_PORT), '--strictPort'], { log: 'web.log', background: true });
const up = (await waitHttp(`http://127.0.0.1:${API_PORT}/api/meta`)) && (await waitHttp(`http://127.0.0.1:${WEB_PORT}/`));
if (!up) { console.error('[e2e] stack did not come up — see server/data/e2e-logs/{server,web}.log'); stopAll(); process.exit(1); }

const results = [];
for (const key of specs) {
  const t0 = Date.now();
  process.stdout.write(`[e2e] ${key.padEnd(9)} … `);
  const code = await wait(run('node', [`docs/modules/${key}.spec.mjs`], { log: `${key}.log` }));
  const sec = Math.round((Date.now() - t0) / 1000);
  results.push({ key, ok: code === 0, sec });
  console.log(`${code === 0 ? 'PASS' : 'FAIL'} (${sec}s)${code === 0 ? '' : ` — server/data/e2e-logs/${key}.log`}`);
}
stopAll();

const failed = results.filter((r) => !r.ok);
console.log(`\n[e2e] ${results.length - failed.length}/${results.length} specs passed${failed.length ? ` · failed: ${failed.map((r) => r.key).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
