// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Release hygiene: the current version has a "Was ist neu" entry and the list stays ordered (see docs/92-code-map.md, "Release"). */
describe('release notes', () => {
  const root = process.cwd();
  const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
  const whatsNew = JSON.parse(readFileSync(join(root, 'src/locales/de/whatsNew.json'), 'utf8')) as Record<string, string[]>;
  const versions = Object.keys(whatsNew);
  const parse = (v: string) => v.split('.').map(Number);
  const newer = (a: string, b: string) => {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
    return false;
  };

  it('has an entry for the current version, as the first one', () => {
    expect(versions[0]).toBe(version);
    expect(whatsNew[version]!.length).toBeGreaterThan(0);
  });

  it('is sorted from newest to oldest and every key is a version number', () => {
    for (const v of versions) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < versions.length; i++) expect(newer(versions[i - 1]!, versions[i]!), `${versions[i - 1]} before ${versions[i]}`).toBe(true);
  });
});
