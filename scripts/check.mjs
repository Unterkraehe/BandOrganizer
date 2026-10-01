#!/usr/bin/env node
// One command for "is everything fine?": type check, lint, code index, tests, build.
//
//   npm run check                       everything (what CI does + the code index)
//   npm run check -- --quick            type check + lint + code index (a few seconds)
//   npm run check -- --no-build         skip the production build
//   npm run check -- flows/songs        only tests whose path matches (extra arguments go to vitest)
//
// Output is short: one line per step; on a failure the relevant output follows and the exit code is 1.
import { generateIndex } from './gen-code-index.mjs';
import { exists, run, tail } from './lib.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const noBuild = quick || args.includes('--no-build');
const filters = args.filter((a) => !a.startsWith('--'));

const steps = [
  { name: 'types ', cmd: ['npx', ['tsc', '-b']] },
  { name: 'lint  ', cmd: ['npx', ['eslint', '.']] },
  { name: 'index ', fn: () => generateIndex({ write: true }) },
  ...(quick ? [] : [{ name: 'tests ', cmd: ['npx', ['vitest', 'run', ...filters]], summary: /(Test Files|Tests )\s.*|Duration.*/g }]),
  ...(noBuild ? [] : [{ name: 'build ', cmd: ['npm', ['run', 'build']], summary: /built in .*/g }]),
];

if (!exists('node_modules')) {
  console.log('✗ node_modules missing – run `npm ci` first');
  process.exit(1);
}

let failed = false;
for (const step of steps) {
  if (step.fn) {
    const message = step.fn();
    console.log(`✓ ${step.name} ${message}`);
    continue;
  }
  const result = run(step.cmd[0], step.cmd[1]);
  if (result.ok) {
    const detail = step.summary ? (result.output.match(step.summary) ?? []).map((s) => s.trim().replace(/\s+/g, ' ')).join(' · ') : '';
    console.log(`✓ ${step.name} ${result.seconds}s${detail ? `  ${detail}` : ''}`);
  } else {
    console.log(`✗ ${step.name} ${result.seconds}s`);
    console.log(tail(result.output, 60));
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
