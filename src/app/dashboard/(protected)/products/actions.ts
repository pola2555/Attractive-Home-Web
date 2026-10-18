'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { slugify } from '@/lib/slug';
import { CONFLICT_MESSAGE, parseExpectedUpdatedAt, versionMatches } from '@/lib/optimisticLock';
import { LOCALES, type Locale } from '@/i18n/config';

export type ProductFormState = { error?: string };

// ---------------------------------------------------------------------------
// Form parsing / validation (shared by create + update)
// ---------------------------------------------------------------------------

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function nullableInt(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

const scalarSchema = z.object({
  code: z.string().max(120).nullable(),
  sourceId: z.string().uuid('Source is required'),
  brandId: z.string().uuid().nullable(),
  typeId: z.string().uuid().nullable(),
  materialId: z.string().uuid().nullable(),
  lookId: z.string().uuid().nullable(),
  colorId: z.string().uuid().nullable(),
  finishId: z.string().uuid().nullable(),
  collectionId: z.string().uuid().nullable(),
  sizeLabel: z.string().max(120).nullable(),
  price: z.number().min(0).max(9_999_999_999),
  currency: z.string().trim().length(3),
  priceUnit: z.string().max(50).nullable(),
  sellingType: z.string().max(120).nullable(),
  packing: z.string().max(120).nullable(),
  weightLabel: z.string().max(120).nullable(),
  featuredRank: z.number().int().min(0).max(1_000_000).nullable(),
  supplierUrl: z.string().url().max(2000).nullable().or(z.literal(null)),
  isPublished: z.boolean(),
  isAvailable: z.boolean(),
});

const imageSchema = z.object({
  s3Key: z.string().trim().min(1).max(500),
  thumbKey: z.string().trim().max(500).nullable(),
  supplierUrl: z.string().trim().max(2000).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

type TranslationRow = {
  localeCode: Locale;
  name: string;
  description: string | null;
  usageNotes: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

type ParsedProduct = {
  slug: string; // may be '' → auto-generate on create
  nameEn: string;
  scalars: z.infer<typeof scalarSchema>;
  applicationIds: string[];
  performanceIds: string[];
  translations: TranslationRow[];
  images: z.infer<typeof imageSchema>[];
};

function parseProductForm(
  fd: FormData,
): { ok: true; data: ParsedProduct } | { ok: false; error: string } {
  const scalarsParsed = scalarSchema.safeParse({
    code: nullableStr(fd, 'code'),
    sourceId: str(fd, 'sourceId'),
    brandId: nullableStr(fd, 'brandId'),
    typeId: nullableStr(fd, 'typeId'),
    materialId: nullableStr(fd, 'materialId'),
    lookId: nullableStr(fd, 'lookId'),
    colorId: nullableStr(fd, 'colorId'),
    finishId: nullableStr(fd, 'finishId'),
    collectionId: nullableStr(fd, 'collectionId'),
    sizeLabel: nullableStr(fd, 'sizeLabel'),
    price: Number(str(fd, 'price') || '0'),
    currency: (str(fd, 'currency') || 'AED').toUpperCase(),
    priceUnit: nullableStr(fd, 'priceUnit'),
    sellingType: nullableStr(fd, 'sellingType'),
    packing: nullableStr(fd, 'packing'),
    weightLabel: nullableStr(fd, 'weightLabel'),
    featuredRank: nullableInt(str(fd, 'featuredRank')),
    supplierUrl: nullableStr(fd, 'supplierUrl'),
    isPublished: fd.get('isPublished') === 'on',
    isAvailable: fd.get('isAvailable') === 'on',
  });
  if (!scalarsParsed.success) {
    return { ok: false, error: scalarsParsed.error.issues[0]?.message ?? 'Invalid product data' };
  }

  // Translations: a row exists only when its name is filled (i18n doctrine —
  // name is NOT NULL). English name is required for slug + public display.
  const translations: TranslationRow[] = [];
  for (const locale of LOCALES) {
    const name = str(fd, `name_${locale}`);
    if (!name) continue;
    translations.push({
      localeCode: locale,
      name,
      description: nullableStr(fd, `description_${locale}`),
      usageNotes: nullableStr(fd, `usageNotes_${locale}`),
      metaTitle: nullableStr(fd, `metaTitle_${locale}`),
      metaDescription: nullableStr(fd, `metaDescription_${locale}`),
    });
  }
  const nameEn = translations.find((t) => t.localeCode === 'en')?.name ?? '';
  if (!nameEn) return { ok: false, error: 'An English name is required.' };

  // Images arrive as a JSON blob from the client (dynamic rows).
  let rawImages: unknown = [];
  try {
    rawImages = JSON.parse(str(fd, 'imagesJson') || '[]');
  } catch {
    return { ok: false, error: 'Could not read the image list.' };
  }
  const images: z.infer<typeof imageSchema>[] = [];
  if (Array.isArray(rawImages)) {
    for (const raw of rawImages) {
      const r = raw as Record<string, unknown>;
      const parsed = imageSchema.safeParse({
        s3Key: typeof r.s3Key === 'string' ? r.s3Key : '',
        thumbKey: (typeof r.thumbKey === 'string' && r.thumbKey.trim()) || null,
        supplierUrl: (typeof r.supplierUrl === 'string' && r.supplierUrl.trim()) || null,
        width: nullableInt(typeof r.width === 'string' ? r.width : String(r.width ?? '')),
        height: nullableInt(typeof r.height === 'string' ? r.height : String(r.height ?? '')),
      });
      if (parsed.success) images.push(parsed.data);
    }
  }

  const applicationIds = fd
    .getAll('applications')
    .filter((v): v is string => typeof v === 'string');
  const performanceIds = fd.getAll('performance').filter((v): v is string => typeof v === 'string');

  return {
    ok: true,
    data: {
      slug: slugify(str(fd, 'slug')),
      nameEn,
      scalars: scalarsParsed.data,
      applicationIds,
      performanceIds,
      translations,
      images,
    },
  };
}

// Ensure a slug is unique; on collision append a short id chunk. The DB unique
// constraint is the final backstop (caught as a friendly error below).
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clash = await prisma.product.findUnique({ where: { slug: base }, select: { id: true } });
  if (!clash || clash.id === excludeId) return base;
  return `${base}-${uuidv7().slice(0, 8)}`;
}

function translationCreateData(productId: string, rows: TranslationRow[]) {
  return rows.map((t) => ({ id: uuidv7(), productId, ...t }));
}
function imageCreateData(productId: string, images: z.infer<typeof imageSchema>[]) {
  return images.map((img, i) => ({ id: uuidv7(), productId, sortOrder: i, ...img }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission('catalog.write');
  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const id = uuidv7();
  // Dashboard-created products have no legacy origin; legacy_id must be unique
  // and NOT NULL, so derive it from the (unique) PK with an "AHW-" marker.
  const legacyId = `AHW-${id}`;
  const base = data.slug || slugify(data.nameEn) || slugify(data.scalars.code ?? '') || id;
  const slug = await uniqueSlug(base);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({ data: { id, legacyId, slug, ...data.scalars } });
      if (data.translations.length) {
        await tx.productTranslation.createMany({
          data: translationCreateData(id, data.translations),
        });
      }
      if (data.applicationIds.length) {
        await tx.productApplication.createMany({
          data: data.applicationIds.map((applicationId) => ({ productId: id, applicationId })),
          skipDuplicates: true,
        });
      }
      if (data.performanceIds.length) {
        await tx.productPerformance.createMany({
          data: data.performanceIds.map((performanceAttributeId) => ({
            productId: id,
            performanceAttributeId,
          })),
          skipDuplicates: true,
        });
      }
      if (data.images.length) {
        await tx.productImage.createMany({ data: imageCreateData(id, data.images) });
      }
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: legacyId,
    action: 'create',
    diff: { slug: { from: null, to: slug }, name: { from: null, to: data.nameEn } },
  });
  revalidatePath('/dashboard/products');
  redirect(`/dashboard/products/${id}/edit`);
}

// ---------------------------------------------------------------------------
// Create — tree product (configurable, priced by the configurator)
// ---------------------------------------------------------------------------

// A configurator template/variant code: lowercase letters, digits and
// underscores, starting with a letter (matches codeSchema in the pricing
// actions, so a tree product's template is editable there too).
function toConfigCode(input: string): string {
  let c = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!c) c = 'product';
  if (!/^[a-z]/.test(c)) c = `p_${c}`.slice(0, 50);
  return c;
}

async function uniqueTemplateCode(base: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 ? base : `${base}_${uuidv7().slice(0, 4)}`.slice(0, 60);
    const clash = await prisma.configTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `${base}_${uuidv7().slice(0, 8)}`.slice(0, 60);
}

// Copy a nullable JSONB column verbatim: SQL NULL stays SQL NULL (DbNull), any
// stored value passes straight through. Prisma refuses a bare `null` here.
function jsonIn(
  v: Prisma.JsonValue | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

// Deep-copy a configurator template so a new tree product can start from an
// existing one instead of a blank canvas. Option groups/values are the SHARED
// vocabulary (globally coded) and are reused, never duplicated — only the
// template-scoped rows are copied, with fresh ids and an old->new map so every
// cross-reference (grid axis -> option, band -> option, effect -> option,
// upgrade -> variant) is rewired to the copy.
async function cloneConfigTemplate(
  tx: Prisma.TransactionClient,
  sourceTemplateId: string,
  newTemplateId: string,
  name: string,
  code: string,
): Promise<void> {
  const src = await tx.configTemplate.findUnique({
    where: { id: sourceTemplateId },
    include: {
      variants: { include: { grid: { include: { axes: true, cells: true } } } },
      options: { include: { values: true } },
      upgrades: { include: { tiers: true, effects: true } },
      bands: true,
      pricingRules: true,
      constraints: true,
      derivedQuantities: true,
    },
  });
  if (!src) throw new Error('The product to copy no longer exists.');

  await tx.configTemplate.create({
    data: {
      id: newTemplateId,
      code,
      name,
      currency: src.currency,
      hsCodeId: src.hsCodeId,
      standardNote: src.standardNote,
      isActive: true,
    },
  });

  const variantMap = new Map<string, string>();
  const gridMap = new Map<string, string>();
  for (const v of src.variants) {
    const nv = uuidv7();
    variantMap.set(v.id, nv);
    await tx.configVariant.create({
      data: {
        id: nv,
        templateId: newTemplateId,
        code: v.code,
        name: v.name,
        includedSpec: v.includedSpec,
        imageUrl: v.imageUrl,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    if (v.grid) {
      const ng = uuidv7();
      gridMap.set(v.grid.id, ng);
      await tx.configPriceGrid.create({
        data: { id: ng, variantId: nv, currency: v.grid.currency, note: v.grid.note },
      });
    }
  }

  const optionMap = new Map<string, string>();
  for (const o of src.options) {
    const no = uuidv7();
    optionMap.set(o.id, no);
    await tx.configTemplateOption.create({
      data: {
        id: no,
        templateId: newTemplateId,
        groupId: o.groupId,
        variantId: o.variantId ? (variantMap.get(o.variantId) ?? null) : null,
        configText: o.configText,
        sortOrder: o.sortOrder,
        isRequired: o.isRequired,
        defaultValueId: o.defaultValueId,
        condition: jsonIn(o.condition),
        ranges: jsonIn(o.ranges),
      },
    });
    for (const join of o.values) {
      await tx.configTemplateOptionValue.create({
        data: {
          templateOptionId: no,
          valueId: join.valueId,
          sortOrder: join.sortOrder,
          condition: jsonIn(join.condition),
          configText: join.configText,
          imageUrl: join.imageUrl,
        },
      });
    }
  }

  for (const v of src.variants) {
    if (!v.grid) continue;
    const ng = gridMap.get(v.grid.id);
    if (!ng) continue;
    for (const ax of v.grid.axes) {
      const mapped = optionMap.get(ax.templateOptionId);
      if (!mapped) continue;
      await tx.configPriceGridAxis.create({
        data: { id: uuidv7(), gridId: ng, templateOptionId: mapped, position: ax.position },
      });
    }
    for (const cell of v.grid.cells) {
      await tx.configPriceCell.create({
        data: {
          id: uuidv7(),
          gridId: ng,
          key: cell.key,
          coords: cell.coords as Prisma.InputJsonValue,
          amount: cell.amount,
          note: cell.note,
        },
      });
    }
  }

  for (const u of src.upgrades) {
    const nu = uuidv7();
    await tx.configUpgrade.create({
      data: {
        id: nu,
        templateId: newTemplateId,
        variantId: u.variantId ? (variantMap.get(u.variantId) ?? null) : null,
        section: u.section,
        code: u.code,
        label: u.label,
        detail: u.detail,
        kind: u.kind,
        amount: u.amount,
        unit: u.unit,
        quantityCode: u.quantityCode,
        defaultQty: u.defaultQty,
        minQty: u.minQty,
        maxQty: u.maxQty,
        productId: u.productId,
        condition: jsonIn(u.condition),
        unavailableNote: u.unavailableNote,
        sortOrder: u.sortOrder,
        isActive: u.isActive,
      },
    });
    for (const t of u.tiers) {
      await tx.configUpgradeTier.create({
        data: { id: uuidv7(), upgradeId: nu, minQty: t.minQty, unitAmount: t.unitAmount },
      });
    }
    for (const e of u.effects) {
      await tx.configUpgradeEffect.create({
        data: {
          id: uuidv7(),
          upgradeId: nu,
          kind: e.kind,
          templateOptionId: e.templateOptionId
            ? (optionMap.get(e.templateOptionId) ?? null)
            : null,
          valueCodes: jsonIn(e.valueCodes),
          message: e.message,
        },
      });
    }
  }

  for (const b of src.bands) {
    const mappedOption = optionMap.get(b.templateOptionId);
    if (!mappedOption) continue;
    await tx.configBand.create({
      data: {
        id: uuidv7(),
        templateId: newTemplateId,
        variantId: b.variantId ? (variantMap.get(b.variantId) ?? null) : null,
        templateOptionId: mappedOption,
        code: b.code,
        label: b.label,
        minValue: b.minValue,
        maxValue: b.maxValue,
        amount: b.amount,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
      },
    });
  }

  for (const r of src.pricingRules) {
    if (!r.templateId) continue; // product-scoped rules stay with the old product
    await tx.pricingRule.create({
      data: {
        id: uuidv7(),
        templateId: newTemplateId,
        code: r.code,
        condition: jsonIn(r.condition),
        stage: r.stage,
        priority: r.priority,
        basis: r.basis,
        quantityCode: r.quantityCode,
        applyPer: r.applyPer,
        amount: r.amount,
        rate: r.rate,
        currency: r.currency,
        note: r.note,
        isActive: r.isActive,
      },
    });
  }

  for (const c of src.constraints) {
    await tx.configTemplateConstraint.create({
      data: {
        id: uuidv7(),
        templateId: newTemplateId,
        code: c.code,
        kind: c.kind,
        condition: c.condition as Prisma.InputJsonValue,
        message: c.message,
        isActive: c.isActive,
      },
    });
  }

  for (const d of src.derivedQuantities) {
    await tx.configDerivedQuantity.create({
      data: {
        id: uuidv7(),
        templateId: newTemplateId,
        code: d.code,
        formula: d.formula,
        unit: d.unit,
        sortOrder: d.sortOrder,
      },
    });
  }

  // Add-ons / colour nodes, the base-price DECISION TREE and every add-on's option
  // tree (all ConfigPriceNode rows), plus which base branches each add-on attaches
  // to and any add-on→add-on links. Without this the copy loses everything authored
  // on the canvas — the whole point of a tree product.
  const srcVariantIds = src.variants.map((v) => v.id);
  if (srcVariantIds.length) {
    const addonMap = new Map<string, string>();
    const addons = await tx.configAddon.findMany({ where: { variantId: { in: srcVariantIds } } });
    for (const a of addons) {
      const na = uuidv7();
      addonMap.set(a.id, na);
      await tx.configAddon.create({
        data: {
          id: na,
          variantId: variantMap.get(a.variantId) ?? a.variantId,
          name: a.name,
          colorName: a.colorName,
          colorHex: a.colorHex,
          amount: a.amount,
          priceUnit: a.priceUnit,
          attachBase: a.attachBase,
          description: a.description,
          configuration: a.configuration,
          sortOrder: a.sortOrder,
        },
      });
    }

    // Parents are written before children so the self-referencing parent FK holds
    // within the batch (same ordering restorePriceTree relies on).
    const nodes = await tx.configPriceNode.findMany({ where: { variantId: { in: srcVariantIds } } });
    const nodeMap = new Map<string, string>();
    nodes.forEach((n) => nodeMap.set(n.id, uuidv7()));
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
          id: nodeMap.get(n.id)!,
          variantId: variantMap.get(n.variantId) ?? n.variantId,
          parentId: n.parentId ? (nodeMap.get(n.parentId) ?? null) : null,
          addonId: n.addonId ? (addonMap.get(n.addonId) ?? null) : null,
          groupId: n.groupId,
          valueId: n.valueId,
          amount: n.amount,
          priceUnit: n.priceUnit,
          description: n.description,
          configuration: n.configuration,
          sortOrder: n.sortOrder,
        })),
      });
    }

    const srcAddonIds = addons.map((a) => a.id);
    if (srcAddonIds.length) {
      const attachments = await tx.configAddonAttachment.findMany({
        where: { addonId: { in: srcAddonIds } },
      });
      const atData = attachments
        .filter((a) => addonMap.has(a.addonId) && nodeMap.has(a.baseNodeId))
        .map((a) => ({
          id: uuidv7(),
          addonId: addonMap.get(a.addonId)!,
          baseNodeId: nodeMap.get(a.baseNodeId)!,
        }));
      if (atData.length) await tx.configAddonAttachment.createMany({ data: atData });

      const links = await tx.configAddonLink.findMany({ where: { addonId: { in: srcAddonIds } } });
      const lkData = links
        .filter((l) => addonMap.has(l.addonId) && addonMap.has(l.targetAddonId))
        .map((l) => ({
          id: uuidv7(),
          addonId: addonMap.get(l.addonId)!,
          targetAddonId: addonMap.get(l.targetAddonId)!,
        }));
      if (lkData.length) await tx.configAddonLink.createMany({ data: lkData });
    }
  }
}

