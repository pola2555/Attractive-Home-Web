'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FacetOption } from '@/lib/catalogAdmin';
import { saveReviewProduct } from '../actions';

const SEL =
  'w-full px-3 py-2 rounded-lg border border-line-strong bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent';

// A single facet dropdown, hoisted so it keeps its identity across renders.
function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FacetOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">{label}</label>
      <select className={SEL} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type Img = { s3Key: string; url: string };

export type ReviewProduct = {
  id: string;
  code: string;
  name: string;
  sourceCode: string;
  typeId: string;
  lookId: string;
  materialId: string;
  collectionId: string;
  applicationIds: string[];
  images: Img[];
};

type Draft = {
  name: string;
  typeId: string;
  lookId: string;
  materialId: string;
  collectionId: string;
  applicationIds: string[];
  images: Img[];
};

const draftOf = (p: ReviewProduct): Draft => ({
  name: p.name === '—' ? '' : p.name,
  typeId: p.typeId,
  lookId: p.lookId,
  materialId: p.materialId,
  collectionId: p.collectionId,
  applicationIds: [...p.applicationIds],
  images: p.images.map((i) => ({ ...i })),
});

export default function ReviewSession({
  queue,
  total,
  capped,
  types,
  looks,
  materials,
  collections,
  applications,
}: {
  queue: ReviewProduct[];
  total: number;
  capped: boolean;
  types: FacetOption[];
  looks: FacetOption[];
  materials: FacetOption[];
  collections: FacetOption[];
  applications: FacetOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const max = Math.min(100, queue.length);
  const [phase, setPhase] = useState<'start' | 'running' | 'done'>('start');
  const [target, setTarget] = useState(Math.min(25, max));
  const [idx, setIdx] = useState(0);
  // Drafts and the undo stack live for the whole session (keyed by queue index),
  // so Undo can step back across products, not just within the current one.
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [undoStack, setUndoStack] = useState<{ idx: number; snap: Draft }[]>([]);
  const [reviewed, setReviewed] = useState(0);
  const [held, setHeld] = useState(0);
  const [skipOpen, setSkipOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [liveTotal, setLiveTotal] = useState(total);

  const product = phase === 'running' ? queue[idx] : null;
  const draft: Draft | null = product ? (drafts[idx] ?? draftOf(product)) : null;

  // Reset the per-product transient UI when we move to a different product
  // (the "store info from previous renders" pattern — no effect needed).
  const [lastIdx, setLastIdx] = useState(idx);
  if (idx !== lastIdx) {
    setLastIdx(idx);
    setError(null);
    setAddUrl('');
    setDragIdx(null);
    setOverIdx(null);
  }

  const edit = (patch: Partial<Draft>) => {
    if (!draft) return;
    setUndoStack((u) => [...u, { idx, snap: draft }]);
    setDrafts((d) => ({ ...d, [idx]: { ...draft, ...patch } }));
  };
  const undo = () => {
    setUndoStack((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      setDrafts((d) => ({ ...d, [last.idx]: last.snap }));
      if (last.idx !== idx) setIdx(last.idx);
      return u.slice(0, -1);
    });
  };
  const toggleRoom = (id: string) => {
    if (!draft) return;
    const has = draft.applicationIds.includes(id);
    edit({
      applicationIds: has
        ? draft.applicationIds.filter((x) => x !== id)
        : [...draft.applicationIds, id],
    });
  };
  const removeImg = (i: number) => draft && edit({ images: draft.images.filter((_, j) => j !== i) });
  const makeCover = (i: number) =>
    draft && edit({ images: [draft.images[i], ...draft.images.filter((_, j) => j !== i)] });
  const moveImg = (from: number, to: number) => {
    if (!draft || from === to || to < 0 || to >= draft.images.length) return;
    const imgs = [...draft.images];
    const [m] = imgs.splice(from, 1);
    imgs.splice(to, 0, m);
    edit({ images: imgs });
  };
  const dropOn = (to: number) => {
    if (dragIdx !== null) moveImg(dragIdx, to);
    setDragIdx(null);
    setOverIdx(null);
  };
  const addImage = () => {
    const u = addUrl.trim();
    if (!draft || !/^https?:\/\//i.test(u)) return;
    edit({ images: [...draft.images, { s3Key: u, url: u }] });
    setAddUrl('');
  };

  const begin = () => {
    setTarget((t) => Math.max(1, Math.min(t, max)));
    setIdx(0);
    setReviewed(0);
    setHeld(0);
    setDrafts({});
    setUndoStack([]);
    setPhase('running');
  };

  const advance = () => {
    if (idx + 1 >= target) {
      router.refresh();
      setPhase('done');
    } else {
      setIdx((i) => i + 1);
    }
  };

  const payload = (d: Draft) => ({
    name: d.name.trim() || product?.code || 'Untitled',
    typeId: d.typeId || null,
    lookId: d.lookId || null,
    materialId: d.materialId || null,
    collectionId: d.collectionId || null,
    applicationIds: d.applicationIds,
    images: d.images.map((im) => ({ s3Key: im.s3Key })),
  });

  const finish = (status: 'reviewed' | 'ask_client') => {
    if (!product || !draft) return;
    const id = product.id;
    const data = payload(draft);
    start(async () => {
      const res = await saveReviewProduct(id, data, status);
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      setLiveTotal((n) => n - 1);
      if (status === 'reviewed') setReviewed((n) => n + 1);
      else setHeld((n) => n + 1);
      advance();
    });
  };

  const resolveSkip = (what: 'skip' | 'hold') => {
    setSkipOpen(false);
    if (what === 'hold') finish('ask_client');
    else advance(); // stays 'new', edits discarded
  };

  // ---------- START ----------
  if (phase === 'start') {
    return (
      <div className="max-w-xl mx-auto py-10">
        <Link href="/dashboard/products" className="text-sm text-muted hover:text-accent">
          ← Back to products
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-3">Review session</h1>
        {queue.length === 0 ? (
          <p className="text-muted mt-4">
            Nothing to review — no not-reviewed products match these filters.
          </p>
        ) : (
          <div className="mt-5 bg-surface border border-line rounded-xl p-6">
            <p className="text-ink">
              <b className="text-accent text-lg">{total.toLocaleString()}</b> not-reviewed product
              {total === 1 ? '' : 's'} match your filters.
              {capped && (
                <span className="text-muted text-sm block mt-1">
                  Loaded the first {queue.length} for this session; filter further to reach the rest.
                </span>
              )}
            </p>
            <label className="block mt-6 text-sm font-medium text-ink">How many to review now?</label>
            <div className="flex items-center gap-4 mt-2">
              <input
                type="range"
                min={Math.min(10, max)}
                max={max}
                step={max >= 15 ? 5 : 1}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="flex-1 accent-amber-700"
                aria-label="Products this session"
              />
              <span className="font-mono text-2xl font-bold text-heading w-14 text-right">{target}</span>
            </div>
            <p className="text-xs text-muted mt-1">
              A session runs one product at a time ({Math.min(10, max)}–{max}).
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 w-full py-3 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white font-semibold"
            >
              ▶ Start reviewing {target}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- DONE ----------
  if (phase === 'done') {
    const left = Math.max(0, target - reviewed - held);
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold text-heading">Session complete</h1>
        <p className="text-ink mt-3">
          You reviewed <b className="text-green-600">{reviewed}</b> product{reviewed === 1 ? '' : 's'}
          {held > 0 && (
            <>
              , parked <b className="text-yellow-600">{held}</b> for the client
            </>
          )}
          {left > 0 && (
            <>
              , and left <b>{left}</b> for next time
            </>
          )}
          .
        </p>
        <div className="flex gap-3 justify-center mt-8">
          <Link
            href="/dashboard/products"
            className="px-5 py-2.5 rounded-lg bg-surface border border-line text-ink"
          >
            Back to products
          </Link>
          {liveTotal > 0 && (
            <button
              type="button"
              onClick={() => {
                router.refresh();
                setPhase('start');
              }}
              className="px-5 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white"
            >
              Review more ({liveTotal} left)
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- RUNNING ----------
  if (!product || !draft) return null;
  const pct = Math.round((idx / target) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      {/* progress */}
      <div className="h-1.5 bg-surface-2">
        <div className="h-full bg-brand-brown transition-all" style={{ width: `${pct}%` }} />
      </div>
      {/* header */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-surface border-b border-line">
        <span className="font-semibold text-heading">
          Product {idx + 1} of {target}
        </span>
        <span className="text-sm text-muted">
          {reviewed} reviewed{held ? ` · ${held} to ask client` : ''}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!undoStack.length}
            className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            ↶ Undo{undoStack.length ? ` (${undoStack.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              router.refresh();
              setPhase('done');
            }}
            className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:border-accent"
          >
            End session
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 grid md:grid-cols-2">
        {/* images */}
        <div className="p-5 overflow-y-auto border-b md:border-b-0 md:border-e border-line">
          <div className="grid grid-cols-2 gap-3">
            {draft.images.map((img, i) => (
              <div
                key={`${img.s3Key}:${i}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overIdx !== i) setOverIdx(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(i);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                className={`relative aspect-square rounded-lg overflow-hidden bg-surface-2 border group cursor-grab active:cursor-grabbing transition-shadow ${
                  overIdx === i && dragIdx !== null && dragIdx !== i
                    ? 'border-accent ring-2 ring-accent'
                    : 'border-line'
                } ${dragIdx === i ? 'opacity-50' : ''}`}
                title="Drag to reorder"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
                <span className="absolute top-1.5 start-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/55 text-white">
                  {i === 0 ? '★ cover' : i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-0.5 p-1 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveImg(i, i - 1)}
                    disabled={i === 0}
                    title="Move earlier"
                    className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20 disabled:opacity-30"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImg(i, i + 1)}
                    disabled={i === draft.images.length - 1}
                    title="Move later"
                    className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20 disabled:opacity-30"
                  >
                    ▶
                  </button>
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => makeCover(i)}
                      title="Set as cover"
                      className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20"
                    >
                      ★
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImg(i)}
                    title="Remove image"
                    className="ms-auto text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-red-500/60"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {draft.images.length === 0 && (
              <div className="col-span-2 aspect-[2/1] rounded-lg bg-surface-2 border border-line grid place-items-center text-muted text-sm">
                No images
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addImage();
                }
              }}
              placeholder="Add image by URL (https://…)"
              className={`${SEL} text-sm`}
            />
            <button
              type="button"
              onClick={addImage}
              disabled={!/^https?:\/\//i.test(addUrl.trim())}
              className="px-3 rounded-lg border border-line-strong text-ink hover:border-accent disabled:opacity-40 whitespace-nowrap"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-muted mt-2">
            Drag to reorder, or use ◀ ▶; the first image is the cover (★).{' '}
            <Link
              href={`/dashboard/products/${product.id}/edit`}
              target="_blank"
              className="text-accent hover:underline"
            >
              Open full product editor ↗
            </Link>{' '}
            for crop / flip / rotate &amp; file uploads.
          </p>
        </div>

        {/* fields */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Name (EN)
            </label>
            <input
              className={SEL}
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
              placeholder={product.code || 'Product name'}
            />
            <p className="text-[11px] text-muted mt-1">
              {product.sourceCode} · <span className="font-mono">{product.code || '—'}</span>
            </p>
          </div>
          <FacetSelect label="Type" value={draft.typeId} options={types} onChange={(v) => edit({ typeId: v })} />
          <FacetSelect label="Look" value={draft.lookId} options={looks} onChange={(v) => edit({ lookId: v })} />
          <FacetSelect
            label="Material"
            value={draft.materialId}
            options={materials}
            onChange={(v) => edit({ materialId: v })}
          />
          <FacetSelect
            label="Collection"
            value={draft.collectionId}
            options={collections}
            onChange={(v) => edit({ collectionId: v })}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Rooms / use
            </label>
            <div className="flex flex-wrap gap-2">
              {applications.map((a) => {
                const on = draft.applicationIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleRoom(a.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      on
                        ? 'border-accent bg-accent-2/15 text-accent'
                        : 'border-line-strong text-ink hover:border-accent/60'
                    }`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-surface border-t border-line">
        <button
          type="button"
          onClick={() => (idx > 0 ? setIdx((i) => i - 1) : null)}
          disabled={idx === 0}
          className="w-10 h-10 rounded-lg border border-line-strong text-lg hover:border-accent disabled:opacity-40"
          title="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setSkipOpen(true)}
          disabled={pending}
          className="px-4 h-10 rounded-lg border border-line-strong text-ink hover:border-accent"
          title="Next without reviewing"
        >
          Skip →
        </button>
        <button
          type="button"
          onClick={() => finish('reviewed')}
          disabled={pending}
          className="ms-auto px-5 h-10 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white font-semibold disabled:opacity-60"
        >
          {pending ? 'Saving…' : '✓ Mark reviewed & next'}
        </button>
      </div>

      {/* skip prompt */}
      {skipOpen && (
        <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-heading">This one isn’t reviewed yet</h3>
            <p className="text-ink-soft text-sm mt-1">
              Moving on without marking <b>{draft.name || product.code}</b> as reviewed. What should
              happen to it?
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                onClick={() => resolveSkip('skip')}
                className="text-start border border-line-strong bg-surface-2 rounded-xl p-3 hover:border-accent"
              >
                <b className="block text-ink">Keep it for later</b>
                <span className="text-muted text-sm">Stays in Not reviewed; this edit is discarded.</span>
              </button>
              <button
                type="button"
                onClick={() => resolveSkip('hold')}
                disabled={pending}
                className="text-start border border-line-strong bg-surface-2 rounded-xl p-3 hover:border-accent disabled:opacity-50"
              >
                <b className="block text-yellow-600">Move to “Ask the client”</b>
                <span className="text-muted text-sm">
                  Saves your edits and parks it — e.g. its name or material needs the client.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSkipOpen(false)}
                className="text-start border border-line-strong bg-surface-2 rounded-xl p-3 hover:border-accent"
              >
                <b className="block text-ink">Keep editing</b>
                <span className="text-muted text-sm">Stay on this product.</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
