'use client';

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent as ReactFormEvent,
  type ReactNode,
} from 'react';
import dagre from 'dagre';
import ConfirmDelete from './ConfirmDelete';
import {
  renameBuild,
  deleteBuild,
  addUpgrade,
  deleteUpgrade,
  addSizeStep,
  deleteSizeStep,
  addTreeNode,
  deleteTreeNode,
  deleteNodes,
  duplicateNodes,
  moveNodes,
  restorePriceTree,
  setTreeNodePrice,
  setTreeNodeInfo,
  createVocabGroup,
  addVocabValue,
  createAddon,
  createColorNode,
  renameAddon,
  deleteAddon,
  attachAddon,
  detachAddon,
  attachAddonToBase,
  detachAddonFromBase,
  attachAddonToAddon,
  detachAddonFromAddon,
  setAddonPrice,
  setAddonInfo,
  setColorNodeColor,
  addPriceUnit,
  type FormState,
} from './actions';
import type { EditorModel, BuildVM, NumberQ } from './model';
import type { PriceTreeData, PTNode, VocabGroup, PriceUnit } from './priceTree';

type Colour = { id: string; name: string; hex: string | null };

// ---------------------------------------------------------------------------
// The canvas model — the door drawn as a map. The door forks into builds; each
// build owns section boxes (Base price, Add-ons, Size steps); Colours and any
// all-build boxes are shared and wire into every build. Derived from the same
// EditorModel that prices the door, so the picture and the price never disagree.
// ---------------------------------------------------------------------------

type NType =
  | 'family' | 'frame' | 'group' | 'price' | 'upgrade' | 'size' | 'colour'
  | 'pnode' | 'addon' | 'anode';
type NRole =
  | 'family' | 'frame' | 'section' | 'price' | 'upgrade' | 'size' | 'colour'
  | 'pnode' | 'addon' | 'anode';

type CNode = {
  id: string;
  type: NType;
  role: NRole;
  label: string;
  pub: boolean;
  note?: string | null;
  amount?: number;
  unit?: string;
  range?: string | null;
  measure?: string | null;
  swatch?: string | null;
  colorVar?: string;
  // section-only
  sectionKind?: 'base' | 'addons' | 'size' | 'colours';
  scope?: string; // 'shared' | variantId
  gridVariantId?: string;
  count?: number;
  // price-branch (pnode) and add-on option (anode)
  variantId?: string;
  pnodeId?: string;
  parentPnodeId?: string | null;
  question?: string; // the question this branch answers (its group's name)
  isLeaf?: boolean;
  hasNotes?: boolean; // carries a description or configuration
  subLabel?: string | null; // pre-computed subtitle (price / "choice" / next question)
  // add-on only
  addonId?: string;
  faded?: boolean; // an add-on with no attachment — floats, grayed out
  isColorNode?: boolean; // an add-on that carries one bespoke colour (swatch set)
};

type Section = {
  id: string;
  memberIds: string[];
  owner: string[]; // variant ids that wire into this box
  kind: 'flat' | 'tree'; // 'tree' = the base-price decision tree (connected, deep)
};

// A named add-on drawn on the canvas: a header whose option tree hangs below it,
// wired into the base tree by edges from each base branch it's attached to.
type AddonVM = {
  headerId: string;
  variantId: string;
  addonId: string;
  baseBoxId: string;
  optionIds: string[]; // canvas ids (an:*) of this add-on's option nodes
  attachBaseIds: string[]; // canvas ids (pn:*/an:*) of the nodes it attaches to
  attachBase: boolean; // attached to the whole base price (the base box)
  attachAddonIds: string[]; // canvas ids (ad:*) of the add-ons it applies to
};

type Canvas = {
  nodes: Record<string, CNode>;
  sections: Section[];
  addons: AddonVM[];
  buildIds: string[];
  // A tree product is one product = one tree, so the single build is implicit and
  // its boxes hang straight off the product. Only a legacy template with a real
  // fork (>1 build) still shows the build layer.
  showBuilds: boolean;
};

// What a palette item carries while it's being dragged onto the canvas.
type DragPayload =
  | { kind: 'option'; groupId: string; valueId: string }
  | { kind: 'new-addon' }
  | { kind: 'new-color' }
  | { kind: 'attach'; addonId: string };

const DRAG_MIME = 'application/x-ah-node';

// The canvas node under a screen point, if any. Uses elementsFromPoint (the whole
// stack, top-to-bottom) rather than elementFromPoint, so an overlay drawn above the
// nodes — an × unlink mark, a cluster label, an edge endpoint — never hides the
// node beneath it from a drop. (Screen coords, so pan/zoom don't matter.)
function nodeIdAtPoint(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const g = el.closest('.gnode');
    if (g) return g.getAttribute('data-id');
  }
  return null;
}

// Resolve a canvas node into the tree slot a cut/paste would drop branches into:
// which build, which tree (addonId '' = the base tree, else an add-on id), and
// under which parent (parentId '' = that tree's top level). null = not somewhere
// price branches can attach (the door, a build header, size/colour boxes, …).
function dropSlot(n: CNode): { variantId: string; addonId: string; parentId: string } | null {
  if (!n.variantId) return null;
  if (n.role === 'section' && n.sectionKind === 'base')
    return { variantId: n.variantId, addonId: '', parentId: '' };
  if (n.role === 'pnode' && n.pnodeId) return { variantId: n.variantId, addonId: '', parentId: n.pnodeId };
  if (n.role === 'addon' && n.addonId) return { variantId: n.variantId, addonId: n.addonId, parentId: '' };
  if (n.role === 'anode' && n.addonId && n.pnodeId)
    return { variantId: n.variantId, addonId: n.addonId, parentId: n.pnodeId };
  return null;
}

const TYPE_VAR: Record<NType, string> = {
  family: '--tc-family',
  frame: '--tc-frame',
  group: '--tc-group',
  price: '--tc-price',
  upgrade: '--tc-upgrade',
  size: '--tc-size',
  colour: '--tc-colour',
  pnode: '--tc-price', // price branches share the base-price green
  addon: '--tc-upgrade', // add-ons in the upgrade gold
  anode: '--tc-upgrade',
};

