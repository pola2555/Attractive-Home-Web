import { NextResponse } from 'next/server';
import { requireCustomer } from '@/lib/customer-auth';
import { getFavoriteProductIds } from '@/lib/favorites';

// Hydrates the client FavoritesProvider without forcing the public pages to be
// dynamic — the session cookie is read here, in an isolated dynamic route.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const customer = await requireCustomer();
  if (!customer) return NextResponse.json({ authed: false, ids: [] });
  const ids = await getFavoriteProductIds(customer.id);
  return NextResponse.json({ authed: true, ids });
}
