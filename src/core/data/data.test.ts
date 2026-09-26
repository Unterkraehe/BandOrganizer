// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { migrate, UnsupportedSchemaError } from './migrate';
import { createRecord, isDeleted, restore, softDelete, touchRecord, type RecordBase } from './record';

interface Note extends RecordBase {
  text: string;
}

describe('ids', () => {
  it('creates prefixed, unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('m')));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^m_[0-9a-km-z]{10}$/);
  });
});

describe('records (R-DATA-05, R-DATA-09)', () => {
  it('creates, touches, soft-deletes and restores', () => {
    const note = createRecord<Note>('n_1', 1, 'm_a', { text: 'Hi' }, '2026-01-01T00:00:00.000Z');
    expect(note).toMatchObject({ id: 'n_1', schemaVersion: 1, createdBy: 'm_a', updatedBy: 'm_a', deletedAt: null });
    const edited = touchRecord(note, 'm_b', { text: 'Hallo' }, '2026-01-02T00:00:00.000Z');
    expect(edited).toMatchObject({ text: 'Hallo', createdBy: 'm_a', updatedBy: 'm_b' });
    const deleted = softDelete(edited, 'm_b');
    expect(isDeleted(deleted)).toBe(true);
    expect(deleted.text).toBe('Hallo');
    expect(isDeleted(restore(deleted, 'm_a'))).toBe(false);
  });
});

describe('migrate (R-DATA-08)', () => {
  const migrations = [
    (r: Record<string, unknown>) => ({ title: r.name, name: undefined }),
    (r: Record<string, unknown>) => ({ tags: r.tags ?? [] }),
  ];

  it('upgrades step by step and keeps unknown fields', () => {
    const result = migrate<Record<string, unknown>>({ schemaVersion: 1, name: 'A', extra: 42 }, 3, migrations);
    expect(result).toMatchObject({ schemaVersion: 3, title: 'A', tags: [], extra: 42 });
  });

  it('treats a missing schemaVersion as 1', () => {
    expect(migrate<Record<string, unknown>>({ name: 'B' }, 2, migrations)).toMatchObject({ schemaVersion: 2, title: 'B' });
  });

  it('refuses records from a newer app version', () => {
    expect(() => migrate({ schemaVersion: 4 }, 3, migrations)).toThrow(UnsupportedSchemaError);
  });
});
