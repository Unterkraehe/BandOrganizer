import { newId } from '@/core/data/ids';
import { migrate } from '@/core/data/migrate';
import { nowIso } from '@/core/data/record';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import type { Versioned } from '@/core/band/band';
import { firstFreeColor, MEMBER_SCHEMA_VERSION, NAME_MAX_LENGTH, sameName, type Member, type MemberColor } from './model';

/** Data access for member profiles (F2 §6). Only via SafeStorage (R-CODE-01). */

export class NameTakenError extends Error {
  constructor(public readonly existing: Member) {
    super(`Name already taken: ${existing.displayName}`);
    this.name = 'NameTakenError';
  }
}

export class InvalidNameError extends Error {
  constructor() {
    super('Name must be 1–30 characters');
    this.name = 'InvalidNameError';
  }
}

const membersDir = (appRoot: string) => joinPath(appRoot, 'members');

export async function listMembers(storage: SafeStorage, appRoot: string): Promise<Versioned<Member>[]> {
  let entries;
  try {
    entries = await storage.list(membersDir(appRoot));
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
  const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.json'));
  const results = await Promise.all(
    files.map(async (entry) => {
      try {
        const raw = await storage.readJson<unknown>(entry.path);
        return { value: migrate<Member>(raw, MEMBER_SCHEMA_VERSION, []), version: entry.version };
      } catch (error) {
        // A broken or hand-edited file is skipped, never overwritten (F2 §9).
        console.warn('Skipping unreadable member file', entry.path, error);
        return null;
      }
    }),
  );
  return results
    .filter((r): r is Versioned<Member> => r !== null)
    .sort((a, b) => a.value.displayName.localeCompare(b.value.displayName, 'de'));
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX_LENGTH) throw new InvalidNameError();
  return trimmed;
}

function assertNameFree(name: string, members: Member[], ownId?: string) {
  const taken = members.find((m) => m.active && m.id !== ownId && sameName(m.displayName, name));
  if (taken) throw new NameTakenError(taken);
}

export interface MemberInput {
  displayName: string;
  role: string | null;
  color?: MemberColor;
}

export async function createMember(
  storage: SafeStorage,
  appRoot: string,
  input: MemberInput,
  existing: Member[],
): Promise<Versioned<Member>> {
  const displayName = validateName(input.displayName);
  assertNameFree(displayName, existing);
  const id = newId('m');
  const now = nowIso();
  const member: Member = {
    id,
    schemaVersion: MEMBER_SCHEMA_VERSION,
    displayName,
    role: input.role?.trim() || null,
    color: input.color ?? firstFreeColor(existing),
    avatar: { type: 'initials' },
    pin: null,
    active: true,
    deactivatedAt: null,
    deactivatedBy: null,
    // A new member creates their own profile (F2 US-2).
    createdAt: now,
    createdBy: id,
    updatedAt: now,
    updatedBy: id,
    deletedAt: null,
    deletedBy: null,
  };
  const entry = await storage.createFile(joinPath(membersDir(appRoot), `${id}.json`), JSON.stringify(member, null, 2) + '\n');
  return { value: member, version: entry.version };
}

async function save(storage: SafeStorage, appRoot: string, member: Member, version: string | undefined) {
  const entry = await storage.writeJson(joinPath(membersDir(appRoot), `${member.id}.json`), member, { expectedVersion: version });
  return { value: member, version: entry.version };
}

/** A member only edits their own profile (F2 §5.3). */
export async function updateMember(
  storage: SafeStorage,
  appRoot: string,
  current: Versioned<Member>,
  input: MemberInput,
  all: Member[],
): Promise<Versioned<Member>> {
  const displayName = validateName(input.displayName);
  assertNameFree(displayName, all, current.value.id);
  const next: Member = {
    ...current.value,
    displayName,
    role: input.role?.trim() || null,
    color: input.color ?? current.value.color,
    updatedAt: nowIso(),
    updatedBy: current.value.id,
  };
  return save(storage, appRoot, next, current.version);
}

/** Deactivate/reactivate instead of deleting (F2 §5.4). */
export async function setMemberActive(
  storage: SafeStorage,
  appRoot: string,
  current: Versioned<Member>,
  active: boolean,
  byMemberId: string,
  all: Member[],
): Promise<Versioned<Member>> {
  if (active) assertNameFree(current.value.displayName, all, current.value.id);
  const now = nowIso();
  const next: Member = {
    ...current.value,
    active,
    deactivatedAt: active ? null : now,
    deactivatedBy: active ? null : byMemberId,
    updatedAt: now,
    updatedBy: byMemberId,
  };
  return save(storage, appRoot, next, current.version);
}
