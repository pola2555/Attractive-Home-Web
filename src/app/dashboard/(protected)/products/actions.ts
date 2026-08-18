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

  const applicationIds = fd.getAll('applications').filter((v): v is string => typeof v === 'string');
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
        await tx.productTranslation.createMany({ data: translationCreateData(id, data.translations) });
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
    select: { legacyId: true, slug: true, updatedAt: true },
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
    entityId: existing.legacyId,
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
    select: { legacyId: true, slug: true },
  });
  if (!product) redirect('/dashboard/products');

  // Cascades translations/applications/performance/images; leads.product_id is
  // SET NULL, so a product with attached leads still deletes cleanly.
  await prisma.product.delete({ where: { id: productId } });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId,
    action: 'delete',
    diff: { slug: { from: product.slug, to: null } },
  });
  revalidatePath('/dashboard/products');
  redirect('/dashboard/products');
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
// Inline price entry (kept from the price-entry list — fast bulk pricing)
// ---------------------------------------------------------------------------

const priceSchema = z.object({
  price: z.coerce.number().min(0).max(9_999_999_999),
  priceUnit: z
    .string()
    .trim()
    .max(50)
    .transform((v) => v || null),
});

export async function updateProductPrice(productId: string, formData: FormData): Promise<void> {
  const user = await requirePermission('catalog.write');
  const parsed = priceSchema.safeParse({
    price: formData.get('price'),
    priceUnit: formData.get('priceUnit') ?? '',
  });
  if (!parsed.success) return;

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const oldPrice = Number(product.price);
  if (oldPrice === parsed.data.price && product.priceUnit === parsed.data.priceUnit) return;

  await prisma.product.update({
    where: { id: productId },
    data: { price: parsed.data.price, priceUnit: parsed.data.priceUnit },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId,
    action: 'update',
    diff: {
      price: { from: oldPrice, to: parsed.data.price },
      price_unit: { from: product.priceUnit, to: parsed.data.priceUnit },
    },
  });
  revalidatePath('/dashboard/products');
}
