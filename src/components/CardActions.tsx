'use client';

import { useMember, toggle, SAVE_KEY, COMPARE_KEY, COMPARE_MAX } from './shortlistStore';
import { useFavorites } from './favorites/FavoritesProvider';

// Save (♥) + Compare (⇄) card affordances. Compare is always the localStorage
// shortlist; Save is the customer's SERVER favorite when signed in, otherwise
// the localStorage shortlist. The floating tray/panels live in ShortlistBar.
export default function CardActions({ productId, className }: { productId: string; className?: string }) {
  const favorites = useFavorites();
  const localSaved = useMember(SAVE_KEY, productId);
  const compared = useMember(COMPARE_KEY, productId);

  const saved = favorites.authed ? favorites.has(productId) : localSaved;
  const saveToggle = () => (favorites.authed ? favorites.toggle(productId) : toggle(SAVE_KEY, productId));

  const btn = (on: boolean) =>
    `w-8 h-8 rounded-[9px] flex items-center justify-center text-[15px] shadow transition-colors ${
      on ? 'bg-accent text-white' : 'bg-on-media/95 text-on-accent hover:bg-on-media'
    }`;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={`flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${className ?? ''}`}
    >
      <button
        type="button"
        aria-label="Save"
        aria-pressed={saved}
        onClick={stop(saveToggle)}
        className={btn(saved)}
      >
        ♥
      </button>
      <button
        type="button"
        aria-label="Compare"
        aria-pressed={compared}
        onClick={stop(() => toggle(COMPARE_KEY, productId, COMPARE_MAX))}
        className={btn(compared)}
      >
        ⇄
      </button>
    </div>
  );
}
