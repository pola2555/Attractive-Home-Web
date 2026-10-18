'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REVIEW_BADGE } from './reviewUi';

/*
 * ReviewTour — an interactive, spotlight-style walkthrough of the Review Session.
 *
 * It is a *sandbox*: everything inside runs on local sample state and NEVER
 * calls a server action or touches the database. The overlay dims the screen
 * and punches a bright hole over the element each step talks about (the classic
 * coach-mark), while the mock UI underneath stays fully clickable.
 *
 * The mock mirrors the real dashboard: a left sidebar + content for the list /
 * start / done / facets scenes, and a full-bleed editor for the running session
 * (the real review editor is `fixed inset-0`, i.e. covers the sidebar). The
 * coach-mark is measured and clamped so it stays fully on screen on any device
 * — it floats beside the target where there is room, and drops to a top/bottom
 * sheet on small or awkward viewports. Opened by the "?" in the Products header.
 */

// ---------------------------------------------------------------- sample data
type Opt = { id: string; name: string };
const TYPES: Opt[] = [
  { id: 'lam', name: 'Laminate sheet' },
  { id: 'door', name: 'Door' },
  { id: 'panel', name: 'Wall panel' },
];
const LOOKS: Opt[] = [
  { id: 'wood', name: 'Woodgrain' },
  { id: 'solid', name: 'Solid colour' },
  { id: 'stone', name: 'Stone' },
];
const MATERIALS: Opt[] = [
  { id: 'hpl', name: 'HPL' },
  { id: 'mdf', name: 'MDF' },
  { id: 'ven', name: 'Veneer' },
];
const COLLECTIONS: Opt[] = [
  { id: 'cat', name: 'Catania' },
  { id: 'mil', name: 'Milano' },
];
const ROOMS: Opt[] = [
  { id: 'kit', name: 'Kitchen' },
  { id: 'ward', name: 'Wardrobe' },
  { id: 'liv', name: 'Living room' },
  { id: 'off', name: 'Office' },
];

// The real dashboard sidebar (src/app/dashboard/(protected)/layout.tsx).
const NAV = [
  'Overview',
  'Leads',
  'Quotes',
  'Products',
  'Pricing',
  'Facets',
  'Catalog filters',
  'Portfolio',
  'Services',
  'Content',
  'Settings',
  'Users',
  'Customers',
  'Audit log',
];
// The ten facet vocabularies (src/lib/facetsAdmin.ts), with sample usage counts.
const VOCAB: { name: string; count: string }[] = [
  { name: 'Types', count: '9' },
  { name: 'Materials', count: '20' },
  { name: 'Looks', count: '14' },
  { name: 'Colours', count: '31' },
  { name: 'Finishes', count: '6' },
  { name: 'Collections', count: '48' },
  { name: 'Brands', count: '12' },
  { name: 'Sources', count: '3' },
  { name: 'Applications', count: '7' },
  { name: 'Performance', count: '5' },
];

// Inline SVG swatches so the demo renders offline with no external images.
const swatch = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient>` +
      `<linearGradient id='v' x1='0' y1='0' x2='1' y2='0'>` +
      `<stop offset='0' stop-color='rgba(255,255,255,0)'/><stop offset='.5' stop-color='rgba(255,255,255,.12)'/>` +
      `<stop offset='1' stop-color='rgba(0,0,0,.10)'/></linearGradient></defs>` +
      `<rect width='160' height='160' fill='url(#g)'/><rect width='160' height='160' fill='url(#v)'/></svg>`,
  )}`;

type Img = { id: string; url: string };
type DemoProduct = {
  code: string;
  source: string;
  name: string;
  typeId: string;
  lookId: string;
  materialId: string;
  collectionId: string;
  roomIds: string[];
  images: Img[];
};
const DEMO: DemoProduct[] = [
  {
    code: 'RX-1180',
    source: 'Rexin',
    name: 'Catania Ash',
    typeId: 'lam',
    lookId: 'wood',
    materialId: 'hpl',
    collectionId: 'cat',
    roomIds: ['kit', 'ward'],
    images: [
      { id: 'a1', url: swatch('#c9a66b', '#7a5a33') },
      { id: 'a2', url: swatch('#d8b784', '#8a6a3b') },
    ],
  },
  {
    code: 'EG-204',
    source: 'Eagle',
    name: '',
    typeId: '',
    lookId: 'solid',
    materialId: '',
    collectionId: '',
    roomIds: [],
    images: [{ id: 'b1', url: swatch('#8d9b86', '#5b6b55') }],
  },
  {
    code: 'MO-77',
    source: 'Mosycle',
    name: 'Milano Graphite',
    typeId: 'panel',
    lookId: 'stone',
    materialId: 'mdf',
    collectionId: 'mil',
    roomIds: ['liv', 'off'],
    images: [
      { id: 'c1', url: swatch('#6a6f78', '#3a3e45') },
      { id: 'c2', url: swatch('#8a8f98', '#4a4e55') },
      { id: 'c3', url: swatch('#52555c', '#2a2c31') },
    ],
  },
];

