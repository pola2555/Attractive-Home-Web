import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

const prisma = new PrismaClient();

// Seeds a handful of imagined interior-design TREE products, each with a real
// two-level base-price decision tree (question 1 -> question 2 -> a price) plus
// a few flat canvas add-ons. They are made_to_order (priced by the configurator,
// not a flat price) and start unpublished, exactly like createTreeProduct makes
// them — then we hang the tree and add-ons on top. Idempotent: a template whose
// code already exists is skipped.

type Addon = { name: string; amount: number; priceUnit: string | null };
type Def = {
  code: string;
  name: string;
  currency: string;
  l1: { group: string; label: string; values: [string, string][] };
  l2: { group: string; label: string; values: [string, string][] };
  base: Record<string, number>; // by l1 value code
  delta: Record<string, number>; // by l2 value code
  addons: Addon[];
  // Real interior-design photos pulled from the web (stored as plain URLs, no S3):
  // one gallery for the base node, and one per first-level branch. By Pexels photo
  // id; applyImages() turns these into the CDN URLs and is idempotent, so it also
  // backfills products that were seeded before images existed.
  images?: { base?: number[]; l1?: Record<string, number[]> };
};

// A stable Pexels CDN URL for a photo id. These are free-to-use stock photos.
const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

const DEFS: Def[] = [
  {
    code: 'kitchen_cabinet',
    name: 'Kitchen Cabinet',
    currency: 'USD',
    l1: {
      group: 'kc_material',
      label: 'Carcass material',
      values: [
        ['mdf', 'MDF'],
        ['ply', 'Plywood'],
        ['oak', 'Solid oak'],
      ],
    },
    l2: {
      group: 'kc_finish',
      label: 'Door finish',
      values: [
        ['laminate', 'Laminate'],
        ['veneer', 'Veneer'],
        ['lacquer', 'Lacquer'],
      ],
    },
    base: { mdf: 120, ply: 160, oak: 240 },
    delta: { laminate: 0, veneer: 30, lacquer: 55 },
    addons: [
      { name: 'Soft-close hinges', amount: 25, priceUnit: 'per_piece' },
      { name: 'Push-to-open mechanism', amount: 35, priceUnit: null },
      { name: 'Integrated aluminium handle', amount: 40, priceUnit: 'per_piece' },
    ],
    images: { base: [6283970], l1: { mdf: [6301168], ply: [19345426], oak: [6538903] } },
  },
  {
    code: 'sliding_wardrobe',
    name: 'Sliding Wardrobe',
    currency: 'USD',
    l1: {
      group: 'sw_doors',
      label: 'Door count',
      values: [
        ['d2', '2-door'],
        ['d3', '3-door'],
        ['d4', '4-door'],
      ],
    },
    l2: {
      group: 'sw_panel',
      label: 'Panel surface',
      values: [
        ['mirror', 'Mirror'],
        ['matte', 'Matte'],
        ['gloss', 'High gloss'],
        ['woodgrain', 'Wood-grain'],
      ],
    },
    base: { d2: 300, d3: 420, d4: 540 },
    delta: { mirror: 80, matte: 0, gloss: 60, woodgrain: 40 },
    addons: [
      { name: 'Soft-close track', amount: 45, priceUnit: null },
      { name: 'LED wardrobe lighting', amount: 60, priceUnit: null },
      { name: 'Internal drawer set', amount: 80, priceUnit: 'per_set' },
    ],
    images: { base: [6044256], l1: { d2: [6508346], d3: [19899089] } },
  },
  {
    code: 'tv_media_unit',
    name: 'TV Media Unit',
    currency: 'USD',
    l1: {
      group: 'tv_size',
      label: 'Width',
      values: [
        ['w120', '120 cm'],
        ['w160', '160 cm'],
        ['w200', '200 cm'],
        ['w240', '240 cm'],
      ],
    },
    l2: {
      group: 'tv_finish',
      label: 'Finish',
      values: [
        ['matte', 'Matte'],
        ['gloss', 'High gloss'],
        ['oak', 'Oak veneer'],
      ],
    },
    base: { w120: 180, w160: 230, w200: 290, w240: 350 },
    delta: { matte: 0, gloss: 45, oak: 70 },
    addons: [
      { name: 'Cable management kit', amount: 15, priceUnit: null },
      { name: 'LED backlight', amount: 40, priceUnit: null },
    ],
    images: { base: [7767067], l1: { w120: [29606737] } },
  },
  {
    code: 'bathroom_vanity',
    name: 'Bathroom Vanity',
    currency: 'USD',
    l1: {
      group: 'bv_top',
      label: 'Countertop',
      values: [
        ['quartz', 'Quartz'],
        ['marble', 'Marble'],
        ['granite', 'Granite'],
        ['solid', 'Solid surface'],
      ],
    },
    l2: {
      group: 'bv_basin',
      label: 'Basin',
      values: [
        ['single', 'Single basin'],
        ['double', 'Double basin'],
        ['vessel', 'Vessel basin'],
      ],
    },
    base: { quartz: 260, marble: 340, granite: 300, solid: 220 },
    delta: { single: 0, double: 120, vessel: 60 },
    addons: [
      { name: 'Soft-close drawers', amount: 30, priceUnit: 'per_set' },
      { name: 'Wall-mount kit', amount: 20, priceUnit: null },
    ],
    images: {
      base: [6284231],
      l1: { quartz: [11701126], marble: [6782580], granite: [6538940] },
    },
  },
  {
    code: 'modular_bookshelf',
    name: 'Modular Bookshelf',
    currency: 'USD',
    l1: {
      group: 'bs_material',
      label: 'Material',
      values: [
        ['melamine', 'Melamine'],
        ['ply', 'Plywood'],
        ['pine', 'Solid pine'],
        ['walnut', 'Walnut'],
      ],
    },
    l2: {
      group: 'bs_tiers',
      label: 'Tiers',
      values: [
        ['t3', '3-tier'],
        ['t4', '4-tier'],
        ['t5', '5-tier'],
      ],
    },
    base: { melamine: 70, ply: 110, pine: 140, walnut: 230 },
    delta: { t3: 0, t4: 35, t5: 70 },
    addons: [
      { name: 'Anti-tip wall kit', amount: 10, priceUnit: null },
      { name: 'Glass door set', amount: 55, priceUnit: 'per_set' },
    ],
    images: {
      base: [39212012],
      l1: { melamine: [3646105], ply: [683929], pine: [7167083] },
    },
  },
];

