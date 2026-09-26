// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { basename, dirname, InvalidPathError, isWithin, joinPath, normalizePath } from './paths';

describe('paths', () => {
  it('normalizes', () => {
    expect(normalizePath('/a//b/./c/')).toBe('/a/b/c');
    expect(normalizePath('/')).toBe('/');
    expect(joinPath('/a', 'b/', '/c')).toBe('/a/b/c');
  });

  it('rejects relative paths and ".."', () => {
    expect(() => normalizePath('a/b')).toThrow(InvalidPathError);
    expect(() => normalizePath('/a/../b')).toThrow(InvalidPathError);
  });

  it('checks containment by whole segments', () => {
    expect(isWithin('/a/b/c', '/a/b')).toBe(true);
    expect(isWithin('/a/b', '/a/b')).toBe(true);
    expect(isWithin('/a/bc', '/a/b')).toBe(false);
    expect(isWithin('/a/B/c', '/a/b')).toBe(false);
  });

  it('splits', () => {
    expect(dirname('/a/b/c.txt')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(basename('/a/b/c.txt')).toBe('c.txt');
  });
});
