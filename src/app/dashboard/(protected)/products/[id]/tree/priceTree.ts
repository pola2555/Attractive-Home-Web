import 'server-only';
import { prisma } from '@/lib/prisma';

// Loads the base-price decision tree (for the canvas editor) and the reusable
// option vocabulary that feeds its dropdowns.

export type PTNode = {
  id: string;
  parentId: string | null;
  groupId: string;
  groupName: string;
  valueId: string;
  valueName: string;
  amount: number | null;
  // How the price is charged: null = one-off/flat; else a unit code.
  priceUnit: string | null;
  description: string | null;
  configuration: string | null;
  sortOrder: number;
};
// A named add-on: its own base-style tree, attached to base branches. Its chosen
// leaf price ADDS on top of the base.
export type PTAddon = {
  id: string;
  name: string;
  sortOrder: number;
  amount: number | null;
  // How the add-on's own price is charged: null = one-off/flat; else a unit code.
  priceUnit: string | null;
  description: string | null;
  configuration: string | null;
  // A colour node carries one custom colour (name + hex); both null on a plain add-on.
  colorName: string | null;
  colorHex: string | null;
  // Attached to the whole base price (every configuration), not just the branches
  // in baseNodeIds.
  attachBase: boolean;
  nodes: PTNode[];
  baseNodeIds: string[];
  // Other add-ons this add-on applies to (header-to-header links).
  targetAddonIds: string[];
};
export type PriceTreeData = {
  variantId: string;
  currency: string;
  nodes: PTNode[]; // the base price tree
  addons: PTAddon[];
};

export type VocabValue = { id: string; name: string };
export type VocabGroup = {
  id: string;
  name: string;
  kind: 'choice' | 'boolean';
  values: VocabValue[];
};

// How a price is charged. The editor ships these common units; staff can add
// more (stored in config_price_units). `code` null everywhere means "one-off".
export type PriceUnit = { code: string; label: string };
export const DEFAULT_PRICE_UNITS: PriceUnit[] = [
  { code: 'per_unit', label: 'per unit' },
  { code: 'per_sqm', label: 'per m²' },
  { code: 'per_item', label: 'per item' },
  { code: 'per_set', label: 'per set' },
  { code: 'per_piece', label: 'per piece' },
  { code: 'per_linear_m', label: 'per linear m' },
];

// The full unit list: the built-in defaults followed by any staff-added units,
// de-duplicated by code (a default is never shadowed).
export async function getPriceUnits(): Promise<PriceUnit[]> {
  const custom = await prisma.configPriceUnit.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { code: true, label: true },
  });
  const seen = new Set(DEFAULT_PRICE_UNITS.map((u) => u.code));
  return [...DEFAULT_PRICE_UNITS, ...custom.filter((u) => !seen.has(u.code))];
}

export async function getPriceTrees(templateId: string): Promise<Record<string, PriceTreeData>> {
  const variants = await prisma.configVariant.findMany({
    where: { templateId },
    include: {
      grid: { select: { currency: true } },
      priceNodes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          group: { include: { translations: { where: { localeCode: 'en' } } } },
          value: { include: { translations: { where: { localeCode: 'en' } } } },
        },
      },
      addons: {
        orderBy: { sortOrder: 'asc' },
        include: {
          attachments: { select: { baseNodeId: true } },
          linksFrom: { select: { targetAddonId: true } },
        },
      },
    },
  });

  type NodeRow = (typeof variants)[number]['priceNodes'][number];
  const toPT = (n: NodeRow): PTNode => ({
    id: n.id,
    parentId: n.parentId,
    groupId: n.groupId,
    groupName: n.group.translations[0]?.name ?? n.group.code,
    valueId: n.valueId,
    valueName: n.value.translations[0]?.name ?? n.value.code,
    amount: n.amount === null ? null : n.amount.toNumber(),
    priceUnit: n.priceUnit,
    description: n.description,
    configuration: n.configuration,
    sortOrder: n.sortOrder,
  });

  const out: Record<string, PriceTreeData> = {};
  for (const v of variants) {
    const byAddon = new Map<string, PTNode[]>();
    const baseNodes: PTNode[] = [];
    for (const n of v.priceNodes) {
      if (n.addonId === null) {
        baseNodes.push(toPT(n));
      } else {
        const list = byAddon.get(n.addonId);
        if (list) list.push(toPT(n));
        else byAddon.set(n.addonId, [toPT(n)]);
      }
    }
    out[v.id] = {
      variantId: v.id,
      currency: v.grid?.currency ?? 'USD',
      nodes: baseNodes,
      addons: v.addons.map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sortOrder,
        amount: a.amount === null ? null : a.amount.toNumber(),
        priceUnit: a.priceUnit,
        description: a.description,
        configuration: a.configuration,
        colorName: a.colorName,
        colorHex: a.colorHex,
        attachBase: a.attachBase,
        nodes: byAddon.get(a.id) ?? [],
        baseNodeIds: a.attachments.map((x) => x.baseNodeId),
        targetAddonIds: a.linksFrom.map((x) => x.targetAddonId),
      })),
    };
  }
  return out;
}

// Every reusable question a tree level can branch on, with its options — the
// "pick from a dropdown, or add to the list" vocabulary. A level is a single
// choice, so we take `select` questions (grow their own options) and `boolean`
// ones (fixed True/False); a `number` question has no finite list of branches.
export async function getVocabulary(): Promise<VocabGroup[]> {
  const groups = await prisma.optionGroup.findMany({
    where: { isActive: true, inputKind: { in: ['select', 'boolean'] } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: {
      translations: { where: { localeCode: 'en' } },
      values: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { translations: { where: { localeCode: 'en' } } },
      },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.translations[0]?.name ?? g.code,
    kind: g.inputKind === 'boolean' ? 'boolean' : 'choice',
    values: g.values.map((v) => ({ id: v.id, name: v.translations[0]?.name ?? v.code })),
  }));
}
