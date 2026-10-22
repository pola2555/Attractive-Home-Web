'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { loadBrandRows, type BrandRowData } from './brandShopActions';

// "Shop by brand" — the top block of the catalog landing. Every brand is a
// collapsible panel; opening one lazy-loads its rows (Shop by type / collection /
// look / … scoped to that brand) and renders them as the same image/swatch cards
// the outside "Shop by …" tiles use, each linking into the brand-filtered catalog.
// Rows, their order and card counts come from the admin config (catalog.shopbybrand);
// this component just renders whatever loadBrandRows() returns.

type Brand = { code: string; name: string; count: number };
type Loaded = BrandRowData[] | 'error';

export default function ShopByBrand({
  locale,
  title,
  brands,
  openLabel,
  loadingText,
  retryText,
}: {
  locale: string;
  title: string;
  brands: Brand[];
  openLabel: string;
  loadingText: string;
  retryText: string;
}) {
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, Loaded>>({});
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (brands.length === 0) return null;

  const fetchBrand = (code: string) => {
    setLoadingCode(code);
    startTransition(async () => {
      try {
        const rows = await loadBrandRows(locale, code);
        setData((d) => ({ ...d, [code]: rows }));
      } catch {
        setData((d) => ({ ...d, [code]: 'error' }));
      } finally {
        setLoadingCode((c) => (c === code ? null : c));
      }
    });
  };

  const toggle = (code: string) => {
    if (openCode === code) {
      setOpenCode(null);
      return;
    }
    setOpenCode(code);
    if (!(code in data)) fetchBrand(code);
  };

  return (
    <section className="mb-10" aria-label={title}>
      <h2 className="text-heading font-extrabold text-lg mb-3">{title}</h2>
      <div className="space-y-2.5">
        {brands.map((brand) => {
          const isOpen = openCode === brand.code;
          const loaded = data[brand.code];
          const isLoading = loadingCode === brand.code && !loaded;
          const panelId = `brandshop-${brand.code}`;
          return (
            <div key={brand.code} className="rounded-xl border border-line bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(brand.code)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-start hover:bg-surface-2 transition-colors"
              >
                <span className="text-heading font-bold text-base flex-1 truncate">{brand.name}</span>
                <span className="text-muted text-xs tabular-nums">{brand.count}</span>
                <span className="text-muted text-xs hidden sm:inline">{openLabel}</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isOpen && (
                <div id={panelId} className="px-4 pb-4 pt-1 border-t border-line">
                  {isLoading && <p className="text-muted text-sm py-4">{loadingText}</p>}
                  {loaded === 'error' && (
                    <button
                      type="button"
                      onClick={() => fetchBrand(brand.code)}
                      className="text-accent hover:underline text-sm py-4"
                    >
                      {retryText}
                    </button>
                  )}
                  {Array.isArray(loaded) &&
                    loaded.map((row) => (
                      <div key={row.key} className="mt-4 first:mt-3">
                        <h3 className="text-heading font-bold text-sm mb-2.5">{row.label}</h3>
                        <div
                          className="grid gap-3"
                          style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(${row.isColor ? '96px' : '160px'}, 1fr))`,
                          }}
                        >
                          {row.cards.map((card) =>
                            row.isColor ? (
                              <Link
                                key={card.code}
                                href={card.href}
                                className="relative rounded-[14px] overflow-hidden aspect-square border border-line block"
                                style={{ backgroundColor: card.hex ?? '#9aa4ab' }}
                              >
                                <span className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-b from-black/10 to-black/70 text-white">
                                  <b className="text-xs font-bold leading-tight truncate">{card.name}</b>
                                  <span className="text-[10px] opacity-85">{card.count}</span>
                                </span>
                              </Link>
                            ) : (
                              <Link
                                key={card.code}
                                href={card.href}
                                className="relative rounded-[14px] overflow-hidden aspect-[4/3] border border-line shadow bg-surface-2 bg-cover bg-center block"
                                style={card.imageUrl ? { backgroundImage: `url('${card.imageUrl}')` } : undefined}
                              >
                                <span className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-b from-black/15 to-black/70 text-white">
                                  <b className="text-[15px] font-bold leading-tight truncate">{card.name}</b>
                                  <span className="text-xs opacity-85">{card.count}</span>
                                </span>
                              </Link>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  {Array.isArray(loaded) && loaded.length === 0 && (
                    <p className="text-muted text-sm py-4">—</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