async function ensureGroup(code: string, label: string, sortOrder: number): Promise<string> {
  const existing = await prisma.optionGroup.findUnique({ where: { code } });
  const id = existing?.id ?? uuidv7();
  if (!existing) {
    await prisma.optionGroup.create({
      data: { id, code, inputKind: 'select', sortOrder, isActive: true },
    });
  }
  await prisma.optionGroupTranslation.upsert({
    where: { groupId_localeCode: { groupId: id, localeCode: 'en' } },
    create: { id: uuidv7(), groupId: id, localeCode: 'en', name: label },
    update: { name: label },
  });
  return id;
}

async function ensureValue(
  groupId: string,
  code: string,
  label: string,
  sortOrder: number,
): Promise<string> {
  const existing = await prisma.optionValue.findUnique({
    where: { groupId_code: { groupId, code } },
  });
  const id = existing?.id ?? uuidv7();
  if (!existing) {
    await prisma.optionValue.create({
      data: { id, groupId, code, sortOrder, isActive: true },
    });
  }
  await prisma.optionValueTranslation.upsert({
    where: { valueId_localeCode: { valueId: id, localeCode: 'en' } },
    create: { id: uuidv7(), valueId: id, localeCode: 'en', name: label },
    update: { name: label },
  });
  return id;
}