const treeProductSchema = z.object({
  name: z.string().trim().min(1, 'Give the product a name.').max(200),
  sourceId: z.string().uuid('Choose a supplier.'),
});

// A "tree product" is a made-to-order product priced by the configurator. Instead
// of the flat ProductForm it starts almost empty — a name, a supplier, and its own
// config template with one build — then opens on the tree canvas, where the
// questions, prices and upgrades get authored. Everything the canvas writes lands
// in the existing configurator tables; this only lays the first stones.
export async function createTreeProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission('pricing.write');
  const parsed = treeProductSchema.safeParse({
    name: str(formData, 'name'),
    sourceId: str(formData, 'sourceId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, sourceId } = parsed.data;

  // Optional: start by copying an existing tree product instead of from scratch.
  const sourceProductId = str(formData, 'sourceProductId') || null;
  let sourceTemplateId: string | null = null;
  if (sourceProductId) {
    const srcProd = await prisma.product.findUnique({
      where: { id: sourceProductId },
      select: { templateId: true, kind: true },
    });
    if (!srcProd?.templateId || srcProd.kind !== 'made_to_order') {
      return { error: 'That product cannot be copied.' };
    }
    sourceTemplateId = srcProd.templateId;
  }

  const id = uuidv7();
  const templateId = uuidv7();
  const code = await uniqueTemplateCode(toConfigCode(str(formData, 'code') || name));
  const slug = await uniqueSlug(slugify(name) || code || id);

  try {
    await prisma.$transaction(async (tx) => {
      if (sourceTemplateId) {
        // Deep-copy the source's whole tree into a brand-new template.
        await cloneConfigTemplate(tx, sourceTemplateId, templateId, name, code);
      } else {
        await tx.configTemplate.create({
          data: { id: templateId, code, name, currency: 'USD', isActive: true },
        });
        // One empty build so the canvas has something to hang the tree on; its
        // grid comes with it, the same convention the variant editor uses.
        const variantId = uuidv7();
        await tx.configVariant.create({
          data: { id: variantId, templateId, code: 'build_1', name: 'Build 1', sortOrder: 0 },
        });
        await tx.configPriceGrid.create({ data: { id: uuidv7(), variantId, currency: 'USD' } });
      }
      // Made-to-order: no legacy_id (the CHECK only demands it for 'stock'), the
      // flat price stays 0 because the configurator prices it, and it starts
      // unpublished so a half-built door never shows in the catalog.
      await tx.product.create({
        data: {
          id,
          kind: 'made_to_order',
          slug,
          sourceId,
          price: 0,
          currency: 'AED',
          isPublished: false,
          isAvailable: true,
          templateId,
        },
      });
      await tx.productTranslation.create({
        data: { id: uuidv7(), productId: id, localeCode: 'en', name },
      });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: id,
    action: 'create',
    diff: { kind: { from: null, to: 'made_to_order (tree)' }, name: { from: null, to: name } },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'config_template',
    entityId: templateId,
    action: 'create',
    diff: { code: { from: null, to: code } },
  });
  revalidatePath('/dashboard/products');
  redirect(`/dashboard/products/${id}/tree`);
}

// ---------------------------------------------------------------------------
// Create — by-measure product (a flat item sold per unit of measure)
// ---------------------------------------------------------------------------

const measureProductSchema = z.object({
  name: z.string().trim().min(1, 'Give the item a name.').max(200),
  sourceId: z.string().uuid('Choose a supplier.'),
  unitPrice: z.number().min(0, 'Price cannot be negative.').max(9_999_999_999),
  priceUnit: z.string().trim().min(1, 'Choose a unit (m², piece, …).').max(50),
  currency: z.string().trim().length(3),
});

// A "by-measure" product is a flat item sold by a unit of measure — a wall panel
// at 26/m², a grille at 15/piece. It carries no configurator tree: the quantity
// (which may be fractional, e.g. 10.5 m²) is entered on the quote line, where the
// cost is unitPrice × quantity and is then shipped and taxed like any other goods.
export async function createMeasureProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission('catalog.write');
  const parsed = measureProductSchema.safeParse({
    name: str(formData, 'name'),
    sourceId: str(formData, 'sourceId'),
    unitPrice: Number(str(formData, 'unitPrice') || '0'),
    priceUnit: str(formData, 'priceUnit'),
    currency: (str(formData, 'currency') || 'USD').toUpperCase(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, sourceId, unitPrice, priceUnit, currency } = parsed.data;

  const id = uuidv7();
  const slug = await uniqueSlug(slugify(name) || id);

  try {
    await prisma.$transaction(async (tx) => {
      // kind 'by_measure': the products CHECK only demands a legacy_id for 'stock',
      // so a by-measure item needs none. It starts unpublished — it is a quote
      // extra, not a public catalog page.
      await tx.product.create({
        data: {
          id,
          kind: 'by_measure',
          slug,
          sourceId,
          price: unitPrice,
          currency,
          priceUnit,
          isPublished: false,
          isAvailable: true,
        },
      });
      await tx.productTranslation.create({
        data: { id: uuidv7(), productId: id, localeCode: 'en', name },
      });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: id,
    action: 'create',
    diff: {
      kind: { from: null, to: 'by_measure' },
      name: { from: null, to: name },
      price: { from: null, to: unitPrice },
      price_unit: { from: null, to: priceUnit },
    },
  });
  revalidatePath('/dashboard/products');
  redirect('/dashboard/products');
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateProduct(
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission('catalog.write');
  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true, slug: true, updatedAt: true },
  });
  if (!existing) return { error: 'Product not found.' };

  // Optimistic lock: refuse the write if someone else saved since this form was
  // loaded, so their edit isn't silently overwritten.
  const expected = parseExpectedUpdatedAt(formData);
  if (!versionMatches(existing.updatedAt, expected)) return { error: CONFLICT_MESSAGE };

  const requested = data.slug || slugify(data.nameEn) || existing.slug;
  const slug = requested === existing.slug ? existing.slug : await uniqueSlug(requested, productId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { slug, ...data.scalars } });

      // Replace child collections wholesale — simplest correct diff, and none
      // of these rows are referenced by anything else.
      await tx.productTranslation.deleteMany({ where: { productId } });
      if (data.translations.length) {
        await tx.productTranslation.createMany({
          data: translationCreateData(productId, data.translations),
        });
      }
      await tx.productApplication.deleteMany({ where: { productId } });
      if (data.applicationIds.length) {
        await tx.productApplication.createMany({
          data: data.applicationIds.map((applicationId) => ({ productId, applicationId })),
          skipDuplicates: true,
        });
      }
      await tx.productPerformance.deleteMany({ where: { productId } });
      if (data.performanceIds.length) {
        await tx.productPerformance.createMany({
          data: data.performanceIds.map((performanceAttributeId) => ({
            productId,
            performanceAttributeId,
          })),
          skipDuplicates: true,
        });
      }
      await tx.productImage.deleteMany({ where: { productId } });
      if (data.images.length) {
        await tx.productImage.createMany({ data: imageCreateData(productId, data.images) });
      }
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: existing.legacyId ?? existing.id,
    action: 'update',
    diff: { slug: { from: existing.slug, to: slug } },
  });
  revalidatePath('/dashboard/products');
  redirect('/dashboard/products');
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteProduct(productId: string): Promise<void> {
  const user = await requirePermission('catalog.write');
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true, slug: true },
  });
  if (!product) redirect('/dashboard/products');

  // Cascades translations/applications/performance/images; leads.product_id is
  // SET NULL, so a product with attached leads still deletes cleanly.
  await prisma.product.delete({ where: { id: productId } });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId ?? product.id,
    action: 'delete',
    diff: { slug: { from: product.slug, to: null } },
  });
  revalidatePath('/dashboard/products');
  redirect('/dashboard/products');
}

