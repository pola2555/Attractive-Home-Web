'use client';

import Link from 'next/link';
import { useFavorites } from './FavoritesProvider';

// Prominent favorite toggle for the product detail page. Signed-in customers
// toggle a server favorite (optimistic, via the provider); anonymous visitors
// get a link to sign in. Degrades gracefully — it's always a real control.
export default function FavoriteButton({
  productId,
  locale,
  labels,
}: {
  productId: string;
  locale: string;
  labels: { save: string; saved: string; signInToSave: string };
}) {
  const favorites = useFavorites();

  if (!favorites.authed) {
    return (
      <Link
        href={`/${locale}/account/sign-in`}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-line-strong text-ink hover:border-accent/60 transition-colors"
      >
        <span aria-hidden>♡</span>
        {labels.signInToSave}
      </Link>
    );
  }

  const saved = favorites.has(productId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => favorites.toggle(productId)}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border transition-colors ${
        saved ? 'bg-accent text-white border-accent' : 'border-line-strong text-ink hover:border-accent/60'
      }`}
    >
      <span aria-hidden>{saved ? '♥' : '♡'}</span>
      {saved ? labels.saved : labels.save}
    </button>
  );
}
