/** Standard fields every stored record has (R-DATA-09). */
export interface RecordBase {
  id: string;
  schemaVersion: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export type NewRecord<T extends RecordBase> = Omit<T, keyof RecordBase>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createRecord<T extends RecordBase>(
  id: string,
  schemaVersion: number,
  memberId: string,
  fields: NewRecord<T>,
  now = nowIso(),
): T {
  return {
    ...fields,
    id,
    schemaVersion,
    createdAt: now,
    createdBy: memberId,
    updatedAt: now,
    updatedBy: memberId,
    deletedAt: null,
    deletedBy: null,
  } as T;
}

export function touchRecord<T extends RecordBase>(record: T, memberId: string, changes: Partial<T> = {}, now = nowIso()): T {
  return { ...record, ...changes, updatedAt: now, updatedBy: memberId };
}

/** Soft delete (R-DATA-05): the record stays, marked as deleted. */
export function softDelete<T extends RecordBase>(record: T, memberId: string, now = nowIso()): T {
  return { ...record, deletedAt: now, deletedBy: memberId, updatedAt: now, updatedBy: memberId };
}

export function restore<T extends RecordBase>(record: T, memberId: string, now = nowIso()): T {
  return { ...record, deletedAt: null, deletedBy: null, updatedAt: now, updatedBy: memberId };
}

export function isDeleted(record: RecordBase): boolean {
  return Boolean(record.deletedAt);
}