// ---------------------------------------------------------------------------
// Review workflow — the dashboard "Review Session" (one product at a time)
// ---------------------------------------------------------------------------

const reviewStatusSchema = z.enum(['new', 'reviewed', 'ask_client']);

export async function setReviewStatus(productId: string, status: string): Promise<void> {
  const user = await requirePermission('catalog.write');
  const s = reviewStatusSchema.safeParse(status);
  if (!s.success || !z.string().uuid().safeParse(productId).success) return;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true, reviewStatus: true },
  });
  if (!p || p.reviewStatus === s.data) return;
  await prisma.product.update({
    where: { id: productId },
    data: { reviewStatus: s.data, reviewedAt: s.data === 'reviewed' ? new Date() : null },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: p.legacyId ?? p.id,
    action: 'update',
    diff: { review_status: { from: p.reviewStatus, to: s.data } },
  });
  revalidatePath('/dashboard/products');
}

const reviewEditSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.').max(300),
  typeId: z.string().uuid().nullable(),
  lookId: z.string().uuid().nullable(),
  materialId: z.string().uuid().nullable(),
  collectionId: z.string().uuid().nullable(),
  applicationIds: z.array(z.string().uuid()).max(50),
  // Optional full image list (order matters; index 0 is the cover). An s3Key
  // that starts with http(s) is an absolute URL the app renders as-is, so
  // images added by URL in the session persist without touching S3.
  images: z.array(z.object({ s3Key: z.string().trim().min(1).max(1000) })).max(30).optional(),
});

