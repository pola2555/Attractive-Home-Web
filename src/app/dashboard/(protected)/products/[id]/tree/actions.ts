'use server';

import { revalidatePath } from 'next/cache';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { DEFAULT_PRICE_UNITS } from './priceTree';

// Composite actions for the tree editor. Where the old templates editor made you
// visit the option vocabulary, then bind the group, then seed its values across
// three screens, each of these does the whole thing in one call and refreshes
// the product's canvas. They write the same configurator tables the engine reads,
// so a door built here prices exactly like the seeded one.

export type FormState = { error?: string; ok?: boolean };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function numOrNull(s: string): number | null {
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// A price-unit code from a form field: a bare code or null (a one-off/flat price).
function unitOrNull(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  return /^[a-z0-9_]{1,40}$/.test(s) ? s : null;
}

// A configurator code: lowercase letters, digits, underscores, starting with a
// letter (the shared codeSchema rule).
function toCode(input: string): string {
  let c = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!c) c = 'x';
  if (!/^[a-z]/.test(c)) c = `c_${c}`.slice(0, 50);
  return c;
}

const SIMPLE_UPGRADE_UNITS = ['flat', 'per_unit', 'per_set', 'per_piece'] as const;

function rev(productId: string) {
  revalidatePath(`/dashboard/products/${productId}/tree`);
}

// Resolve (and authorise) the product's template. Every action funnels through
// here so a caller can never touch another product's template by id-guessing.
async function templateIdOf(productId: string): Promise<string | null> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { templateId: true },
  });
  return p?.templateId ?? null;
}

async function uniqueCode(
  base: string,
  taken: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = i === 0 ? base : `${base}_${i}`.slice(0, 60);
    if (!(await taken(code))) return code;
  }
  return `${base}_${uuidv7().slice(0, 4)}`.slice(0, 60);
}

// ---------------------------------------------------------------------------
// Builds (variants)
// ---------------------------------------------------------------------------

export async function addBuild(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Name the build.' };

  const code = await uniqueCode(toCode(name), async (c) =>
    Boolean(await prisma.configVariant.findFirst({ where: { templateId, code: c }, select: { id: true } })),
  );
  const count = await prisma.configVariant.count({ where: { templateId } });
  const id = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.configVariant.create({ data: { id, templateId, code, name, sortOrder: count } });
    await tx.configPriceGrid.create({ data: { id: uuidv7(), variantId: id, currency: 'USD' } });
  });
  await writeAudit({
    userId: user.id,
    entityType: 'config_variant',
    entityId: id,
    action: 'create',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function renameBuild(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const variantId = str(fd, 'variantId');
  const name = str(fd, 'name');
  if (!name) return { error: 'Name cannot be empty.' };
  const variant = await prisma.configVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.templateId !== templateId) return { error: 'Build not found.' };
  await prisma.configVariant.update({ where: { id: variantId }, data: { name } });
  rev(productId);
  return { ok: true };
}

export async function deleteBuild(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.templateId !== templateId) return;
  await prisma.configVariant.delete({ where: { id: variantId } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_variant',
    entityId: variantId,
    action: 'delete',
    diff: { code: { from: variant.code, to: null } },
  });
  rev(productId);
}

// ---------------------------------------------------------------------------
// Questions (option group + binding + seeded answers) — the one-step add
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  name: z.string().trim().min(1, 'Name the question.').max(120),
  kind: z.enum(['select', 'number']),
});

export async function addQuestion(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const parsed = questionSchema.safeParse({ name: str(fd, 'name'), kind: str(fd, 'kind') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, kind } = parsed.data;

  // scope: '' | 'shared' = shared across builds; otherwise a variant id.
  const scope = str(fd, 'scope');
  let variantId: string | null = null;
  if (scope && scope !== 'shared') {
    const variant = await prisma.configVariant.findUnique({ where: { id: scope } });
    if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };
    variantId = scope;
  }

  const unit = kind === 'number' ? nullableStr(fd, 'unit') : null;
  const answers =
    kind === 'select'
      ? str(fd, 'answers')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];
  if (kind === 'select' && answers.length === 0) {
    return { error: 'A choice question needs at least one answer (one per line).' };
  }

  const groupCode = await uniqueCode(toCode(name), async (c) =>
    Boolean(await prisma.optionGroup.findUnique({ where: { code: c }, select: { id: true } })),
  );
  const sortOrder = await prisma.configTemplateOption.count({ where: { templateId } });

  const groupId = uuidv7();
  const optionId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.optionGroup.create({
      data: { id: groupId, code: groupCode, inputKind: kind, unit, sortOrder: 0, isActive: true },
    });
    await tx.optionGroupTranslation.create({
      data: { id: uuidv7(), groupId, localeCode: 'en', name },
    });

    const valueIds: string[] = [];
    const seen = new Set<string>();
    for (const label of answers) {
      let vc = toCode(label);
      while (seen.has(vc)) vc = `${vc}_x`;
      seen.add(vc);
      const valueId = uuidv7();
      valueIds.push(valueId);
      await tx.optionValue.create({
        data: { id: valueId, groupId, code: vc, sortOrder: valueIds.length - 1, isActive: true },
      });
      await tx.optionValueTranslation.create({
        data: { id: uuidv7(), valueId, localeCode: 'en', name: label },
      });
    }

    await tx.configTemplateOption.create({
      data: { id: optionId, templateId, groupId, variantId, sortOrder, isRequired: true },
    });
    if (valueIds.length) {
      await tx.configTemplateOptionValue.createMany({
        data: valueIds.map((valueId, index) => ({
          templateOptionId: optionId,
          valueId,
          sortOrder: index,
        })),
      });
    }
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: optionId,
    action: 'create',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteQuestion(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const optionId = str(fd, 'optionId');
  const option = await prisma.configTemplateOption.findUnique({ where: { id: optionId } });
  if (!option || option.templateId !== templateId) return;
  // Removes the binding and its seeded answers (cascade). The option group stays
  // in the shared vocabulary, reusable, rather than being deleted from under any
  // other product that might reference it.
  await prisma.configTemplateOption.delete({ where: { id: optionId } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: optionId,
    action: 'delete',
    diff: { removed: { from: true, to: null } },
  });
  rev(productId);
}

// ---------------------------------------------------------------------------
// Answers (option value + join)
// ---------------------------------------------------------------------------

