#!/usr/bin/env node
// Builds a delivery zip of the repository.
//
//   npm run pack -- --out <dir> [--docs-copy <dir>] [--suffix -tooling] [--no-check]
//
// - runs `npm run check` first (types, lint, code index, tests, build) unless --no-check
// - requires a "Was ist neu" entry for the current version (src/locales/de/whatsNew.json)
// - zips the repository as BandOrganizer/ → <out>/BandOrganizer-v<version><suffix>.zip
//   WITHOUT node_modules, dist, dev-dist, coverage, release, .git, *.tsbuildinfo and src/config.ts
//   (src/config.ts holds the band's own HiDrive client ID – a delivery must never overwrite it)
// - --docs-copy <dir>: replaces <dir> with a copy of docs/ (the planning folder handed out next to the zip)
// Needs the `zip` and `unzip` commands.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pkg, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const version = pkg().version;
const out = resolve(ROOT, option('--out') ?? 'release');
const suffix = option('--suffix') ?? '';
const docsCopy = option('--docs-copy');

const whatsNew = JSON.parse(readFileSync(join(ROOT, 'src/locales/de/whatsNew.json'), 'utf8'));
if (!whatsNew[version]) fail(`src/locales/de/whatsNew.json has no entry for version ${version} (add it as the first key).`);

if (!args.includes('--no-check')) {
  const check = spawnSync(process.execPath, [join(ROOT, 'scripts/check.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (check.status !== 0) fail('check failed – nothing was packed.');
}

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'dev-dist', 'coverage', 'release', '.git']);
const EXCLUDE_FILES = new Set(['src/config.ts']);
const excluded = (path) => {
  const rel = relative(ROOT, path).split('\\').join('/');
  if (!rel) return false;
  if (rel.split('/').some((part) => EXCLUDE_DIRS.has(part))) return true;
  return EXCLUDE_FILES.has(rel) || rel.endsWith('.tsbuildinfo');
};

const stage = mkdtempSync(join(tmpdir(), 'bandorganizer-pack-'));
try {
  cpSync(ROOT, join(stage, 'BandOrganizer'), { recursive: true, filter: (src) => !excluded(src) });
  mkdirSync(out, { recursive: true });
  const zipPath = join(out, `BandOrganizer-v${version}${suffix}.zip`);
  rmSync(zipPath, { force: true });
  const zip = spawnSync('zip', ['-qr', zipPath, 'BandOrganizer'], { cwd: stage, encoding: 'utf8' });
  if (zip.error || zip.status !== 0) fail(`zip failed: ${zip.error?.message ?? zip.stderr}`);

  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const forbidden = listing.filter((f) => /(^|\/)(node_modules|dist)\//.test(f) || f.endsWith('src/config.ts'));
  if (forbidden.length) fail(`forbidden files in the zip: ${forbidden.slice(0, 3).join(', ')}`);

  if (docsCopy) {
    const target = resolve(docsCopy);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(ROOT, 'docs'), target, { recursive: true });
  }
  console.log(`✓ ${zipPath}  (${listing.filter((f) => !f.endsWith('/')).length} files, ${(statSync(zipPath).size / 1024).toFixed(0)} kB, version ${version})`);
  console.log('  src/config.ts is not included.' + (docsCopy ? `  docs copied to ${resolve(docsCopy)}` : ''));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
if (!existsSync(out)) fail('output folder missing');