// Save the fields the review session edits (EN name + category facets + rooms),
// then optionally set the review status in the same step.
export async function saveReviewProduct(
  productId: string,
  input: unknown,
  nextStatus?: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission('catalog.write');
  if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: 'Bad id' };
  const parsed = reviewEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };
  const d = parsed.data;
  const status = nextStatus ? reviewStatusSchema.safeParse(nextStatus) : null;

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true },
  });
  if (!existing) return { ok: false, error: 'Product not found.' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          typeId: d.typeId,
          lookId: d.lookId,
          materialId: d.materialId,
          collectionId: d.collectionId,
          ...(status?.success
            ? {
                reviewStatus: status.data,
                reviewedAt: status.data === 'reviewed' ? new Date() : null,
              }
            : {}),
        },
      });
      const en = await tx.productTranslation.findFirst({
        where: { productId, localeCode: 'en' },
        select: { id: true },
      });
      if (en) {
        await tx.productTranslation.update({ where: { id: en.id }, data: { name: d.name } });
      } else {
        await tx.productTranslation.create({
          data: { id: uuidv7(), productId, localeCode: 'en', name: d.name },
        });
      }
      await tx.productApplication.deleteMany({ where: { productId } });
      if (d.applicationIds.length) {
        await tx.productApplication.createMany({
          data: d.applicationIds.map((applicationId) => ({ productId, applicationId })),
          skipDuplicates: true,
        });
      }
      // Replace the gallery when the session sent one (reorder / remove / add).
      if (d.images) {
        await tx.productImage.deleteMany({ where: { productId } });
        if (d.images.length) {
          await tx.productImage.createMany({
            data: d.images.map((im, i) => ({ id: uuidv7(), productId, sortOrder: i, s3Key: im.s3Key })),
          });
        }
      }
    });
  } catch (err) {
    return { ok: false, error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: existing.legacyId ?? existing.id,
    action: 'update',
    diff: { reviewed_edit: { from: null, to: status?.success ? status.data : 'saved' } },
  });
  revalidatePath('/dashboard/products');
  return { ok: true };
}