export async function addAnswer(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const optionId = str(fd, 'optionId');
  const name = str(fd, 'name');
  if (!name) return { error: 'Name the answer.' };

  const option = await prisma.configTemplateOption.findUnique({
    where: { id: optionId },
    select: { id: true, templateId: true, groupId: true },
  });
  if (!option || option.templateId !== templateId) return { error: 'Unknown question.' };

  const colorId = nullableStr(fd, 'colorId');
  const code = await uniqueCode(toCode(name), async (c) =>
    Boolean(
      await prisma.optionValue.findUnique({
        where: { groupId_code: { groupId: option.groupId, code: c } },
        select: { id: true },
      }),
    ),
  );
  const valueSort = await prisma.optionValue.count({ where: { groupId: option.groupId } });
  const joinSort = await prisma.configTemplateOptionValue.count({
    where: { templateOptionId: optionId },
  });

  const valueId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.optionValue.create({
      data: { id: valueId, groupId: option.groupId, code, colorId, sortOrder: valueSort, isActive: true },
    });
    await tx.optionValueTranslation.create({
      data: { id: uuidv7(), valueId, localeCode: 'en', name },
    });
    await tx.configTemplateOptionValue.create({
      data: { templateOptionId: optionId, valueId, sortOrder: joinSort },
    });
  });
  await writeAudit({
    userId: user.id,
    entityType: 'option_value',
    entityId: valueId,
    action: 'create',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteAnswer(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const optionId = str(fd, 'optionId');
  const valueId = str(fd, 'valueId');
  const option = await prisma.configTemplateOption.findUnique({ where: { id: optionId } });
  if (!option || option.templateId !== templateId) return;
  // Drop the answer from THIS question only; the value stays in the vocabulary.
  await prisma.configTemplateOptionValue
    .delete({ where: { templateOptionId_valueId: { templateOptionId: optionId, valueId } } })
    .catch(() => {});
  rev(productId);
}

// ---------------------------------------------------------------------------
// Upgrades (flat / per-unit / per-set / per-piece — the common ones)
// ---------------------------------------------------------------------------

export async function addUpgrade(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const label = str(fd, 'label');
  if (!label) return { error: 'Name the add-on.' };
  const amount = Number(str(fd, 'amount'));
  if (!Number.isFinite(amount)) return { error: 'Enter a price.' };
  const unit = str(fd, 'unit') || 'flat';
  if (!SIMPLE_UPGRADE_UNITS.includes(unit as (typeof SIMPLE_UPGRADE_UNITS)[number])) {
    return { error: 'Choose how the price is charged.' };
  }

  const scope = str(fd, 'scope');
  let variantId: string | null = null;
  if (scope && scope !== 'shared') {
    const variant = await prisma.configVariant.findUnique({ where: { id: scope } });
    if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };
    variantId = scope;
  }

  const code = await uniqueCode(toCode(label), async (c) =>
    Boolean(await prisma.configUpgrade.findFirst({ where: { templateId, code: c }, select: { id: true } })),
  );
  const sortOrder = await prisma.configUpgrade.count({ where: { templateId } });
  const id = uuidv7();
  await prisma.configUpgrade.create({
    data: {
      id,
      templateId,
      code,
      variantId,
      label,
      kind: 'upgrade',
      amount,
      unit,
      defaultQty: 1,
      minQty: 1,
      sortOrder,
    },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'config_upgrade',
    entityId: id,
    action: 'create',
    diff: { amount: { from: null, to: amount } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteUpgrade(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const id = str(fd, 'upgradeId');
  const upgrade = await prisma.configUpgrade.findUnique({ where: { id } });
  if (!upgrade || upgrade.templateId !== templateId) return;
  await prisma.configUpgrade.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_upgrade',
    entityId: id,
    action: 'delete',
    diff: { code: { from: upgrade.code, to: null } },
  });
  rev(productId);
}

// ---------------------------------------------------------------------------
// Size steps (bands on a number question)
// ---------------------------------------------------------------------------

export async function addSizeStep(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const label = str(fd, 'label');
  if (!label) return { error: 'Name the size step.' };
  const optionId = str(fd, 'optionId');
  const min = numOrNull(str(fd, 'min'));
  const max = numOrNull(str(fd, 'max'));
  if (min === null && max === null) return { error: 'Give the step a from and/or to value.' };
  if (min !== null && max !== null && min >= max) return { error: 'From must be below to.' };
  const amount = Number(str(fd, 'amount'));
  if (!Number.isFinite(amount)) return { error: 'Enter a price.' };

  const option = await prisma.configTemplateOption.findUnique({
    where: { id: optionId },
    include: { group: { select: { inputKind: true } } },
  });
  if (!option || option.templateId !== templateId) return { error: 'Choose a measurement.' };
  if (option.group.inputKind !== 'number') {
    return { error: 'Size steps attach to a number question (like Height or Width).' };
  }

  const scope = str(fd, 'scope');
  let variantId: string | null = null;
  if (scope && scope !== 'shared') {
    const variant = await prisma.configVariant.findUnique({ where: { id: scope } });
    if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };
    variantId = scope;
  }

  const code = await uniqueCode(toCode(label), async (c) =>
    Boolean(await prisma.configBand.findFirst({ where: { templateId, code: c }, select: { id: true } })),
  );
  const sortOrder = await prisma.configBand.count({ where: { templateId } });
  const id = uuidv7();
  await prisma.configBand.create({
    data: {
      id,
      templateId,
      variantId,
      templateOptionId: optionId,
      code,
      label,
      minValue: min,
      maxValue: max,
      amount,
      sortOrder,
    },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'config_band',
    entityId: id,
    action: 'create',
    diff: { amount: { from: null, to: amount } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteSizeStep(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const id = str(fd, 'bandId');
  const band = await prisma.configBand.findUnique({ where: { id } });
  if (!band || band.templateId !== templateId) return;
  await prisma.configBand.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_band',
    entityId: id,
    action: 'delete',
    diff: { code: { from: band.code, to: null } },
  });
  rev(productId);
}

// ---------------------------------------------------------------------------
// Price table — edited on the canvas in a modal, not a separate page.
//
// A build's base price is a grid. Its axes are the choices that set the price
// (Thickness, Edge banding…), each with its own options. Rather than a separate
// "questions" step, you name a dimension and its options right here, and it
// becomes an axis of this build's grid. Adding or removing a dimension re-keys
// the grid, so its cells are cleared then — a cell keyed on two axes means
// nothing once there are three. Editing the options WITHIN a dimension reuses
// addAnswer / deleteAnswer above.
// ---------------------------------------------------------------------------

export async function addPriceDimension(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };

  const name = str(fd, 'name');
  if (!name) return { error: 'Name the dimension (e.g. Thickness).' };
  const values = str(fd, 'values')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (values.length === 0) return { error: 'List its options, one per line.' };

  const grid = await prisma.configPriceGrid.findUnique({
    where: { variantId },
    select: { id: true },
  });
  if (!grid) return { error: 'This build has no price grid yet.' };

  const groupCode = await uniqueCode(toCode(name), async (c) =>
    Boolean(await prisma.optionGroup.findUnique({ where: { code: c }, select: { id: true } })),
  );
  const sortOrder = await prisma.configTemplateOption.count({ where: { templateId } });
  const position = await prisma.configPriceGridAxis.count({ where: { gridId: grid.id } });

  const groupId = uuidv7();
  const optionId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.optionGroup.create({
      data: { id: groupId, code: groupCode, inputKind: 'select', unit: null, sortOrder: 0, isActive: true },
    });
    await tx.optionGroupTranslation.create({
      data: { id: uuidv7(), groupId, localeCode: 'en', name },
    });

    const valueIds: string[] = [];
    const seen = new Set<string>();
    for (const label of values) {
      let vc = toCode(label);
      while (seen.has(vc)) vc = `${vc}_x`;
      seen.add(vc);
      const valueId = uuidv7();
      valueIds.push(valueId);
      await tx.optionValue.create({
        data: { id: valueId, groupId, code: vc, sortOrder: valueIds.length - 1, isActive: true },
      });
      await tx.optionValueTranslation.create({
        data: { id: uuidv7(), valueId, localeCode: 'en', name: label },
      });
    }

    await tx.configTemplateOption.create({
      data: { id: optionId, templateId, groupId, variantId, sortOrder, isRequired: true },
    });
    await tx.configTemplateOptionValue.createMany({
      data: valueIds.map((valueId, index) => ({ templateOptionId: optionId, valueId, sortOrder: index })),
    });

    await tx.configPriceGridAxis.create({
      data: { id: uuidv7(), gridId: grid.id, templateOptionId: optionId, position },
    });
    // Adding an axis re-keys every cell, so the old ones cannot be kept.
    await tx.configPriceCell.deleteMany({ where: { gridId: grid.id } });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: optionId,
    action: 'create',
    diff: { dimension: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function deletePriceDimension(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const variantId = str(fd, 'variantId');
  const optionId = str(fd, 'optionId');
  const option = await prisma.configTemplateOption.findUnique({
    where: { id: optionId },
    select: { id: true, templateId: true },
  });
  if (!option || option.templateId !== templateId) return;

  const grid = await prisma.configPriceGrid.findUnique({
    where: { variantId },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    if (grid) {
      await tx.configPriceGridAxis.deleteMany({ where: { gridId: grid.id, templateOptionId: optionId } });
      // Removing an axis re-keys the grid.
      await tx.configPriceCell.deleteMany({ where: { gridId: grid.id } });
    }
    await tx.configTemplateOption.delete({ where: { id: optionId } });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: optionId,
    action: 'delete',
    diff: { dimension: { from: true, to: null } },
  });
  rev(productId);
}

// ---------------------------------------------------------------------------
// Base-price DECISION TREE (the free-form alternative to the grid)
//
// A node is one branch: a chosen value for the question at its level. Its
// children are the next question's answers, so different branches can ask
// different questions and stop at different depths. A leaf's price is set with
// setTreeNodePrice — blank means "not sold". Questions and their options come
// from the shared vocabulary; addVocabValue / createVocabGroup grow it.
// ---------------------------------------------------------------------------

export async function addTreeNode(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };

  // addonId set = a node of that add-on's tree; null = the base price tree.
  const addonId = str(fd, 'addonId') || null;
  if (addonId) {
    const addon = await prisma.configAddon.findUnique({
      where: { id: addonId },
      select: { variantId: true },
    });
    if (!addon || addon.variantId !== variantId) return { error: 'Unknown add-on.' };
  }

  const groupId = str(fd, 'groupId');
  const valueId = str(fd, 'valueId');
  if (!groupId || !valueId) return { error: 'Pick a question and an option.' };
  const value = await prisma.optionValue.findUnique({
    where: { id: valueId },
    select: { groupId: true },
  });
  if (!value || value.groupId !== groupId) return { error: 'That option is not in that question.' };

  const parentId = str(fd, 'parentId') || null;
  if (parentId) {
    const parent = await prisma.configPriceNode.findUnique({
      where: { id: parentId },
      select: { variantId: true, addonId: true },
    });
    if (!parent || parent.variantId !== variantId || parent.addonId !== addonId) {
      return { error: 'Unknown parent branch.' };
    }
  }

  // Everything at one level answers the same question, and a value appears once.
  const siblings = await prisma.configPriceNode.findMany({
    where: { variantId, parentId, addonId },
    select: { groupId: true, valueId: true },
  });
  if (siblings.length && siblings[0].groupId !== groupId) {
    return { error: 'This level already asks a different question — options here share one question.' };
  }
  if (siblings.some((s) => s.valueId === valueId)) {
    return { error: 'That option is already at this level.' };
  }

  const id = uuidv7();
  await prisma.configPriceNode.create({
    data: { id, variantId, parentId, addonId, groupId, valueId, amount: null, sortOrder: siblings.length },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'config_price_node',
    entityId: id,
    action: 'create',
    diff: { added: { from: null, to: true } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteTreeNode(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const nodeId = str(fd, 'nodeId');
  const node = await prisma.configPriceNode.findUnique({
    where: { id: nodeId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!node || node.variant.templateId !== templateId) return;
  await prisma.configPriceNode.delete({ where: { id: nodeId } }); // cascades to children
  await writeAudit({
    userId: user.id,
    entityType: 'config_price_node',
    entityId: nodeId,
    action: 'delete',
    diff: { removed: { from: true, to: null } },
  });
  rev(productId);
}

// Bulk remove — the canvas lets you select several nodes and delete them at
// once. Each descriptor names one deletable thing (a price branch, add-on, size
// step or build); anything else the canvas already declined to select. Every
// item is re-checked against THIS product's template before it goes, and a
// price branch cascades to everything under it (so a parent already taking its
// child with it just skips the child's own entry).
const delDescriptorSchema = z.object({
  type: z.enum(['pnode', 'upgrade', 'size', 'build']),
  id: z.string().min(1),
});

export async function deleteNodes(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return;

  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, 'payload'));
  } catch {
    return;
  }
  const parsed = z.array(delDescriptorSchema).max(500).safeParse(raw);
  if (!parsed.success) return;

  for (const item of parsed.data) {
    if (item.type === 'pnode') {
      const node = await prisma.configPriceNode.findUnique({
        where: { id: item.id },
        include: { variant: { select: { templateId: true } } },
      });
      if (!node || node.variant.templateId !== templateId) continue;
      await prisma.configPriceNode.delete({ where: { id: item.id } }); // cascades to children
      await writeAudit({
        userId: user.id,
        entityType: 'config_price_node',
        entityId: item.id,
        action: 'delete',
        diff: { removed: { from: true, to: null } },
      });
    } else if (item.type === 'upgrade') {
      const up = await prisma.configUpgrade.findUnique({ where: { id: item.id } });
      if (!up || up.templateId !== templateId) continue;
      await prisma.configUpgrade.delete({ where: { id: item.id } });
      await writeAudit({
        userId: user.id,
        entityType: 'config_upgrade',
        entityId: item.id,
        action: 'delete',
        diff: { code: { from: up.code, to: null } },
      });
    } else if (item.type === 'size') {
      const band = await prisma.configBand.findUnique({ where: { id: item.id } });
      if (!band || band.templateId !== templateId) continue;
      await prisma.configBand.delete({ where: { id: item.id } });
      await writeAudit({
        userId: user.id,
        entityType: 'config_band',
        entityId: item.id,
        action: 'delete',
        diff: { code: { from: band.code, to: null } },
      });
    } else {
      const variant = await prisma.configVariant.findUnique({ where: { id: item.id } });
      if (!variant || variant.templateId !== templateId) continue;
      await prisma.configVariant.delete({ where: { id: item.id } });
      await writeAudit({
        userId: user.id,
        entityType: 'config_variant',
        entityId: item.id,
        action: 'delete',
        diff: { code: { from: variant.code, to: null } },
      });
    }
  }
  rev(productId);
}

// Duplicate one or more price branches — each WITH its whole subtree — and
// attach the copies under a chosen destination (another branch, or the top
// level). This is how "40 mm and 45 mm share the same edge-banding tree" is
// built without retyping it: pick 40's branches, duplicate them under 45.
//
// The same level rules as addTreeNode hold at the landing spot: everything at a
// level answers one question, and a value appears once — so the destination must
// be empty or already ask the sources' question, and must not already offer any
// of the values being copied. A branch can't be dropped inside its own subtree.
export async function duplicateNodes(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };

  const destParentId = str(fd, 'destParentId') || null; // '' → attach at the top level
  // Copy/paste (Ctrl+C) sets this: a copied leaf with no declared price lands
  // as 0 rather than "not sold", so a pasted subtree is priced and ready.
  const zeroUndeclared = str(fd, 'zeroUndeclared') === '1';

  let rawSources: unknown;
  try {
    rawSources = JSON.parse(str(fd, 'sourceIds'));
  } catch {
    return { error: 'Nothing to duplicate.' };
  }
  const parsedSources = z.array(z.string().min(1)).min(1).max(200).safeParse(rawSources);
  if (!parsedSources.success) return { error: 'Nothing to duplicate.' };

  const all = await prisma.configPriceNode.findMany({
    where: { variantId },
    select: {
      id: true,
      parentId: true,
      addonId: true,
      groupId: true,
      valueId: true,
      amount: true,
      priceUnit: true,
      description: true,
      configuration: true,
      sortOrder: true,
    },
  });
  type Row = (typeof all)[number];
  const byId = new Map<string, Row>(all.map((n) => [n.id, n]));
  // Duplication stays inside one tree (the base tree, or a single add-on's), so
  // children are scoped to that context — a base root and an add-on root can
  // both have parentId = null without being siblings.
  let ctxAddonId: string | null = null;
  const childrenOf = (pid: string | null) =>
    all
      .filter((n) => n.parentId === pid && n.addonId === ctxAddonId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  // Keep only the "top" of the selection — a selected node that sits inside
  // another selected node is already carried by its ancestor's subtree.
  const srcSet = new Set(parsedSources.data);
  const hasSelectedAncestor = (n: Row): boolean => {
    let pid = n.parentId;
    let guard = 0;
    while (pid && guard++ < 1000) {
      if (srcSet.has(pid)) return true;
      pid = byId.get(pid)?.parentId ?? null;
    }
    return false;
  };
  const tops: Row[] = [];
  for (const id of parsedSources.data) {
    const n = byId.get(id);
    if (!n) return { error: 'Some branches no longer exist — reopen and try again.' };
    if (!hasSelectedAncestor(n)) tops.push(n);
  }
  if (tops.length === 0) return { error: 'Nothing to duplicate.' };

  const groupId = tops[0].groupId;
  if (tops.some((n) => n.groupId !== groupId)) {
    return { error: 'Pick branches from the same question to duplicate together.' };
  }
  ctxAddonId = tops[0].addonId;
  if (tops.some((n) => n.addonId !== ctxAddonId)) {
    return { error: 'Duplicate branches from the same tree together.' };
  }

  // Cannot land inside one of the sources (a branch inside itself).
  if (destParentId) {
    const dest = byId.get(destParentId);
    if (!dest) return { error: 'Unknown destination.' };
    if (dest.addonId !== ctxAddonId) return { error: 'Choose a destination in the same tree.' };
    const banned = new Set<string>();
    const collect = (id: string) => {
      banned.add(id);
      for (const c of childrenOf(id)) collect(c.id);
    };
    for (const t of tops) collect(t.id);
    if (banned.has(destParentId)) return { error: 'Cannot attach a branch inside itself.' };
  }

  const destChildren = childrenOf(destParentId);
  if (destChildren.length && destChildren[0].groupId !== groupId) {
    return { error: 'That level already asks a different question.' };
  }
  const destValueIds = new Set(destChildren.map((c) => c.valueId));
  const seen = new Set<string>();
  for (const t of tops) {
    if (seen.has(t.valueId)) return { error: 'The same option is selected twice.' };
    seen.add(t.valueId);
    if (destValueIds.has(t.valueId)) {
      return { error: 'The destination already offers one of these options.' };
    }
  }

  const creates: {
    id: string;
    variantId: string;
    parentId: string | null;
    addonId: string | null;
    groupId: string;
    valueId: string;
    amount: Row['amount'] | number;
    priceUnit: string | null;
    description: string | null;
    configuration: string | null;
    sortOrder: number;
  }[] = [];
  const cloneSubtree = (srcId: string, newParentId: string | null, sortOrder: number) => {
    const src = byId.get(srcId)!;
    const kids = childrenOf(srcId);
    const isLeaf = kids.length === 0;
    // Copy/paste: an undeclared leaf lands as 0 rather than staying blank.
    const amount = zeroUndeclared && isLeaf && src.amount === null ? 0 : src.amount;
    const newId = uuidv7();
    creates.push({
      id: newId,
      variantId,
      parentId: newParentId,
      addonId: ctxAddonId,
      groupId: src.groupId,
      valueId: src.valueId,
      amount,
      priceUnit: src.priceUnit,
      description: src.description,
      configuration: src.configuration,
      sortOrder,
    });
    kids.forEach((k, i) => cloneSubtree(k.id, newId, i));
  };
  let sort = destChildren.length;
  for (const t of tops) cloneSubtree(t.id, destParentId, sort++);

  await prisma.configPriceNode.createMany({ data: creates });
  await writeAudit({
    userId: user.id,
    entityType: 'config_price_node',
    entityId: destParentId ?? variantId,
    action: 'create',
    diff: { duplicated: { from: null, to: creates.length } },
  });
  rev(productId);
  return { ok: true };
}

// Cut & paste — MOVE one or more price branches (each with its whole subtree)
// to a new home ANYWHERE in this product: another spot in the same tree, another
// build's base tree, or into an add-on's tree. The subtree keeps its shape; the
// tops are re-parented and — when the destination is a different tree — the whole
// moved subtree is re-stamped with the destination's build and add-on. The
// engine's one rule still holds at the landing spot: everything at a level answers
// one question and a value appears once (the same guard as drag-to-build).
export async function moveNodes(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  // Where the branches come from.
  const srcVariantId = str(fd, 'variantId');
  const srcVariant = await prisma.configVariant.findUnique({
    where: { id: srcVariantId },
    select: { templateId: true },
  });
  if (!srcVariant || srcVariant.templateId !== templateId) return { error: 'Unknown build.' };

  // Where they are going: which build, which tree ('' = the base tree, else an
  // add-on id), under which parent ('' = that tree's top level).
  const destVariantId = str(fd, 'destVariantId') || srcVariantId;
  const destAddonId = str(fd, 'destAddonId') || null;
  const destParentId = str(fd, 'destParentId') || null;

  const destVariant = await prisma.configVariant.findUnique({
    where: { id: destVariantId },
    select: { templateId: true },
  });
  if (!destVariant || destVariant.templateId !== templateId) {
    return { error: 'Unknown destination build.' };
  }
  if (destAddonId) {
    const addon = await prisma.configAddon.findUnique({
      where: { id: destAddonId },
      select: { variantId: true },
    });
    if (!addon || addon.variantId !== destVariantId) return { error: 'Unknown destination add-on.' };
  }

  let rawSources: unknown;
  try {
    rawSources = JSON.parse(str(fd, 'sourceIds'));
  } catch {
    return { error: 'Nothing to move.' };
  }
  const parsedSources = z.array(z.string().min(1)).min(1).max(200).safeParse(rawSources);
  if (!parsedSources.success) return { error: 'Nothing to move.' };

  // The source build's nodes, so a subtree can be walked.
  const all = await prisma.configPriceNode.findMany({
    where: { variantId: srcVariantId },
    select: { id: true, parentId: true, addonId: true, groupId: true, valueId: true, sortOrder: true },
  });
  type Row = (typeof all)[number];
  const byId = new Map<string, Row>(all.map((n) => [n.id, n]));

  // Keep only the tops of the selection — a selected node inside another selected
  // node already rides along with its ancestor.
  const srcSet = new Set(parsedSources.data);
  const hasSelectedAncestor = (n: Row): boolean => {
    let pid = n.parentId;
    let guard = 0;
    while (pid && guard++ < 1000) {
      if (srcSet.has(pid)) return true;
      pid = byId.get(pid)?.parentId ?? null;
    }
    return false;
  };
  const tops: Row[] = [];
  for (const id of parsedSources.data) {
    const n = byId.get(id);
    if (!n) return { error: 'Some branches no longer exist — reopen and try again.' };
    if (!hasSelectedAncestor(n)) tops.push(n);
  }
  if (tops.length === 0) return { error: 'Nothing to move.' };

  const groupId = tops[0].groupId;
  if (tops.some((n) => n.groupId !== groupId)) {
    return { error: 'Pick branches from the same question to move together.' };
  }
  const ctxAddonId = tops[0].addonId;
  if (tops.some((n) => n.addonId !== ctxAddonId)) {
    return { error: 'Move branches from the same tree together.' };
  }

  // Every node that travels: the tops plus their descendants (scoped to the
  // source tree).
  const childrenOf = (pid: string | null) =>
    all
      .filter((n) => n.parentId === pid && n.addonId === ctxAddonId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const movedIds = new Set<string>();
  const collect = (id: string) => {
    movedIds.add(id);
    for (const c of childrenOf(id)) collect(c.id);
  };
  for (const t of tops) collect(t.id);

  const sameTree = destVariantId === srcVariantId && destAddonId === ctxAddonId;
  if (sameTree && destParentId && movedIds.has(destParentId)) {
    return { error: 'Cannot move a branch inside itself.' };
  }
  if (sameTree && tops.every((t) => t.parentId === destParentId)) {
    return { error: 'These branches are already here.' };
  }

  // The destination parent must belong to the destination tree.
  if (destParentId) {
    const p = await prisma.configPriceNode.findUnique({
      where: { id: destParentId },
      select: { variantId: true, addonId: true },
    });
    if (!p || p.variantId !== destVariantId || p.addonId !== destAddonId) {
      return { error: 'Unknown destination.' };
    }
  }

  // One question per level, a value once — checked against the destination's own
  // children (ignoring any that are themselves being moved from within it).
  const destChildren = (
    await prisma.configPriceNode.findMany({
      where: { variantId: destVariantId, parentId: destParentId, addonId: destAddonId },
      select: { id: true, groupId: true, valueId: true },
    })
  ).filter((c) => !movedIds.has(c.id));
  if (destChildren.length && destChildren[0].groupId !== groupId) {
    return { error: 'That level already asks a different question.' };
  }
  const destValueIds = new Set(destChildren.map((c) => c.valueId));
  const seen = new Set<string>();
  for (const t of tops) {
    if (seen.has(t.valueId)) return { error: 'The same option is selected twice.' };
    seen.add(t.valueId);
    if (destValueIds.has(t.valueId)) {
      return { error: 'The destination already offers one of these options.' };
    }
  }

  // Re-parent the tops; re-stamp the whole subtree's build/add-on when the tree
  // changed (an in-place move only touches the tops' parent + order).
  const topSet = new Set(tops.map((t) => t.id));
  let sort = destChildren.length;
  const ops = tops.map((t) =>
    prisma.configPriceNode.update({
      where: { id: t.id },
      data: {
        parentId: destParentId,
        sortOrder: sort++,
        ...(sameTree ? {} : { variantId: destVariantId, addonId: destAddonId }),
      },
    }),
  );
  if (!sameTree) {
    for (const id of movedIds) {
      if (topSet.has(id)) continue;
      ops.push(
        prisma.configPriceNode.update({
          where: { id },
          data: { variantId: destVariantId, addonId: destAddonId },
        }),
      );
    }
  }
  await prisma.$transaction(ops);

  await writeAudit({
    userId: user.id,
    entityType: 'config_price_node',
    entityId: destParentId ?? destVariantId,
    action: 'update',
    diff: { moved: { from: null, to: movedIds.size } },
  });
  rev(productId);
  return { ok: true };
}

// Undo/redo. The canvas keeps a history of price-tree snapshots on the client
// (it already holds every field of every branch); undo and redo hand one back
// here and this replaces the tree with it, atomically. The snapshot covers the
// WHOLE tree of every build — the base branches and every add-on's branches
// (each node carries its addonId) — so moving a branch between trees is undoable.
const snapshotNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  addonId: z.string().nullable().optional(),
  groupId: z.string().min(1),
  valueId: z.string().min(1),
  amount: z.number().nullable(),
  priceUnit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  configuration: z.string().nullable().optional(),
  sortOrder: z.number().int(),
});
const snapshotAddonSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  colorName: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  priceUnit: z.string().nullable().optional(),
  attachBase: z.boolean().optional(),
  description: z.string().nullable().optional(),
  configuration: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
const snapshotVariantSchema = z.object({
  nodes: z.array(snapshotNodeSchema),
  addons: z.array(snapshotAddonSchema).optional(),
  attachments: z.array(z.object({ addonId: z.string(), baseNodeId: z.string() })).optional(),
  links: z.array(z.object({ addonId: z.string(), targetAddonId: z.string() })).optional(),
});

export async function restorePriceTree(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, 'snapshot'));
  } catch {
    return { error: 'Could not read the snapshot.' };
  }
  const parsed = z.record(z.string(), snapshotVariantSchema).safeParse(raw);
  if (!parsed.success) return { error: 'Could not read the snapshot.' };

  const variants = await prisma.configVariant.findMany({
    where: { templateId },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);
  const variantSet = new Set(variantIds);

  await prisma.$transaction(async (tx) => {
    const entries = Object.entries(parsed.data).filter(([vid]) => variantSet.has(vid));

    // ── 1. Reconcile the add-ons themselves (lifecycle + metadata) ──────────────
    // The snapshot now versions the add-ons/colour nodes, not just their branches,
    // so undo/redo can create, delete, rename, recolour or reprice one. Wipe the
    // live add-ons of these builds (which cascades their branches, attachments and
    // links) and recreate exactly the set the snapshot holds, keeping ids stable so
    // branches and attachments still line up.
    const wantedAddonIds = new Set<string>();
    const addonCreate: {
      id: string;
      variantId: string;
      name: string;
      colorName: string | null;
      colorHex: string | null;
      amount: number | null;
      priceUnit: string | null;
      attachBase: boolean;
      description: string | null;
      configuration: string | null;
      sortOrder: number;
    }[] = [];
    for (const [variantId, snap] of entries) {
      for (const a of snap.addons ?? []) {
        wantedAddonIds.add(a.id);
        addonCreate.push({
          id: a.id,
          variantId,
          name: a.name,
          colorName: a.colorName ?? null,
          colorHex: a.colorHex ?? null,
          amount: a.amount ?? null,
          priceUnit: a.priceUnit ?? null,
          attachBase: a.attachBase ?? false,
          description: a.description ?? null,
          configuration: a.configuration ?? null,
          sortOrder: a.sortOrder ?? 0,
        });
      }
    }

    // Deleting the add-ons cascades their branch nodes, attachments and links;
    // deleting the base nodes cascades any base attachments. After both, bare.
    await tx.configAddon.deleteMany({ where: { variantId: { in: variantIds } } });
    await tx.configPriceNode.deleteMany({ where: { variantId: { in: variantIds } } });
    if (addonCreate.length) await tx.configAddon.createMany({ data: addonCreate });

    // ── 2. Rebuild every node (base + add-on branches) parents-before-children ──
    const restoredIds = new Set<string>();
    for (const [variantId, snap] of entries) {
      const nodes = snap.nodes.filter((n) => !n.addonId || wantedAddonIds.has(n.addonId));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const done = new Set<string>();
      const ordered: typeof nodes = [];
      const visit = (n: (typeof nodes)[number]) => {
        if (done.has(n.id)) return;
        if (n.parentId && byId.has(n.parentId)) visit(byId.get(n.parentId)!);
        done.add(n.id);
        ordered.push(n);
      };
      nodes.forEach(visit);

      if (ordered.length) {
        await tx.configPriceNode.createMany({
          data: ordered.map((n) => ({
            id: n.id,
            variantId,
            parentId: n.parentId && byId.has(n.parentId) ? n.parentId : null,
            addonId: n.addonId ?? null,
            groupId: n.groupId,
            valueId: n.valueId,
            amount: n.amount,
            priceUnit: n.priceUnit ?? null,
            description: n.description ?? null,
            configuration: n.configuration ?? null,
            sortOrder: n.sortOrder,
          })),
        });
        for (const n of ordered) restoredIds.add(n.id);
      }
    }

    // ── 3. Rebuild attachments (add-on → base branch) and links (add-on → add-on) ─
    const attachData: { id: string; addonId: string; baseNodeId: string }[] = [];
    const linkData: { id: string; addonId: string; targetAddonId: string }[] = [];
    for (const [, snap] of entries) {
      for (const at of snap.attachments ?? []) {
        if (wantedAddonIds.has(at.addonId) && restoredIds.has(at.baseNodeId))
          attachData.push({ id: uuidv7(), addonId: at.addonId, baseNodeId: at.baseNodeId });
      }
      for (const lk of snap.links ?? []) {
        if (wantedAddonIds.has(lk.addonId) && wantedAddonIds.has(lk.targetAddonId))
          linkData.push({ id: uuidv7(), addonId: lk.addonId, targetAddonId: lk.targetAddonId });
      }
    }
    if (attachData.length) await tx.configAddonAttachment.createMany({ data: attachData });
    if (linkData.length) await tx.configAddonLink.createMany({ data: linkData });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_price_node',
    entityId: templateId,
    action: 'update',
    diff: { restored: { from: null, to: true } },
  });
  rev(productId);
  return { ok: true };
}

export async function setTreeNodePrice(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const nodeId = str(fd, 'nodeId');
  const node = await prisma.configPriceNode.findUnique({
    where: { id: nodeId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!node || node.variant.templateId !== templateId) return { error: 'Unknown branch.' };

  const raw = str(fd, 'amount');
  let amount: number | null = null; // blank = no price here; a deeper choice inherits from above
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'Enter a price, or leave it blank so it’s just a choice.' };
    }
    amount = n;
  }
  await prisma.configPriceNode.update({
    where: { id: nodeId },
    data: { amount, priceUnit: unitOrNull(fd, 'unit') },
  });
  rev(productId);
  return { ok: true };
}

// The optional per-branch notes: a free description and the supplier's
// "Configuration" spec. Either can be blanked.
export async function setTreeNodeInfo(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const nodeId = str(fd, 'nodeId');
  const node = await prisma.configPriceNode.findUnique({
    where: { id: nodeId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!node || node.variant.templateId !== templateId) return { error: 'Unknown branch.' };

  await prisma.configPriceNode.update({
    where: { id: nodeId },
    data: {
      description: nullableStr(fd, 'description'),
      configuration: nullableStr(fd, 'configuration'),
    },
  });
  rev(productId);
  return { ok: true };
}

// Parse the images textarea: one URL per line, each a plain http(s) link (no S3
// upload — the node just points at a hosted image). Blanks are dropped, order is
// kept, duplicates removed, and the list is capped so a paste cannot bloat a row.
// Returns an error message when a non-blank line is not a valid http(s) URL.
const MAX_NODE_IMAGES = 12;
function parseImages(fd: FormData, key: string): { urls: string[]; error?: string } {
  const raw = fd.get(key);
  const text = typeof raw === 'string' ? raw : '';
  const urls: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim();
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { urls: [], error: `"${url.slice(0, 60)}" is not a valid URL.` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { urls: [], error: 'Images must be http(s) links.' };
    }
    if (!urls.includes(url)) urls.push(url);
  }
  if (urls.length > MAX_NODE_IMAGES) {
    return { urls: [], error: `At most ${MAX_NODE_IMAGES} images.` };
  }
  return { urls };
}

// Images for one price-tree branch (a base node or an add-on option) — plain web
// URLs, shown on the canvas and beside the choice in the quote. Empty clears them.
export async function setTreeNodeImages(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const nodeId = str(fd, 'nodeId');
  const node = await prisma.configPriceNode.findUnique({
    where: { id: nodeId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!node || node.variant.templateId !== templateId) return { error: 'Unknown branch.' };

  const { urls, error } = parseImages(fd, 'images');
  if (error) return { error };
  // Store the list straight (an empty array = none), which sidesteps Prisma's
  // JsonNull/DbNull handling for a nullable Json column and reads back the same.
  await prisma.configPriceNode.update({ where: { id: nodeId }, data: { images: urls } });
  rev(productId);
  return { ok: true };
}

// Toggle whether a BASE-tree level is multiple-choice. A level is the set of
// sibling nodes that share a parent (and a question); the flag is stored on every
// one of them so the engine reads it off any sibling. Base tree only — an add-on
// option sub-tree (addonId set) is refused, so colour/add-on nodes are untouched.
export async function setLevelMultiSelect(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const nodeId = str(fd, 'nodeId');
  const node = await prisma.configPriceNode.findUnique({
    where: { id: nodeId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!node || node.variant.templateId !== templateId) return { error: 'Unknown branch.' };
  if (node.addonId !== null) return { error: 'Multiple-choice applies to base branches only.' };

  const multi = str(fd, 'multi') === '1';
  // Every sibling of this level (same variant, same parent, base tree) flips
  // together, so the level is multi-select iff its nodes carry the flag.
  await prisma.configPriceNode.updateMany({
    where: { variantId: node.variantId, parentId: node.parentId, addonId: null },
    data: { multiSelect: multi },
  });
  rev(productId);
  return { ok: true };
}

// Images for the base ("owner") node — the product/build the tree hangs off.
// Stored on the variant; shown on the canvas and at the top of the quote.
export async function setVariantImages(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };

  const { urls, error } = parseImages(fd, 'images');
  if (error) return { error };
  await prisma.configVariant.update({ where: { id: variantId }, data: { images: urls } });
  rev(productId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Add-ons — a named add-on is its own base-style decision tree (its nodes carry
// its addonId), attached to one or more BASE branches. Its chosen leaf price
// adds on top of the base. Authored with the same node actions as the base tree
// (addTreeNode/setTreeNodePrice/… all take an addonId), plus these for the
// container and its attachments.
// ---------------------------------------------------------------------------

export async function createAddon(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Name the add-on.' };

  const sortOrder = await prisma.configAddon.count({ where: { variantId } });
  const id = uuidv7();
  await prisma.configAddon.create({ data: { id, variantId, name, sortOrder } });

  // Optionally attach it to a node straight away (dragged onto one). Any node in
  // the same build is a valid anchor — the new add-on has no nodes of its own yet.
  const baseNodeId = str(fd, 'baseNodeId') || null;
  if (baseNodeId) {
    const base = await prisma.configPriceNode.findUnique({
      where: { id: baseNodeId },
      select: { variantId: true },
    });
    if (base && base.variantId === variantId) {
      await prisma.configAddonAttachment.create({ data: { id: uuidv7(), addonId: id, baseNodeId } });
    }
  }
  // Or attach it to the whole base price (dropped on the Base price box).
  if (str(fd, 'attachBase') === '1') {
    await prisma.configAddon.update({ where: { id }, data: { attachBase: true } });
  }
  // Or link it to another add-on straight away (dropped on an add-on header).
  await linkOnCreate(fd, id, variantId);
  await writeAudit({
    userId: user.id,
    entityType: 'config_addon',
    entityId: id,
    action: 'create',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

// Shared by createAddon / createColorNode: when the new add-on was dropped onto
// another add-on's header, link it to that add-on so it isn't left floating.
async function linkOnCreate(fd: FormData, addonId: string, variantId: string): Promise<void> {
  const targetAddonId = str(fd, 'targetAddonId') || null;
  if (!targetAddonId || targetAddonId === addonId) return;
  const target = await prisma.configAddon.findUnique({
    where: { id: targetAddonId },
    select: { variantId: true },
  });
  if (target && target.variantId === variantId) {
    await prisma.configAddonLink.create({
      data: { id: uuidv7(), addonId, targetAddonId },
    });
  }
}

// Normalise a colour to a #rrggbb hex, expanding #rgb; null on anything else.
function normHex(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}

// A COLOUR NODE is an add-on that also carries one bespoke colour (a name + hex
// authored right here, not from the shared colour library). It reuses every
// add-on action — rename, price, notes, attach/detach, delete — and adds only
// its colour, set here and edited with setColorNodeColor.
export async function createColorNode(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Name the colour node.' };
  const colorHex = normHex(str(fd, 'colorHex'));
  if (!colorHex) return { error: 'Pick a colour.' };
  // The colour's own label defaults to the node's name when left blank.
  const colorName = nullableStr(fd, 'colorName') ?? name;

  const sortOrder = await prisma.configAddon.count({ where: { variantId } });
  const id = uuidv7();
  await prisma.configAddon.create({
    data: { id, variantId, name, colorName, colorHex, sortOrder },
  });
  // Optionally attach on create (dragged onto a node, or the Base price box).
  const baseNodeId = str(fd, 'baseNodeId') || null;
  if (baseNodeId) {
    const base = await prisma.configPriceNode.findUnique({
      where: { id: baseNodeId },
      select: { variantId: true },
    });
    if (base && base.variantId === variantId) {
      await prisma.configAddonAttachment.create({ data: { id: uuidv7(), addonId: id, baseNodeId } });
    }
  }
  if (str(fd, 'attachBase') === '1') {
    await prisma.configAddon.update({ where: { id }, data: { attachBase: true } });
  }
  // Or link it to another add-on straight away (dropped on an add-on header).
  await linkOnCreate(fd, id, variantId);
  await writeAudit({
    userId: user.id,
    entityType: 'config_addon',
    entityId: id,
    action: 'create',
    diff: { colorNode: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function renameAddon(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const name = str(fd, 'name');
  if (!name) return { error: 'Name cannot be empty.' };
  const addon = await prisma.configAddon.findUnique({
    where: { id: addonId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!addon || addon.variant.templateId !== templateId) return { error: 'Unknown add-on.' };
  await prisma.configAddon.update({ where: { id: addonId }, data: { name } });
  rev(productId);
  return { ok: true };
}

export async function deleteAddon(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await prisma.configAddon.findUnique({
    where: { id: addonId },
    include: { variant: { select: { templateId: true } } },
  });
  if (!addon || addon.variant.templateId !== templateId) return;
  await prisma.configAddon.delete({ where: { id: addonId } }); // cascades nodes + attachments
  await writeAudit({
    userId: user.id,
    entityType: 'config_addon',
    entityId: addonId,
    action: 'delete',
    diff: { removed: { from: true, to: null } },
  });
  rev(productId);
}

// Attach / detach an add-on to ANY node in its build — a base branch (a leaf, or
// a higher node to cover everything under it) or a node inside another add-on.
// The one thing it may not attach to is a node of its own tree.
async function addonOfTemplate(addonId: string, templateId: string | null) {
  if (!templateId) return null;
  const addon = await prisma.configAddon.findUnique({
    where: { id: addonId },
    select: { variantId: true, variant: { select: { templateId: true } } },
  });
  return addon && addon.variant.templateId === templateId ? addon : null;
}

export async function attachAddon(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const baseNodeId = str(fd, 'baseNodeId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return;
  const base = await prisma.configPriceNode.findUnique({
    where: { id: baseNodeId },
    select: { variantId: true, addonId: true },
  });
  // Any node in the same build is a valid anchor, except one of this add-on's
  // own nodes (which would attach it to itself).
  if (!base || base.variantId !== addon.variantId || base.addonId === addonId) return;
  await prisma.configAddonAttachment.upsert({
    where: { addonId_baseNodeId: { addonId, baseNodeId } },
    update: {},
    create: { id: uuidv7(), addonId, baseNodeId },
  });
  rev(productId);
}

// Attach / detach the WHOLE base price (every configuration of the variant) —
// the "connect to the Base price box" anchor.
export async function attachAddonToBase(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return;
  await prisma.configAddon.update({ where: { id: addonId }, data: { attachBase: true } });
  rev(productId);
}

export async function detachAddonFromBase(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return;
  await prisma.configAddon.update({ where: { id: addonId }, data: { attachBase: false } });
  rev(productId);
}

// Attach / detach an add-on to the WHOLE of another add-on — the header-to-header
// link. "addon applies to targetAddon"; both must be in the same build, and an
// add-on never links to itself.
export async function attachAddonToAddon(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const targetAddonId = str(fd, 'targetAddonId');
  if (!addonId || !targetAddonId || addonId === targetAddonId) return;
  const addon = await addonOfTemplate(addonId, templateId);
  const target = await addonOfTemplate(targetAddonId, templateId);
  if (!addon || !target || addon.variantId !== target.variantId) return;
  await prisma.configAddonLink.upsert({
    where: { addonId_targetAddonId: { addonId, targetAddonId } },
    update: {},
    create: { id: uuidv7(), addonId, targetAddonId },
  });
  rev(productId);
}

export async function detachAddonFromAddon(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const targetAddonId = str(fd, 'targetAddonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return;
  await prisma.configAddonLink
    .delete({ where: { addonId_targetAddonId: { addonId, targetAddonId } } })
    .catch(() => {});
  rev(productId);
}

// The add-on's own price. Blank = no own price (a flat add-on with only options
// takes its price from the chosen option instead).
export async function setAddonPrice(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return { error: 'Unknown add-on.' };
  const raw = str(fd, 'amount');
  let amount: number | null = null;
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: 'Enter a price, or leave it blank.' };
    amount = n;
  }
  await prisma.configAddon.update({
    where: { id: addonId },
    data: { amount, priceUnit: unitOrNull(fd, 'unit') },
  });
  rev(productId);
  return { ok: true };
}

// Add a custom price unit to the growable list — the "＋ add a unit" beside the
// price dropdown. The common units ship as code constants; this adds the rest.
export async function addPriceUnit(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const label = str(fd, 'label');
  if (!label) return { error: 'Name the unit (e.g. per box).' };
  const code = toCode(label);
  const isDefault = DEFAULT_PRICE_UNITS.some((u) => u.code === code);
  const existing = await prisma.configPriceUnit.findUnique({ where: { code }, select: { id: true } });
  if (isDefault || existing) return { error: 'That unit already exists.' };
  const sortOrder = await prisma.configPriceUnit.count();
  await prisma.configPriceUnit.create({ data: { id: uuidv7(), code, label, sortOrder } });
  rev(productId);
  return { ok: true };
}

// The add-on's optional details.
export async function setAddonInfo(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return { error: 'Unknown add-on.' };
  await prisma.configAddon.update({
    where: { id: addonId },
    data: {
      description: nullableStr(fd, 'description'),
      configuration: nullableStr(fd, 'configuration'),
    },
  });
  rev(productId);
  return { ok: true };
}

// The colour node's colour: a free name + a hex. Blanking the hex turns it back
// into an ordinary add-on.
export async function setColorNodeColor(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return { error: 'Unknown colour node.' };
  const rawHex = str(fd, 'colorHex');
  let colorHex: string | null = null;
  if (rawHex !== '') {
    colorHex = normHex(rawHex);
    if (!colorHex) return { error: 'Enter a colour like #8A6B4A.' };
  }
  await prisma.configAddon.update({
    where: { id: addonId },
    data: { colorHex, colorName: colorHex ? nullableStr(fd, 'colorName') : null },
  });
  rev(productId);
  return { ok: true };
}

export async function detachAddon(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  const addonId = str(fd, 'addonId');
  const baseNodeId = str(fd, 'baseNodeId');
  const addon = await addonOfTemplate(addonId, templateId);
  if (!addon) return;
  await prisma.configAddonAttachment
    .delete({ where: { addonId_baseNodeId: { addonId, baseNodeId } } })
    .catch(() => {});
  rev(productId);
}

// Add a new question (option group) to the shared vocabulary. A question is
// either a `choice` (a list of options you grow yourself) or a `boolean`
// true/false (its two options — True and False — are seeded here so you can
// branch on either straight away).
export async function createVocabGroup(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const name = str(fd, 'name');
  if (!name) return { error: 'Name the question (e.g. Thickness).' };
  const kind = str(fd, 'kind') === 'boolean' ? 'boolean' : 'choice';
  const code = await uniqueCode(toCode(name), async (c) =>
    Boolean(await prisma.optionGroup.findUnique({ where: { code: c }, select: { id: true } })),
  );
  const groupId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.optionGroup.create({
      data: {
        id: groupId,
        code,
        inputKind: kind === 'boolean' ? 'boolean' : 'select',
        unit: null,
        sortOrder: 0,
        isActive: true,
      },
    });
    await tx.optionGroupTranslation.create({
      data: { id: uuidv7(), groupId, localeCode: 'en', name },
    });
    if (kind === 'boolean') {
      // Seed the two answers so a true/false question is usable immediately.
      const pairs: [string, string][] = [
        ['true', 'True'],
        ['false', 'False'],
      ];
      for (let i = 0; i < pairs.length; i++) {
        const [vcode, label] = pairs[i];
        const valueId = uuidv7();
        await tx.optionValue.create({
          data: { id: valueId, groupId, code: vcode, sortOrder: i, isActive: true },
        });
        await tx.optionValueTranslation.create({
          data: { id: uuidv7(), valueId, localeCode: 'en', name: label },
        });
      }
    }
  });
  rev(productId);
  return { ok: true };
}

// Add a new option to a question's shared list.
export async function addVocabValue(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requirePermission('pricing.write');
  const groupId = str(fd, 'groupId');
  const name = str(fd, 'name');
  if (!groupId) return { error: 'Pick a question first.' };
  if (!name) return { error: 'Name the option.' };
  const group = await prisma.optionGroup.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) return { error: 'Unknown question.' };
  const code = await uniqueCode(toCode(name), async (c) =>
    Boolean(
      await prisma.optionValue.findUnique({
        where: { groupId_code: { groupId, code: c } },
        select: { id: true },
      }),
    ),
  );
  const sortOrder = await prisma.optionValue.count({ where: { groupId } });
  const valueId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.optionValue.create({
      data: { id: valueId, groupId, code, sortOrder, isActive: true },
    });
    await tx.optionValueTranslation.create({
      data: { id: uuidv7(), valueId, localeCode: 'en', name },
    });
  });
  rev(productId);
  return { ok: true };
}

export async function savePriceGrid(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };
  const variantId = str(fd, 'variantId');
  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    select: { templateId: true },
  });
  if (!variant || variant.templateId !== templateId) return { error: 'Unknown build.' };

  const grid = await prisma.configPriceGrid.findUnique({
    where: { variantId },
    include: {
      axes: { orderBy: { position: 'asc' }, include: { templateOption: { include: { group: true } } } },
    },
  });
  if (!grid) return { error: 'This build has no price grid yet.' };

  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, 'cellsJson'));
  } catch {
    return { error: 'The grid could not be read. Reopen it and try again.' };
  }
  const parsed = z.record(z.string(), z.string()).safeParse(raw ?? {});
  if (!parsed.success) return { error: 'The grid could not be read. Reopen it and try again.' };

  const axisCodes = grid.axes.map((a) => a.templateOption.group.code);
  for (const [key, value] of Object.entries(parsed.data)) {
    const parts = key.split('|');
    if (parts.length !== axisCodes.length) continue;
    const trimmed = value.trim();
    let amount: number | null = null;
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `"${trimmed}" is not a price. Leave a cell blank to mark it not sold.` };
      }
      amount = n;
    }
    const coords = Object.fromEntries(axisCodes.map((code, i) => [code, parts[i]]));
    await prisma.configPriceCell.upsert({
      where: { gridId_key: { gridId: grid.id, key } },
      update: { amount, coords },
      create: { id: uuidv7(), gridId: grid.id, key, coords, amount },
    });
  }

  await writeAudit({
    userId: user.id,
    entityType: 'config_price_grid',
    entityId: grid.id,
    action: 'update',
    diff: { cells: { from: null, to: Object.keys(parsed.data).length } },
  });
  rev(productId);
  return { ok: true };
}