async function seedOne(def: Def, source: { id: string }): Promise<string> {
  const existing = await prisma.configTemplate.findUnique({ where: { code: def.code } });
  if (existing) return `skipped (exists): ${def.code}`;

  const templateId = uuidv7();
  const variantId = uuidv7();
  const productId = uuidv7();
  const slug = def.code.replace(/_/g, '-');

  // Vocabulary: two question groups and their values (shared tables, reused on
  // re-run).
  const g1 = await ensureGroup(def.l1.group, def.l1.label, 10);
  const g2 = await ensureGroup(def.l2.group, def.l2.label, 20);
  const v1: Record<string, string> = {};
  for (let i = 0; i < def.l1.values.length; i++) {
    const [code, label] = def.l1.values[i];
    v1[code] = await ensureValue(g1, code, label, i);
  }
  const v2: Record<string, string> = {};
  for (let i = 0; i < def.l2.values.length; i++) {
    const [code, label] = def.l2.values[i];
    v2[code] = await ensureValue(g2, code, label, i);
  }

  await prisma.$transaction(async (tx) => {
    await tx.configTemplate.create({
      data: {
        id: templateId,
        code: def.code,
        name: def.name,
        currency: def.currency,
        isActive: true,
      },
    });
    await tx.configVariant.create({
      data: { id: variantId, templateId, code: 'build_1', name: 'Build 1', sortOrder: 0 },
    });
    await tx.configPriceGrid.create({
      data: { id: uuidv7(), variantId, currency: def.currency },
    });

    await tx.product.create({
      data: {
        id: productId,
        kind: 'made_to_order',
        slug,
        sourceId: source.id,
        price: 0,
        currency: 'AED',
        isPublished: false,
        isAvailable: true,
        templateId,
      },
    });
    await tx.productTranslation.create({
      data: { id: uuidv7(), productId, localeCode: 'en', name: def.name },
    });

    // Template questions (so the quote renders the two dropdowns). Availability
    // on the second question is driven by the tree, so no per-value conditions.
    const opt1 = uuidv7();
    const opt2 = uuidv7();
    await tx.configTemplateOption.create({
      data: { id: opt1, templateId, groupId: g1, sortOrder: 1, isRequired: true },
    });
    await tx.configTemplateOption.create({
      data: { id: opt2, templateId, groupId: g2, sortOrder: 2, isRequired: true },
    });
    for (let i = 0; i < def.l1.values.length; i++) {
      await tx.configTemplateOptionValue.create({
        data: { templateOptionId: opt1, valueId: v1[def.l1.values[i][0]], sortOrder: i },
      });
    }
    for (let i = 0; i < def.l2.values.length; i++) {
      await tx.configTemplateOptionValue.create({
        data: { templateOptionId: opt2, valueId: v2[def.l2.values[i][0]], sortOrder: i },
      });
    }

    // Base price decision tree: l1 value (no price) -> l2 value (the price).
    for (let i = 0; i < def.l1.values.length; i++) {
      const [c1] = def.l1.values[i];
      const rootId = uuidv7();
      await tx.configPriceNode.create({
        data: {
          id: rootId,
          variantId,
          parentId: null,
          groupId: g1,
          valueId: v1[c1],
          amount: null,
          sortOrder: i,
        },
      });
      for (let j = 0; j < def.l2.values.length; j++) {
        const [c2] = def.l2.values[j];
        await tx.configPriceNode.create({
          data: {
            id: uuidv7(),
            variantId,
            parentId: rootId,
            groupId: g2,
            valueId: v2[c2],
            amount: def.base[c1] + def.delta[c2],
            sortOrder: j,
          },
        });
      }
    }

    // Flat canvas add-ons, attached to the whole base (offered on every build).
    for (let i = 0; i < def.addons.length; i++) {
      const a = def.addons[i];
      await tx.configAddon.create({
        data: {
          id: uuidv7(),
          variantId,
          name: a.name,
          amount: a.amount,
          priceUnit: a.priceUnit,
          attachBase: true,
          sortOrder: i,
        },
      });
    }
  });

  return `created: ${def.name} (${def.code}) — product ${slug}`;
}

// Set the base-node gallery and the first-level branch images. Runs for every
// product on every run (idempotent), so it also backfills ones seeded before
// images existed. Looks nodes up by their stable group/value codes.
async function applyImages(def: Def): Promise<void> {
  if (!def.images) return;
  const template = await prisma.configTemplate.findUnique({
    where: { code: def.code },
    select: { variants: { where: { code: 'build_1' }, select: { id: true } } },
  });
  const variantId = template?.variants[0]?.id;
  if (!variantId) return;

  if (def.images.base?.length) {
    await prisma.configVariant.update({
      where: { id: variantId },
      data: { images: def.images.base.map(px) },
    });
  }

  if (def.images.l1) {
    const g1 = await prisma.optionGroup.findUnique({
      where: { code: def.l1.group },
      select: { id: true },
    });
    if (g1) {
      for (const [code, ids] of Object.entries(def.images.l1)) {
        const value = await prisma.optionValue.findUnique({
          where: { groupId_code: { groupId: g1.id, code } },
          select: { id: true },
        });
        if (!value) continue;
        await prisma.configPriceNode.updateMany({
          where: { variantId, parentId: null, addonId: null, groupId: g1.id, valueId: value.id },
          data: { images: ids.map(px) },
        });
      }
    }
  }
}

