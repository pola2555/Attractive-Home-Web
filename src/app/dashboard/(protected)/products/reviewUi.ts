import type { FacetOption } from '@/lib/catalogAdmin';

// Shared review-status presentation, used by the table, the card grid and the
// bulk bar so the colours stay in one place: reviewed = green, not reviewed =
// red, ask the client = yellow.
export const REVIEW_BADGE: Record<string, { label: string; cls: string }> = {
  new: { label: 'Not reviewed', cls: 'text-red-700 bg-red-500/10' },
  reviewed: { label: 'Reviewed', cls: 'text-green-700 bg-green-500/10' },
  ask_client: { label: 'Ask client', cls: 'text-yellow-700 bg-yellow-500/20' },
};

// Options for the "Move to list…" bulk control.
export const REVIEW_OPTIONS: FacetOption[] = [
  { id: 'new', code: 'new', name: 'Not reviewed', isActive: true },
  { id: 'reviewed', code: 'reviewed', name: 'Reviewed', isActive: true },
  { id: 'ask_client', code: 'ask_client', name: 'Ask the client', isActive: true },
];
