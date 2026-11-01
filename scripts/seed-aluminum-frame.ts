import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { seedBenison } from '../prisma/seed/benison';

// Idempotent seed that rebuilds the demo tree product "Aluminum Frame Door"
// (template code `aluminum_frame`, product slug `aluminum-frame-door`). It was
// originally built by a one-off script that has since been deleted; five e2e
// specs depend on it (alu-frame, alu-frame-rules, alu-frame-canvas, quote-addons,
// quote-tree-reveal). Modelled on scripts/seed-interior-trees.ts (a made_to_order
// tree product with a ConfigPriceNode base tree + canvas add-ons, isPublished:
// false) and on prisma/seed/benison.ts (the ben_* vocabulary, the size-band /
// upgrade / constraint patterns and how it picks a Source + HS code).
//
// It REUSES the shared global ben_* question vocabulary (ben_thickness,
// ben_edge_banding, ben_board, ben_width, ben_height, ben_color) that
// benison.ts creates — no new base question codes are invented. The base price
// is a decision TREE (thickness -> edge -> board), the size bands are ConfigAddon
// measure rows (the current canvas size mechanism), the wide-door colour rule is
// a ConfigTemplateConstraint, and the $40 lock is a ConfigUpgrade accessory.
//
// Re-running it wipes and rebuilds the add-on / base-tree layer under the one
// variant (clean idempotency) and upserts everything else by its natural key.

const prisma = new PrismaClient();

const TEMPLATE_CODE = 'aluminum_frame';
const PRODUCT_SLUG = 'aluminum-frame-door';
const PRODUCT_NAME = 'Aluminum Frame Door';
const VARIANT_CODE = 'alu_wpc';
const HS_CODE = '4418.20'; // reuse Benison's wooden-doors classification

// The base-price decision tree, thickness -> edge banding -> board material. A
// leaf (board) carries the price; 55 mm has no PUR branch at all. ~19 nodes.
const BASE_TREE: Record<string, Record<string, Record<string, number>>> = {
  '40': {
    pur: { spc: 65 },
    alu_silent: { spc: 80, wpc: 80, fr: 80 },
  },
  '45': {
    pur: { spc: 75 },
    alu_silent: { spc: 90, wpc: 90, fr: 90 },
  },
  '55': {
    alu_silent: { spc: 100, wpc: 100, fr: 100 },
  },
};

// Every value code each explicit question offers. The tree is still the
// authority on which values a branch actually shows (treeOptionAvailability);
// listing them here only makes the ConfigTemplateOption rows the quote renders.
const THICKNESS = ['40', '45', '55'];
const EDGE = ['pur', 'alu_silent'];
const BOARD = ['spc', 'wpc', 'fr'];
const COLOURS = [
  'zeppelin_grey',
  'pearl_white',
  'misty_grey',
  'light_cloud_grey',
  'platinum',
  'marsha_grey',
  'milan_grey',
  'matte_black',
];

async function groupId(code: string): Promise<string> {
  const row = await prisma.optionGroup.findUnique({ where: { code }, select: { id: true } });
  if (!row) throw new Error(`Option group ${code} missing — seed Benison first.`);
  return row.id;
}

async function valueId(gid: string, code: string): Promise<string> {
  const row = await prisma.optionValue.findUnique({
    where: { groupId_code: { groupId: gid, code } },
    select: { id: true },
  });
  if (!row) throw new Error(`Option value ${code} missing in group ${gid}.`);
  return row.id;
}

// Create a select OptionGroup + values if absent (for the add-on sub-questions
// the base ben_* vocabulary does not cover — hinges, glass). Idempotent.
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

async function ensureValue(gid: string, code: string, label: string, sortOrder: number): Promise<string> {
  const existing = await prisma.optionValue.findUnique({
    where: { groupId_code: { groupId: gid, code } },
  });
  const id = existing?.id ?? uuidv7();
  if (!existing) {
    await prisma.optionValue.create({ data: { id, groupId: gid, code, sortOrder, isActive: true } });
  }
  await prisma.optionValueTranslation.upsert({
    where: { valueId_localeCode: { valueId: id, localeCode: 'en' } },
    create: { id: uuidv7(), valueId: id, localeCode: 'en', name: label },
    update: { name: label },
  });
  return id;
}

