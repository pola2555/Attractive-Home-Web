'use server';

import { revalidatePath } from 'next/cache';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { referencedGroups } from '@/lib/configurator/condition';
import {
  evaluateFormula,
  referencedVariables,
  ALLOWED_FUNCTIONS,
} from '@/lib/configurator/formula';
import { getTemplate } from '@/lib/configuratorAdmin';
import {
  APPLY_PER,
  INPUT_KINDS,
  PRICING_BASES,
  PRICING_STAGES,
  RESERVED_PREFIX,
  type Condition,
} from '@/lib/configurator/types';

export type FormState = { error?: string; ok?: boolean };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function nullableNum(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // undefined = malformed, distinct from an absent value
  }
}

// ---------------------------------------------------------------------------
// Option groups and values
// ---------------------------------------------------------------------------

const codeSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, 'Codes are lowercase letters, digits and underscores.')
  // `__qty` is the reserved line-quantity variable. Allowing a group to claim a
  // `__` name would let it shadow the pseudo-variable and silently change what
  // every tier-pricing rule means.
  .refine((v) => !v.startsWith(RESERVED_PREFIX), 'Codes cannot start with "__" (reserved).');

export async function saveOptionGroup(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');

  const parsed = codeSchema.safeParse(str(fd, 'code'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const inputKind = str(fd, 'inputKind');
  if (!(INPUT_KINDS as readonly string[]).includes(inputKind)) {
    return { error: 'Unknown input kind.' };
  }

  const name = str(fd, 'name');
  if (!name) return { error: 'Name is required.' };

  const data = {
    code: parsed.data,
    inputKind,
    unit: nullableStr(fd, 'unit'),
    sortOrder: Number(str(fd, 'sortOrder') || '0'),
    isActive: fd.get('isActive') === 'on',
  };

  const groupId = id ?? uuidv7();
  await prisma.$transaction(async (tx) => {
    if (id) await tx.optionGroup.update({ where: { id }, data });
    else await tx.optionGroup.create({ data: { id: groupId, ...data } });

    await tx.optionGroupTranslation.upsert({
      where: { groupId_localeCode: { groupId, localeCode: 'en' } },
      update: { name, helpText: nullableStr(fd, 'helpText') },
      create: {
        id: uuidv7(),
        groupId,
        localeCode: 'en',
        name,
        helpText: nullableStr(fd, 'helpText'),
      },
    });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'option_group',
    entityId: groupId,
    action: id ? 'update' : 'create',
    diff: { code: { from: null, to: parsed.data } },
  });

  revalidatePath('/dashboard/pricing/options');
  return { ok: true };
}

export async function deleteOptionGroup(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const group = await prisma.optionGroup.findUnique({ where: { id } });
  if (!group) return;
  await prisma.optionGroup.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'option_group',
    entityId: id,
    action: 'delete',
    diff: { code: { from: group.code, to: null } },
  });
  revalidatePath('/dashboard/pricing/options');
}