// A demo of a MULTI-SELECT level: a one-level tree where the single level is
// marked multiple-choice, so a quote can tick several modules at once and each
// one's price is summed (base + modules isn't the model here — each module is an
// independently-priced root choice, which is exactly what multi-select sums).
const MULTI_DEMO = {
  code: 'modular_closet',
  name: 'Modular Closet System',
  currency: 'USD',
  group: 'mc_module',
  groupLabel: 'Modules',
  modules: [
    ['shoe_rack', 'Shoe rack', 90],
    ['drawer_tower', 'Drawer tower', 140],
    ['glass_cabinet', 'Glass cabinet', 180],
    ['valet_rod', 'Valet rod', 40],
    ['hanging_rail', 'Hanging rail', 60],
  ] as [string, string, number][],
  baseImage: 6044256,
};

async function seedMultiDemo(source: { id: string }): Promise<string> {
  const def = MULTI_DEMO;
  const g = await ensureGroup(def.group, def.groupLabel, 30);
  const vals: Record<string, string> = {};
  for (let i = 0; i < def.modules.length; i++) {
    const [code, label] = def.modules[i];
    vals[code] = await ensureValue(g, code, label, i);
  }

  const existing = await prisma.configTemplate.findUnique({
    where: { code: def.code },
    select: { variants: { where: { code: 'build_1' }, select: { id: true } } },
  });
  if (existing) {
    const variantId = existing.variants[0]?.id;
    if (variantId) {
      await prisma.configVariant.update({
        where: { id: variantId },
        data: { images: [px(def.baseImage)] },
      });
    }
    return `skipped (exists): ${def.code} + images`;
  }

  const templateId = uuidv7();
  const variantId = uuidv7();
  const productId = uuidv7();
  const slug = def.code.replace(/_/g, '-');

  await prisma.$transaction(async (tx) => {
    await tx.configTemplate.create({
      data: { id: templateId, code: def.code, name: def.name, currency: def.currency, isActive: true },
    });
    await tx.configVariant.create({
      data: { id: variantId, templateId, code: 'build_1', name: 'Build 1', sortOrder: 0, images: [px(def.baseImage)] },
    });
    await tx.configPriceGrid.create({ data: { id: uuidv7(), variantId, currency: def.currency } });
    await tx.product.create({
      data: {
        id: productId,
        kind: 'made_to_order',
        slug,
        sourceId: source.id,
        price: 0,
        currency: 'AED',
        isPublished: false,
        isAvailable: true,
        templateId,
      },
    });
    await tx.productTranslation.create({
      data: { id: uuidv7(), productId, localeCode: 'en', name: def.name },
    });

    const opt = uuidv7();
    await tx.configTemplateOption.create({
      data: { id: opt, templateId, groupId: g, sortOrder: 1, isRequired: true },
    });
    for (let i = 0; i < def.modules.length; i++) {
      await tx.configTemplateOptionValue.create({
        data: { templateOptionId: opt, valueId: vals[def.modules[i][0]], sortOrder: i },
      });
    }

    // One multi-select level: every module is a root leaf with its own price.
    for (let i = 0; i < def.modules.length; i++) {
      const [code, , price] = def.modules[i];
      await tx.configPriceNode.create({
        data: {
          id: uuidv7(),
          variantId,
          parentId: null,
          groupId: g,
          valueId: vals[code],
          amount: price,
          multiSelect: true,
          sortOrder: i,
        },
      });
    }
  });

  return `created: ${def.name} (${def.code}) — product ${slug} + multi-select level`;
}

async function main() {
  const source = await prisma.source.findFirst({ select: { id: true } });
  if (!source)
    throw new Error('No Source row found — a product needs a source. Seed sources first.');

  for (const def of DEFS) {
    const msg = await seedOne(def, source);
    await applyImages(def);
    console.log(`${msg}${def.images ? ' + images' : ''}`);
  }
  console.log(await seedMultiDemo(source));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