// Translate the few expected Prisma write failures into human messages.
function writeErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return 'That slug is already in use — choose a different one.';
    if (err.code === 'P2003') return 'One of the selected facet values no longer exists.';
  }
  throw err; // unexpected — let the framework surface it
}

// ---------------------------------------------------------------------------
// Inline row edits — fast price / unit / featured-rank + publish toggle
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  price: z.coerce.number().min(0).max(9_999_999_999),
  priceUnit: z
    .string()
    .trim()
    .max(50)
    .transform((v) => v || null),
  featuredRank: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(1_000_000)])
    .transform((v) => (v === '' ? null : v)),
});

export async function saveProductRow(productId: string, formData: FormData): Promise<void> {
  const user = await requirePermission('catalog.write');
  const parsed = rowSchema.safeParse({
    price: formData.get('price') ?? 0,
    priceUnit: formData.get('priceUnit') ?? '',
    featuredRank: formData.get('featuredRank') ?? '',
  });
  if (!parsed.success) return;
  const { price, priceUnit, featuredRank } = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true, price: true, priceUnit: true, featuredRank: true },
  });
  if (!product) return;
  if (
    Number(product.price) === price &&
    product.priceUnit === priceUnit &&
    product.featuredRank === featuredRank
  ) {
    return;
  }

  await prisma.product.update({
    where: { id: productId },
    data: { price, priceUnit, featuredRank },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId ?? product.id,
    action: 'update',
    diff: {
      price: { from: Number(product.price), to: price },
      price_unit: { from: product.priceUnit, to: priceUnit },
      featured_rank: { from: product.featuredRank, to: featuredRank },
    },
  });
  revalidatePath('/dashboard/products');
}

