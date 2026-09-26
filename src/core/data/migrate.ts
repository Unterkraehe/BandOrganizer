/**
 * Schema migrations (R-DATA-08). Each migration upgrades a record from version n to n+1.
 * Unknown extra fields are always kept.
 */
export type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

export class UnsupportedSchemaError extends Error {
  constructor(found: number, supported: number) {
    super(`Record has schemaVersion ${found}, this app supports up to ${supported}. Please update the app.`);
    this.name = 'UnsupportedSchemaError';
  }
}

/**
 * @param migrations migrations[n] upgrades version n+1 → n+2 (migrations[0]: 1 → 2).
 */
export function migrate<T>(raw: unknown, currentVersion: number, migrations: Migration[]): T {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('Record must be an object');
  let record = { ...(raw as Record<string, unknown>) };
  let version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1;
  if (version > currentVersion) throw new UnsupportedSchemaError(version, currentVersion);
  while (version < currentVersion) {
    const step = migrations[version - 1];
    if (!step) throw new Error(`Missing migration from schemaVersion ${version}`);
    record = { ...record, ...step(record), schemaVersion: version + 1 };
    version += 1;
  }
  return { ...record, schemaVersion: currentVersion } as T;
}
