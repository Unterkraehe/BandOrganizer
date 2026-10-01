// Shared helpers for the maintenance scripts (Node only, no dependencies).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root – scripts work from any current directory (running `tsc -b` in src/ fails otherwise). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** Runs a command in the repo root, returns { ok, seconds, output }. */
export function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32', ...options });
  return {
    ok: result.status === 0,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    // A missing program (e.g. npx not on PATH) gives no output at all – say so instead of failing silently.
    output: result.error ? `${command}: ${result.error.message}` : `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status,
  };
}

export const tail = (text, lines = 40) => text.trimEnd().split('\n').slice(-lines).join('\n');
export const exists = (path) => existsSync(join(ROOT, path));
