/**
 * `npm run dev`: run the playground locally.
 *
 * 0. Create `.dev.vars` from `.dev.vars.example` with a random SESSION_SECRET when it's missing,
 *    and stop when SESSION_SECRET is empty. Without it the worker doesn't proxy at all and only
 *    serves the framework's landing page.
 * 1. Warn when `@startup-api/cloudflare` is the published package instead of an `npm link` to a
 *    local checkout (see README.md).
 * 2. Re-sync the framework's static assets (`public/users/**`) from that package, so edits to the
 *    framework's admin and power-strip files show up on restart.
 * 3. Check that the playground's ports are free, then start the StartupAPI worker and the origin
 *    app (origin/) together, and stop both when either exits or on Ctrl+C.
 */
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

// The HTTP ports are set in wrangler.jsonc and origin/wrangler.jsonc; keep them in sync with these.
const PORTS = {
  worker: 8273,
  origin: 8274,
  workerInspector: 9273,
  originInspector: 9274,
};

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

if (!existsSync('.dev.vars')) {
  const secret = randomBytes(32).toString('hex');
  writeFileSync('.dev.vars', readFileSync('.dev.vars.example', 'utf8').replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`));
  console.log('[dev] Created .dev.vars from .dev.vars.example with a random SESSION_SECRET.');
}
const sessionSecret = readFileSync('.dev.vars', 'utf8').match(/^SESSION_SECRET=["']?([^"'\n]*)["']?\s*$/m)?.[1];
if (!sessionSecret) {
  console.error('[dev] SESSION_SECRET is empty in .dev.vars. Set it to a random string, e.g. the output of `openssl rand -hex 32`.');
  process.exit(1);
}

const pkgDir = join(process.cwd(), 'node_modules', '@startup-api', 'cloudflare');
let linked = false;
try {
  linked = lstatSync(pkgDir).isSymbolicLink();
} catch {
  console.error('[dev] @startup-api/cloudflare is not installed. Run `npm install` and `npm run link`.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
if (linked) {
  console.log(`[dev] Using local @startup-api/cloudflare ${version} from ${realpathSync(pkgDir)}`);
} else {
  console.warn(
    `[dev] WARNING: using the published @startup-api/cloudflare ${version}, not your local checkout.\n` +
      '[dev] Run `npm run link` to test local framework changes.',
  );
}

const busy = [];
for (const [name, port] of Object.entries(PORTS)) {
  if (!(await isPortFree(port))) busy.push(`${port} (${name})`);
}
if (busy.length) {
  console.error(`[dev] Port already in use: ${busy.join(', ')}. Stop whatever is using it, e.g. another \`npm run dev\`.`);
  process.exit(1);
}

const sync = spawnSync(process.execPath, ['scripts/sync-assets.mjs'], { stdio: 'inherit' });
if (sync.status !== 0) process.exit(sync.status ?? 1);

const wrangler = join('node_modules', '.bin', 'wrangler');
const children = [
  // Each `wrangler dev` needs its own inspector (debugger) port.
  spawn(wrangler, ['dev', '-c', 'origin/wrangler.jsonc', '--inspector-port', String(PORTS.originInspector)], { stdio: 'inherit' }),
  spawn(wrangler, ['dev', '--inspector-port', String(PORTS.workerInspector)], { stdio: 'inherit' }),
];

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