type Draft = Omit<DemoProduct, 'code' | 'source'>;
const draftOf = (p: DemoProduct): Draft => ({
  name: p.name,
  typeId: p.typeId,
  lookId: p.lookId,
  materialId: p.materialId,
  collectionId: p.collectionId,
  roomIds: [...p.roomIds],
  images: p.images.map((i) => ({ ...i })),
});

const SELECT_CLS =
  'w-full px-3 py-2 rounded-lg border border-line-strong bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent text-sm';

// A single facet dropdown, hoisted so it keeps its identity across renders.
function Facet({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">{label}</label>
      <select className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
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

// ------------------------------------------------------------------- steps
type Scene = 'list' | 'facets' | 'start' | 'editor' | 'done';
type Step = {
  target: string | null; // data-tour key, or null for a centred welcome
  title: string;
  body: React.ReactNode;
  scene: Scene;
  select?: boolean; // pre-select a card (to reveal the bulk bar)
  skip?: boolean; // open the Skip prompt
};
const STEPS: Step[] = [
  {
    target: null,
    scene: 'list',
    title: 'A guided tour — nothing is saved',
    body: (
      <>
        This is a safe sandbox that mirrors the real dashboard. Click around all you like — it uses
        sample products and never changes the real catalogue. Move with <b>Next</b>, <b>Back</b> or
        the ← → keys.
      </>
    ),
  },
  {
    target: 'nav-products',
    scene: 'list',
    title: 'You’re in Products',
    body: (
      <>
        The left sidebar is how you move around the dashboard. <b>Products</b> is where the
        catalogue — and the review sessions — live.
      </>
    ),
  },
  {
    target: 'nav-facets',
    scene: 'list',
    title: 'New options live in Facets',
    body: (
      <>
        A session only <i>picks</i> a product’s type, material, look, collection and rooms — it
        can’t invent new ones. To add, rename or remove those, open <b>Facets</b> in the sidebar.
        Let’s peek in.
      </>
    ),
  },
  {
    target: 'facet-card',
    scene: 'facets',
    title: 'Add, rename or remove values',
    body: (
      <>
        Each card is one vocabulary. Open one (say <b>Materials</b>) to <b>add</b> a new value,{' '}
        <b>rename</b> it, reorder, deactivate or <b>delete</b> it. The number is how many products
        use it. Anything you add here instantly appears in the dropdowns inside a session.
      </>
    ),
  },
  {
    target: 'view-tabs',
    scene: 'list',
    title: 'Table or Cards',
    body: <>Back in Products, switch between a dense Table and visual Cards. Reviewing feels best in Cards.</>,
  },
  {
    target: 'review-chips',
    scene: 'list',
    title: 'Status at a glance',
    body: (
      <>
        Every product is <span className="text-green-700 font-semibold">Reviewed</span>,{' '}
        <span className="text-red-700 font-semibold">Not reviewed</span> or{' '}
        <span className="text-yellow-700 font-semibold">Ask client</span>. These chips filter by
        status and combine with any other filter.
      </>
    ),
  },
  {
    target: 'card',
    scene: 'list',
    title: 'Cards carry the colour',
    body: <>Each card shows its status colour and is click-to-select. Tick a few to act on them together.</>,
  },
  {
    target: 'bulkbar',
    scene: 'list',
    select: true,
    title: 'Move lists in bulk',
    body: (
      <>
        With cards selected, <b>Move to list…</b> shifts them between Not reviewed / Reviewed / Ask
        the client at once — handy for triage before a focused session.
      </>
    ),
  },
  {
    target: 'review-btn',
    scene: 'list',
    title: 'Start a session',
    body: <>A session walks the not-reviewed products one at a time, like a phone gallery. It opens here.</>,
  },
  {
    target: 'range',
    scene: 'start',
    title: 'Choose your batch',
    body: <>Pick how many products to review this sitting, from 10 to 100. Drag the slider.</>,
  },
  {
    target: 'start-btn',
    scene: 'start',
    title: 'Begin',
    body: <>Only not-reviewed products enter the session. Let’s start one.</>,
  },
  {
    target: 'progress',
    scene: 'editor',
    title: 'Always know where you are',
    body: <>The session fills the screen. This bar fills as you go, and the header counts your progress.</>,
  },
  {
    target: 'fields',
    scene: 'editor',
    title: 'Edit anything',
    body: (
      <>
        Fix the <b>name</b>, set <b>type / look / material / collection</b> and tag the{' '}
        <b>rooms</b>. Try changing one now — the controls are live.
      </>
    ),
  },
  {
    target: 'images',
    scene: 'editor',
    title: 'Reorder & set the cover',
    body: (
      <>
        <b>Drag</b> images to reorder (or use <b>◀ ▶</b>), set any one as <b>cover</b> with ★, and{' '}
        <b>add by URL</b> or <b>remove</b>. The first image is the cover.
      </>
    ),
  },
  {
    target: 'full-editor',
    scene: 'editor',
    title: 'Pixel edits live next door',
    body: (
      <>
        <b>Crop, flip, rotate</b> and file uploads open in the full product editor (new tab). The
        session keeps the fast edits here.
      </>
    ),
  },
  {
    target: 'undo',
    scene: 'editor',
    title: 'Undo spans the session',
    body: (
      <>
        One undo stack for the whole sitting — it steps back through your edits, even across
        products. It clears when the session closes.
      </>
    ),
  },
  {
    target: 'markreviewed',
    scene: 'editor',
    title: 'Mark reviewed & move on',
    body: (
      <>
        This saves your edits, turns the product{' '}
        <span className="text-green-700 font-semibold">green</span>, and jumps to the next one.
      </>
    ),
  },
  {
    target: 'skip-modal',
    scene: 'editor',
    skip: true,
    title: 'Not sure? You’re asked',
    body: (
      <>
        Move on without reviewing and you choose: <b>keep it for later</b> (stays red, edits
        dropped) or <b>Ask the client</b> (saves and parks it{' '}
        <span className="text-yellow-700 font-semibold">yellow</span>).
      </>
    ),
  },
  {
    target: 'endsession',
    scene: 'editor',
    title: 'Stop whenever',
    body: <>End the session at any point — reviewed products are already saved as you went.</>,
  },
  {
    target: 'summary',
    scene: 'done',
    title: 'That’s the whole flow',
    body: (
      <>
        A short recap closes each session. Remember: this tour touched <b>nothing</b> — open a real
        session from the Products page when you’re ready.
      </>
    ),
  },
];

// ------------------------------------------------------- coach-mark geometry
type Geo = { hole: { top: number; left: number; width: number; height: number } | null; top: number; left: number; width: number; sheet: boolean };

// Place the card where it fits without covering the spotlight, clamped fully on
// screen. Priority below → above → right → left, else a top/bottom sheet.
function computeGeo(tr: DOMRect | null, cardW: number, cardH: number): Geo {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TOP = 48; // leave room for the tour's own top bar
  const GAP = 12;
  const M = 12;
  if (!tr) {
    return { hole: null, left: (vw - cardW) / 2, top: Math.max(TOP, (vh - cardH) / 2), width: cardW, sheet: false };
  }
  const hole = {
    top: Math.max(0, tr.top - 8),
    left: Math.max(0, tr.left - 8),
    width: tr.width + 16,
    height: tr.height + 16,
  };
  const clampX = (x: number) => Math.min(Math.max(M, x), Math.max(M, vw - cardW - M));
  const clampY = (y: number) => Math.min(Math.max(TOP, y), Math.max(TOP, vh - cardH - M));
  if (tr.bottom + GAP + cardH <= vh - M)
    return { hole, top: tr.bottom + GAP, left: clampX(tr.left), width: cardW, sheet: false };
  if (tr.top - GAP - cardH >= TOP)
    return { hole, top: tr.top - GAP - cardH, left: clampX(tr.left), width: cardW, sheet: false };
  if (tr.right + GAP + cardW <= vw - M)
    return { hole, left: tr.right + GAP, top: clampY(tr.top), width: cardW, sheet: false };
  if (tr.left - GAP - cardW >= M)
    return { hole, left: tr.left - GAP - cardW, top: clampY(tr.top), width: cardW, sheet: false };
  // Nothing fits beside it: dock as a sheet in whichever half the target isn't.
  const midY = tr.top + tr.height / 2;
  const top = midY > vh / 2 ? TOP : Math.max(TOP, vh - cardH - M);
  return { hole, top, left: (vw - cardW) / 2, width: cardW, sheet: true };
}

// ------------------------------------------------------------------ component
export default function ReviewTour() {
  const [open, setOpen] = useState(false);

  // The portal only mounts after a client click, so `document` is always
  // present by the time `open` is true — no SSR guard needed.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Take a guided tour of the review session"
        aria-label="Guided tour of the review session"
        className="w-9 h-9 grid place-items-center rounded-full border border-line text-ink hover:border-accent hover:text-accent text-lg font-semibold"
      >
        ?
      </button>
      {open && createPortal(<TourOverlay onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function TourOverlay({ onClose }: { onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const def = STEPS[step];

  // demo session state
  const [phase, setPhase] = useState<Scene>('list');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [skipOpen, setSkipOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [held, setHeld] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [undoStack, setUndoStack] = useState<{ idx: number; snap: Draft }[]>([]);
  const [addUrl, setAddUrl] = useState('');
  const batch = 25; // cosmetic batch size for the demo

  const product = DEMO[idx];
  const draft = drafts[idx] ?? draftOf(product);

  // Apply a step: move the mock into the scene the step talks about.
  const applyStep = useCallback((n: number) => {
    const s = STEPS[n];
    setStep(n);
    setPhase(s.scene);
    setSkipOpen(!!s.skip);
    setSelected(s.select ? new Set([0]) : new Set());
  }, []);

  const next = useCallback(() => {
    if (step + 1 < STEPS.length) applyStep(step + 1);
    else onClose();
  }, [step, applyStep, onClose]);
  const back = useCallback(() => {
    if (step > 0) applyStep(step - 1);
  }, [step, applyStep]);

  // keyboard + scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [next, back, onClose]);

  // Bring the current target into view when the step/scene changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !def.target) return;
    const el = host.querySelector<HTMLElement>(`[data-tour="${def.target}"]`);
    el?.scrollIntoView({ block: 'center', inline: 'center' });
  }, [step, phase, skipOpen, def.target]);

  // Measure the target + card and place the coach-mark. All setState happens
  // inside rAF / listener callbacks (never synchronously in the effect body),
  // so it stays on the right side of the lint rule.
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    let r2 = 0;
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      const el = def.target ? host.querySelector<HTMLElement>(`[data-tour="${def.target}"]`) : null;
      const tr = el ? el.getBoundingClientRect() : null;
      const cardW = Math.min(360, window.innerWidth - 24);
      const cardH = cardRef.current?.offsetHeight ?? 200;
      setGeo(computeGeo(tr, cardW, cardH));
    };
    const r1 = requestAnimationFrame(() => {
      measure();
      r2 = requestAnimationFrame(measure);
    });
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [step, phase, skipOpen, def.target]);

  // ---- demo editor handlers (local only) ----
  const edit = (patch: Partial<Draft>) => {
    setUndoStack((u) => [...u, { idx, snap: draft }]);
    setDrafts((d) => ({ ...d, [idx]: { ...draft, ...patch } }));
  };
  const undo = () =>
    setUndoStack((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      setDrafts((d) => ({ ...d, [last.idx]: last.snap }));
      if (last.idx !== idx) setIdx(last.idx);
      return u.slice(0, -1);
    });
  const toggleRoom = (id: string) =>
    edit({
      roomIds: draft.roomIds.includes(id)
        ? draft.roomIds.filter((x) => x !== id)
        : [...draft.roomIds, id],
    });
  const removeImg = (i: number) => edit({ images: draft.images.filter((_, j) => j !== i) });
  const makeCover = (i: number) =>
    edit({ images: [draft.images[i], ...draft.images.filter((_, j) => j !== i)] });
  const moveImg = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.images.length) return;
    const imgs = [...draft.images];
    const [m] = imgs.splice(from, 1);
    imgs.splice(to, 0, m);
    edit({ images: imgs });
  };
  const addImage = () => {
    const u = addUrl.trim();
    if (!/^https?:\/\//i.test(u)) return;
    edit({ images: [...draft.images, { id: `u${Date.now()}`, url: u }] });
    setAddUrl('');
  };
  const nextProduct = () => setIdx((i) => (i + 1) % DEMO.length);
  const markReviewed = () => {
    setReviewed((n) => n + 1);
    nextProduct();
    if (def.target === 'markreviewed') applyStep(step + 1);
  };
  const resolveSkip = (what: 'skip' | 'hold') => {
    setSkipOpen(false);
    if (what === 'hold') {
      setHeld((n) => n + 1);
      nextProduct();
    } else nextProduct();
    if (def.skip) applyStep(step + 1);
  };

  const dim = 'rgba(20,16,10,0.62)';
  const inShell = phase !== 'editor';

  return (
    <div ref={hostRef} className="fixed inset-0 z-[200] flex flex-col" aria-modal role="dialog">
      {/* persistent top bar — always offers a close, whatever the card does */}
      <div className="relative z-[230] flex items-center justify-between gap-2 h-12 px-4 bg-surface border-b border-line shrink-0">
        <span className="text-xs sm:text-sm text-muted truncate">
          <b className="text-heading">Guided tour</b> · sample data — nothing is saved
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:border-accent whitespace-nowrap"
        >
          Close ✕
        </button>
      </div>

      {/* ---- demo stage ---- */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-auto bg-surface-2">
          <div className={inShell ? 'min-h-full' : 'h-full'}>
            {phase === 'editor' ? (
              <DemoEditor
                draft={draft}
                product={product}
                batch={batch}
                reviewed={reviewed}
                held={held}
                undoCount={undoStack.length}
                addUrl={addUrl}
                setAddUrl={setAddUrl}
                onEdit={edit}
                onUndo={undo}
                onToggleRoom={toggleRoom}
                onRemoveImg={removeImg}
                onMakeCover={makeCover}
                onMoveImg={moveImg}
                onAddImage={addImage}
                onSkip={() => setSkipOpen(true)}
                onReviewed={markReviewed}
              />
            ) : (
              <DemoShell>
                {phase === 'list' && <DemoListMain selected={selected} setSelected={setSelected} />}
                {phase === 'facets' && <DemoFacetsMain />}
                {phase === 'start' && <DemoStartMain batch={batch} />}
                {phase === 'done' && <DemoDoneMain reviewed={reviewed} held={held} batch={batch} />}
              </DemoShell>
            )}
          </div>
        </div>
      </div>

      {/* ---- skip prompt ---- */}
      {skipOpen && (
        <div className="fixed inset-0 top-12 z-[210] flex items-center justify-center p-4">
          <div
            data-tour="skip-modal"
            className="bg-surface border border-line rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[80vh] overflow-auto"
          >
            <h3 className="text-lg font-bold text-heading">This one isn’t reviewed yet</h3>
            <p className="text-muted text-sm mt-1">
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
                className="text-start border border-line-strong bg-surface-2 rounded-xl p-3 hover:border-accent"
              >
                <b className="block text-yellow-600">Move to “Ask the client”</b>
                <span className="text-muted text-sm">Saves your edits and parks it for a question.</span>
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

      {/* ---- dim + spotlight hole (purely visual; clicks pass through) ---- */}
      {geo?.hole ? (
        <div
          className="pointer-events-none fixed rounded-xl transition-all duration-300 ease-out"
          style={{
            top: geo.hole.top,
            left: geo.hole.left,
            width: geo.hole.width,
            height: geo.hole.height,
            boxShadow: `0 0 0 100vmax ${dim}`,
            outline: '2px solid rgba(255,255,255,0.9)',
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 top-12" style={{ background: dim }} />
      )}

      {/* ---- coach-mark card ---- */}
      <div
        ref={cardRef}
        className={`fixed z-[220] rounded-2xl border border-line bg-surface shadow-2xl p-5 transition-opacity ${
          geo ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          top: geo?.top ?? 0,
          left: geo?.left ?? 0,
          width: geo?.width ?? 340,
          maxHeight: 'calc(100vh - 72px)',
          overflow: 'auto',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono uppercase tracking-wide text-muted">
            Step {step + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-accent text-sm"
            aria-label="Close tour"
          >
            Skip ✕
          </button>
        </div>
        <h3 className="text-lg font-bold text-heading mt-2">{def.title}</h3>
        <p className="text-ink text-sm mt-1.5 leading-relaxed">{def.body}</p>

        <div className="flex gap-1 mt-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-brand-brown' : 'bg-surface-2'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            ‹ Back
          </button>
          <button
            type="button"
            onClick={next}
            className="px-5 py-1.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm font-semibold"
          >
            {step + 1 === STEPS.length ? 'Done' : 'Next ›'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------- dashboard shell
function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="w-40 sm:w-52 shrink-0 bg-bg-deep border-e border-line flex flex-col">
        <div className="flex items-center justify-end p-2">
          <span className="w-8 h-8 grid place-items-center rounded-md border border-line-strong text-muted text-sm">
            «
          </span>
        </div>
        <div className="px-4 pb-6 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
          <span className="text-heading font-bold px-1">Attractive Home</span>
          <nav className="flex flex-col gap-1">
            {NAV.map((label) => {
              const active = label === 'Products';
              const key = label === 'Products' ? 'nav-products' : label === 'Facets' ? 'nav-facets' : undefined;
              return (
                <span
                  key={label}
                  data-tour={key}
                  className={
                    active
                      ? 'px-3 py-2 rounded-lg bg-accent-2/15 text-heading font-medium border-s-2 border-accent text-sm'
                      : 'px-3 py-2 rounded-lg text-ink hover:bg-accent-2/10 text-sm'
                  }
                >
                  {label}
                </span>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-auto">{children}</main>
    </div>
  );
}

// ------------------------------------------------------------- scene: list
function DemoListMain({
  selected,
  setSelected,
}: {
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
}) {
  const statuses: (keyof typeof REVIEW_BADGE)[] = ['new', 'reviewed', 'ask_client'];
  const toggle = (i: number) => {
    const n = new Set(selected);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    setSelected(n);
  };
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 flex-wrap">
        <h1 className="text-xl font-bold text-heading">
          Products <span className="text-muted text-sm font-normal">(4,276)</span>
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span data-tour="view-tabs" className="flex rounded-lg border border-line overflow-hidden text-sm">
            <span className="px-3 py-2 text-ink">Table</span>
            <span className="px-3 py-2 bg-accent-2/15 text-heading font-medium">Cards</span>
          </span>
          <span className="w-9 h-9 grid place-items-center rounded-full border border-line text-ink">?</span>
          <span className="px-3 py-2 rounded-lg border border-accent text-accent text-sm whitespace-nowrap">
            ▶ Review session
          </span>
          <span className="px-3 py-2 rounded-lg bg-brand-brown text-white text-sm whitespace-nowrap">
            + New
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
        <span className="px-3 py-1 rounded-full text-sm border border-line text-ink">No image</span>
        <span className="px-3 py-1 rounded-full text-sm border border-line text-ink">No material</span>
        <span data-tour="review-chips" className="inline-flex gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-sm border border-red-500 text-red-700 bg-red-500/10">
            Not reviewed
          </span>
          <span className="px-3 py-1 rounded-full text-sm border border-green-500 text-green-700 bg-green-500/10">
            Reviewed
          </span>
          <span className="px-3 py-1 rounded-full text-sm border border-yellow-500 text-yellow-700 bg-yellow-500/20">
            Ask client
          </span>
        </span>
      </div>

      {/* The review button again, in the header region, as the session launcher */}
      <div className="px-4 sm:px-5 pb-2">
        <span
          data-tour="review-btn"
          className="inline-block px-4 py-2 rounded-lg border border-accent text-accent text-sm"
        >
          ▶ Review session
        </span>
      </div>

      <div className="flex-1 p-4 sm:p-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {DEMO.map((p, i) => {
            const status = statuses[i % statuses.length];
            const badge = REVIEW_BADGE[status];
            const on = selected.has(i);
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => toggle(i)}
                data-tour={i === 0 ? 'card' : undefined}
                className={`text-start rounded-xl border bg-surface overflow-hidden transition-colors ${
                  on ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50'
                }`}
              >
                <div className="relative aspect-[4/3] bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.images[0].url} alt="" className="w-full h-full object-cover" />
                  <span
                    className={`absolute top-2 start-2 w-5 h-5 grid place-items-center rounded-full border text-[11px] ${
                      on ? 'bg-accent border-accent text-white' : 'bg-surface/80 border-line'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-medium text-ink truncate">{p.name || p.code}</p>
                  <div className="flex items-center justify-between mt-1.5 gap-1">
                    <span className="text-[11px] font-mono text-muted truncate">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <div
          data-tour="bulkbar"
          className="sticky bottom-0 border-t border-line bg-surface px-4 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 flex-wrap"
        >
          <span className="text-sm font-medium text-heading">{selected.size} selected</span>
          <span className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink">
            Move to list… ▾
          </span>
          <span className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink">Publish</span>
          <span className="hidden sm:inline px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink">
            Unpublish
          </span>
          <span className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-red-600">Delete</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ms-auto text-sm text-muted hover:text-accent"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------- scene: facets
function DemoFacetsMain() {
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-heading mb-1">Facets</h1>
      <p className="text-muted mb-6 text-sm">Vocabularies that classify products and drive the catalog filters.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {VOCAB.map((v) => (
          <span
            key={v.name}
            data-tour={v.name === 'Materials' ? 'facet-card' : undefined}
            className="flex items-center justify-between bg-surface rounded-lg border border-line p-4 hover:border-accent/60"
          >
            <span className="text-ink font-medium">{v.name}</span>
            <span className="text-muted text-sm">{v.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ scene: start
function DemoStartMain({ batch }: { batch: number }) {
  return (
    <div className="max-w-xl mx-auto py-8 sm:py-10 px-4 sm:px-5">
      <span className="text-sm text-muted">← Back to products</span>
      <h1 className="text-2xl font-bold text-heading mt-3">Review session</h1>
      <div className="mt-5 bg-surface border border-line rounded-xl p-5 sm:p-6">
        <p className="text-ink">
          <b className="text-accent text-lg">128</b> not-reviewed products match your filters.
        </p>
        <label className="block mt-6 text-sm font-medium text-ink">How many to review now?</label>
        <div data-tour="range" className="flex items-center gap-4 mt-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            defaultValue={batch}
            className="flex-1 accent-amber-700"
            aria-label="Products this session"
          />
          <span className="font-mono text-2xl font-bold text-heading w-14 text-right">{batch}</span>
        </div>
        <p className="text-xs text-muted mt-1">A session runs one product at a time (10–100).</p>
        <span
          data-tour="start-btn"
          className="mt-6 w-full block text-center py-3 rounded-lg bg-brand-brown text-white font-semibold"
        >
          ▶ Start reviewing {batch}
        </span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- scene: editor
function DemoEditor(props: {
  draft: Draft;
  product: DemoProduct;
  batch: number;
  reviewed: number;
  held: number;
  undoCount: number;
  addUrl: string;
  setAddUrl: (v: string) => void;
  onEdit: (p: Partial<Draft>) => void;
  onUndo: () => void;
  onToggleRoom: (id: string) => void;
  onRemoveImg: (i: number) => void;
  onMakeCover: (i: number) => void;
  onMoveImg: (from: number, to: number) => void;
  onAddImage: () => void;
  onSkip: () => void;
  onReviewed: () => void;
}) {
  const {
    draft,
    product,
    reviewed,
    held,
    undoCount,
    addUrl,
    setAddUrl,
    onEdit,
    onUndo,
    onToggleRoom,
    onRemoveImg,
    onMakeCover,
    onMoveImg,
    onAddImage,
    onSkip,
    onReviewed,
    batch,
  } = props;
  const pct = Math.round((reviewed / batch) * 100);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full bg-surface">
      <div data-tour="progress" className="h-1.5 bg-surface-2">
        <div className="h-full bg-brand-brown transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-line">
        <span className="font-semibold text-heading">
          Product {reviewed + 1} of {batch}
        </span>
        <span className="text-sm text-muted">
          {reviewed} reviewed{held ? ` · ${held} to ask client` : ''}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            data-tour="undo"
            onClick={onUndo}
            disabled={!undoCount}
            className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            ↶ Undo{undoCount ? ` (${undoCount})` : ''}
          </button>
          <span data-tour="endsession" className="px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink">
            End session
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid md:grid-cols-2 overflow-auto">
        {/* images */}
        <div data-tour="images" className="p-5 border-b md:border-b-0 md:border-e border-line">
          <div className="grid grid-cols-2 gap-3">
            {draft.images.map((img, i) => (
              <div
                key={img.id}
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
                  if (dragIdx !== null) onMoveImg(dragIdx, i);
                  setDragIdx(null);
                  setOverIdx(null);
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
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
                <span className="absolute top-1.5 start-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/55 text-white">
                  {i === 0 ? '★ cover' : i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-0.5 p-1 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onMoveImg(i, i - 1)}
                    disabled={i === 0}
                    title="Move earlier"
                    className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20 disabled:opacity-30"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveImg(i, i + 1)}
                    disabled={i === draft.images.length - 1}
                    title="Move later"
                    className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20 disabled:opacity-30"
                  >
                    ▶
                  </button>
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => onMakeCover(i)}
                      title="Set as cover"
                      className="text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-white/20"
                    >
                      ★
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveImg(i)}
                    title="Remove image"
                    className="ms-auto text-[11px] text-white px-1.5 py-0.5 rounded hover:bg-red-500/60"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddImage();
                }
              }}
              placeholder="Add image by URL (https://…)"
              className={SELECT_CLS}
            />
            <button
              type="button"
              onClick={onAddImage}
              disabled={!/^https?:\/\//i.test(addUrl.trim())}
              className="px-3 rounded-lg border border-line-strong text-ink hover:border-accent disabled:opacity-40 whitespace-nowrap text-sm"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-muted mt-2">
            Drag to reorder, or use ◀ ▶; the first image is the cover (★).{' '}
            <span data-tour="full-editor" className="text-accent underline">
              Open full product editor ↗
            </span>{' '}
            for crop / flip / rotate &amp; file uploads.
          </p>
        </div>

        {/* fields */}
        <div data-tour="fields" className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Name (EN)
            </label>
            <input
              className={SELECT_CLS}
              value={draft.name}
              onChange={(e) => onEdit({ name: e.target.value })}
              placeholder={product.code}
            />
            <p className="text-[11px] text-muted mt-1">
              {product.source} · <span className="font-mono">{product.code}</span>
            </p>
          </div>
          <Facet label="Type" value={draft.typeId} options={TYPES} onChange={(v) => onEdit({ typeId: v })} />
          <Facet label="Look" value={draft.lookId} options={LOOKS} onChange={(v) => onEdit({ lookId: v })} />
          <Facet
            label="Material"
            value={draft.materialId}
            options={MATERIALS}
            onChange={(v) => onEdit({ materialId: v })}
          />
          <Facet
            label="Collection"
            value={draft.collectionId}
            options={COLLECTIONS}
            onChange={(v) => onEdit({ collectionId: v })}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Rooms / use
            </label>
            <div className="flex flex-wrap gap-2">
              {ROOMS.map((a) => {
                const on = draft.roomIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onToggleRoom(a.id)}
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
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t border-line">
        <span className="w-10 h-10 grid place-items-center rounded-lg border border-line-strong text-lg text-muted">
          ‹
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 h-10 rounded-lg border border-line-strong text-ink hover:border-accent"
        >
          Skip →
        </button>
        <button
          type="button"
          data-tour="markreviewed"
          onClick={onReviewed}
          className="ms-auto px-5 h-10 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white font-semibold"
        >
          ✓ Mark reviewed &amp; next
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- scene: done
function DemoDoneMain({ reviewed, held, batch }: { reviewed: number; held: number; batch: number }) {
  const left = Math.max(0, batch - reviewed - held);
  return (
    <div className="grid place-items-center p-8 min-h-full">
      <div data-tour="summary" className="max-w-lg text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-heading mt-3">Session complete</h1>
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
        <div className="flex gap-3 justify-center mt-8 flex-wrap">
          <span className="px-5 py-2.5 rounded-lg bg-surface border border-line text-ink">
            Back to products
          </span>
          <span className="px-5 py-2.5 rounded-lg bg-brand-brown text-white">Review more</span>
        </div>
      </div>
    </div>
  );
}
