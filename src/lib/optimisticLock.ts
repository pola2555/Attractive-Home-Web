import 'server-only';

// Optimistic concurrency control for dashboard edit forms.
//
// Two staff members can open the same record at once. Without a guard, whoever
// saves last silently overwrites the other's work. Each edit form carries the
// row's `updatedAt` as it was when the page loaded (a hidden field); on save we
// compare it to the value currently in the database. If they differ, someone
// else saved in the meantime, so we refuse the write and ask the editor to
// reload — the conventional "optimistic lock" pattern.

export const CONFLICT_MESSAGE =
  'Someone else changed this record while you had it open. Reload the page to see their changes, then re-apply yours.';

// Parse the hidden `expectedUpdatedAt` field. Returns null when it is absent or
// unparseable (e.g. a create form), in which case the caller skips the check.
export function parseExpectedUpdatedAt(fd: FormData): Date | null {
  const raw = fd.get('expectedUpdatedAt');
  if (typeof raw !== 'string' || !raw) return null;
  const when = new Date(raw);
  return Number.isNaN(when.getTime()) ? null : when;
}

// True when the stored row still matches the version the editor loaded. A null
// expectation (create form / legacy page) never blocks.
export function versionMatches(current: Date, expected: Date | null): boolean {
  if (!expected) return true;
  return current.getTime() === expected.getTime();
}
