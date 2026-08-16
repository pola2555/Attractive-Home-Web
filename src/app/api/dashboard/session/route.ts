import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/permissions';

// Tiny endpoint the navbar polls after mount to decide whether to show the
// "Dashboard" link. Any active staff user can reach the dashboard (individual
// modules are RBAC-gated inside it). Reading the staff cookie here keeps the
// public layout free of it, so the marketing pages stay static/ISR.
export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ canAccess: Boolean(user) }, { headers: { 'Cache-Control': 'no-store' } });
}