export async function setProductPublished(productId: string, next: boolean): Promise<void> {
  const user = await requirePermission('catalog.write');
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, legacyId: true, isPublished: true },
  });
  if (!product || product.isPublished === next) return;
  await prisma.product.update({ where: { id: productId }, data: { isPublished: next } });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId ?? product.id,
    action: 'update',
    diff: { is_published: { from: product.isPublished, to: next } },
  });
  revalidatePath('/dashboard/products');
}

// ---------------------------------------------------------------------------
// Bulk actions — operate on the selected product ids (one summary audit row)
// ---------------------------------------------------------------------------

const idsSchema = z.array(z.string().uuid()).min(1).max(2000);

export async function bulkSetPublished(ids: string[], next: boolean): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success) return;
  const res = await prisma.product.updateMany({
    where: { id: { in: clean.data } },
    data: { isPublished: next },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'update',
    diff: { is_published: { from: null, to: next } },
  });
  revalidatePath('/dashboard/products');
}

export async function bulkSetSource(ids: string[], sourceId: string): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success || !z.string().uuid().safeParse(sourceId).success) return;
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { code: true },
  });
  if (!source) return;
  const res = await prisma.product.updateMany({
    where: { id: { in: clean.data } },
    data: { sourceId },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'update',
    diff: { source: { from: null, to: source.code } },
  });
  revalidatePath('/dashboard/products');
}