export async function saveOptionValue(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const groupId = str(fd, 'groupId');
  const id = nullableStr(fd, 'id');

  const parsed = codeSchema.safeParse(str(fd, 'code'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const name = str(fd, 'name');
  if (!name) return { error: 'Name is required.' };

  // Attributes reach formulas as `<group>_<key>`, e.g. door_material_density.
  const attributesRaw = parseJson(str(fd, 'attributes'));
  if (attributesRaw === undefined) return { error: 'Attributes must be valid JSON.' };
  if (
    attributesRaw !== null &&
    (typeof attributesRaw !== 'object' || Array.isArray(attributesRaw))
  ) {
    return { error: 'Attributes must be a JSON object, e.g. {"density": 700}.' };
  }

  const valueId = id ?? uuidv7();
  const data = {
    groupId,
    code: parsed.data,
    numericValue: nullableNum(str(fd, 'numericValue')),
    attributes: (attributesRaw ?? undefined) as object | undefined,
    colorId: nullableStr(fd, 'colorId'),
    productId: nullableStr(fd, 'productId'),
    sortOrder: Number(str(fd, 'sortOrder') || '0'),
    isActive: fd.get('isActive') === 'on',
  };

  await prisma.$transaction(async (tx) => {
    if (id) await tx.optionValue.update({ where: { id }, data });
    else await tx.optionValue.create({ data: { id: valueId, ...data } });

    await tx.optionValueTranslation.upsert({
      where: { valueId_localeCode: { valueId, localeCode: 'en' } },
      update: { name },
      create: { id: uuidv7(), valueId, localeCode: 'en', name },
    });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'option_value',
    entityId: valueId,
    action: id ? 'update' : 'create',
    diff: { code: { from: null, to: parsed.data } },
  });

  revalidatePath(`/dashboard/pricing/options/${groupId}`);
  return { ok: true };
}

export async function deleteOptionValue(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const value = await prisma.optionValue.findUnique({ where: { id } });
  if (!value) return;
  await prisma.optionValue.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'option_value',
    entityId: id,
    action: 'delete',
    diff: { code: { from: value.code, to: null } },
  });
  revalidatePath(`/dashboard/pricing/options/${value.groupId}`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function saveTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');
  const parsed = codeSchema.safeParse(str(fd, 'code'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = {
    code: parsed.data,
    name: str(fd, 'name') || parsed.data,
    // One currency per template: mixed-currency rules would force the pricing
    // engine to consult an FX table mid-calculation, and it is deliberately a
    // pure function that never does.
    currency: (str(fd, 'currency') || 'USD').toUpperCase().slice(0, 3),
    // Items configured from this template carry no product, so this is their
    // only route to a real duty rate.
    hsCodeId: nullableStr(fd, 'hsCodeId'),
    isActive: fd.get('isActive') === 'on',
  };

  const templateId = id ?? uuidv7();
  if (id) await prisma.configTemplate.update({ where: { id }, data });
  else await prisma.configTemplate.create({ data: { id: templateId, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'config_template',
    entityId: templateId,
    action: id ? 'update' : 'create',
    diff: { code: { from: null, to: parsed.data } },
  });

  revalidatePath('/dashboard/pricing/templates');
  return { ok: true };
}

// Bind an option group to a template, with its availability condition and
// conditional numeric ranges.
export async function saveTemplateOption(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const groupId = str(fd, 'groupId');
  const sortOrder = Number(str(fd, 'sortOrder') || '0');

  const condition = parseJson(str(fd, 'condition'));
  if (condition === undefined) return { error: 'Condition must be valid JSON.' };
  const ranges = parseJson(str(fd, 'ranges'));
  if (ranges === undefined) return { error: 'Ranges must be valid JSON.' };
  if (ranges !== null && !Array.isArray(ranges)) return { error: 'Ranges must be a JSON array.' };

  // THE DAG RULE. A condition may only reference groups that come EARLIER in
  // the template. Without this, material can gate colour while colour gates
  // material, and the configurator oscillates with no way to fix it at runtime.
  const existing = await prisma.configTemplateOption.findMany({
    where: { templateId },
    include: { group: { select: { code: true } } },
  });
  const earlier = new Set(existing.filter((o) => o.sortOrder < sortOrder).map((o) => o.group.code));

  const referenced = new Set<string>();
  referencedGroups(condition as Condition | null, referenced);
  for (const range of Array.isArray(ranges) ? ranges : []) {
    if (range && typeof range === 'object' && 'condition' in range) {
      referencedGroups((range as { condition: Condition | null }).condition, referenced);
    }
  }

  for (const code of referenced) {
    if (!earlier.has(code)) {
      return {
        error: `This option's conditions reference "${code}", which is not earlier in the template. A condition may only depend on options above it — that is what keeps the dependency graph acyclic.`,
      };
    }
  }

  const data = {
    sortOrder,
    isRequired: fd.get('isRequired') === 'on',
    condition: (condition ?? undefined) as object | undefined,
    ranges: (ranges ?? undefined) as object | undefined,
  };

  // Not an upsert: a question can now be bound once per variant, so the old
  // UNIQUE(template_id, group_id) has become two PARTIAL indexes that Prisma
  // cannot address as a compound key. This screen only ever edits the
  // variant-less binding, so it is the one matched here.
  const existingOption = await prisma.configTemplateOption.findFirst({
    where: { templateId, groupId, variantId: null },
    select: { id: true },
  });

  if (existingOption) {
    await prisma.configTemplateOption.update({ where: { id: existingOption.id }, data });
  } else {
    // A freshly bound choice question starts by offering EVERY value its group
    // defines, so it is answerable in the configurator the moment it is bound.
    // Without this the option has no config_template_option_values rows at all
    // and renders as an empty dropdown nobody can pick from — the values live in
    // a join table with no fallback (see toTemplateDef in configuratorAdmin.ts).
    // Mirrors saveVariantOption, where an empty submission already means "all".
    // The editor can curate the set afterwards; number/boolean groups seed none.
    const group = await prisma.optionGroup.findUnique({
      where: { id: groupId },
      include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    const seedValues =
      group && (group.inputKind === 'select' || group.inputKind === 'multi_select')
        ? group.values
        : [];
    await prisma.$transaction(async (tx) => {
      const created = await tx.configTemplateOption.create({
        data: { id: uuidv7(), templateId, groupId, ...data },
      });
      if (seedValues.length) {
        await tx.configTemplateOptionValue.createMany({
          data: seedValues.map((value, index) => ({
            templateOptionId: created.id,
            valueId: value.id,
            sortOrder: index,
          })),
        });
      }
    });
  }

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: `${templateId}:${groupId}`,
    action: 'update',
    diff: { sortOrder: { from: null, to: sortOrder } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function removeTemplateOption(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const option = await prisma.configTemplateOption.findUnique({ where: { id } });
  if (!option) return;
  await prisma.configTemplateOption.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: id,
    action: 'delete',
  });
  revalidatePath(`/dashboard/pricing/templates/${option.templateId}`);
}

export async function saveDerivedQuantity(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  const formula = str(fd, 'formula');
  const sortOrder = Number(str(fd, 'sortOrder') || '0');

  if (!code || !formula) return { error: 'Code and formula are required.' };

  const template = await getTemplate(templateId);
  if (!template) return { error: 'Template not found.' };

  // Same DAG rule as conditions: a formula may only reference option groups and
  // EARLIER derived quantities.
  const allowed = new Set<string>();
  for (const option of template.options) {
    allowed.add(option.groupCode);
    for (const value of option.values) {
      for (const key of Object.keys(value.attributes ?? {})) {
        allowed.add(`${option.groupCode}_${key}`);
      }
    }
  }
  for (const quantity of template.derivedQuantities) {
    if (quantity.sortOrder < sortOrder) allowed.add(quantity.code);
  }

  for (const name of referencedVariables(formula)) {
    if (!allowed.has(name)) {
      return {
        error: `"${name}" is not available here. Use an option group code, an attribute as <group>_<key>, or a derived quantity with a lower order. Functions available: ${ALLOWED_FUNCTIONS.join(', ')}.`,
      };
    }
  }

  // Dry run with 1s so a syntax error is caught at save time, not at quote
  // time. A formula that fails later yields null, never zero — but catching it
  // here is better than flagging an item for review.
  const probe = Object.fromEntries([...allowed].map((name) => [name, 1]));
  const result = evaluateFormula(formula, probe);
  if (!result.ok) return { error: `Formula error: ${result.error}` };

  await prisma.configDerivedQuantity.upsert({
    where: { templateId_code: { templateId, code } },
    update: { formula, unit: nullableStr(fd, 'unit'), sortOrder },
    create: {
      id: uuidv7(),
      templateId,
      code,
      formula,
      unit: nullableStr(fd, 'unit'),
      sortOrder,
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_derived_quantity',
    entityId: `${templateId}:${code}`,
    action: 'update',
    diff: { formula: { from: null, to: formula } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function deleteDerivedQuantity(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  await prisma.configDerivedQuantity.deleteMany({ where: { templateId, code } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_derived_quantity',
    entityId: `${templateId}:${code}`,
    action: 'delete',
  });
  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
}

export async function savePricingRule(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');
  const templateId = nullableStr(fd, 'templateId');
  const productId = nullableStr(fd, 'productId');

  // Mirrors the CHECK constraint in the migration; caught here so the user gets
  // a sentence instead of a Postgres error.
  if ((templateId ? 1 : 0) + (productId ? 1 : 0) !== 1) {
    return { error: 'A rule belongs to exactly one of a template or a product.' };
  }

  const code = str(fd, 'code');
  if (!code) return { error: 'Rule code is required.' };

  const stage = str(fd, 'stage');
  if (!(PRICING_STAGES as readonly string[]).includes(stage)) return { error: 'Unknown stage.' };

  const basis = str(fd, 'basis');
  if (!(PRICING_BASES as readonly string[]).includes(basis)) return { error: 'Unknown basis.' };

  const applyPer = str(fd, 'applyPer') || 'unit';
  if (!(APPLY_PER as readonly string[]).includes(applyPer)) return { error: 'Unknown scope.' };

  const condition = parseJson(str(fd, 'condition'));
  if (condition === undefined) return { error: 'Condition must be valid JSON.' };

  const amount = nullableNum(str(fd, 'amount'));
  const rate = nullableNum(str(fd, 'rate'));
  const quantityCode = nullableStr(fd, 'quantityCode');

  if (basis === 'flat' && amount === null) return { error: 'A flat rule needs an amount.' };
  if (basis !== 'flat' && rate === null) return { error: 'This rule needs a rate.' };
  if (basis === 'per_quantity' && !quantityCode) {
    return { error: 'A per-quantity rule must name the quantity it multiplies.' };
  }
  if (basis === 'percent' && applyPer !== 'unit') {
    return {
      error: 'A percentage rule only applies per unit — it has no other well-defined base.',
    };
  }

  const data = {
    templateId,
    productId,
    code,
    condition: (condition ?? undefined) as object | undefined,
    stage,
    priority: Number(str(fd, 'priority') || '100'),
    basis,
    quantityCode,
    applyPer,
    amount,
    rate,
    // A currency on a percentage is meaningless.
    currency: basis === 'percent' ? null : (str(fd, 'currency') || 'USD').toUpperCase().slice(0, 3),
    note: nullableStr(fd, 'note'),
    isActive: fd.get('isActive') === 'on',
  };

  const ruleId = id ?? uuidv7();
  if (id) await prisma.pricingRule.update({ where: { id }, data });
  else await prisma.pricingRule.create({ data: { id: ruleId, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'pricing_rule',
    entityId: ruleId,
    action: id ? 'update' : 'create',
    diff: { code: { from: null, to: code } },
  });

  if (templateId) revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function deletePricingRule(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const rule = await prisma.pricingRule.findUnique({ where: { id } });
  if (!rule) return;
  await prisma.pricingRule.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'pricing_rule',
    entityId: id,
    action: 'delete',
    diff: { code: { from: rule.code, to: null } },
  });
  if (rule.templateId) revalidatePath(`/dashboard/pricing/templates/${rule.templateId}`);
}

export async function saveConstraint(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  const message = str(fd, 'message');
  if (!code || !message) return { error: 'Code and message are required.' };

  const condition = parseJson(str(fd, 'condition'));
  if (condition === undefined || condition === null) {
    return { error: 'Condition must be valid JSON.' };
  }

  const kind = str(fd, 'kind') || 'forbid';
  if (kind !== 'forbid' && kind !== 'require') return { error: 'Kind must be forbid or require.' };

  await prisma.configTemplateConstraint.upsert({
    where: { templateId_code: { templateId, code } },
    update: { kind, condition: condition as object, message, isActive: true },
    create: {
      id: uuidv7(),
      templateId,
      code,
      kind,
      condition: condition as object,
      message,
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_constraint',
    entityId: `${templateId}:${code}`,
    action: 'update',
    diff: { kind: { from: null, to: kind } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function deleteConstraint(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  await prisma.configTemplateConstraint.deleteMany({ where: { templateId, code } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_constraint',
    entityId: `${templateId}:${code}`,
    action: 'delete',
  });
  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
}

// Which values a template offers for a bound group, and under what condition.
export async function saveTemplateOptionValues(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateOptionId = str(fd, 'templateOptionId');
  const rows = parseJson(str(fd, 'valuesJson'));
  if (rows === undefined || !Array.isArray(rows)) return { error: 'Values must be a JSON array.' };

  const option = await prisma.configTemplateOption.findUnique({
    where: { id: templateOptionId },
    include: { template: { include: { options: { include: { group: true } } } } },
  });
  if (!option) return { error: 'Template option not found.' };

  const earlier = new Set(
    option.template.options.filter((o) => o.sortOrder < option.sortOrder).map((o) => o.group.code),
  );

  const schema = z.array(
    z.object({
      valueId: z.string().uuid(),
      sortOrder: z.number().int().default(0),
      condition: z.unknown().nullable().default(null),
    }),
  );
  const parsed = schema.safeParse(rows);
  if (!parsed.success) return { error: 'Values are malformed.' };

  // DAG rule again — a value's availability may only depend on earlier options.
  for (const row of parsed.data) {
    for (const code of referencedGroups(row.condition as Condition | null)) {
      if (!earlier.has(code)) {
        return {
          error: `A value condition references "${code}", which is not earlier in the template.`,
        };
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.configTemplateOptionValue.deleteMany({ where: { templateOptionId } });
    for (const row of parsed.data) {
      await tx.configTemplateOptionValue.create({
        data: {
          templateOptionId,
          valueId: row.valueId,
          sortOrder: row.sortOrder,
          condition: (row.condition ?? undefined) as object | undefined,
        },
      });
    }
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option_values',
    entityId: templateOptionId,
    action: 'update',
    diff: { count: { from: null, to: parsed.data.length } },
  });

  revalidatePath(`/dashboard/pricing/templates/${option.templateId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rate cards
// ---------------------------------------------------------------------------

export async function saveHsCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');
  const code = str(fd, 'code');
  if (!code) return { error: 'HS code is required.' };

  const dutyPercent = nullableNum(str(fd, 'dutyPercent')) ?? 5;
  const vatPercent = nullableNum(str(fd, 'vatPercent')) ?? 5;
  if (dutyPercent < 0 || dutyPercent > 100 || vatPercent < 0 || vatPercent > 100) {
    return { error: 'Percentages must be between 0 and 100.' };
  }

  const data = {
    code,
    description: str(fd, 'description') || code,
    dutyPercent,
    vatPercent,
    notes: nullableStr(fd, 'notes'),
    isActive: fd.get('isActive') === 'on',
  };

  const hsId = id ?? uuidv7();
  if (id) await prisma.hsCode.update({ where: { id }, data });
  else await prisma.hsCode.create({ data: { id: hsId, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'hs_code',
    entityId: hsId,
    action: id ? 'update' : 'create',
    diff: { code: { from: null, to: code } },
  });

  revalidatePath('/dashboard/pricing/rates');
  return { ok: true };
}

export async function saveFreightRate(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');

  const rate = nullableNum(str(fd, 'rate'));
  if (rate === null) return { error: 'Rate is required.' };

  const data = {
    mode: str(fd, 'mode') || 'sea_lcl',
    originPort: (str(fd, 'originPort') || 'CNSHA').toUpperCase(),
    destinationPort: (str(fd, 'destinationPort') || 'AEJEA').toUpperCase(),
    containerType: nullableStr(fd, 'containerType'),
    unit: str(fd, 'unit') || 'wm',
    rate,
    rateLow: nullableNum(str(fd, 'rateLow')),
    rateHigh: nullableNum(str(fd, 'rateHigh')),
    minCharge: nullableNum(str(fd, 'minCharge')),
    currency: (str(fd, 'currency') || 'USD').toUpperCase().slice(0, 3),
    transitDays: nullableNum(str(fd, 'transitDays')),
    // A carrier contract parameter, not a constant: IATA general cargo is 6000,
    // express carriers use 5000.
    volumetricDivisor: nullableNum(str(fd, 'volumetricDivisor')),
    packagingFactor: nullableNum(str(fd, 'packagingFactor')) ?? 1.1,
    isActive: fd.get('isActive') === 'on',
  };

  const rateId = id ?? uuidv7();
  if (id) await prisma.freightRate.update({ where: { id }, data });
  else await prisma.freightRate.create({ data: { id: rateId, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'freight_rate',
    entityId: rateId,
    action: id ? 'update' : 'create',
    diff: { mode: { from: null, to: data.mode } },
  });

  revalidatePath('/dashboard/pricing/rates');
  return { ok: true };
}

export async function deleteFreightRate(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  await prisma.freightRate.deleteMany({ where: { id } });
  await writeAudit({ userId: user.id, entityType: 'freight_rate', entityId: id, action: 'delete' });
  revalidatePath('/dashboard/pricing/rates');
}

export async function savePortStorageRate(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const id = nullableStr(fd, 'id');
  const perDayRate = nullableNum(str(fd, 'perDayRate'));
  if (perDayRate === null) return { error: 'Per-day rate is required.' };

  const data = {
    port: (str(fd, 'port') || 'AEJEA').toUpperCase(),
    containerType: nullableStr(fd, 'containerType'),
    freeDays: Number(str(fd, 'freeDays') || '5'),
    perDayRate,
    currency: (str(fd, 'currency') || 'AED').toUpperCase().slice(0, 3),
    isActive: fd.get('isActive') === 'on',
  };

  const rateId = id ?? uuidv7();
  if (id) await prisma.portStorageRate.update({ where: { id }, data });
  else await prisma.portStorageRate.create({ data: { id: rateId, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'port_storage_rate',
    entityId: rateId,
    action: id ? 'update' : 'create',
    diff: { port: { from: null, to: data.port } },
  });

  revalidatePath('/dashboard/pricing/rates');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Variants, price grids, upgrades and bands — the editor's half of the module
//
// Every one of these is written so the EDITOR never types JSON. A condition
// arrives as a group code plus a list of value codes and is assembled here; a
// band arrives as three numbers. That is the whole point of these actions
// existing rather than reusing the generic rule form.
// ---------------------------------------------------------------------------

export async function saveVariant(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  const name = str(fd, 'name');

  if (!/^[a-z0-9_]+$/.test(code)) {
    return { error: 'Use lowercase letters, numbers and underscores for the code.' };
  }
  if (!name) return { error: 'Give the variant a name.' };

  const existing = await prisma.configVariant.findFirst({
    where: { templateId, code },
    select: { id: true },
  });

  const data = {
    name,
    includedSpec: nullableStr(fd, 'includedSpec'),
    sortOrder: Number(str(fd, 'sortOrder') || '0') || 0,
  };

  const variant = existing
    ? await prisma.configVariant.update({ where: { id: existing.id }, data })
    : await prisma.configVariant.create({
        data: { id: uuidv7(), templateId, code, ...data },
      });

  // Every variant gets a grid immediately, even an empty one: the editor's
  // next screen is "fill the grid", and making them create it by hand is a
  // step that exists only because the schema said so.
  await prisma.configPriceGrid.upsert({
    where: { variantId: variant.id },
    update: {},
    create: { id: uuidv7(), variantId: variant.id, currency: str(fd, 'currency') || 'USD' },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'config_variant',
    entityId: variant.id,
    action: existing ? 'update' : 'create',
    diff: { name: { from: null, to: name } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function removeVariant(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const variant = await prisma.configVariant.findUnique({ where: { id } });
  if (!variant) return;

  // Cascades to the grid, its cells, this branch's questions, its upgrades and
  // its bands — which is why the UI asks first.
  await prisma.configVariant.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_variant',
    entityId: id,
    action: 'delete',
    diff: { code: { from: variant.code, to: null } },
  });
  revalidatePath(`/dashboard/pricing/templates/${variant.templateId}`);
}

/** Bind a question to one branch, and say which of its values that branch sells. */
export async function saveVariantOption(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const variantId = str(fd, 'variantId');
  const groupId = str(fd, 'groupId');
  const sortOrder = Number(str(fd, 'sortOrder') || '0') || 0;

  const group = await prisma.optionGroup.findUnique({
    where: { id: groupId },
    include: { values: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!group) return { error: 'That option group no longer exists.' };

  const existing = await prisma.configTemplateOption.findFirst({
    where: { templateId, groupId, variantId },
    select: { id: true },
  });

  const option = existing
    ? await prisma.configTemplateOption.update({
        where: { id: existing.id },
        data: { sortOrder, configText: nullableStr(fd, 'configText') },
      })
    : await prisma.configTemplateOption.create({
        data: {
          id: uuidv7(),
          templateId,
          variantId,
          groupId,
          sortOrder,
          isRequired: true,
          configText: nullableStr(fd, 'configText'),
        },
      });

  // Which values this branch offers. An empty submission means "all of them",
  // because a question with no answers is never what anyone meant.
  const offered = fd.getAll('valueCodes').filter((v): v is string => typeof v === 'string');
  const codes = offered.length ? offered : group.values.map((v) => v.code);

  await prisma.configTemplateOptionValue.deleteMany({ where: { templateOptionId: option.id } });
  for (const [index, code] of codes.entries()) {
    const value = group.values.find((v) => v.code === code);
    if (!value) continue;
    await prisma.configTemplateOptionValue.create({
      data: { templateOptionId: option.id, valueId: value.id, sortOrder: index },
    });
  }

  await writeAudit({
    userId: user.id,
    entityType: 'config_template_option',
    entityId: option.id,
    action: existing ? 'update' : 'create',
    diff: { values: { from: null, to: codes.length } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

/** Which questions form the grid's axes, in order. */
export async function saveGridAxes(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const variantId = str(fd, 'variantId');
  const templateId = str(fd, 'templateId');

  const grid = await prisma.configPriceGrid.findUnique({ where: { variantId } });
  if (!grid) return { error: 'That variant has no price grid yet.' };

  const optionIds = fd.getAll('optionIds').filter((v): v is string => typeof v === 'string');
  if (optionIds.length === 0) return { error: 'Choose at least one question for the grid.' };

  const options = await prisma.configTemplateOption.findMany({
    where: { id: { in: optionIds } },
    include: { group: true },
  });

  // A number cannot be a grid axis: it has no finite set of values to make
  // columns from. Size is priced by bands instead, which is what the supplier
  // does anyway.
  const numeric = options.filter((o) => o.group.inputKind !== 'select');
  if (numeric.length) {
    return {
      error: `Only single-choice questions can be grid axes. "${numeric[0].group.code}" is a ${numeric[0].group.inputKind} — price it with a size band instead.`,
    };
  }

  // Changing the axes re-keys every cell, so the old ones cannot be kept: a
  // key built from two axes means nothing once there are three.
  await prisma.configPriceCell.deleteMany({ where: { gridId: grid.id } });
  await prisma.configPriceGridAxis.deleteMany({ where: { gridId: grid.id } });

  for (const [position, id] of optionIds.entries()) {
    await prisma.configPriceGridAxis.create({
      data: { id: uuidv7(), gridId: grid.id, templateOptionId: id, position },
    });
  }

  await writeAudit({
    userId: user.id,
    entityType: 'config_price_grid',
    entityId: grid.id,
    action: 'update',
    diff: { axes: { from: null, to: optionIds.length } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}/grid/${variantId}`);
  return { ok: true };
}

/**
 * Save the whole grid in one post.
 *
 * Cell by cell would be a request per keystroke on a grid with 18 of them, and
 * would leave the grid half-saved if the tab closed. The form carries every
 * cell, and a blank box means NOT SOLD — the dash in the supplier's sheet —
 * which is a fact worth storing rather than an absence.
 */
export async function saveGridCells(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const variantId = str(fd, 'variantId');
  const templateId = str(fd, 'templateId');

  const grid = await prisma.configPriceGrid.findUnique({
    where: { variantId },
    include: {
      axes: {
        orderBy: { position: 'asc' },
        include: { templateOption: { include: { group: true } } },
      },
    },
  });
  if (!grid) return { error: 'That variant has no price grid yet.' };

  const raw = parseJson(str(fd, 'cellsJson'));
  if (raw === undefined) return { error: 'The grid could not be read. Reload and try again.' };

  const parsed = z.record(z.string(), z.string()).safeParse(raw ?? {});
  if (!parsed.success) return { error: 'The grid could not be read. Reload and try again.' };

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

  revalidatePath(`/dashboard/pricing/templates/${templateId}/grid/${variantId}`);
  return { ok: true };
}

const UPGRADE_UNIT_VALUES = ['flat', 'per_unit', 'per_set', 'per_sqm', 'per_piece'] as const;

export async function saveUpgrade(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  const label = str(fd, 'label');

  if (!/^[a-z0-9_]+$/.test(code)) {
    return { error: 'Use lowercase letters, numbers and underscores for the code.' };
  }
  if (!label) return { error: 'Give the upgrade a name.' };

  const amount = Number(str(fd, 'amount'));
  if (!Number.isFinite(amount)) return { error: 'Enter an amount.' };

  const unit = str(fd, 'unit');
  if (!UPGRADE_UNIT_VALUES.includes(unit as (typeof UPGRADE_UNIT_VALUES)[number])) {
    return { error: 'Choose how the amount is charged.' };
  }
  if (unit === 'per_sqm' && !str(fd, 'quantityCode')) {
    return { error: 'A per-m² upgrade needs the calculated quantity it multiplies.' };
  }

  // The condition, assembled from dropdowns rather than typed. This is the
  // whole reason "only available on 45 and 55 mm" does not require JSON.
  const whenGroup = nullableStr(fd, 'whenGroup');
  const whenValues = fd.getAll('whenValues').filter((v): v is string => typeof v === 'string');
  let condition: Condition | null = null;
  if (whenGroup && whenValues.length) condition = { group: whenGroup, in: whenValues };

  const existing = await prisma.configUpgrade.findFirst({
    where: { templateId, code },
    select: { id: true },
  });

  const data = {
    variantId: nullableStr(fd, 'variantId'),
    section: nullableStr(fd, 'section'),
    label,
    detail: nullableStr(fd, 'detail'),
    kind: str(fd, 'kind') === 'accessory' ? 'accessory' : 'upgrade',
    amount,
    unit,
    quantityCode: nullableStr(fd, 'quantityCode'),
    defaultQty: Number(str(fd, 'defaultQty') || '1') || 1,
    condition: (condition ?? undefined) as object | undefined,
    unavailableNote: nullableStr(fd, 'unavailableNote'),
    sortOrder: Number(str(fd, 'sortOrder') || '0') || 0,
  };

  const upgrade = existing
    ? await prisma.configUpgrade.update({ where: { id: existing.id }, data })
    : await prisma.configUpgrade.create({ data: { id: uuidv7(), templateId, code, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'config_upgrade',
    entityId: upgrade.id,
    action: existing ? 'update' : 'create',
    diff: { amount: { from: null, to: amount } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function removeUpgrade(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const upgrade = await prisma.configUpgrade.findUnique({ where: { id } });
  if (!upgrade) return;
  await prisma.configUpgrade.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_upgrade',
    entityId: id,
    action: 'delete',
    diff: { code: { from: upgrade.code, to: null } },
  });
  revalidatePath(`/dashboard/pricing/templates/${upgrade.templateId}`);
}

export async function saveBand(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = str(fd, 'templateId');
  const code = str(fd, 'code');
  const label = str(fd, 'label');
  const templateOptionId = str(fd, 'templateOptionId');

  if (!/^[a-z0-9_]+$/.test(code)) {
    return { error: 'Use lowercase letters, numbers and underscores for the code.' };
  }
  if (!label) return { error: 'Give the band a name.' };

  const min = nullableNum(str(fd, 'minValue'));
  const max = nullableNum(str(fd, 'maxValue'));
  if (min === null && max === null) {
    return { error: 'A band needs at least one end, otherwise it matches every size.' };
  }
  if (min !== null && max !== null && min >= max) {
    return { error: 'The lower bound has to be below the upper one.' };
  }

  const amount = Number(str(fd, 'amount'));
  if (!Number.isFinite(amount)) return { error: 'Enter an amount.' };

  const option = await prisma.configTemplateOption.findUnique({
    where: { id: templateOptionId },
    include: { group: true },
  });
  if (!option) return { error: 'Choose the measurement this band applies to.' };
  if (option.group.inputKind !== 'number') {
    return { error: `"${option.group.code}" is not a measurement, so it has no bands.` };
  }

  // Overlap is the defect the supplier's own list has: width 950-1050 and
  // 1050-1220 both claim 1050. Bands are half-open so only one can ever win,
  // but warning at save time is better than a silently ignored row.
  const siblings = await prisma.configBand.findMany({
    where: { templateId, templateOptionId, NOT: { code } },
  });
  for (const other of siblings) {
    const otherMin = other.minValue ? other.minValue.toNumber() : -Infinity;
    const otherMax = other.maxValue ? other.maxValue.toNumber() : Infinity;
    const thisMin = min ?? -Infinity;
    const thisMax = max ?? Infinity;
    if (thisMin < otherMax && otherMin < thisMax) {
      return {
        error: `This overlaps "${other.label}". Two bands on one measurement means only the first ever applies — narrow one of them.`,
      };
    }
  }

  const existing = await prisma.configBand.findFirst({
    where: { templateId, code },
    select: { id: true },
  });

  const data = {
    variantId: nullableStr(fd, 'variantId'),
    templateOptionId,
    label,
    minValue: min,
    maxValue: max,
    amount,
    sortOrder: Number(str(fd, 'sortOrder') || '0') || 0,
  };

  const band = existing
    ? await prisma.configBand.update({ where: { id: existing.id }, data })
    : await prisma.configBand.create({ data: { id: uuidv7(), templateId, code, ...data } });

  await writeAudit({
    userId: user.id,
    entityType: 'config_band',
    entityId: band.id,
    action: existing ? 'update' : 'create',
    diff: { amount: { from: null, to: amount } },
  });

  revalidatePath(`/dashboard/pricing/templates/${templateId}`);
  return { ok: true };
}

export async function removeBand(fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const id = str(fd, 'id');
  const band = await prisma.configBand.findUnique({ where: { id } });
  if (!band) return;
  await prisma.configBand.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    entityType: 'config_band',
    entityId: id,
    action: 'delete',
    diff: { code: { from: band.code, to: null } },
  });
  revalidatePath(`/dashboard/pricing/templates/${band.templateId}`);
}