// An explicit ConfigTemplateOption (find-or-create by its natural shape, then
// keep its authored fields current). There is no single unique column, so we key
// on (templateId, groupId, variantId) the way benison.ts does.
async function ensureOption(args: {
  templateId: string;
  groupId: string;
  variantId: string | null;
  sortOrder: number;
  isRequired: boolean;
  condition?: object | null;
}): Promise<string> {
  const existing = await prisma.configTemplateOption.findFirst({
    where: { templateId: args.templateId, groupId: args.groupId, variantId: args.variantId },
    select: { id: true },
  });
  const data = {
    sortOrder: args.sortOrder,
    isRequired: args.isRequired,
    condition: (args.condition ?? null) as object | undefined,
  };
  if (existing) {
    await prisma.configTemplateOption.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const id = uuidv7();
  await prisma.configTemplateOption.create({
    data: {
      id,
      templateId: args.templateId,
      groupId: args.groupId,
      variantId: args.variantId,
      ...data,
    },
  });
  return id;
}

async function ensureOptionValue(optionId: string, vid: string, sortOrder: number): Promise<void> {
  await prisma.configTemplateOptionValue.upsert({
    where: { templateOptionId_valueId: { templateOptionId: optionId, valueId: vid } },
    create: { templateOptionId: optionId, valueId: vid, sortOrder },
    update: { sortOrder },
  });
}

async function main() {
  // The ben_* vocabulary is created by the Benison seed; build it if a run finds
  // it missing (it is normally already present in the dev DB).
  const haveBen = await prisma.optionGroup.findUnique({ where: { code: 'ben_thickness' } });
  if (!haveBen) {
    console.log('ben_* vocabulary not found — running the Benison seed first.');
    await seedBenison(prisma);
  }

  const gThickness = await groupId('ben_thickness');
  const gEdge = await groupId('ben_edge_banding');
  const gBoard = await groupId('ben_board');
  const gColor = await groupId('ben_color');

  const vThickness = new Map<string, string>();
  for (const c of THICKNESS) vThickness.set(c, await valueId(gThickness, c));
  const vEdge = new Map<string, string>();
  for (const c of EDGE) vEdge.set(c, await valueId(gEdge, c));
  const vBoard = new Map<string, string>();
  for (const c of BOARD) vBoard.set(c, await valueId(gBoard, c));
  const vColor = new Map<string, string>();
  for (const c of COLOURS) vColor.set(c, await valueId(gColor, c));

  // Add-on sub-question vocabulary (hinges, glass) — not part of the base ben_*
  // questions, so authored here.
  const gHinge = await ensureGroup('alu_side_hinge', 'Side concealed hinges', 300);
  const hingeStd = await ensureValue(gHinge, 'std', 'Standard finish', 0);
  const hingeColour = await ensureValue(gHinge, 'color', 'Colour-matched', 1);
  const gGlass = await ensureGroup('alu_glass', 'Glass opening', 301);
  const glassFull = await ensureValue(gGlass, 'with', 'With glass', 0);
  const glassCut = await ensureValue(gGlass, 'cut', 'Opening only', 1);

  const hsCode = await prisma.hsCode.findUnique({ where: { code: HS_CODE } });
  const source =
    (await prisma.source.findFirst({ where: { code: 'benison' }, select: { id: true } })) ??
    (await prisma.source.findFirst({ select: { id: true } }));
  if (!source) throw new Error('No Source row found — seed sources first.');

  // ---- template, variant, (empty) grid for currency, product -------------
  const template = await prisma.configTemplate.upsert({
    where: { code: TEMPLATE_CODE },
    update: { name: PRODUCT_NAME, currency: 'USD', hsCodeId: hsCode?.id ?? null, isActive: true },
    create: {
      id: uuidv7(),
      code: TEMPLATE_CODE,
      name: PRODUCT_NAME,
      currency: 'USD',
      standardNote: 'Standard opening 2170 x 950 mm — every size band is a step above this',
      hsCodeId: hsCode?.id ?? null,
      isActive: true,
    },
  });

  const variant = await prisma.configVariant.upsert({
    where: { templateId_code: { templateId: template.id, code: VARIANT_CODE } },
    update: {},
    create: {
      id: uuidv7(),
      templateId: template.id,
      code: VARIANT_CODE,
      name: 'Aluminum Frame + WPC Connecting Board',
      includedSpec: 'Frame + 1 lock + 3x 2D hinges, wood keel + graphite board',
      sortOrder: 1,
    },
  });

  await prisma.configPriceGrid.upsert({
    where: { variantId: variant.id },
    update: { currency: 'USD' },
    create: { id: uuidv7(), variantId: variant.id, currency: 'USD' },
  });

  const product = await prisma.product.upsert({
    where: { slug: PRODUCT_SLUG },
    update: { templateId: template.id, hsCodeId: hsCode?.id ?? null, isPublished: false },
    create: {
      id: uuidv7(),
      kind: 'made_to_order',
      slug: PRODUCT_SLUG,
      sourceId: source.id,
      templateId: template.id,
      hsCodeId: hsCode?.id ?? null,
      price: 0,
      currency: 'USD',
      isPublished: false, // demo — stays out of the public catalog
      isAvailable: true,
    },
  });
  await prisma.productTranslation.upsert({
    where: { productId_localeCode: { productId: product.id, localeCode: 'en' } },
    update: { name: PRODUCT_NAME },
    create: {
      id: uuidv7(),
      productId: product.id,
      localeCode: 'en',
      name: PRODUCT_NAME,
      description:
        'Made-to-order aluminium-frame interior door with a WPC connecting board. Choose thickness, edge banding, board material and finish; our team configures and quotes it.',
    },
  });

  // ---- explicit questions (thickness/edge/board bound to the variant, colour
  //      shared and gated on the aluminium-silent branch) -------------------
  const optThickness = await ensureOption({
    templateId: template.id,
    groupId: gThickness,
    variantId: variant.id,
    sortOrder: 1,
    isRequired: true,
  });
  for (const [i, c] of THICKNESS.entries()) await ensureOptionValue(optThickness, vThickness.get(c)!, i);

  const optEdge = await ensureOption({
    templateId: template.id,
    groupId: gEdge,
    variantId: variant.id,
    sortOrder: 2,
    isRequired: true,
  });
  for (const [i, c] of EDGE.entries()) await ensureOptionValue(optEdge, vEdge.get(c)!, i);

  const optBoard = await ensureOption({
    templateId: template.id,
    groupId: gBoard,
    variantId: variant.id,
    sortOrder: 3,
    isRequired: true,
  });
  for (const [i, c] of BOARD.entries()) await ensureOptionValue(optBoard, vBoard.get(c)!, i);

  // Colour is only offered on the aluminium-silent edge, and is OPTIONAL so a
  // door can be quoted without naming a colour. The whole question hides until
  // the silent edge is chosen (option-level condition).
  const optColor = await ensureOption({
    templateId: template.id,
    groupId: gColor,
    variantId: null,
    sortOrder: 6,
    isRequired: false,
    condition: { group: 'ben_edge_banding', in: ['alu_silent'] },
  });
  for (const [i, c] of COLOURS.entries()) await ensureOptionValue(optColor, vColor.get(c)!, i);

  // ---- base price tree (addonId = null) ----------------------------------
  // Wiped and rebuilt each run. Deleting the add-ons first clears their nodes +
  // attachments (cascade); deleting the base nodes then clears the rest.
  await prisma.configAddon.deleteMany({ where: { variantId: variant.id } });
  await prisma.configPriceNode.deleteMany({ where: { variantId: variant.id } });

  const thicknessNodeId = new Map<string, string>(); // for the Flat-outside attachment
  let tSort = 0;
  for (const [thick, edges] of Object.entries(BASE_TREE)) {
    const thickId = uuidv7();
    thicknessNodeId.set(thick, thickId);
    await prisma.configPriceNode.create({
      data: {
        id: thickId,
        variantId: variant.id,
        parentId: null,
        groupId: gThickness,
        valueId: vThickness.get(thick)!,
        amount: null,
        sortOrder: tSort++,
      },
    });
    let eSort = 0;
    for (const [edge, boards] of Object.entries(edges)) {
      const edgeId = uuidv7();
      await prisma.configPriceNode.create({
        data: {
          id: edgeId,
          variantId: variant.id,
          parentId: thickId,
          groupId: gEdge,
          valueId: vEdge.get(edge)!,
          amount: null,
          sortOrder: eSort++,
        },
      });
      let bSort = 0;
      for (const [board, price] of Object.entries(boards)) {
        await prisma.configPriceNode.create({
          data: {
            id: uuidv7(),
            variantId: variant.id,
            parentId: edgeId,
            groupId: gBoard,
            valueId: vBoard.get(board)!,
            amount: price,
            sortOrder: bSort++,
          },
        });
      }
    }
  }

  // ---- canvas add-on layer ------------------------------------------------
  let aSort = 0;
  const flatAddon = async (
    name: string,
    amount: number,
    priceUnit: string | null,
    attach: { attachBase?: boolean; nodeIds?: string[] },
  ) => {
    const id = uuidv7();
    await prisma.configAddon.create({
      data: {
        id,
        variantId: variant.id,
        name,
        amount,
        priceUnit,
        attachBase: attach.attachBase ?? false,
        sortOrder: aSort++,
      },
    });
    for (const nodeId of attach.nodeIds ?? []) {
      await prisma.configAddonAttachment.create({
        data: { id: uuidv7(), addonId: id, baseNodeId: nodeId },
      });
    }
    return id;
  };

  // Flat upgrades, priced from the canvas (the retired ConfigUpgrade rows are
  // intentionally NOT recreated — the quote shows exactly one control each).
  await flatAddon('All same colour', 30, null, { attachBase: true });
  await flatAddon('Nano agent', 12, null, { attachBase: true });
  await flatAddon('Metal strips', 14, null, { attachBase: true });
  await flatAddon('Coloured metal strips / aluminium grills', 19, null, { attachBase: true });
  await flatAddon('Aluminium honeycomb connecting board', 9, 'per_set', { attachBase: true });
  await flatAddon('Upgraded integrated set', 9, 'per_set', { attachBase: true });
  // "Flat outside" is a 45/55-only upgrade: attached to those two thickness roots.
  await flatAddon('Flat outside, inward opening', 15, null, {
    nodeIds: [thicknessNodeId.get('45')!, thicknessNodeId.get('55')!],
  });

  // Size bands as ConfigAddon measure rows (the current size mechanism): a width
  // or height in the half-open [min, max) adds its surcharge automatically.
  const sizeBand = async (
    measureCode: string,
    measureLabel: string,
    min: number | null,
    max: number | null,
    amount: number,
  ) => {
    const fmt = (n: number | null) => (n === null ? '' : String(n));
    const name = `${measureLabel} ${fmt(min)}–${fmt(max)} mm`.trim();
    await prisma.configAddon.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        name,
        amount,
        attachBase: true,
        measureCode,
        measureLabel,
        measureUnit: 'mm',
        rangeMin: min,
        rangeMax: max,
        sortOrder: aSort++,
      },
    });
  };
  await sizeBand('ben_width', 'Width', 950, 1050, 12);
  await sizeBand('ben_width', 'Width', 1050, 1220, 23);
  await sizeBand('ben_height', 'Height', 2170, 2240, 12);
  await sizeBand('ben_height', 'Height', 2440, null, 23);

  // Option-tree add-ons (a sub-question whose chosen leaf price adds on top).
  const treeAddon = async (
    name: string,
    priceUnit: string | null,
    gid: string,
    choices: { valueId: string; amount: number }[],
  ) => {
    const addonId = uuidv7();
    await prisma.configAddon.create({
      data: {
        id: addonId,
        variantId: variant.id,
        name,
        amount: null,
        priceUnit,
        attachBase: true,
        sortOrder: aSort++,
      },
    });
    for (const [i, ch] of choices.entries()) {
      await prisma.configPriceNode.create({
        data: {
          id: uuidv7(),
          variantId: variant.id,
          parentId: null,
          addonId,
          groupId: gid,
          valueId: ch.valueId,
          amount: ch.amount,
          sortOrder: i,
        },
      });
    }
  };
  await treeAddon('Side concealed hinges', 'per_unit', gHinge, [
    { valueId: hingeStd, amount: 7 },
    { valueId: hingeColour, amount: 11 },
  ]);
  await treeAddon('Glass opening', null, gGlass, [
    { valueId: glassFull, amount: 21 },
    { valueId: glassCut, amount: 13 },
  ]);

  // NOTE on canvas colour nodes: the original product carried 8 colorHex add-ons
  // for the canvas. They are intentionally NOT recreated here. The current quote
  // loader (configuratorAdmin.toTemplateDef) links a colorHex add-on to the
  // `ben_color` option VALUE whose code equals the slug of the add-on's name, and
  // then DRIVES that value's availability from the add-on's branch attachments —
  // overriding the value's own condition. So colour nodes named after the eight
  // colours would either (a) synthesise a duplicate "Colour" question in the quote
  // when attached, or (b) suppress every ben_color value when unattached. Keeping
  // colour out of the add-on layer lets the one explicit ben_color select (gated
  // on the aluminium-silent branch) and the forbid constraint be the single,
  // correct source of colour behaviour the specs exercise.

  // ---- wide-door colour constraint (forbid) ------------------------------
  await prisma.configTemplateConstraint.upsert({
    where: { templateId_code: { templateId: template.id, code: 'wide_door_colour' } },
    update: {
      kind: 'forbid',
      condition: {
        all: [
          { group: 'ben_width', op: '>=', value: 1050 },
          { group: 'ben_width', op: '<', value: 1220 },
          { group: 'ben_color', in: ['marsha_grey', 'milan_grey', 'matte_black'] },
        ],
      },
      message:
        'A door this wide is only made in Zeppelin Grey, Pearl White, Misty Grey, Light Cloud Grey or Platinum.',
      isActive: true,
    },
    create: {
      id: uuidv7(),
      templateId: template.id,
      code: 'wide_door_colour',
      kind: 'forbid',
      condition: {
        all: [
          { group: 'ben_width', op: '>=', value: 1050 },
          { group: 'ben_width', op: '<', value: 1220 },
          { group: 'ben_color', in: ['marsha_grey', 'milan_grey', 'matte_black'] },
        ],
      },
      message:
        'A door this wide is only made in Zeppelin Grey, Pearl White, Misty Grey, Light Cloud Grey or Platinum.',
      isActive: true,
    },
  });

  // ---- the $40 lock, priced like an accessory upgrade --------------------
  await prisma.configUpgrade.upsert({
    where: { templateId_code: { templateId: template.id, code: 'lock_alu_wpc_set' } },
    update: {
      variantId: variant.id,
      section: 'Locks',
      label: 'Aluminum Frame + WPC connecting board lock',
      kind: 'accessory',
      amount: 40,
      unit: 'flat',
      isActive: true,
    },
    create: {
      id: uuidv7(),
      templateId: template.id,
      variantId: variant.id,
      section: 'Locks',
      code: 'lock_alu_wpc_set',
      label: 'Aluminum Frame + WPC connecting board lock',
      kind: 'accessory',
      amount: 40,
      unit: 'flat',
      defaultQty: 1,
      sortOrder: 0,
      isActive: true,
    },
  });

  console.log(`Seeded ${PRODUCT_NAME} (${TEMPLATE_CODE}) — product ${PRODUCT_SLUG}, variant ${VARIANT_CODE}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