export async function bulkSetFeatured(ids: string[], rank: number | null): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success) return;
  const value = rank === null ? null : Math.max(0, Math.min(1_000_000, Math.trunc(rank)));
  const res = await prisma.product.updateMany({
    where: { id: { in: clean.data } },
    data: { featuredRank: value },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'update',
    diff: { featured_rank: { from: null, to: value } },
  });
  revalidatePath('/dashboard/products');
}

// Bulk-set a single scalar facet (type/material/look/collection/color/finish/
// brand) across the selection. An empty valueId clears the facet (→ NULL).
const FACET_COLUMN = {
  type: 'typeId',
  material: 'materialId',
  look: 'lookId',
  collection: 'collectionId',
  color: 'colorId',
  finish: 'finishId',
  brand: 'brandId',
} as const;
type FacetKey = keyof typeof FACET_COLUMN;

async function facetCode(field: FacetKey, id: string): Promise<string | null> {
  const sel = { where: { id }, select: { code: true } };
  switch (field) {
    case 'type': return (await prisma.productType.findUnique(sel))?.code ?? null;
    case 'material': return (await prisma.material.findUnique(sel))?.code ?? null;
    case 'look': return (await prisma.look.findUnique(sel))?.code ?? null;
    case 'collection': return (await prisma.collection.findUnique(sel))?.code ?? null;
    case 'color': return (await prisma.color.findUnique(sel))?.code ?? null;
    case 'finish': return (await prisma.finish.findUnique(sel))?.code ?? null;
    case 'brand': return (await prisma.brand.findUnique(sel))?.code ?? null;
  }
}

