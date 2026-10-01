#!/usr/bin/env node
// Serves the production build (vite preview) in the background – for the browser checks in scripts/qa.
//
//   node scripts/serve.mjs start [port]     (default 4173; needs `npm run build` first)
//   node scripts/serve.mjs stop  [port]
//   node scripts/serve.mjs status [port]
//
// The process id is kept in a file, so stopping never has to search for processes by name
// (`pkill -f vite` can also kill the shell that runs the command).
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, ROOT } from './lib.mjs';

const [command = 'status', portArg] = process.argv.slice(2);
const port = Number(portArg ?? 4173);
const pidFile = join(tmpdir(), `bandorganizer-preview-${port}.pid`);
const logFile = join(tmpdir(), `bandorganizer-preview-${port}.log`);
const url = `http://localhost:${port}/BandOrganizer/`;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readPid = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : null);
const responds = () => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);

if (command === 'start') {
  const old = readPid();
  if (old && alive(old) && (await responds())) {
    console.log(`already running: ${url} (pid ${old})`);
    process.exit(0);
  }
  if (!exists('dist/index.html')) {
    console.error('dist/ is missing – run `npm run build` first.');
    process.exit(1);
  }
  const log = openSync(logFile, 'w');
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 40; i++) {
    if (await responds()) {
      console.log(`serving ${url} (pid ${child.pid})`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.error(`did not start – see ${logFile}`);
  process.exit(1);
} else if (command === 'stop') {
  const pid = readPid();
  if (pid && alive(pid)) {
    try {
      process.kill(-pid); // the whole process group (detached)
    } catch {
      process.kill(pid);
    }
    console.log(`stopped pid ${pid}`);
  } else console.log('not running');
  rmSync(pidFile, { force: true });
} else {
  const pid = readPid();
  console.log(pid && alive(pid) && (await responds()) ? `running: ${url} (pid ${pid})` : 'not running');
}