const UNIT_LABEL: Record<string, string> = {
  flat: '',
  per_unit: '/unit',
  per_set: '/set',
  per_piece: '/pc',
  per_sqm: '/m²',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const rangeText = (min: number | null, max: number | null) => {
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}`;
  if (min !== null) return `from ${fmt(min)}`;
  if (max !== null) return `up to ${fmt(max)}`;
  return null;
};

// A stable, order-independent serialization of every base-price tree — the unit
// of undo/redo. It carries exactly the columns that define the tree and its
// prices (names come from the shared vocabulary, so they're left out), sorted so
// the same tree always yields the same string.
function snapshotPriceTrees(priceTrees: Record<string, PriceTreeData>): string {
  type Row = {
    id: string;
    parentId: string | null;
    addonId: string | null;
    groupId: string;
    valueId: string;
    amount: number | null;
    priceUnit: string | null;
    description: string | null;
    configuration: string | null;
    sortOrder: number;
  };
  const row = (n: PTNode, addonId: string | null): Row => ({
    id: n.id,
    parentId: n.parentId,
    addonId,
    groupId: n.groupId,
    valueId: n.valueId,
    amount: n.amount,
    priceUnit: n.priceUnit,
    description: n.description,
    configuration: n.configuration,
    sortOrder: n.sortOrder,
  });
  const out: Record<string, Row[]> = {};
  for (const vid of Object.keys(priceTrees).sort()) {
    // Version the WHOLE tree — the base branches AND every add-on's branches — so
    // moving a branch between trees (a cut/paste across trees) can be undone.
    const rows = priceTrees[vid].nodes.map((n) => row(n, null));
    for (const a of priceTrees[vid].addons) for (const n of a.nodes) rows.push(row(n, a.id));
    out[vid] = rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return JSON.stringify(out);
}

function buildCanvas(
  model: EditorModel,
  colours: Colour[],
  productName: string,
  priceTrees: Record<string, PriceTreeData>,
  priceUnits: PriceUnit[],
): Canvas {
  const nodes: Record<string, CNode> = {};
  const sections: Section[] = [];
  const addons: AddonVM[] = [];
  const buildIds = model.builds.map((b) => b.variantId);
  const showBuilds = model.builds.length > 1;
  // How a declared price reads on the canvas: " per m²", " per box", or nothing.
  const unitLabel = new Map(priceUnits.map((u) => [u.code, u.label]));
  const unitSuffix = (code: string | null) => (code ? ` ${unitLabel.get(code) ?? code}` : '');

  nodes.door = {
    id: 'door',
    type: 'family',
    role: 'family',
    label: productName,
    pub: true,
    note: 'This product. Its base price tree, add-ons, size steps and colours hang off it below.',
  };

  const addSection = (
    id: string,
    memberIds: string[],
    owner: string[],
    box: CNode,
    kind: 'flat' | 'tree' = 'flat',
  ) => {
    box.count = memberIds.length;
    nodes[id] = box;
    sections.push({ id, memberIds, owner, kind });
  };

  model.builds.forEach((b: BuildVM) => {
    // With one build the product itself owns the boxes; with a real fork each
    // build owns its own.
    const owner = showBuilds ? [b.variantId] : ['door'];
    if (showBuilds) {
      nodes[b.variantId] = {
        id: b.variantId,
        type: 'frame',
        role: 'frame',
        label: b.name,
        pub: true,
        note: b.includedSpec,
      };
    }

    // Base price — a decision tree of choices, drawn as connected nodes that
    // hang below the box. Each branch is its own node; open the box to see them.
    const baseBoxId = `sec:${b.variantId}:base`;
    const tree = priceTrees[b.variantId];
    const pnodes = tree ? tree.nodes : [];
    const cur = tree?.currency ?? model.currency;
    const childrenOf = (pid: string | null) => pnodes.filter((n) => n.parentId === pid);
    const pnodeIds: string[] = [];
    for (const n of pnodes) {
      const id = `pn:${n.id}`;
      const kids = childrenOf(n.id);
      const isLeaf = kids.length === 0;
      const subLabel =
        n.amount !== null
          ? `${cur} ${fmt(n.amount)}${unitSuffix(n.priceUnit)}`
          : isLeaf
            ? 'choice'
            : `↳ ${kids[0].groupName}`;
      nodes[id] = {
        id,
        type: 'pnode',
        role: 'pnode',
        label: n.valueName,
        pub: false,
        variantId: b.variantId,
        pnodeId: n.id,
        parentPnodeId: n.parentId,
        question: n.groupName,
        isLeaf,
        hasNotes: Boolean(n.description || n.configuration),
        amount: n.amount ?? undefined,
        subLabel,
      };
      pnodeIds.push(id);
    }
    const roots = childrenOf(null);
    addSection(
      baseBoxId,
      pnodeIds,
      owner,
      {
        id: baseBoxId,
        type: 'group',
        role: 'section',
        label: 'Base price',
        pub: false,
        colorVar: TYPE_VAR.price,
        sectionKind: 'base',
        scope: b.variantId,
        variantId: b.variantId,
        gridVariantId: b.variantId,
        subLabel: roots.length ? `asks: ${roots[0].groupName}` : 'no price yet',
        note: 'The base price, built as a tree of choices. Open it to add branches — each branch is a node.',
      },
      'tree',
    );

    // Map every node id in this build to its canvas id, so an attachment can
    // anchor to a base branch (pn:) or to a node inside another add-on (an:).
    const canvasIdOf = new Map<string, string>();
    for (const n of pnodes) canvasIdOf.set(n.id, `pn:${n.id}`);
    for (const a of tree?.addons ?? [])
      for (const n of a.nodes) canvasIdOf.set(n.id, `an:${n.id}`);

    // Add-ons — each a named tree of its own, wired into the base tree by the
    // base branches it's attached to (built after this loop, once all base
    // nodes exist). A colour node is the same, plus a swatch.
    for (const a of tree?.addons ?? []) {
      const headerId = `ad:${a.id}`;
      const aChildrenOf = (pid: string | null) => a.nodes.filter((n) => n.parentId === pid);
      const optionIds: string[] = [];
      for (const n of a.nodes) {
        const id = `an:${n.id}`;
        const kids = aChildrenOf(n.id);
        const isLeaf = kids.length === 0;
        const subLabel =
          n.amount !== null
            ? `+${cur} ${fmt(n.amount)}${unitSuffix(n.priceUnit)}`
            : isLeaf
              ? 'choice'
              : `↳ ${kids[0].groupName}`;
        nodes[id] = {
          id,
          type: 'anode',
          role: 'anode',
          label: n.valueName,
          pub: false,
          variantId: b.variantId,
          addonId: a.id,
          pnodeId: n.id,
          parentPnodeId: n.parentId,
          question: n.groupName,
          isLeaf,
          hasNotes: Boolean(n.description || n.configuration),
          amount: n.amount ?? undefined,
          subLabel,
        };
        optionIds.push(id);
      }
      const anchorCount = a.baseNodeIds.length + a.targetAddonIds.length;
      const attachText = a.attachBase
        ? anchorCount === 0
          ? 'whole base'
          : `whole base +${anchorCount}`
        : anchorCount === 0
          ? 'not attached'
          : `${anchorCount} link${anchorCount === 1 ? '' : 's'}`;
      const priceText = a.amount !== null ? `+${cur} ${fmt(a.amount)}${unitSuffix(a.priceUnit)}` : null;
      const isColorNode = Boolean(a.colorHex);
      const colorText = isColorNode ? (a.colorName ?? 'colour') : null;
      const unattached = anchorCount === 0 && !a.attachBase;
      nodes[headerId] = {
        id: headerId,
        type: 'addon',
        role: 'addon',
        label: a.name,
        pub: false,
        colorVar: isColorNode ? '--tc-colornode' : TYPE_VAR.addon,
        variantId: b.variantId,
        addonId: a.id,
        count: a.nodes.length,
        hasNotes: Boolean(a.description || a.configuration),
        faded: unattached,
        isColorNode,
        swatch: a.colorHex,
        subLabel: [colorText, priceText, attachText].filter(Boolean).join(' · '),
        note: isColorNode
          ? 'A colour node: one bespoke colour with its own price and options, charged on top of the base for the configurations it is attached to.'
          : 'An add-on: its own price and options, charged on top of the base for the configurations it is attached to.',
      };
      addons.push({
        headerId,
        variantId: b.variantId,
        addonId: a.id,
        baseBoxId,
        optionIds,
        attachBaseIds: a.baseNodeIds
          .map((id) => canvasIdOf.get(id))
          .filter((x): x is string => Boolean(x)),
        attachBase: a.attachBase,
        attachAddonIds: a.targetAddonIds.map((id) => `ad:${id}`),
      });
    }

    // Size steps (bands).
    const szIds = b.sizeSteps.map((s) => {
      const id = `sz:${s.id}`;
      nodes[id] = {
        id,
        type: 'size',
        role: 'size',
        label: s.label,
        amount: s.amount,
        range: rangeText(s.min, s.max),
        measure: s.measure,
        pub: false,
      };
      return id;
    });
    addSection(`sec:${b.variantId}:size`, szIds, owner, {
      id: `sec:${b.variantId}:size`,
      type: 'group',
      role: 'section',
      label: 'Size steps',
      pub: false,
      colorVar: TYPE_VAR.size,
      sectionKind: 'size',
      scope: b.variantId,
      note: 'Surcharges applied automatically from the height/width given.',
    });
  });

  const owners = showBuilds ? buildIds : ['door'];

  // Shared size steps.
  if (model.shared.sizeSteps.length) {
    const szIds = model.shared.sizeSteps.map((s) => {
      const id = `sz:${s.id}`;
      nodes[id] = {
        id,
        type: 'size',
        role: 'size',
        label: s.label,
        amount: s.amount,
        range: rangeText(s.min, s.max),
        measure: s.measure,
        pub: false,
      };
      return id;
    });
    addSection('sec:shared:size', szIds, owners, {
      id: 'sec:shared:size',
      type: 'group',
      role: 'section',
      label: 'Size steps (all builds)',
      pub: false,
      colorVar: TYPE_VAR.size,
      sectionKind: 'size',
      scope: 'shared',
      note: 'Size surcharges applied to every build.',
    });
  }

  // Colours — customer-facing swatches, shared by all builds.
  const coIds = colours.map((c) => {
    const id = `co:${c.id}`;
    nodes[id] = {
      id,
      type: 'colour',
      role: 'colour',
      label: c.name || 'Colour',
      swatch: c.hex,
      pub: true,
    };
    return id;
  });
  addSection('sec:colours', coIds, owners, {
    id: 'sec:colours',
    type: 'group',
    role: 'section',
    label: 'Colours',
    pub: true,
    colorVar: TYPE_VAR.colour,
    sectionKind: 'colours',
    scope: 'shared',
    note: 'Customer-facing swatches, shared by every build. Managed in the colour library.',
  });

  return { nodes, sections, addons, buildIds, showBuilds };
}

// ---------------------------------------------------------------------------
// SVG drawing helpers (imperative — the canvas contents live outside React).
// ---------------------------------------------------------------------------

const SVGNS = 'http://www.w3.org/2000/svg';
function E<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}

// A smooth path through dagre's polyline points (Catmull-Rom → cubic bézier), so
// edges read as flowing curves instead of jagged elbows — much calmer when many
// attachment lines cross under the tree.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function measureWidth(ctx: CanvasRenderingContext2D, text: string, mono: boolean): number {
  ctx.font = mono
    ? "600 11px 'Brown Pro', system-ui, sans-serif"
    : "500 12.5px 'Brown Pro', system-ui, sans-serif";
  return ctx.measureText(text).width;
}

function wrapLabel(ctx: CanvasRenderingContext2D, label: string): string[] {
  if (measureWidth(ctx, label, false) <= 190) return [label];
  const w = label.split(' ');
  let best = -1;
  let bd = Infinity;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(' ');
    const b = w.slice(i).join(' ');
    const mx = Math.max(measureWidth(ctx, a, false), measureWidth(ctx, b, false));
    const d = Math.abs(measureWidth(ctx, a, false) - measureWidth(ctx, b, false));
    if (mx <= 210 && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best > 0 ? [w.slice(0, best).join(' '), w.slice(best).join(' ')] : [label];
}

function colorOf(n: CNode): string {
  return `var(${n.colorVar ?? TYPE_VAR[n.type]})`;
}
function fillFor(n: CNode): string {
  const col = colorOf(n);
  if (n.type === 'price') return `color-mix(in srgb, ${col} 14%, rgb(var(--surface)))`;
  if (n.type === 'family') return `color-mix(in srgb, ${col} 12%, rgb(var(--surface)))`;
  return `color-mix(in srgb, ${col} 7%, rgb(var(--surface)))`;
}

function subtitleOf(n: CNode, view: 'staff' | 'customer', cur: string): string | null {
  // Price/add-on branches and the base-price & add-on boxes carry a pre-computed
  // subtitle (a leaf price, "choice", or the next question). Staff-only.
  if (
    n.type === 'pnode' ||
    n.type === 'anode' ||
    n.type === 'addon' ||
    n.sectionKind === 'base'
  ) {
    return view === 'customer' ? null : (n.subLabel ?? null);
  }
  if (n.role === 'section') return `${n.count ?? 0} inside`;
  if (view === 'customer') return null;
  if (n.role === 'upgrade') return `+${cur} ${fmt(n.amount ?? 0)}${UNIT_LABEL[n.unit ?? 'flat'] ?? ''}`;
  if (n.role === 'size') return `+${cur} ${fmt(n.amount ?? 0)}`;
  if (n.role === 'price') return n.note?.startsWith('No ') ? 'not set' : 'table';
  return null;
}

type Size = { w: number; h: number; lines: string[]; sub: string | null };
function sizeFor(ctx: CanvasRenderingContext2D, n: CNode, view: 'staff' | 'customer', cur: string): Size {
  if (n.type === 'colour') {
    return { w: Math.max(64, measureWidth(ctx, n.label, false) + 20), h: 56, lines: [n.label], sub: null };
  }
  const lines = wrapLabel(ctx, n.label);
  const sub = subtitleOf(n, view, cur);
  let tw = 0;
  lines.forEach((l) => (tw = Math.max(tw, measureWidth(ctx, l, false))));
  if (sub) tw = Math.max(tw, measureWidth(ctx, sub, n.role !== 'section') + 4);
  const padY = 20;
  let padX = 34;
  if (n.type === 'upgrade') padX = 42;
  else if (n.type === 'size') padX = 46;
  const nLines = lines.length + (sub ? 1 : 0);
  return { w: Math.max(78, tw + padX), h: Math.max(40, nLines * 16 + padY), lines, sub };
}

function shapeEl(n: CNode, w: number, h: number): SVGElement {
  const x = -w / 2;
  const y = -h / 2;
  let el: SVGElement;
  if (n.type === 'frame') el = E('rect', { x, y, width: w, height: h, rx: 3 });
  else if (n.type === 'family') el = E('rect', { x, y, width: w, height: h, rx: 14 });
  else if (n.type === 'price') el = E('rect', { x, y, width: w, height: h, rx: 9 });
  else if (n.type === 'upgrade') {
    const s = 12;
    el = E('polygon', { points: `${x + s},${y} ${x + w},${y} ${x + w - s},${y + h} ${x},${y + h}` });
  } else if (n.type === 'size') {
    const k = 12;
    el = E('polygon', {
      points: `${x + k},${y} ${x + w - k},${y} ${x + w},0 ${x + w - k},${y + h} ${x + k},${y + h} ${x},0`,
    });
  } else el = E('rect', { x, y, width: w, height: h, rx: 9 });
  el.setAttribute('class', 'shape');
  el.style.stroke = colorOf(n);
  el.style.fill = fillFor(n);
  return el;
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export default function TreeEditor({
  productId,
  productName,
  model,
  colours,
  priceTrees,
  vocab,
  priceUnits,
}: {
  productId: string;
  productName: string;
  model: EditorModel;
  colours: Colour[];
  priceTrees: Record<string, PriceTreeData>;
  vocab: VocabGroup[];
  priceUnits: PriceUnit[];
}) {
  const cur = model.currency;
  const canvas = useMemo(
    () => buildCanvas(model, colours, productName, priceTrees, priceUnits),
    [model, colours, productName, priceTrees, priceUnits],
  );
  // Existing add-ons & colour nodes, flattened for the palette's "drag to connect" list.
  const paletteAddons = useMemo(() => {
    const out: { addonId: string; name: string; colorHex: string | null; isColor: boolean }[] = [];
    for (const vid of Object.keys(priceTrees))
      for (const a of priceTrees[vid].addons)
        out.push({ addonId: a.id, name: a.name, colorHex: a.colorHex, isColor: Boolean(a.colorHex) });
    return out;
  }, [priceTrees]);

  const [view, setView] = useState<'staff' | 'customer'>('staff');
  // Expanded section / branch ids. Default: the base box and its first level are
  // open, so the tree shows the top choices but the second level (each first
  // choice's children) stays closed until you click its +.
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const vid of Object.keys(priceTrees)) {
      s.add(`sec:${vid}:base`);
      for (const n of priceTrees[vid].nodes) if (n.parentId === null) s.add(`pn:${n.id}`);
    }
    return s;
  });
  // Clipboard of picked price branches: the source ids and which tree they came
  // from (build + addonId, '' = the base tree). Copy (Ctrl+C) duplicates within
  // that same tree on paste; cut (Ctrl+X) moves the originals to ANY tree.
  const [clip, setClip] = useState<{
    variantId: string;
    addonId: string;
    sourceIds: string[];
    mode: 'copy' | 'cut';
  } | null>(null);
  // Connect mode: click an add-on and a base branch to attach them.
  const [connectMode, setConnectMode] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const nodeClickRef = useRef<(id: string, ev: MouseEvent) => void>(() => {});
  // Drag-and-drop from the palette onto canvas nodes (create / attach).
  const [dropMsg, setDropMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const dragHiRef = useRef<string | null>(null);
  // Multi-selection: plain click selects one; Ctrl/⌘/Shift-click toggles more.
  const [sel, setSel] = useState<Set<string>>(() => new Set(['door']));

  const svgRef = useRef<SVGSVGElement>(null);
  const vpRef = useRef<SVGGElement | null>(null);
  const nodesLayerRef = useRef<SVGGElement | null>(null);
  const clustersLayerRef = useRef<SVGGElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const selRef = useRef(sel);
  const refitRef = useRef(true);
  const tx = useRef(0);
  const ty = useRef(0);
  const scale = useRef(1);
  const layout = useRef({ w: 1, h: 1 });

  const applyTransform = useCallback(() => {
    vpRef.current?.setAttribute(
      'transform',
      `translate(${tx.current},${ty.current}) scale(${scale.current})`,
    );
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const cw = svg.clientWidth || 900;
    const ch = svg.clientHeight || 640;
    const s = Math.min(cw / layout.current.w, ch / layout.current.h) * 0.92;
    scale.current = Math.max(0.18, Math.min(1.3, s));
    tx.current = (cw - layout.current.w * scale.current) / 2;
    ty.current = (ch - layout.current.h * scale.current) / 2;
    applyTransform();
  }, [applyTransform]);

  const zoomBy = useCallback(
    (f: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const cx = svg.clientWidth / 2;
      const cy = svg.clientHeight / 2;
      const ns = Math.max(0.18, Math.min(2.4, scale.current * f));
      tx.current = cx - (cx - tx.current) * (ns / scale.current);
      ty.current = cy - (cy - ty.current) * (ns / scale.current);
      scale.current = ns;
      applyTransform();
    },
    [applyTransform],
  );

  const select = useCallback((id: string, additive = false) => {
    setSel((prev) => {
      let next: Set<string>;
      if (additive) {
        next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size === 0) next.add('door');
      } else {
        next = new Set([id]);
      }
      selRef.current = next;
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    const next = new Set(['door']);
    selRef.current = next;
    setSel(next);
  }, []);

  // ---- drag-and-drop from the palette onto canvas nodes ----
  // Highlight the node currently under a drag (a DOM class toggle, no rebuild).
  const setDropHi = useCallback((id: string | null) => {
    if (dragHiRef.current === id) return;
    const layer = nodesLayerRef.current;
    if (dragHiRef.current)
      layer
        ?.querySelector(`.gnode[data-id="${CSS.escape(dragHiRef.current)}"]`)
        ?.classList.remove('drop-hi');
    if (id) layer?.querySelector(`.gnode[data-id="${CSS.escape(id)}"]`)?.classList.add('drop-hi');
    dragHiRef.current = id;
  }, []);

  const flashDrop = useCallback((msg: string, ok = false) => {
    setDropMsg({ text: msg, ok });
    window.setTimeout(() => setDropMsg(null), ok ? 2500 : 4000);
  }, []);

  // What a dropped palette item does, given the node it landed on (or null for
  // empty canvas). `option` builds a price branch; `new-*` creates an add-on or
  // colour node (attached to the target, or floating); `attach` links an existing
  // add-on/colour node — drop it on many nodes to connect it to all of them.
  const handleDrop = useCallback(
    async (payload: DragPayload, targetId: string | null) => {
      const t = targetId ? canvas.nodes[targetId] : null;
      const variantId = t?.variantId ?? canvas.buildIds[0];
      if (!variantId) return;

      if (payload.kind === 'option') {
        if (!t) {
          flashDrop('Drop an option onto a branch, the Base price box, or an add-on.');
          return;
        }
        let parentId = '';
        let addonId = '';
        if (t.sectionKind === 'base') parentId = '';
        else if (t.role === 'pnode' && t.pnodeId) parentId = t.pnodeId;
        else if (t.role === 'anode' && t.pnodeId) {
          parentId = t.pnodeId;
          addonId = t.addonId ?? '';
        } else if (t.role === 'addon' && t.addonId) addonId = t.addonId;
        else {
          flashDrop('Drop an option onto a branch, the Base price box, or an add-on.');
          return;
        }
        const fd = new FormData();
        fd.set('variantId', variantId);
        fd.set('parentId', parentId);
        if (addonId) fd.set('addonId', addonId);
        fd.set('groupId', payload.groupId);
        fd.set('valueId', payload.valueId);
        const res = await addTreeNode(productId, {}, fd);
        if (res?.error) flashDrop(res.error);
        else if (targetId) setOpen((prev) => new Set(prev).add(targetId));
      } else if (payload.kind === 'new-addon' || payload.kind === 'new-color') {
        const fd = new FormData();
        fd.set('variantId', variantId);
        fd.set('name', payload.kind === 'new-color' ? 'Colour' : 'Add-on');
        if (t?.pnodeId) fd.set('baseNodeId', t.pnodeId);
        else if (t?.sectionKind === 'base') fd.set('attachBase', '1');
        if (payload.kind === 'new-color') {
          fd.set('colorHex', '#8a6b4a');
          const res = await createColorNode(productId, {}, fd);
          if (res?.error) flashDrop(res.error);
        } else {
          const res = await createAddon(productId, {}, fd);
          if (res?.error) flashDrop(res.error);
        }
      } else if (payload.kind === 'attach') {
        if (!t) {
          flashDrop('Drop it onto a node, or the Base price box, to connect it.');
          return;
        }
        const fd = new FormData();
        fd.set('addonId', payload.addonId);
        if (t.sectionKind === 'base') {
          await attachAddonToBase(productId, fd);
          flashDrop('Connected to the whole base price.', true);
        } else if (t.role === 'addon' && t.addonId && t.addonId !== payload.addonId) {
          // Dropped on another add-on's header → link add-on to add-on.
          fd.set('targetAddonId', t.addonId);
          await attachAddonToAddon(productId, fd);
          flashDrop(`Connected to “${t.label}”.`, true);
        } else if (t.pnodeId && t.addonId !== payload.addonId) {
          fd.set('baseNodeId', t.pnodeId);
          await attachAddon(productId, fd);
          flashDrop(`Connected to “${t.label}”.`, true);
        } else {
          flashDrop('Pick a different node — that is the item itself.');
        }
      }
    },
    [canvas, productId, flashDrop],
  );

  // ---- undo / redo history of the base-price tree(s) ----
  const snap = useMemo(() => snapshotPriceTrees(priceTrees), [priceTrees]);
  const variantSig = useMemo(() => Object.keys(priceTrees).sort().join(','), [priceTrees]);
  const [hist, setHist] = useState<{ stack: string[]; cursor: number; varSig: string }>(() => ({
    stack: [snap],
    cursor: 0,
    varSig: variantSig,
  }));
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [, restoreDispatch, restoring] = useActionState<FormState, FormData>(
    restorePriceTree.bind(null, productId),
    {},
  );
  const [pasteState, pasteDispatch, pasting] = useActionState<FormState, FormData>(
    duplicateNodes.bind(null, productId),
    {},
  );
  const [moveState, moveDispatch, moving] = useActionState<FormState, FormData>(
    moveNodes.bind(null, productId),
    {},
  );

  // Keep the history in step with server state by adjusting during render
  // (React's "derive state from props" pattern) — no effect, so no
  // set-state-in-effect. Each branch is guarded so it converges in one pass.
  if (restoreTarget !== null) {
    if (snap === restoreTarget) setRestoreTarget(null); // our undo/redo landed
  } else if (snap !== hist.stack[hist.cursor]) {
    if (variantSig !== hist.varSig) {
      // A build was added/removed — a structural change we don't version; start
      // a fresh history from here so a restore never targets a gone build.
      setHist({ stack: [snap], cursor: 0, varSig: variantSig });
    } else {
      setHist((h) => {
        const stack = h.stack.slice(0, h.cursor + 1);
        stack.push(snap);
        const capped = stack.length > 60 ? stack.slice(stack.length - 60) : stack;
        return { stack: capped, cursor: capped.length - 1, varSig: h.varSig };
      });
    }
  }

  const canUndo = hist.cursor > 0 && !restoring;
  const canRedo = hist.cursor < hist.stack.length - 1 && !restoring;

  const doRestore = useCallback(
    (snapshot: string) => {
      const fd = new FormData();
      fd.set('snapshot', snapshot);
      startTransition(() => restoreDispatch(fd));
    },
    [restoreDispatch],
  );

  const undo = useCallback(() => {
    if (hist.cursor <= 0 || restoring) return;
    const target = hist.stack[hist.cursor - 1];
    setRestoreTarget(target);
    setHist((h) => ({ ...h, cursor: h.cursor - 1 }));
    doRestore(target);
  }, [hist, restoring, doRestore]);

  const redo = useCallback(() => {
    if (hist.cursor >= hist.stack.length - 1 || restoring) return;
    const target = hist.stack[hist.cursor + 1];
    setRestoreTarget(target);
    setHist((h) => ({ ...h, cursor: h.cursor + 1 }));
    doRestore(target);
  }, [hist, restoring, doRestore]);

  // ---- build the SVG imperatively whenever the shape/view/open-set changes ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctx =
      ctxRef.current ?? (ctxRef.current = document.createElement('canvas').getContext('2d'));
    if (!ctx) return;

    const isCustomer = view === 'customer';
    const passes = (pub: boolean) => !isCustomer || pub;

    // reset
    svg.textContent = '';
    const vp = E('g', {});
    const gClusters = E('g', {});
    const gEdges = E('g', {});
    const gNodes = E('g', {});
    const gLabels = E('g', {});
    vp.appendChild(gClusters);
    vp.appendChild(gEdges);
    vp.appendChild(gNodes);
    vp.appendChild(gLabels);
    svg.appendChild(vp);
    vpRef.current = vp;
    nodesLayerRef.current = gNodes;
    clustersLayerRef.current = gClusters;

    const g = new dagre.graphlib.Graph({ compound: true });
    g.setGraph({ rankdir: 'TB', nodesep: 26, ranksep: 66, marginx: 30, marginy: 30 });
    g.setDefaultEdgeLabel(() => ({}));

    const sizes: Record<string, Size> = {};
    const reg = (id: string) => {
      const s = sizeFor(ctx, canvas.nodes[id], view, cur);
      sizes[id] = s;
      g.setNode(id, { width: s.w, height: s.h });
    };
    const edges: {
      from: string;
      to: string;
      shared: boolean;
      attach?: { addonId: string; baseNodeId?: string; base?: boolean; targetAddonId?: string };
      colorLink?: boolean; // an attachment from a colour node (pink) vs an add-on (gold)
    }[] = [];

    reg('door');
    if (canvas.showBuilds) {
      canvas.buildIds.forEach((bid) => {
        reg(bid);
        edges.push({ from: 'door', to: bid, shared: false });
      });
    }

    // Which branches of each base-price tree are currently revealed — a DFS that
    // descends only through expanded nodes, so collapse works per node.
    const parentCanvasOf = (mid: string) => {
      const pp = canvas.nodes[mid].parentPnodeId;
      return pp ? `pn:${pp}` : null; // null → wired to the base box
    };
    const treeVisible: Record<string, string[]> = {};
    canvas.sections.forEach((sec) => {
      if (sec.kind !== 'tree') return;
      const res: string[] = [];
      const walk = (parentCanvasId: string, isBox: boolean) => {
        if (!open.has(parentCanvasId)) return;
        for (const mid of sec.memberIds) {
          const pc = parentCanvasOf(mid);
          if ((isBox && pc === null) || pc === parentCanvasId) {
            res.push(mid);
            walk(mid, false);
          }
        }
      };
      walk(sec.id, true);
      treeVisible[sec.id] = res;
    });

    const clusters: string[] = [];
    canvas.sections.forEach((sec) => {
      const box = canvas.nodes[sec.id];
      if (!passes(box.pub)) return;
      const shared = sec.owner.length > 1;

      // The base-price tree: the box is always a normal node, and its revealed
      // branches hang below it as a connected sub-graph (parent → child edges),
      // not a flat bounding cluster — the tree can be many levels deep.
      if (sec.kind === 'tree') {
        reg(sec.id);
        sec.owner.forEach((o) => edges.push({ from: o, to: sec.id, shared }));
        for (const mid of treeVisible[sec.id]) {
          reg(mid);
          const pc = parentCanvasOf(mid);
          edges.push({ from: pc ?? sec.id, to: mid, shared: false });
        }
        return;
      }

      const isOpen = open.has(sec.id) && sec.memberIds.length > 0;
      if (!isOpen) {
        reg(sec.id);
        sec.owner.forEach((o) => edges.push({ from: o, to: sec.id, shared }));
      } else {
        g.setNode(sec.id, {});
        clusters.push(sec.id);
        sec.memberIds.forEach((mid) => {
          reg(mid);
          g.setParent(mid, sec.id);
          sec.owner.forEach((o) => edges.push({ from: o, to: mid, shared }));
        });
      }
    });

    // Add-ons and colour nodes (staff-only). First register every header and its
    // revealed option tree; THEN wire each to the nodes it attaches to — a second
    // pass, so an add-on anchored to another add-on's node finds it registered.
    const addonVisible: Record<string, string[]> = {};
    if (!isCustomer) {
      canvas.addons.forEach((ad) => {
        reg(ad.headerId);
        const res: string[] = [];
        if (open.has(ad.headerId)) {
          const walk = (parentCanvasId: string, isHeader: boolean) => {
            if (!open.has(parentCanvasId)) return;
            for (const mid of ad.optionIds) {
              const pp = canvas.nodes[mid].parentPnodeId;
              const pc = pp ? `an:${pp}` : null;
              if ((isHeader && pc === null) || pc === parentCanvasId) {
                res.push(mid);
                reg(mid);
                edges.push({ from: pc ?? ad.headerId, to: mid, shared: false });
                walk(mid, false);
              }
            }
          };
          walk(ad.headerId, true);
        }
        addonVisible[ad.headerId] = res;
      });
      canvas.addons.forEach((ad) => {
        const visibleAttach = ad.attachBaseIds.filter((id) => g.hasNode(id));
        const sharedEdge = ad.attachBaseIds.length > 1;
        const colorLink = canvas.nodes[ad.headerId]?.isColorNode ?? false;
        // Attached to the whole base price → a detachable link from the base box.
        if (ad.attachBase && g.hasNode(ad.baseBoxId)) {
          edges.push({
            from: ad.baseBoxId,
            to: ad.headerId,
            shared: false,
            attach: { addonId: ad.addonId, base: true },
            colorLink,
          });
        }
        if (visibleAttach.length) {
          visibleAttach.forEach((bid) =>
            edges.push({
              from: bid,
              to: ad.headerId,
              shared: sharedEdge,
              attach: { addonId: ad.addonId, baseNodeId: bid.slice(3) },
              colorLink,
            }),
          );
        } else if (ad.attachBaseIds.length > 0 && !ad.attachBase) {
          // Attached to branches, but every anchor is collapsed out of view — hang
          // it off the base box so it isn't lost (plain edge, not a base link).
          edges.push({ from: ad.baseBoxId, to: ad.headerId, shared: false });
        }
        // Applies to whole OTHER add-ons → a detachable header-to-header link. Add-on
        // headers are always on the canvas, so these edges always render.
        ad.attachAddonIds.forEach((targetHeaderId) => {
          if (!g.hasNode(targetHeaderId)) return;
          edges.push({
            from: targetHeaderId,
            to: ad.headerId,
            shared: false,
            attach: { addonId: ad.addonId, targetAddonId: targetHeaderId.slice(3) },
            colorLink,
          });
        });
        // else: no attachment at all → no edge, so it floats (and renders faded).
      });
    }

    edges.forEach((e) => {
      if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
    });
    dagre.layout(g);
    const gr = g.graph();
    layout.current = { w: gr.width || 1, h: gr.height || 1 };

    // cluster boxes + labels
    clusters.forEach((cid) => {
      const b = g.node(cid);
      const box = canvas.nodes[cid];
      const col = colorOf(box);
      const rect = E('rect', {
        x: b.x - b.width / 2,
        y: b.y - b.height / 2,
        width: b.width,
        height: b.height,
        rx: 14,
        class: 'cluster' + (selRef.current.has(cid) ? ' sel' : ''),
      });
      rect.dataset.id = cid;
      rect.style.stroke = col;
      rect.style.fill = `color-mix(in srgb, ${col} 5%, rgb(var(--surface)))`;
      rect.style.strokeWidth = '1.5';
      gClusters.appendChild(rect);

      const lw = measureWidth(ctx, box.label, false) + 44;
      const lh = 24;
      const chip = E('g', {
        class: 'clabel',
        transform: `translate(${b.x - b.width / 2 + 6},${b.y - b.height / 2 - lh / 2})`,
      });
      const cr = E('rect', { x: 0, y: 0, width: lw, height: lh, rx: 7 });
      cr.style.fill = 'rgb(var(--surface))';
      cr.style.stroke = col;
      cr.style.strokeWidth = '1.4';
      chip.appendChild(cr);
      const ct = E('text', { x: 11, y: lh / 2 + 1, 'dominant-baseline': 'central', class: 'ctitle' });
      ct.style.fill = col;
      ct.textContent = box.label;
      chip.appendChild(ct);
      const cc = E('text', {
        x: lw - 13,
        y: lh / 2 + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: 'cclose',
      });
      cc.textContent = '–';
      chip.appendChild(cc);
      cc.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setOpen((prev) => {
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
        select(cid);
      });
      chip.addEventListener('click', (ev) =>
        select(cid, ev.ctrlKey || ev.metaKey || ev.shiftKey),
      );
      gLabels.appendChild(chip);
    });

    // edges
    edges.forEach((e) => {
      if (!g.hasNode(e.from) || !g.hasNode(e.to)) return;
      const ed = g.edge(e.from, e.to);
      if (!ed) return;
      const pts = ed.points;
      const d = smoothPath(pts);
      gEdges.appendChild(
        E('path', {
          d,
          class:
            'edge' +
            (e.shared ? ' shared' : '') +
            (e.attach ? ' attach' : '') +
            (e.colorLink ? ' color' : ''),
        }),
      );
      // An add-on / colour-node link carries an × to unlink it.
      if (e.attach) {
        const mid = pts[Math.floor(pts.length / 2)];
        const x = E('g', {
          class: 'unlink' + (e.colorLink ? ' color' : ''),
          transform: `translate(${mid.x},${mid.y})`,
        });
        x.appendChild(E('circle', { cx: 0, cy: 0, r: 8 }));
        const t = E('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        t.textContent = '×';
        x.appendChild(t);
        const at = e.attach;
        x.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const fd = new FormData();
          fd.set('addonId', at.addonId);
          if (at.base) {
            detachAddonFromBase(productId, fd);
          } else if (at.targetAddonId) {
            fd.set('targetAddonId', at.targetAddonId);
            detachAddonFromAddon(productId, fd);
          } else {
            fd.set('baseNodeId', at.baseNodeId ?? '');
            detachAddon(productId, fd);
          }
        });
        gLabels.appendChild(x);
      }
    });

    // nodes
    const visible: string[] = canvas.showBuilds ? ['door', ...canvas.buildIds] : ['door'];
    canvas.sections.forEach((sec) => {
      const box = canvas.nodes[sec.id];
      if (!passes(box.pub)) return;
      if (sec.kind === 'tree') {
        // The box always shows; its revealed branches show below it.
        visible.push(sec.id, ...treeVisible[sec.id]);
      } else if (open.has(sec.id) && sec.memberIds.length > 0) {
        visible.push(...sec.memberIds);
      } else {
        visible.push(sec.id);
      }
    });
    if (!isCustomer) {
      canvas.addons.forEach((ad) => {
        visible.push(ad.headerId, ...(addonVisible[ad.headerId] ?? []));
      });
    }

    visible.forEach((id) => {
      const pos = g.node(id);
      if (!pos) return;
      const n = canvas.nodes[id];
      const s = sizes[id];
      const grp = E('g', {
        class: 'gnode' + (selRef.current.has(id) ? ' sel' : '') + (n.faded ? ' faded' : ''),
      });
      grp.dataset.id = id;

      if (n.type === 'colour') {
        const c = E('circle', { cx: 0, cy: -9, r: 13 });
        c.setAttribute('class', 'shape');
        c.style.fill = n.swatch || 'rgb(var(--surface-2))';
        c.style.stroke = 'rgba(0,0,0,.28)';
        grp.appendChild(c);
        const tl = E('text', { x: 0, y: 18, 'text-anchor': 'middle' });
        tl.textContent = n.label;
        grp.appendChild(tl);
      } else {
        grp.appendChild(shapeEl(n, s.w, s.h));
        const total = s.lines.length + (s.sub ? 1 : 0);
        let cy = -(total - 1) * 8;
        s.lines.forEach((ln) => {
          const t = E('text', { x: 0, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
          t.textContent = ln;
          grp.appendChild(t);
          cy += 16;
        });
        if (s.sub) {
          const t = E('text', {
            x: 0,
            y: cy,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            class: n.role === 'section' ? 'sub' : 'mono',
          });
          if (n.role !== 'section') t.style.fill = colorOf(n);
          t.textContent = s.sub;
          grp.appendChild(t);
        }
      }

      // A small marker when a branch carries a description or configuration.
      if (n.hasNotes) {
        const dot = E('circle', { cx: s.w / 2 - 7, cy: -s.h / 2 + 7, r: 3, class: 'notedot' });
        grp.appendChild(dot);
      }

      // A colour node wears its colour as a swatch chip in the corner.
      if (n.isColorNode && n.swatch) {
        const sw = E('circle', { cx: -s.w / 2 + 11, cy: -s.h / 2 + 11, r: 6, class: 'coswatch' });
        sw.style.fill = n.swatch;
        grp.appendChild(sw);
      }

      // Expand/collapse handles. The base box always carries one; an add-on header
      // only when it actually has options; any branch WITH children carries one; a
      // closed flat section carries a + that only opens (it closes from its chip).
      const isBaseBox = n.sectionKind === 'base';
      const isAddonWithOptions = n.type === 'addon' && (n.count ?? 0) > 0;
      const isBranchWithKids =
        (n.type === 'pnode' || n.type === 'anode') && n.isLeaf === false;
      const isClosedFlat =
        n.role === 'section' && !isBaseBox && (n.count ?? 0) > 0 && !open.has(id);
      const canToggle = isBaseBox || isAddonWithOptions || isBranchWithKids;
      if (canToggle || isClosedFlat) {
        const opened = open.has(id);
        const h = E('g', { class: 'handle', transform: `translate(0,${s.h / 2})` });
        h.appendChild(E('circle', { cx: 0, cy: 0, r: 9 }));
        const t = E('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        t.textContent = opened && canToggle ? '–' : '+';
        h.appendChild(t);
        h.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setOpen((prev) => {
            const next = new Set(prev);
            if (opened && canToggle) next.delete(id);
            else next.add(id);
            return next;
          });
          select(id);
        });
        grp.appendChild(h);
      }

      grp.addEventListener('click', (ev) => nodeClickRef.current(id, ev));
      grp.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      gNodes.appendChild(grp);
    });

    if (refitRef.current) {
      refitRef.current = false;
      fit();
    } else {
      applyTransform();
    }
  }, [canvas, view, open, cur, fit, applyTransform, select, productId]);

  // ---- selection highlight without a full rebuild (DOM class toggles only) ----
  useEffect(() => {
    selRef.current = sel;
    const gNodes = nodesLayerRef.current;
    const gClusters = clustersLayerRef.current;
    gNodes?.querySelectorAll('.gnode.sel').forEach((el) => el.classList.remove('sel'));
    gClusters?.querySelectorAll('.cluster.sel').forEach((el) => el.classList.remove('sel'));
    sel.forEach((id) => {
      gNodes?.querySelector(`.gnode[data-id="${CSS.escape(id)}"]`)?.classList.add('sel');
      gClusters?.querySelector(`.cluster[data-id="${CSS.escape(id)}"]`)?.classList.add('sel');
    });
  }, [sel]);

  // ---- pan + wheel-zoom (attached once) ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let panning = false;
    let sx = 0;
    let sy = 0;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (t.closest('.gnode') || t.closest('.clabel') || t.closest('.unlink')) return;
      panning = true;
      sx = e.clientX - tx.current;
      sy = e.clientY - ty.current;
      svg.classList.add('panning');
      svg.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!panning) return;
      tx.current = e.clientX - sx;
      ty.current = e.clientY - sy;
      applyTransform();
    };
    const onUp = () => {
      panning = false;
      svg.classList.remove('panning');
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.max(0.18, Math.min(2.4, scale.current * f));
      tx.current = mx - (mx - tx.current) * (ns / scale.current);
      ty.current = my - (my - ty.current) * (ns / scale.current);
      scale.current = ns;
      applyTransform();
    };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('wheel', onWheel);
    };
  }, [applyTransform]);


  // Selection filtered to nodes that still exist and (in customer view) are
  // public — a deleted node's id lingering in the set is harmless.
  const selectedIds = [...sel].filter(
    (id) => canvas.nodes[id] && (view === 'staff' || canvas.nodes[id].pub),
  );

  const changeView = (v: 'staff' | 'customer') => {
    refitRef.current = true;
    if (v === 'customer' && !selectedIds.some((id) => canvas.nodes[id]?.pub)) clearSelection();
    setView(v);
  };
  const openAll = () => {
    refitRef.current = true;
    const s = new Set<string>();
    canvas.sections.forEach((sec) => {
      if (sec.memberIds.length > 0) s.add(sec.id);
    });
    canvas.addons.forEach((ad) => s.add(ad.headerId));
    for (const id in canvas.nodes) {
      const n = canvas.nodes[id];
      if ((n.type === 'pnode' || n.type === 'anode') && n.isLeaf === false) s.add(id);
    }
    setOpen(s);
  };
  const closeAll = () => {
    refitRef.current = true;
    setOpen(new Set());
  };

  const selNode = canvas.nodes[selectedIds[0]] ?? canvas.nodes.door;
  const showBulk = view === 'staff' && selectedIds.length > 1;

  // ---- copy (Ctrl+C) / cut (Ctrl+X) / paste (Ctrl+V) of price branches ----
  // Both base branches and add-on branches can be picked; a pick stays within one
  // tree (the first pick's build + add-on context).
  const putOnClip = useCallback(
    (mode: 'copy' | 'cut') => {
      const picks = selectedIds
        .map((id) => canvas.nodes[id])
        .filter((n) => (n.role === 'pnode' || n.role === 'anode') && n.pnodeId && n.variantId);
      if (picks.length === 0) return;
      const variantId = picks[0].variantId!;
      const addonId = picks[0].addonId ?? ''; // '' = the base tree
      const sourceIds = picks
        .filter((n) => n.variantId === variantId && (n.addonId ?? '') === addonId)
        .map((n) => n.pnodeId!);
      setClip({ variantId, addonId, sourceIds, mode });
    },
    [selectedIds, canvas],
  );
  const copy = useCallback(() => putOnClip('copy'), [putOnClip]);
  const cut = useCallback(() => putOnClip('cut'), [putOnClip]);

  const pasteUnder = useCallback(
    (destNode: CNode) => {
      if (!clip) return;
      const slot = dropSlot(destNode);
      if (!slot) return; // not a place branches can attach
      const fd = new FormData();
      fd.set('sourceIds', JSON.stringify(clip.sourceIds));
      if (clip.mode === 'cut') {
        // Cut moves the originals — to any build, the base tree or an add-on's tree.
        fd.set('variantId', clip.variantId);
        fd.set('destVariantId', slot.variantId);
        fd.set('destAddonId', slot.addonId);
        fd.set('destParentId', slot.parentId);
        startTransition(() => moveDispatch(fd));
      } else {
        // Copy duplicates, and only within the same tree the branches came from.
        if (slot.variantId !== clip.variantId || slot.addonId !== clip.addonId) return;
        fd.set('variantId', clip.variantId);
        fd.set('destParentId', slot.parentId);
        fd.set('zeroUndeclared', '1');
        startTransition(() => pasteDispatch(fd));
      }
      setOpen((prev) => new Set(prev).add(destNode.id)); // reveal the branches at their new home
    },
    [clip, pasteDispatch, moveDispatch],
  );
  const paste = useCallback(() => pasteUnder(selNode), [pasteUnder, selNode]);

  const canCopy = selectedIds.some(
    (id) => canvas.nodes[id]?.role === 'pnode' || canvas.nodes[id]?.role === 'anode',
  );
  const destSlot = clip ? dropSlot(selNode) : null;
  const canPasteHere =
    clip !== null &&
    destSlot !== null &&
    (clip.mode === 'cut' ||
      (destSlot.variantId === clip.variantId && destSlot.addonId === clip.addonId));
  const pasteTargetLabel =
    selNode.sectionKind === 'base' ? 'the top level' : `“${selNode.label}”`;

  // One keydown listener; the latest handlers are read from a ref so it needn't
  // re-bind. Skips when a form field is focused (its own text undo/copy wins).
  const kbRef = useRef({ undo, redo, copy, cut, paste, canCopy, canPaste: clip !== null });
  useEffect(() => {
    kbRef.current = { undo, redo, copy, cut, paste, canCopy, canPaste: clip !== null };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingLink(null);
        setConnectMode(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      const kb = kbRef.current;
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        kb.undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        kb.redo();
      } else if (k === 'c' && kb.canCopy) {
        e.preventDefault();
        kb.copy();
      } else if (k === 'x' && kb.canCopy) {
        e.preventDefault();
        kb.cut();
      } else if (k === 'v' && kb.canPaste) {
        e.preventDefault();
        kb.paste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Node clicks route through this ref so connect mode can intercept them without
  // rebuilding the SVG on every toggle.
  useEffect(() => {
    // A link joins an add-on / colour-node header to an anchor: the Base price box
    // (the whole base), a base branch, a node inside a DIFFERENT add-on, or ANOTHER
    // add-on's header (the first clicked applies to the second). Order is free for
    // the node anchors; for two headers the first is the one that applies.
    const isBaseBox = (n: CNode) => n.role === 'section' && n.sectionKind === 'base';
    const canLink = (n: CNode) =>
      n.role === 'addon' || n.role === 'pnode' || n.role === 'anode' || isBaseBox(n);
    const linkPair = (
      a: CNode,
      b: CNode,
    ): { addonId: string; baseNodeId?: string; base?: boolean; targetAddonId?: string } | null => {
      // Two headers: a applies to b (a is the dependent add-on).
      if (a.role === 'addon' && b.role === 'addon') {
        if (!a.addonId || !b.addonId || a.addonId === b.addonId) return null;
        if (a.variantId !== b.variantId) return null;
        return { addonId: a.addonId, targetAddonId: b.addonId };
      }
      const header = a.role === 'addon' ? a : b.role === 'addon' ? b : null;
      const other = a.role === 'addon' ? b : b.role === 'addon' ? a : null;
      if (!header || !other || other.role === 'addon' || !header.addonId) return null;
      if (header.variantId !== other.variantId) return null;
      if (isBaseBox(other)) return { addonId: header.addonId, base: true };
      if (!other.pnodeId || other.addonId === header.addonId) return null; // not its own node
      return { addonId: header.addonId, baseNodeId: other.pnodeId };
    };
    nodeClickRef.current = (id, ev) => {
      if (!connectMode) {
        select(id, ev.ctrlKey || ev.metaKey || ev.shiftKey);
        return;
      }
      const n = canvas.nodes[id];
      if (!n || !canLink(n)) {
        setPendingLink(null);
        return;
      }
      if (!pendingLink) {
        setPendingLink(id);
        select(id);
        return;
      }
      if (pendingLink === id) {
        setPendingLink(null);
        return;
      }
      const a = canvas.nodes[pendingLink];
      const pair = a ? linkPair(a, n) : null;
      if (pair) {
        const fd = new FormData();
        fd.set('addonId', pair.addonId);
        if (pair.base) {
          attachAddonToBase(productId, fd);
        } else if (pair.targetAddonId) {
          fd.set('targetAddonId', pair.targetAddonId);
          attachAddonToAddon(productId, fd);
        } else {
          fd.set('baseNodeId', pair.baseNodeId ?? '');
          attachAddon(productId, fd);
        }
        setPendingLink(null);
      } else {
        // Not a header + an anchor — start over from the one just clicked.
        setPendingLink(id);
        select(id);
      }
    };
  });

  return (
    <div className="ah-tree">
      <style dangerouslySetInnerHTML={{ __html: CANVAS_CSS }} />

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-full border border-line-strong bg-surface p-0.5">
          <button
            onClick={() => changeView('staff')}
            aria-pressed={view === 'staff'}
            className={`px-3 py-1.5 rounded-full text-sm ${view === 'staff' ? 'bg-ink text-bg' : 'text-muted'}`}
          >
            Staff view
          </button>
          <button
            onClick={() => changeView('customer')}
            aria-pressed={view === 'customer'}
            className={`px-3 py-1.5 rounded-full text-sm ${view === 'customer' ? 'bg-ink text-bg' : 'text-muted'}`}
          >
            Customer view
          </button>
        </div>
        <span className="text-xs text-muted">
          {view === 'customer'
            ? 'Only what a customer sees — builds, colours. No prices.'
            : 'Everything, including internal prices.'}
        </span>
        <span className="flex-1" />
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo price-tree change (Ctrl+Z)"
          className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-line-strong"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo price-tree change (Ctrl+Y)"
          className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-line-strong"
        >
          ↷ Redo
        </button>
        <span className="w-px self-stretch bg-line-strong mx-1" />
        <button
          onClick={() => {
            setConnectMode((m) => !m);
            setPendingLink(null);
          }}
          aria-pressed={connectMode}
          title="Link an add-on or colour node to any node: click one, then the other"
          className={`text-xs px-2.5 py-1.5 rounded-md border ${
            connectMode
              ? 'bg-ink text-bg border-ink'
              : 'border-line-strong text-muted hover:text-ink hover:border-accent'
          }`}
        >
          {connectMode ? '🔗 Connecting…' : '🔗 Connect'}
        </button>
        <span className="w-px self-stretch bg-line-strong mx-1" />
        <button onClick={openAll} className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent">
          Open all
        </button>
        <button onClick={closeAll} className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent">
          Close all
        </button>
        <button onClick={fit} className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent">
          Fit
        </button>
      </div>

      {/* clipboard bar — shown after Ctrl+C (copy) or Ctrl+X (cut) picks branches */}
      {clip && (
        <div className="clipbar">
          <span className="clip-msg">
            {clip.sourceIds.length} branch{clip.sourceIds.length === 1 ? '' : 'es'}{' '}
            {clip.mode === 'cut'
              ? 'cut — click any branch, the Base box or an add-on, then Move'
              : 'copied · undeclared prices become 0'}
          </span>
          <span className="grow" />
          {(pasteState.error || moveState.error) && (
            <span className="err">{clip.mode === 'cut' ? moveState.error : pasteState.error}</span>
          )}
          <button
            onClick={paste}
            disabled={!canPasteHere || pasting || moving}
            title={clip.mode === 'cut' ? 'Move here (Ctrl+V)' : 'Paste (Ctrl+V)'}
            className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-ink hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pasting || moving
              ? clip.mode === 'cut'
                ? 'Moving…'
                : 'Pasting…'
              : canPasteHere
                ? `${clip.mode === 'cut' ? 'Move' : 'Paste'} under ${pasteTargetLabel}`
                : 'Select a destination branch'}
          </button>
          <button
            onClick={() => setClip(null)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent"
          >
            Clear
          </button>
        </div>
      )}

      {/* palette + canvas + detail */}
      <div className="main">
        <Palette vocab={vocab} addons={paletteAddons} productId={productId} />

        <div
          className={`stage${connectMode ? ' connect' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDropHi(nodeIdAtPoint(e.clientX, e.clientY));
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHi(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropHi(null);
            const raw = e.dataTransfer.getData(DRAG_MIME);
            if (!raw) return;
            let payload: DragPayload;
            try {
              payload = JSON.parse(raw);
            } catch {
              return;
            }
            handleDrop(payload, nodeIdAtPoint(e.clientX, e.clientY));
          }}
        >
          <div className={`hint${connectMode ? ' connect' : ''}`}>
            {connectMode
              ? pendingLink
                ? 'Now click any node — or the Base price box for the whole base — to attach it · Esc to cancel'
                : 'Click an add-on or colour node, then any node — a branch, the Base price box, or another add-on — to link them · × on a line unlinks · Esc to exit'
              : 'Drag from the palette onto a node to build · drag to pan · scroll to zoom · Ctrl/⌘/Shift-click to select several · copy Ctrl+C · cut Ctrl+X · paste Ctrl+V'}
          </div>
          <svg ref={svgRef} className="cv" />
          {dropMsg && <div className={`dropmsg${dropMsg.ok ? ' ok' : ''}`}>{dropMsg.text}</div>}
          <div className="zoombar">
            <button onClick={() => zoomBy(1.2)} aria-label="Zoom in">
              +
            </button>
            <button onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
              −
            </button>
          </div>
        </div>

        <aside className="min-w-0">
          {showBulk ? (
            <BulkPanel
              productId={productId}
              nodes={selectedIds.map((id) => canvas.nodes[id])}
              priceTrees={priceTrees}
              onCopy={copy}
              onCut={cut}
              onClear={clearSelection}
            />
          ) : (
            <DetailPanel
              key={selNode.id}
              node={selNode}
              view={view}
              cur={cur}
              productId={productId}
              model={model}
              priceTrees={priceTrees}
              priceUnits={priceUnits}
              onExpand={(id) => setOpen((prev) => new Set(prev).add(id))}
            />
          )}
        </aside>
      </div>

      <Legend />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — edits the selected node
// ---------------------------------------------------------------------------

function DetailPanel({
  node,
  view,
  cur,
  productId,
  model,
  priceTrees,
  priceUnits,
  onExpand,
}: {
  node: CNode;
  view: 'staff' | 'customer';
  cur: string;
  productId: string;
  model: EditorModel;
  priceTrees: Record<string, PriceTreeData>;
  priceUnits: PriceUnit[];
  onExpand: (id: string) => void;
}) {
  const editable = view === 'staff';
  const kindName: Record<NRole, string> = {
    family: 'Product',
    frame: 'Build',
    section: 'Section box',
    price: 'Base price',
    upgrade: 'Add-on',
    size: 'Size step',
    colour: 'Colour',
    pnode: 'Price branch',
    addon: 'Add-on',
    anode: 'Add-on option',
  };
  const roleLabel =
    node.role === 'addon' && node.isColorNode ? 'Colour node' : kindName[node.role];

  // Captured as consts so their narrowing survives into the render closures below.
  const treeVariantId = node.variantId;
  const pnodeId = node.pnodeId;

  const measuresFor = (scope?: string): NumberQ[] => {
    if (scope === 'shared' || !scope) return model.shared.numberQuestions;
    const b = model.builds.find((x) => x.variantId === scope);
    return b ? [...b.numberQuestions, ...model.shared.numberQuestions] : model.shared.numberQuestions;
  };

  return (
    <div className="card">
      <div className="head">
        <div className="kind">
          <span className="dot" style={{ background: colorOf(node) }} />
          {node.role === 'section' ? node.label : roleLabel}
        </div>
        <div className="name">{node.role === 'section' ? kindName.section : node.label}</div>
      </div>
      <div className="body">
        <VisibilityPill pub={node.pub} />

        {node.role === 'family' && node.note && <Field k="About">{node.note}</Field>}

        {node.role === 'frame' && (
          <>
            {node.note && <Field k="Included">{node.note}</Field>}
            {editable && (
              <>
                <div className="formbox">
                  <div className="k">Rename build</div>
                  <RenameBuild action={renameBuild.bind(null, productId)} variantId={node.id} name={node.label} />
                </div>
                <ConfirmDelete
                  action={deleteBuild.bind(null, productId)}
                  hidden={{ variantId: node.id }}
                  prompt="Delete this build and everything in it?"
                  label="Delete this build"
                />
              </>
            )}
          </>
        )}

        {node.role === 'section' && node.sectionKind === 'base' && (
          <>
            {node.note && <Field k="What it is">{node.note}</Field>}
            {editable && (
              <p className="tiny">
                Build the tree from the <b>palette</b> on the left: drag a question&rsquo;s option
                onto this box for a first branch, or onto a branch to go deeper. Drag an{' '}
                <b>Add-on</b> or <b>Colour node</b> onto a node to attach it there.
              </p>
            )}
            {editable && (
              <button className="btn-link" onClick={() => onExpand(node.id)}>
                Open the price tree ↓
              </button>
            )}
          </>
        )}

        {node.role === 'section' && node.sectionKind === 'addons' && (
          <>
            {node.note && <Field k="What it is">{node.note}</Field>}
            {editable && (
              <div className="formbox">
                <div className="k">Add an add-on</div>
                <AddUpgrade action={addUpgrade.bind(null, productId)} scope={node.scope ?? 'shared'} cur={cur} />
              </div>
            )}
          </>
        )}

        {node.role === 'section' && node.sectionKind === 'size' && (
          <>
            {node.note && <Field k="What it is">{node.note}</Field>}
            {editable && (
              <div className="formbox">
                <div className="k">Add a size step</div>
                <AddSizeStep
                  action={addSizeStep.bind(null, productId)}
                  scope={node.scope ?? 'shared'}
                  measures={measuresFor(node.scope)}
                  cur={cur}
                />
              </div>
            )}
          </>
        )}

        {node.role === 'section' && node.sectionKind === 'colours' && node.note && (
          <Field k="What it is">{node.note}</Field>
        )}

        {node.role === 'pnode' && treeVariantId && pnodeId && (() => {
          const tree = priceTrees[treeVariantId];
          const self = tree ? tree.nodes.find((n) => n.id === pnodeId) : undefined;
          return (
            <>
              <Field k="Answers">{node.question}</Field>
              <Field k="This branch">{node.label}</Field>
              {view === 'staff' && (
                <div className="formbox">
                  <div className="k">Price at this branch</div>
                  <PriceInput
                    key={`price:${pnodeId}`}
                    action={setTreeNodePrice.bind(null, productId)}
                    hidden={{ nodeId: pnodeId }}
                    amount={node.amount ?? null}
                    currency={cur}
                    unit={self?.priceUnit ?? null}
                    units={priceUnits}
                    productId={productId}
                  />
                  <p className="tiny">
                    Optional. Leave blank when it&rsquo;s just a choice — a deeper branch inherits
                    the nearest price above it.
                  </p>
                </div>
              )}
              {editable && (
                <p className="tiny">
                  Add a follow-up by dragging a question&rsquo;s option from the palette onto this
                  branch.
                </p>
              )}
              {editable && (
                <div className="formbox">
                  <div className="k">Description &amp; configuration (optional)</div>
                  <NodeInfoForm
                    key={`info:${pnodeId}`}
                    action={setTreeNodeInfo.bind(null, productId)}
                    hidden={{ nodeId: pnodeId }}
                    description={self?.description ?? null}
                    configuration={self?.configuration ?? null}
                  />
                </div>
              )}
              {editable && tree && tree.addons.length > 0 && (
                <Field k="Add-ons here">
                  {tree.addons.filter((a) => a.baseNodeIds.includes(pnodeId)).length === 0
                    ? 'none — drag one from the palette onto this branch'
                    : tree.addons
                        .filter((a) => a.baseNodeIds.includes(pnodeId))
                        .map((a) => a.name)
                        .join(', ')}
                </Field>
              )}
              {editable && tree && (
                <div className="formbox">
                  <div className="k">Duplicate this branch</div>
                  <DuplicateBranches
                    key={`dup:${pnodeId}`}
                    productId={productId}
                    variantId={treeVariantId}
                    tree={tree}
                    sourceIds={[pnodeId]}
                  />
                </div>
              )}
              {editable && (
                <ConfirmDelete
                  action={deleteTreeNode.bind(null, productId)}
                  hidden={{ nodeId: pnodeId }}
                  prompt="Remove this branch and everything under it?"
                  label="Remove this branch"
                />
              )}
            </>
          );
        })()}

        {node.role === 'anode' && treeVariantId && pnodeId && node.addonId && (() => {
          const tree = priceTrees[treeVariantId];
          const addon = tree?.addons.find((a) => a.id === node.addonId);
          const nodesArr = addon?.nodes ?? [];
          const self = nodesArr.find((n) => n.id === pnodeId);
          return (
            <>
              <Field k="Add-on">{addon?.name}</Field>
              <Field k="Answers">{node.question}</Field>
              <Field k="This option">{node.label}</Field>
              {view === 'staff' && (
                <div className="formbox">
                  <div className="k">Extra price for this option</div>
                  <PriceInput
                    key={`aprice:${pnodeId}`}
                    action={setTreeNodePrice.bind(null, productId)}
                    hidden={{ nodeId: pnodeId }}
                    amount={node.amount ?? null}
                    currency={`+${cur}`}
                    unit={self?.priceUnit ?? null}
                    units={priceUnits}
                    productId={productId}
                  />
                  <p className="tiny">
                    Added on top of the base. Leave blank when it&rsquo;s just a choice — a deeper
                    option inherits the nearest extra above it.
                  </p>
                </div>
              )}
              {editable && (
                <p className="tiny">
                  Add a follow-up by dragging a question&rsquo;s option from the palette onto this
                  option.
                </p>
              )}
              {editable && (
                <div className="formbox">
                  <div className="k">Description &amp; configuration (optional)</div>
                  <NodeInfoForm
                    key={`ainfo:${pnodeId}`}
                    action={setTreeNodeInfo.bind(null, productId)}
                    hidden={{ nodeId: pnodeId }}
                    description={self?.description ?? null}
                    configuration={self?.configuration ?? null}
                  />
                </div>
              )}
              {editable && (
                <ConfirmDelete
                  action={deleteTreeNode.bind(null, productId)}
                  hidden={{ nodeId: pnodeId }}
                  prompt="Remove this option and everything under it?"
                  label="Remove this option"
                />
              )}
            </>
          );
        })()}

        {node.role === 'addon' && treeVariantId && node.addonId && (() => {
          const tree = priceTrees[treeVariantId];
          const addon = tree?.addons.find((a) => a.id === node.addonId);
          const addonId = node.addonId;
          return (
            <>
              {node.note && <Field k="What it is">{node.note}</Field>}
              {editable && addon && (
                <div className="formbox">
                  <div className="k">{node.isColorNode ? 'Colour node name' : 'Add-on name'}</div>
                  <RenameAddon
                    key={`rn:${addonId}`}
                    action={renameAddon.bind(null, productId)}
                    addonId={addonId}
                    name={addon.name}
                  />
                </div>
              )}
              {editable && addon && node.isColorNode && (
                <div className="formbox">
                  <div className="k">Colour</div>
                  <ColorEditor
                    key={`col:${addonId}`}
                    action={setColorNodeColor.bind(null, productId)}
                    addonId={addonId}
                    colorName={addon.colorName}
                    colorHex={addon.colorHex}
                  />
                </div>
              )}
              {view === 'staff' && addon && (
                <div className="formbox">
                  <div className="k">{node.isColorNode ? 'Colour price' : 'Add-on price'}</div>
                  <PriceInput
                    key={`adprice:${addonId}`}
                    action={setAddonPrice.bind(null, productId)}
                    hidden={{ addonId }}
                    amount={addon.amount}
                    currency={`+${cur}`}
                    unit={addon.priceUnit}
                    units={priceUnits}
                    productId={productId}
                  />
                  <p className="tiny">
                    Optional. A flat add-on needs only this; with options, the option refines it.
                  </p>
                </div>
              )}
              {editable && addon && (
                <div className="formbox">
                  <div className="k">Description &amp; configuration (optional)</div>
                  <NodeInfoForm
                    key={`adinfo:${addonId}`}
                    action={setAddonInfo.bind(null, productId)}
                    hidden={{ addonId }}
                    description={addon.description}
                    configuration={addon.configuration}
                  />
                </div>
              )}
              {editable && (
                <p className="tiny">
                  Add options by dragging a question&rsquo;s option from the palette onto this{' '}
                  {node.isColorNode ? 'colour node' : 'add-on'}.
                </p>
              )}
              <Field k="Applies to">
                {(() => {
                  const n = addon?.baseNodeIds.length ?? 0;
                  const m = addon?.targetAddonIds.length ?? 0;
                  const parts: string[] = [];
                  if (addon?.attachBase) parts.push('the whole base price');
                  if (n > 0) parts.push(`${n} base configuration${n === 1 ? '' : 's'}`);
                  if (m > 0) parts.push(`${m} add-on${m === 1 ? '' : 's'}`);
                  return parts.length ? parts.join(' + ') : 'nothing yet — it floats until linked';
                })()}
              </Field>
              {editable && (
                <p className="tiny">
                  Connect it by dragging it from the palette&rsquo;s list onto any node — a branch, the{' '}
                  <b>Base price</b> box for the whole base, or another add-on. Drop it on several nodes
                  to connect it to all of them; the × on a line unlinks. (<b>Connect</b> mode in the
                  top bar does the same by clicking.)
                </p>
              )}
              {editable && (
                <button className="btn-link" onClick={() => onExpand(node.id)}>
                  {node.isColorNode ? 'Open the colour node ↓' : 'Open the add-on ↓'}
                </button>
              )}
              {editable && (
                <ConfirmDelete
                  action={deleteAddon.bind(null, productId)}
                  hidden={{ addonId }}
                  prompt={
                    node.isColorNode
                      ? 'Remove this colour node and its options?'
                      : 'Remove this add-on and its options?'
                  }
                  label={node.isColorNode ? 'Remove this colour node' : 'Remove this add-on'}
                />
              )}
            </>
          );
        })()}

        {node.role === 'upgrade' && (
          <>
            {view === 'staff' && (
              <Field k="Supplier price" mono>
                +{cur} {fmt(node.amount ?? 0)}
                {UNIT_LABEL[node.unit ?? 'flat'] ?? ''}
              </Field>
            )}
            {editable && (
              <ConfirmDelete
                action={deleteUpgrade.bind(null, productId)}
                hidden={{ upgradeId: node.id.replace(/^up:/, '') }}
                prompt="Remove this add-on?"
                label="Remove this add-on"
              />
            )}
          </>
        )}

        {node.role === 'size' && (
          <>
            {node.measure && <Field k="Measurement">{node.measure}</Field>}
            {node.range && <Field k="Range">{node.range}</Field>}
            {view === 'staff' && (
              <Field k="Surcharge" mono>
                +{cur} {fmt(node.amount ?? 0)}
              </Field>
            )}
            {editable && (
              <ConfirmDelete
                action={deleteSizeStep.bind(null, productId)}
                hidden={{ bandId: node.id.replace(/^sz:/, '') }}
                prompt="Remove this size step?"
                label="Remove this size step"
              />
            )}
          </>
        )}

        {node.role === 'colour' && (
          <div className="field">
            <div className="k">Swatch</div>
            <div className="swatchbig" style={{ background: node.swatch || 'rgb(var(--surface-2))' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk panel — shown when more than one node is selected. Removes the ones that
// can be removed here (price branches, add-ons, size steps, builds) in one go,
// behind the same inline two-step confirm as everywhere else (no popups).
// ---------------------------------------------------------------------------

type DelDescriptor = { type: 'pnode' | 'upgrade' | 'size' | 'build'; id: string };

function describe(n: CNode): DelDescriptor | null {
  if (n.role === 'pnode' && n.pnodeId) return { type: 'pnode', id: n.pnodeId };
  if (n.role === 'upgrade') return { type: 'upgrade', id: n.id.replace(/^up:/, '') };
  if (n.role === 'size') return { type: 'size', id: n.id.replace(/^sz:/, '') };
  if (n.role === 'frame') return { type: 'build', id: n.id };
  return null;
}

const BULK_KIND_LABEL: Record<DelDescriptor['type'], string> = {
  pnode: 'Price branch',
  upgrade: 'Add-on',
  size: 'Size step',
  build: 'Build',
};

function BulkPanel({
  productId,
  nodes,
  priceTrees,
  onCopy,
  onCut,
  onClear,
}: {
  productId: string;
  nodes: CNode[];
  priceTrees: Record<string, PriceTreeData>;
  onCopy: () => void;
  onCut: () => void;
  onClear: () => void;
}) {
  const removable = nodes.filter((n) => describe(n) !== null);
  const skipped = nodes.filter((n) => describe(n) === null);
  const payload = JSON.stringify(removable.map((n) => describe(n)!));

  // Copy/cut work on price branches — base branches and add-on branches alike.
  const canCopy = nodes.some(
    (n) => (n.role === 'pnode' || n.role === 'anode') && n.pnodeId && n.variantId,
  );

  // Duplicate applies to the selected price branches, all from the same tree.
  const pnodeNodes = nodes.filter((n) => n.role === 'pnode' && n.pnodeId && n.variantId);
  const dupVariantId = pnodeNodes[0]?.variantId;
  const dupTree = dupVariantId ? priceTrees[dupVariantId] : undefined;
  const dupSources = dupVariantId
    ? pnodeNodes.filter((n) => n.variantId === dupVariantId).map((n) => n.pnodeId!)
    : [];

  return (
    <div className="card">
      <div className="head">
        <div className="kind">
          <span className="dot" style={{ background: 'rgb(var(--accent))' }} />
          Selection
        </div>
        <div className="name">{nodes.length} nodes selected</div>
      </div>
      <div className="body">
        {removable.length > 0 ? (
          <div className="field">
            <div className="k">Will be removed ({removable.length})</div>
            <ul className="bulk-list">
              {removable.map((n) => (
                <li key={n.id}>
                  <span className="bulk-kind">{BULK_KIND_LABEL[describe(n)!.type]}</span>
                  <span className="bulk-name">{n.label}</span>
                </li>
              ))}
            </ul>
            <p className="tiny">Removing a price branch also removes everything under it.</p>
          </div>
        ) : (
          <p className="tiny">None of the selected nodes can be removed here.</p>
        )}

        {skipped.length > 0 && (
          <div className="field">
            <div className="k">Kept ({skipped.length})</div>
            <p className="tiny">
              The product, section boxes and colours aren&rsquo;t removed here — colours are
              managed in the colour library.
            </p>
          </div>
        )}

        {dupTree && dupSources.length > 0 && (
          <div className="formbox">
            <div className="k">
              Duplicate {dupSources.length} price branch{dupSources.length === 1 ? '' : 'es'}
            </div>
            <DuplicateBranches
              key={`dup:${dupSources.join(',')}`}
              productId={productId}
              variantId={dupVariantId!}
              tree={dupTree}
              sourceIds={dupSources}
            />
          </div>
        )}

        {canCopy && (
          <div className="bulk-acts">
            <button className="btn-ghost" onClick={onCopy} title="Copy (Ctrl+C)">
              Copy
            </button>
            <button
              className="btn-ghost"
              onClick={onCut}
              title="Cut, then click any branch / Base box / add-on and Move (Ctrl+X)"
            >
              Cut
            </button>
          </div>
        )}
        {removable.length > 0 && (
          <ConfirmDelete
            action={deleteNodes.bind(null, productId)}
            hidden={{ payload }}
            prompt={`Remove ${removable.length} node${removable.length === 1 ? '' : 's'}?`}
            label={`Remove ${removable.length} selected`}
          />
        )}
        <button className="btn-ghost" onClick={onClear}>
          Clear selection
        </button>
      </div>
    </div>
  );
}

function VisibilityPill({ pub }: { pub: boolean }) {
  return (
    <span className={`pill ${pub ? 'cust' : 'staff'}`}>
      {pub ? '● Customer-visible' : '○ Staff only'}
    </span>
  );
}

function Field({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="field">
      <div className="k">{k}</div>
      <div className={`v${mono ? ' mono' : ''}`}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend() {
  const items: { type: NType; name: string }[] = [
    { type: 'family', name: 'Product' },
    { type: 'frame', name: 'Build' },
    { type: 'group', name: 'Section box' },
    { type: 'price', name: 'Base price' },
    { type: 'upgrade', name: 'Add-on' },
    { type: 'size', name: 'Size step' },
    { type: 'colour', name: 'Colour' },
  ];
  return (
    <div className="legend">
      <span className="legtitle">Legend</span>
      {items.map((it) => (
        <span key={it.type} className="legrow">
          <span className="legswatch" style={{ background: `color-mix(in srgb, var(${TYPE_VAR[it.type]}) 25%, rgb(var(--surface)))`, borderColor: `var(${TYPE_VAR[it.type]})` }} />
          {it.name}
        </span>
      ))}
      <span className="legrow">
        <svg width="26" height="10">
          <line x1="1" y1="5" x2="25" y2="5" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeDasharray="5 4" />
        </svg>
        Shared by all builds
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms (bound server actions)
// ---------------------------------------------------------------------------

type BoundAction = (prev: FormState, fd: FormData) => Promise<FormState>;

function useResetOnOk(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

// Auto-save (no Save button): commit a node-edit form when a field is left (blur)
// or a dropdown changes — and only when something actually changed since the last
// save. Leaving the node blurs the focused field, so its edits persist without a
// click. The action is dispatched inside startTransition, as useActionState wants.
function useAutoSaveForm(action: BoundAction) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const savedRef = useRef<string | null>(null);
  const sig = (f: HTMLFormElement) => {
    const parts: string[] = [];
    for (const [k, v] of new FormData(f).entries()) parts.push(`${k}=${String(v)}`);
    return parts.join('&');
  };
  useEffect(() => {
    // Baseline from the initial (defaultValue) field values, so an untouched form
    // never saves.
    if (formRef.current && savedRef.current === null) savedRef.current = sig(formRef.current);
  }, []);
  const commit = useCallback(() => {
    const f = formRef.current;
    if (!f) return;
    const s = sig(f);
    if (s === savedRef.current) return; // nothing changed
    savedRef.current = s;
    startTransition(() => formAction(new FormData(f)));
  }, [formAction]);
  // Dropdowns save the moment they change; text/number/colour save on blur.
  const onChange = useCallback(
    (e: ReactFormEvent<HTMLFormElement>) => {
      if (e.target instanceof HTMLSelectElement) commit();
    },
    [commit],
  );
  // With no action/submit button, pressing Enter would otherwise navigate the page
  // (a native GET). Intercept it and save instead.
  const onSubmit = useCallback(
    (e: ReactFormEvent<HTMLFormElement>) => {
      e.preventDefault();
      commit();
    },
    [commit],
  );
  return { formRef, commit, onChange, onSubmit, state, pending };
}

// Small "Saving… / Saved / error" line that replaces the Save button.
function SaveHint({ state, pending }: { state: FormState; pending: boolean }) {
  if (pending) return <span className="savehint">Saving…</span>;
  if (state.error) return <span className="err">{state.error}</span>;
  if (state.ok) return <span className="savehint ok">Saved ✓</span>;
  return null;
}

function RenameBuild({ action, variantId, name }: { action: BoundAction; variantId: string; name: string }) {
  const { formRef, commit, onChange, onSubmit, state, pending } = useAutoSaveForm(action);
  return (
    <form
      ref={formRef}
      onBlur={commit}
      onChange={onChange}
      onSubmit={onSubmit}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <input name="name" defaultValue={name} className="in" />
      <SaveHint state={state} pending={pending} />
    </form>
  );
}

function AddUpgrade({ action, scope, cur }: { action: BoundAction; scope: string; cur: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="scope" value={scope} />
      <input name="label" placeholder="e.g. Soundproof filling" className="in" />
      <div className="flex gap-2">
        <input name="amount" type="number" step="0.01" placeholder={`price (${cur})`} className="in flex-1" />
        <select name="unit" defaultValue="flat" className="in">
          <option value="flat">one-off</option>
          <option value="per_unit">per unit</option>
          <option value="per_set">per set</option>
          <option value="per_piece">per piece</option>
        </select>
      </div>
      <button disabled={pending} className="btn">
        {pending ? 'Adding…' : '+ Add-on'}
      </button>
      {state.error && <span className="err">{state.error}</span>}
    </form>
  );
}

function AddSizeStep({
  action,
  scope,
  measures,
  cur,
}: {
  action: BoundAction;
  scope: string;
  measures: NumberQ[];
  cur: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useResetOnOk(state);
  if (measures.length === 0) {
    return (
      <p className="text-xs text-muted">
        Size steps attach to a measurement (like Height or Width). None is set up on this product yet.
      </p>
    );
  }
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="scope" value={scope} />
      <select name="optionId" className="in" defaultValue={measures[0].optionId}>
        {measures.map((m) => (
          <option key={m.optionId} value={m.optionId}>
            {m.name}
          </option>
        ))}
      </select>
      <input name="label" placeholder="e.g. 2170–2240" className="in" />
      <div className="flex gap-2">
        <input name="min" type="number" step="any" placeholder="from" className="in flex-1" />
        <input name="max" type="number" step="any" placeholder="to" className="in flex-1" />
      </div>
      <input name="amount" type="number" step="0.01" placeholder={`+price (${cur})`} className="in" />
      <button disabled={pending} className="btn">
        {pending ? 'Adding…' : '+ Size step'}
      </button>
      {state.error && <span className="err">{state.error}</span>}
    </form>
  );
}

// The optional description + "Configuration" spec. Saved together; either can be
// blanked. Reused for branches, add-on options, and the add-on header.
function NodeInfoForm({
  action,
  hidden,
  description,
  configuration,
}: {
  action: BoundAction;
  hidden: Record<string, string>;
  description: string | null;
  configuration: string | null;
}) {
  const { formRef, commit, onChange, onSubmit, state, pending } = useAutoSaveForm(action);
  return (
    <form
      ref={formRef}
      onBlur={commit}
      onChange={onChange}
      onSubmit={onSubmit}
      className="flex flex-col gap-2"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <textarea
        name="description"
        defaultValue={description ?? ''}
        placeholder="Description"
        className="in ta"
        rows={2}
      />
      <textarea
        name="configuration"
        defaultValue={configuration ?? ''}
        placeholder="Configuration"
        className="in ta"
        rows={2}
      />
      <SaveHint state={state} pending={pending} />
    </form>
  );
}

// A price input. Blank = no price here — a deeper branch inherits the nearest
// declared price above it (a node can be "just a choice"). Reused for base
// branches, add-on options, and the add-on header (via action + hidden id).
function PriceInput({
  action,
  hidden,
  amount,
  currency,
  unit,
  units,
  productId,
}: {
  action: BoundAction;
  hidden: Record<string, string>;
  amount: number | null;
  currency: string;
  unit: string | null;
  units: PriceUnit[];
  productId: string;
}) {
  const { formRef, commit, onChange, onSubmit, state, pending } = useAutoSaveForm(action);
  const [addingUnit, setAddingUnit] = useState(false);
  const [uState, uAction, uPending] = useActionState<FormState, FormData>(
    addPriceUnit.bind(null, productId),
    {},
  );
  const uRef = useResetOnOk(uState);
  // Keep a current-but-unknown unit visible so a removed one isn't silently lost.
  const opts =
    unit && !units.some((u) => u.code === unit) ? [{ code: unit, label: unit }, ...units] : units;
  return (
    <div className="flex flex-col gap-2">
      <form
        ref={formRef}
        onBlur={commit}
        onChange={onChange}
        onSubmit={onSubmit}
        className="priceform"
        title={state.error ?? undefined}
      >
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <span className="cur">{currency}</span>
        <input
          name="amount"
          defaultValue={amount == null ? '' : String(amount)}
          placeholder="no price"
          inputMode="decimal"
          className="price-in"
          aria-label="Price"
        />
        <select name="unit" defaultValue={unit ?? ''} className="in unit-in" aria-label="Unit">
          <option value="">one-off</option>
          {opts.map((u) => (
            <option key={u.code} value={u.code}>
              {u.label}
            </option>
          ))}
        </select>
        <SaveHint state={state} pending={pending} />
      </form>
      <button type="button" className="btn-link" onClick={() => setAddingUnit((v) => !v)}>
        ＋ add a unit
      </button>
      {addingUnit && (
        <form ref={uRef} action={uAction} className="flex gap-2 items-center">
          <input name="label" placeholder="e.g. per box" className="in" />
          <button disabled={uPending} className="btn">
            {uPending ? '…' : 'Add'}
          </button>
          {uState.error && <span className="err">{uState.error}</span>}
          {uState.ok && <span className="tiny ok">Added — pick it above.</span>}
        </form>
      )}
    </div>
  );
}

// The left palette: draggable building blocks. Drag an option onto a node to add
// a branch; drag an Add-on/Colour chip onto a node to create+attach (or onto empty
// canvas to leave it floating); drag an existing add-on/colour node onto any node —
// drop it on several to connect it to all of them. The vocabulary grows here too.
type PaletteAddon = { addonId: string; name: string; colorHex: string | null; isColor: boolean };
type DragMaker = (payload: DragPayload) => (e: ReactDragEvent) => void;

function Palette({
  vocab,
  addons,
  productId,
}: {
  vocab: VocabGroup[];
  addons: PaletteAddon[];
  productId: string;
}) {
  const drag: DragMaker = (payload) => (e) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <aside className="palette">
      <div className="pal-sec">
        <div className="pal-h">Add</div>
        <div className="pal-chip" draggable onDragStart={drag({ kind: 'new-addon' })}>
          <span className="pal-ic pal-ic-addon" />
          <span className="pal-name">Add-on</span>
        </div>
        <div className="pal-chip" draggable onDragStart={drag({ kind: 'new-color' })}>
          <span className="pal-sw" style={{ background: '#8a6b4a' }} />
          <span className="pal-name">Colour node</span>
        </div>
        <p className="tiny">Drag onto a node to attach it there, or onto empty canvas to float it.</p>
      </div>

      {addons.length > 0 && (
        <div className="pal-sec">
          <div className="pal-h">Your add-ons &amp; colours</div>
          {addons.map((a) => (
            <div
              key={a.addonId}
              className="pal-chip"
              draggable
              onDragStart={drag({ kind: 'attach', addonId: a.addonId })}
            >
              {a.isColor ? (
                <span className="pal-sw" style={{ background: a.colorHex ?? '#8a6b4a' }} />
              ) : (
                <span className="pal-ic pal-ic-addon" />
              )}
              <span className="pal-name">{a.name}</span>
            </div>
          ))}
          <p className="tiny">Drag one onto any node to connect it — drop on several to connect it to all.</p>
        </div>
      )}

      <div className="pal-sec">
        <div className="pal-h">Questions</div>
        {vocab.map((g) => (
          <PaletteQuestion key={g.id} group={g} productId={productId} drag={drag} />
        ))}
        <NewQuestion productId={productId} />
        <p className="tiny">Drag an option onto a branch, the Base price box, or an add-on.</p>
      </div>
    </aside>
  );
}

// One question in the palette: its options are draggable chips; grow the list inline.
function PaletteQuestion({
  group,
  productId,
  drag,
}: {
  group: VocabGroup;
  productId: string;
  drag: DragMaker;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addVocabValue.bind(null, productId),
    {},
  );
  const ref = useResetOnOk(state);
  const [adding, setAdding] = useState(false);
  return (
    <details className="pal-q">
      <summary>
        {group.name}
        {group.kind === 'boolean' ? ' · T/F' : ''}
      </summary>
      <div className="pal-opts">
        {group.values.map((v) => (
          <div
            key={v.id}
            className="pal-opt"
            draggable
            onDragStart={drag({ kind: 'option', groupId: group.id, valueId: v.id })}
          >
            {v.name}
          </div>
        ))}
        {group.kind !== 'boolean' && (
          <>
            <button type="button" className="btn-link" onClick={() => setAdding((a) => !a)}>
              ＋ option
            </button>
            {adding && (
              <form ref={ref} action={formAction} className="flex gap-1 items-center">
                <input type="hidden" name="groupId" value={group.id} />
                <input name="name" placeholder="new option" className="in" />
                <button disabled={pending} className="btn">
                  {pending ? '…' : 'Add'}
                </button>
                {state.error && <span className="err">{state.error}</span>}
              </form>
            )}
          </>
        )}
      </div>
    </details>
  );
}

// Grow the shared vocabulary with a new question (choice or true/false).
function NewQuestion({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'choice' | 'boolean'>('choice');
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createVocabGroup.bind(null, productId),
    {},
  );
  const ref = useResetOnOk(state);
  return (
    <div className="pal-newq">
      <button type="button" className="btn-link" onClick={() => setOpen((o) => !o)}>
        ＋ new question
      </button>
      {open && (
        <form ref={ref} action={formAction} className="flex flex-col gap-2">
          <div className="seg">
            <label className={kind === 'choice' ? 'on' : ''}>
              <input
                type="radio"
                name="kind"
                value="choice"
                checked={kind === 'choice'}
                onChange={() => setKind('choice')}
                className="sr-only"
              />
              Choices
            </label>
            <label className={kind === 'boolean' ? 'on' : ''}>
              <input
                type="radio"
                name="kind"
                value="boolean"
                checked={kind === 'boolean'}
                onChange={() => setKind('boolean')}
                className="sr-only"
              />
              True / False
            </label>
          </div>
          <input
            name="name"
            placeholder={kind === 'boolean' ? 'e.g. Has silent edge?' : 'e.g. Edge banding'}
            className="in"
          />
          <button disabled={pending} className="btn">
            {pending ? '…' : 'Add question'}
          </button>
          {state.error && <span className="err">{state.error}</span>}
          {state.ok && <span className="tiny ok">Added.</span>}
        </form>
      )}
    </div>
  );
}

// Duplicate a set of price branches (each with its subtree) and attach the
// copies under a chosen destination. Only branches from the SAME question can be
// duplicated together, since they land as one level under the destination.
function DuplicateBranches({
  productId,
  variantId,
  tree,
  sourceIds,
}: {
  productId: string;
  variantId: string;
  tree: PriceTreeData;
  sourceIds: string[];
}) {
  const nodeById = new Map(tree.nodes.map((n) => [n.id, n]));
  const childrenOf = (pid: string | null) => tree.nodes.filter((n) => n.parentId === pid);

  const srcSet = new Set(sourceIds);
  const hasSelectedAncestor = (n: PTNode) => {
    let pid = n.parentId;
    let guard = 0;
    while (pid && guard++ < 1000) {
      if (srcSet.has(pid)) return true;
      pid = nodeById.get(pid)?.parentId ?? null;
    }
    return false;
  };
  // A selected node inside another selected node is already carried along.
  const tops = sourceIds
    .map((id) => nodeById.get(id))
    .filter((n): n is PTNode => !!n && !hasSelectedAncestor(n));

  const sameGroup = tops.length > 0 && tops.every((n) => n.groupId === tops[0].groupId);
  const groupId = tops[0]?.groupId;
  const topValueIds = new Set(tops.map((n) => n.valueId));

  const pathLabel = (n: PTNode) => {
    const parts: string[] = [];
    let cur: PTNode | undefined = n;
    let guard = 0;
    while (cur && guard++ < 50) {
      parts.unshift(cur.valueName);
      cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
    }
    return parts.join(' › ');
  };

  const banned = new Set<string>();
  const collect = (id: string) => {
    banned.add(id);
    childrenOf(id).forEach((c) => collect(c.id));
  };
  tops.forEach((t) => collect(t.id));

  const levelOk = (children: PTNode[]) =>
    (children.length === 0 || children[0].groupId === groupId) &&
    !children.some((c) => topValueIds.has(c.valueId));

  const rootOk = sameGroup && levelOk(childrenOf(null));
  const candidates = sameGroup
    ? tree.nodes.filter((n) => !banned.has(n.id) && levelOk(childrenOf(n.id)))
    : [];

  const options: { value: string; label: string }[] = [];
  if (rootOk) options.push({ value: '', label: 'Top level (as new branches)' });
  candidates.forEach((c) => options.push({ value: c.id, label: pathLabel(c) }));

  const [dest, setDest] = useState(options[0]?.value ?? '');
  const value = options.some((o) => o.value === dest) ? dest : (options[0]?.value ?? '');
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    duplicateNodes.bind(null, productId),
    {},
  );

  if (!sameGroup) {
    return <p className="tiny">Pick branches from the same question to duplicate them together.</p>;
  }
  if (options.length === 0) {
    return (
      <p className="tiny">
        Nowhere to attach these yet — a destination must ask the same question and not already
        offer these options.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="sourceIds" value={JSON.stringify(tops.map((n) => n.id))} />
      <label className="tiny">Attach under</label>
      <select
        name="destParentId"
        value={value}
        onChange={(e) => setDest(e.target.value)}
        className="in"
      >
        {options.map((o) => (
          <option key={o.value || '__root'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button disabled={pending} className="btn">
        {pending ? 'Duplicating…' : `Duplicate ${tops.length} branch${tops.length === 1 ? '' : 'es'}`}
      </button>
      {state.error && <span className="err">{state.error}</span>}
      {state.ok && <span className="tiny ok">Duplicated — see the destination.</span>}
    </form>
  );
}

function RenameAddon({
  action,
  addonId,
  name,
}: {
  action: BoundAction;
  addonId: string;
  name: string;
}) {
  const { formRef, commit, onChange, onSubmit, state, pending } = useAutoSaveForm(action);
  return (
    <form
      ref={formRef}
      onBlur={commit}
      onChange={onChange}
      onSubmit={onSubmit}
      className="flex gap-2 items-center"
    >
      <input type="hidden" name="addonId" value={addonId} />
      <input name="name" defaultValue={name} className="in flex-1" />
      <SaveHint state={state} pending={pending} />
    </form>
  );
}

// Edit a colour node's colour: a native swatch picker plus an optional name.
function ColorEditor({
  action,
  addonId,
  colorName,
  colorHex,
}: {
  action: BoundAction;
  addonId: string;
  colorName: string | null;
  colorHex: string | null;
}) {
  const { formRef, commit, onChange, onSubmit, state, pending } = useAutoSaveForm(action);
  return (
    <form
      ref={formRef}
      onBlur={commit}
      onChange={onChange}
      onSubmit={onSubmit}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="addonId" value={addonId} />
      <div className="flex gap-2 items-center">
        <input
          type="color"
          name="colorHex"
          defaultValue={colorHex ?? '#8a6b4a'}
          className="colorwell"
          aria-label="Colour"
        />
        <input
          name="colorName"
          defaultValue={colorName ?? ''}
          placeholder="Colour name (optional)"
          className="in flex-1"
        />
      </div>
      <SaveHint state={state} pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scoped canvas styles (theme-aware: dark default, light via [data-theme=light])
// ---------------------------------------------------------------------------

const CANVAS_CSS = `
.ah-tree {
  --tc-family:#D3A05E; --tc-frame:#4FB8AC; --tc-group:#7E9EC4; --tc-price:#64C07E;
  --tc-upgrade:#E0AC5A; --tc-size:#B79BE0; --tc-colour:#D3A05E; --tc-colornode:#E58AAE; --tc-edge:#3A4C57;
}
:root[data-theme='light'] .ah-tree {
  --tc-family:#8A5A2B; --tc-frame:#2C7A70; --tc-group:#3A5573; --tc-price:#3B7A4C;
  --tc-upgrade:#B07A2A; --tc-size:#7A56A0; --tc-colour:#8A5A2B; --tc-colornode:#B0436E; --tc-edge:#C0B49E;
}
.ah-tree .stage {
  position:relative; border:1px solid rgb(var(--line)); border-radius:12px; overflow:hidden;
  background-image: radial-gradient(circle at 1px 1px, rgb(var(--line)) 1px, transparent 0);
  background-size: 24px 24px; background-color: rgb(var(--surface));
}
.ah-tree .main { display:grid; gap:14px; align-items:start; grid-template-columns:210px minmax(0,1fr) 300px; }
@media (max-width: 1024px) { .ah-tree .main { grid-template-columns:1fr; } }
.ah-tree svg.cv { display:block; width:100%; height:640px; touch-action:none; cursor:grab; }
.ah-tree svg.cv.panning { cursor:grabbing; }
.ah-tree .hint { position:absolute; left:12px; top:12px; z-index:1; font-size:12px; color:rgb(var(--muted));
  background:color-mix(in srgb, rgb(var(--surface)) 82%, transparent); padding:4px 8px; border-radius:6px; pointer-events:none; }
.ah-tree .zoombar { position:absolute; right:12px; bottom:12px; display:flex; gap:6px; }
.ah-tree .zoombar button { width:34px; height:34px; border-radius:8px; border:1px solid rgb(var(--line-strong));
  background:rgb(var(--surface)); color:rgb(var(--ink)); font-size:18px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.ah-tree .zoombar button:hover { border-color:rgb(var(--accent)); }
.ah-tree .gnode { cursor:pointer; }
.ah-tree .gnode .shape { stroke-width:1.6; transition:stroke-width .1s; }
.ah-tree .gnode:hover .shape { stroke-width:2.6; }
.ah-tree .gnode.sel .shape { stroke-width:3; }
.ah-tree .gnode.sel { filter: drop-shadow(0 2px 6px color-mix(in srgb, rgb(var(--accent)) 55%, transparent)); }
.ah-tree .gnode text { font-family:'Brown Pro', system-ui, sans-serif; font-size:12.5px; fill:rgb(var(--ink)); pointer-events:none; }
.ah-tree .gnode text.mono { font-size:11px; font-weight:600; }
.ah-tree .gnode text.sub { font-size:10.5px; fill:rgb(var(--muted)); }
.ah-tree .edge { fill:none; stroke:var(--tc-edge); stroke-width:1.5; }
.ah-tree .edge.shared { stroke:rgb(var(--accent)); stroke-width:1.8; stroke-dasharray:5 4; }
.ah-tree .cluster.sel { stroke-width:3 !important; }
.ah-tree .clabel { cursor:pointer; }
.ah-tree .clabel .ctitle { font-family:'Brown Pro', system-ui, sans-serif; font-size:12.5px; font-weight:600; }
.ah-tree .clabel .cclose { font-size:16px; font-weight:700; fill:rgb(var(--muted)); cursor:pointer; }
.ah-tree .clabel:hover .cclose { fill:rgb(var(--accent)); }
.ah-tree .handle circle { fill:rgb(var(--surface)); stroke:rgb(var(--line-strong)); stroke-width:1.4; }
.ah-tree .handle text { font-family:'Brown Pro', system-ui, sans-serif; font-size:14px; font-weight:700; fill:rgb(var(--muted)); pointer-events:none; }
.ah-tree .handle:hover circle { stroke:rgb(var(--accent)); }

.ah-tree .card { background:rgb(var(--surface)); border:1px solid rgb(var(--line)); border-radius:12px; overflow:hidden; position:sticky; top:14px; }
.ah-tree .card .head { padding:13px 15px; border-bottom:1px solid rgb(var(--line)); }
.ah-tree .card .kind { font-size:11px; text-transform:uppercase; letter-spacing:.07em; font-weight:600; color:rgb(var(--accent)); margin-bottom:4px; display:flex; align-items:center; gap:7px; }
.ah-tree .card .kind .dot { width:9px; height:9px; border-radius:2px; display:inline-block; }
.ah-tree .card .name { font-size:18px; font-weight:600; color:rgb(var(--heading)); }
.ah-tree .card .body { padding:13px 15px; display:flex; flex-direction:column; gap:11px; }
.ah-tree .field .k { color:rgb(var(--muted)); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:2px; }
.ah-tree .field .v { font-size:13.5px; color:rgb(var(--ink)); }
.ah-tree .field .v.mono { font-family:ui-monospace, 'SFMono-Regular', Menlo, monospace; font-variant-numeric:tabular-nums; }
.ah-tree .pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; padding:3px 9px; border-radius:999px; border:1px solid rgb(var(--line-strong)); width:fit-content; color:rgb(var(--muted)); }
.ah-tree .pill.cust { color:var(--tc-frame); border-color:color-mix(in srgb, var(--tc-frame) 45%, rgb(var(--line-strong))); }
.ah-tree .swatchbig { width:34px; height:34px; border-radius:50%; border:1px solid rgba(0,0,0,.28); }
.ah-tree .formbox { border:1px dashed rgb(var(--line-strong)); border-radius:8px; padding:10px; }
.ah-tree .formbox .k { color:rgb(var(--muted)); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:7px; }
.ah-tree .in { width:100%; padding:7px 9px; background:rgb(var(--surface-2)); color:rgb(var(--ink)); border:1px solid rgb(var(--line-strong)); border-radius:6px; font-size:13px; }
.ah-tree .in:focus { outline:none; box-shadow:0 0 0 2px rgb(var(--accent)); }
.ah-tree .btn { padding:7px 11px; border-radius:6px; background:rgb(var(--brown)); color:#fff; font-size:13px; border:0; cursor:pointer; }
.ah-tree .btn:hover { background:rgb(var(--brown-hover)); }
.ah-tree .btn:disabled { opacity:.5; }
.ah-tree .btn-link { color:rgb(var(--accent)); font-size:13.5px; background:transparent; border:0; padding:0; cursor:pointer; text-align:start; }
.ah-tree .btn-link:hover { text-decoration:underline; }
.ah-tree .err { color:#f87171; font-size:12px; }
.ah-tree .savehint { font-size:11px; color:rgb(var(--muted)); min-height:14px; }
.ah-tree .savehint.ok { color:#3a9d5d; }

.ah-tree .modal-backdrop { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.55); display:flex; align-items:flex-start; justify-content:center; padding:32px 16px; overflow:auto; }
.ah-tree .modal { background:rgb(var(--surface)); border:1px solid rgb(var(--line)); border-radius:14px; width:min(920px,100%); box-shadow:0 20px 60px rgba(0,0,0,.4); overflow:hidden; }
.ah-tree .modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:15px 18px; border-bottom:1px solid rgb(var(--line)); }
.ah-tree .modal-x { width:32px; height:32px; border-radius:8px; border:1px solid rgb(var(--line-strong)); background:transparent; color:rgb(var(--muted)); font-size:15px; cursor:pointer; flex:none; }
.ah-tree .modal-x:hover { color:rgb(var(--ink)); border-color:rgb(var(--accent)); }
.ah-tree .modal-body { padding:16px 18px; display:flex; flex-direction:column; gap:22px; max-height:calc(100vh - 170px); overflow:auto; }
.ah-tree .modal-h { margin:0 0 4px; font-size:15px; color:rgb(var(--heading)); }
.ah-tree .modal-p { margin:0 0 10px; font-size:12.5px; color:rgb(var(--muted)); max-width:70ch; }
.ah-tree .dims { display:flex; flex-direction:column; gap:10px; }
.ah-tree .dimcard { border:1px solid rgb(var(--line)); border-radius:10px; padding:12px 14px; background:rgb(var(--surface-2)); transition:opacity .15s; }
.ah-tree .dimcard.optional { opacity:.6; }
.ah-tree .dimcard.optional:hover, .ah-tree .dimcard.optional:focus-within { opacity:1; }
.ah-tree .dimcard-top { display:flex; align-items:center; gap:9px; margin-bottom:10px; }
.ah-tree .dim-badge { width:20px; height:20px; flex:none; border-radius:6px; background:color-mix(in srgb, var(--tc-price) 22%, rgb(var(--surface))); color:var(--tc-price); font-size:12px; font-weight:600; display:inline-flex; align-items:center; justify-content:center; }
.ah-tree .dim-name { font-weight:600; color:rgb(var(--ink)); font-size:14px; }
.ah-tree .tag { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:rgb(var(--muted)); border:1px solid rgb(var(--line-strong)); border-radius:999px; padding:1px 7px; }
.ah-tree .grow { flex:1; }
.ah-tree .opts { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.ah-tree .opt { display:inline-flex; align-items:center; gap:7px; padding:4px 8px 4px 11px; border:1px solid rgb(var(--line-strong)); border-radius:999px; font-size:13px; color:rgb(var(--ink)); background:rgb(var(--surface)); }
.ah-tree .opt-add { display:inline-flex; align-items:center; border:1px dashed rgb(var(--line-strong)); border-radius:999px; padding:2px 4px 2px 12px; }
.ah-tree .opt-add input { background:transparent; border:0; color:rgb(var(--ink)); font-size:13px; width:92px; outline:none; }
.ah-tree .opt-add input::placeholder { color:rgb(var(--muted)); }
.ah-tree .opt-add button { background:transparent; border:0; color:var(--tc-price); cursor:pointer; font-size:15px; padding:0 6px; line-height:1; }
.ah-tree .add-dim-btn { width:100%; border:1px dashed rgb(var(--line-strong)); background:transparent; color:rgb(var(--accent)); border-radius:10px; padding:11px; font-size:13.5px; cursor:pointer; }
.ah-tree .add-dim-btn:hover { border-color:rgb(var(--accent)); background:color-mix(in srgb, rgb(var(--accent)) 6%, transparent); }
.ah-tree .dimform { border:1px solid rgb(var(--line)); border-radius:10px; padding:14px; background:rgb(var(--surface-2)); display:flex; flex-direction:column; gap:12px; }
.ah-tree .dimform-field { display:flex; flex-direction:column; gap:5px; }
.ah-tree .dimform-field label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:rgb(var(--muted)); }
.ah-tree .dimform-row { display:flex; gap:8px; justify-content:flex-end; }
.ah-tree .in.mono { font-family:ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size:12px; }
.ah-tree .btn-ghost { padding:7px 11px; border-radius:6px; background:transparent; border:1px solid rgb(var(--line-strong)); color:rgb(var(--muted)); font-size:13px; cursor:pointer; }
.ah-tree .btn-ghost:hover { color:rgb(var(--ink)); border-color:rgb(var(--accent)); }

.ah-tree .cd { display:inline-flex; }
.ah-tree .cd-trigger { background:transparent; border:0; padding:0; cursor:pointer; font-size:12.5px; color:#e08a84; }
.ah-tree .cd-trigger:hover { text-decoration:underline; }
.ah-tree .cd-x { background:transparent; border:0; padding:0 2px; cursor:pointer; font-size:14px; line-height:1; color:rgb(var(--muted)); }
.ah-tree .cd-x:hover { color:#e08a84; }
.ah-tree .cd-armed { display:inline-flex; align-items:center; gap:6px; }
.ah-tree .cd-q { font-size:12px; color:rgb(var(--muted)); }
.ah-tree .cd-yes { background:color-mix(in srgb, #b0514a 22%, transparent); border:1px solid color-mix(in srgb, #b0514a 55%, transparent); color:#e08a84; border-radius:6px; padding:2px 9px; font-size:12px; cursor:pointer; }
.ah-tree .cd-yes:hover { background:color-mix(in srgb, #b0514a 32%, transparent); }
.ah-tree .cd-no { background:transparent; border:1px solid rgb(var(--line-strong)); color:rgb(var(--muted)); border-radius:6px; padding:2px 9px; font-size:12px; cursor:pointer; }
.ah-tree .cd-no:hover { color:rgb(var(--ink)); }

.ah-tree .legend { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin-top:14px; padding:11px 14px; border:1px solid rgb(var(--line)); border-radius:10px; background:rgb(var(--surface)); font-size:12.5px; color:rgb(var(--ink)); }
.ah-tree .legtitle { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:rgb(var(--muted)); font-weight:600; }
.ah-tree .legrow { display:inline-flex; align-items:center; gap:7px; }
.ah-tree .legswatch { width:16px; height:12px; border-radius:3px; border:1.5px solid; display:inline-block; }
@media (max-width: 860px) { .ah-tree .card { position:static; } }

.ah-tree .lvl-root { display:flex; flex-direction:column; gap:8px; }
.ah-tree .lvl { border-inline-start:2px solid rgb(var(--line)); margin-inline-start:10px; padding-inline-start:14px; margin-top:6px; display:flex; flex-direction:column; gap:6px; }
.ah-tree .lvl-q { font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:rgb(var(--muted)); }
.ah-tree .tnode-row { display:flex; align-items:center; gap:10px; padding:6px 10px; border:1px solid rgb(var(--line)); border-radius:8px; background:rgb(var(--surface-2)); }
.ah-tree .tnode-name { font-weight:500; color:rgb(var(--ink)); font-size:13.5px; }
.ah-tree .priceform { display:inline-flex; align-items:center; gap:5px; }
.ah-tree .priceform .cur { font-size:11px; color:rgb(var(--muted)); }
.ah-tree .price-in { width:88px; padding:4px 7px; background:rgb(var(--surface)); color:rgb(var(--ink)); border:1px solid rgb(var(--line-strong)); border-radius:6px; font-size:13px; text-align:end; font-variant-numeric:tabular-nums; }
.ah-tree .unit-in { width:auto; padding:4px 6px; font-size:12px; }
.ah-tree .price-in:focus { outline:none; box-shadow:0 0 0 2px rgb(var(--accent)); }
.ah-tree .add-sub-btn { align-self:flex-start; background:transparent; border:1px dashed rgb(var(--line-strong)); color:rgb(var(--accent)); border-radius:8px; padding:5px 10px; font-size:12.5px; cursor:pointer; }
.ah-tree .add-sub-btn:hover { border-color:rgb(var(--accent)); }
.ah-tree .addnode-open { display:flex; flex-direction:column; gap:8px; border:1px dashed rgb(var(--line-strong)); border-radius:8px; padding:10px; align-items:flex-start; }
.ah-tree .addnode-open .ar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.ah-tree .inline-add { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.ah-tree .priceform { flex-wrap:wrap; }
.ah-tree .tiny { font-size:11px; color:rgb(var(--muted)); margin:0; }
.ah-tree .tiny.ok { color:var(--tc-price); }
.ah-tree .seg { display:inline-flex; border:1px solid rgb(var(--line-strong)); border-radius:7px; overflow:hidden; width:fit-content; }
.ah-tree .seg label { padding:5px 12px; font-size:12px; color:rgb(var(--muted)); cursor:pointer; }
.ah-tree .seg label.on { background:rgb(var(--ink)); color:rgb(var(--bg)); }
.ah-tree .bulk-list { list-style:none; margin:4px 0 0; padding:0; display:flex; flex-direction:column; gap:4px; max-height:220px; overflow:auto; }
.ah-tree .bulk-list li { display:flex; align-items:center; gap:8px; font-size:13px; }
.ah-tree .bulk-kind { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:rgb(var(--muted)); border:1px solid rgb(var(--line-strong)); border-radius:999px; padding:1px 7px; flex:none; }
.ah-tree .bulk-name { color:rgb(var(--ink)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ah-tree .bulk-acts { display:flex; gap:8px; }
.ah-tree .bulk-acts .btn-ghost { flex:1; text-align:center; }
.ah-tree .ta { resize:vertical; min-height:34px; font-family:inherit; line-height:1.35; }
.ah-tree .notedot { fill:rgb(var(--accent)); }
.ah-tree .clipbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; padding:8px 12px; border:1px solid color-mix(in srgb, rgb(var(--accent)) 40%, rgb(var(--line-strong))); border-radius:10px; background:color-mix(in srgb, rgb(var(--accent)) 7%, rgb(var(--surface))); }
.ah-tree .clipbar .clip-msg { font-size:12.5px; color:rgb(var(--ink)); }
.ah-tree .attach-list { display:flex; flex-direction:column; gap:4px; max-height:200px; overflow:auto; }
.ah-tree .attach-row { display:block; }
.ah-tree .attach-btn { display:flex; align-items:center; gap:8px; width:100%; text-align:start; background:rgb(var(--surface-2)); border:1px solid rgb(var(--line-strong)); border-radius:6px; padding:5px 8px; font-size:12.5px; color:rgb(var(--ink)); cursor:pointer; }
.ah-tree .attach-btn:hover { border-color:rgb(var(--accent)); }
.ah-tree .attach-btn.on { border-color:color-mix(in srgb, var(--tc-upgrade) 55%, rgb(var(--line-strong))); background:color-mix(in srgb, var(--tc-upgrade) 12%, rgb(var(--surface))); }
.ah-tree .attach-check { width:14px; text-align:center; color:var(--tc-upgrade); font-weight:700; flex:none; }
.ah-tree .attach-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ah-tree .gnode.faded { opacity:.45; }
.ah-tree .gnode.faded:hover { opacity:1; }
.ah-tree .edge.attach { stroke:var(--tc-upgrade); stroke-width:1.5; stroke-dasharray:3 3; opacity:.72; }
.ah-tree .edge.attach.color { stroke:var(--tc-colornode); }
.ah-tree .unlink { cursor:pointer; }
.ah-tree .unlink circle { fill:rgb(var(--surface)); stroke:var(--tc-upgrade); stroke-width:1.4; }
.ah-tree .unlink text { font-family:'Brown Pro', system-ui, sans-serif; font-size:12px; font-weight:700; fill:var(--tc-upgrade); pointer-events:none; }
.ah-tree .unlink.color circle { stroke:var(--tc-colornode); }
.ah-tree .unlink.color text { fill:var(--tc-colornode); }
.ah-tree .unlink:hover circle { fill:color-mix(in srgb, var(--tc-upgrade) 20%, rgb(var(--surface))); }
.ah-tree .stage.connect svg.cv { cursor:crosshair; }
.ah-tree .hint.connect { color:var(--tc-upgrade); background:color-mix(in srgb, var(--tc-upgrade) 12%, rgb(var(--surface))); }
.ah-tree .coswatch { stroke:rgba(0,0,0,.32); stroke-width:1; }
/* Left palette */
.ah-tree .palette { position:sticky; top:14px; max-height:calc(100vh - 40px); overflow:auto; border:1px solid rgb(var(--line)); border-radius:12px; background:rgb(var(--surface)); padding:11px; display:flex; flex-direction:column; gap:15px; }
.ah-tree .pal-sec { display:flex; flex-direction:column; gap:6px; }
.ah-tree .pal-h { font-size:11px; text-transform:uppercase; letter-spacing:.07em; font-weight:600; color:rgb(var(--accent)); }
.ah-tree .pal-chip { display:flex; align-items:center; gap:8px; padding:6px 9px; border:1px solid rgb(var(--line-strong)); border-radius:8px; background:rgb(var(--surface-2)); font-size:13px; color:rgb(var(--ink)); cursor:grab; }
.ah-tree .pal-chip:hover { border-color:rgb(var(--accent)); }
.ah-tree .pal-chip:active { cursor:grabbing; }
.ah-tree .pal-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ah-tree .pal-sw { width:15px; height:15px; border-radius:50%; border:1px solid rgba(0,0,0,.3); flex:none; }
.ah-tree .pal-ic { width:15px; height:15px; border-radius:3px; flex:none; }
.ah-tree .pal-ic-addon { background:var(--tc-upgrade); }
.ah-tree .pal-q { border:1px solid rgb(var(--line)); border-radius:8px; background:rgb(var(--surface-2)); padding:1px 9px; }
.ah-tree .pal-q > summary { cursor:pointer; font-size:12.5px; padding:6px 0; color:rgb(var(--ink)); list-style:none; }
.ah-tree .pal-q > summary::-webkit-details-marker { display:none; }
.ah-tree .pal-q > summary::before { content:'▸'; color:rgb(var(--muted)); margin-inline-end:6px; font-size:10px; }
.ah-tree .pal-q[open] > summary::before { content:'▾'; }
.ah-tree .pal-opts { display:flex; flex-wrap:wrap; gap:5px; padding:2px 0 9px; }
.ah-tree .pal-opt { padding:3px 9px; border:1px solid rgb(var(--line-strong)); border-radius:999px; background:rgb(var(--surface)); font-size:12.5px; color:rgb(var(--ink)); cursor:grab; }
.ah-tree .pal-opt:hover { border-color:var(--tc-price); color:var(--tc-price); }
.ah-tree .pal-opt:active { cursor:grabbing; }
.ah-tree .pal-newq { display:flex; flex-direction:column; gap:6px; }
/* Drag-onto-node feedback */
.ah-tree .gnode.drop-hi .shape { stroke-width:3.4; }
.ah-tree .gnode.drop-hi { filter: drop-shadow(0 0 1px rgb(var(--accent))) drop-shadow(0 2px 8px color-mix(in srgb, rgb(var(--accent)) 75%, transparent)); }
.ah-tree .dropmsg { position:absolute; left:12px; bottom:12px; z-index:2; font-size:12px; color:#fff; background:color-mix(in srgb, #b0514a 92%, #000); padding:6px 10px; border-radius:8px; max-width:70%; box-shadow:0 4px 14px rgba(0,0,0,.3); }
.ah-tree .dropmsg.ok { background:color-mix(in srgb, #3a7d44 92%, #000); }
.ah-tree .colorwell { width:38px; height:34px; flex:none; padding:2px; background:rgb(var(--surface-2)); border:1px solid rgb(var(--line-strong)); border-radius:6px; cursor:pointer; }
.ah-tree .colorwell::-webkit-color-swatch-wrapper { padding:0; }
.ah-tree .colorwell::-webkit-color-swatch { border:none; border-radius:4px; }
`;