export async function bulkSetFacet(ids: string[], field: string, valueId: string): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success || !(field in FACET_COLUMN)) return;
  const key = field as FacetKey;

  let value: string | null = null;
  let code = '(cleared)';
  if (valueId) {
    if (!z.string().uuid().safeParse(valueId).success) return;
    const c = await facetCode(key, valueId);
    if (!c) return; // unknown value — do nothing rather than null the facet
    value = valueId;
    code = c;
  }

  const data: Prisma.ProductUncheckedUpdateManyInput = {};
  data[FACET_COLUMN[key]] = value;
  const res = await prisma.product.updateMany({ where: { id: { in: clean.data } }, data });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'update',
    diff: { [field]: { from: null, to: code } },
  });
  revalidatePath('/dashboard/products');
}

// Bulk add / remove a room-or-use tag (application, a many-to-many join).
export async function bulkSetApplication(
  ids: string[],
  applicationId: string,
  add: boolean,
): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success || !z.string().uuid().safeParse(applicationId).success) return;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { code: true },
  });
  if (!app) return;

  if (add) {
    await prisma.productApplication.createMany({
      data: clean.data.map((productId) => ({ productId, applicationId })),
      skipDuplicates: true,
    });
  } else {
    await prisma.productApplication.deleteMany({
      where: { productId: { in: clean.data }, applicationId },
    });
  }
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${clean.data.length} products`,
    action: 'update',
    diff: { application: add ? { from: null, to: app.code } : { from: app.code, to: null } },
  });
  revalidatePath('/dashboard/products');
}

// Move the selection between review lists (not reviewed / reviewed / ask client).
export async function bulkSetReviewStatus(ids: string[], status: string): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  const s = reviewStatusSchema.safeParse(status);
  if (!clean.success || !s.success) return;
  const res = await prisma.product.updateMany({
    where: { id: { in: clean.data } },
    data: { reviewStatus: s.data, reviewedAt: s.data === 'reviewed' ? new Date() : null },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'update',
    diff: { review_status: { from: null, to: s.data } },
  });
  revalidatePath('/dashboard/products');
}

export async function bulkDeleteProducts(ids: string[]): Promise<void> {
  const user = await requirePermission('catalog.write');
  const clean = idsSchema.safeParse(ids);
  if (!clean.success) return;
  const res = await prisma.product.deleteMany({ where: { id: { in: clean.data } } });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: `${res.count} products`,
    action: 'delete',
    diff: { deleted: { from: res.count, to: null } },
  });
  revalidatePath('/dashboard/products');
}
