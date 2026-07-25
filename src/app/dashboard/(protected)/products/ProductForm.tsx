'use client';

import { useActionState, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { FacetOptions, FacetOption, ProductFormInitial } from '@/lib/catalogAdmin';
import type { ProductFormState } from './actions';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;

type ImageRow = {
  _key: number;
  s3Key: string;
  thumbKey: string;
  supplierUrl: string;
  width: string;
  height: string;
};

function optionLabel(o: FacetOption): string {
  const base = o.name === o.code ? o.name : `${o.name} (${o.code})`;
  return o.isActive ? base : `${base} — inactive`;
}

function Text({
  name,
  label,
  defaultValue,
  type = 'text',
  required,
  placeholder,
  dir,
  step,
  min,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  step?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        dir={dir}
        step={step}
        min={min}
        className={inputCls}
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  options: FacetOption[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
      </span>
      <select name={name} defaultValue={defaultValue ?? ''} required={required} className={inputCls}>
        {!required && <option value="">— none —</option>}
        {required && <option value="" disabled>— select —</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxGroup({
  name,
  label,
  options,
  selected,
}: {
  name: string;
  label: string;
  options: FacetOption[];
  selected: string[];
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className={labelCls}>{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} />
            {optionLabel(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProductForm({
  action,
  facets,
  initial,
  submitLabel,
}: {
  action: ServerAction;
  facets: FacetOptions;
  initial?: ProductFormInitial;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ProductFormState, FormData>(action, {});

  let keySeq = 0;
  const [images, setImages] = useState<ImageRow[]>(
    (initial?.images ?? []).map((img) => ({ _key: keySeq++, ...img })),
  );
  const addImage = () =>
    setImages((rows) => [
      ...rows,
      { _key: Date.now(), s3Key: '', thumbKey: '', supplierUrl: '', width: '', height: '' },
    ]);
  const removeImage = (key: number) => setImages((rows) => rows.filter((r) => r._key !== key));
  const patchImage = (key: number, patch: Partial<ImageRow>) =>
    setImages((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const t = (locale: Locale) => initial?.translations[locale];

  return (
    <form action={formAction} className="max-w-4xl space-y-10">
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      {/* Translations */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Names &amp; copy</h2>
        {LOCALES.map((locale) => {
          const tr = t(locale);
          const body = (
            <div className="space-y-3 pt-3">
              <Text
                name={`name_${locale}`}
                label="Name"
                required={locale === 'en'}
                defaultValue={tr?.name}
                dir={dirOf(locale)}
              />
              <Text name={`description_${locale}`} label="Description" defaultValue={tr?.description} dir={dirOf(locale)} />
              <Text name={`usageNotes_${locale}`} label="Usage notes" defaultValue={tr?.usageNotes} dir={dirOf(locale)} />
              <div className="grid grid-cols-2 gap-3">
                <Text name={`metaTitle_${locale}`} label="Meta title (SEO)" defaultValue={tr?.metaTitle} dir={dirOf(locale)} />
                <Text name={`metaDescription_${locale}`} label="Meta description (SEO)" defaultValue={tr?.metaDescription} dir={dirOf(locale)} />
              </div>
            </div>
          );
          return locale === 'en' ? (
            <div key={locale}>
              <p className="text-sm font-medium text-heading">{LOCALE_LABEL[locale]}</p>
              {body}
            </div>
          ) : (
            <details key={locale} className="border-t border-line pt-3">
              <summary className="text-sm font-medium text-heading cursor-pointer">
                {LOCALE_LABEL[locale]}
              </summary>
              {body}
            </details>
          );
        })}
      </section>

      {/* Facets */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Classification</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Select name="sourceId" label="Source" options={facets.sources} defaultValue={initial?.sourceId} required />
          <Select name="typeId" label="Type" options={facets.types} defaultValue={initial?.typeId} />
          <Select name="materialId" label="Material" options={facets.materials} defaultValue={initial?.materialId} />
          <Select name="lookId" label="Look" options={facets.looks} defaultValue={initial?.lookId} />
          <Select name="colorId" label="Color" options={facets.colors} defaultValue={initial?.colorId} />
          <Select name="finishId" label="Finish" options={facets.finishes} defaultValue={initial?.finishId} />
          <Select name="collectionId" label="Collection" options={facets.collections} defaultValue={initial?.collectionId} />
          <Select name="brandId" label="Brand" options={facets.brands} defaultValue={initial?.brandId} />
        </div>
        <CheckboxGroup name="applications" label="Applications" options={facets.applications} selected={initial?.applicationIds ?? []} />
        <CheckboxGroup name="performance" label="Performance attributes" options={facets.performance} selected={initial?.performanceIds ?? []} />
      </section>

      {/* Commerce */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Commerce &amp; details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Text name="code" label="Supplier code / SKU" defaultValue={initial?.code} />
          <Text name="sizeLabel" label="Size label" defaultValue={initial?.sizeLabel} placeholder="750×1500 mm" />
          <Text name="price" label="Price" type="number" step="0.01" min="0" defaultValue={initial?.price} />
          <Text name="currency" label="Currency" defaultValue={initial?.currency ?? 'AED'} />
          <Text name="priceUnit" label="Price unit" defaultValue={initial?.priceUnit} placeholder="per m² / box / piece" />
          <Text name="sellingType" label="Selling type" defaultValue={initial?.sellingType} />
          <Text name="packing" label="Packing" defaultValue={initial?.packing} />
          <Text name="weightLabel" label="Weight" defaultValue={initial?.weightLabel} />
          <Text name="featuredRank" label="Featured rank" type="number" min="0" defaultValue={initial?.featuredRank} />
        </div>
        <Text name="supplierUrl" label="Supplier URL" type="url" defaultValue={initial?.supplierUrl} placeholder="https://…" />
        <Text name="slug" label="Slug (leave blank to auto-generate from the English name)" defaultValue={initial?.slug} />
        <div className="flex flex-wrap gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="isPublished" defaultChecked={initial?.isPublished ?? true} /> Published
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="isAvailable" defaultChecked={initial?.isAvailable ?? true} /> Available
          </label>
        </div>
      </section>

      {/* Images */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-heading">Images</h2>
          <button type="button" onClick={addImage} className="text-sm text-accent hover:underline">
            + Add image
          </button>
        </div>
        <p className="text-muted text-xs">
          First row is the primary image. Enter existing S3 keys — uploads come in a later phase.
        </p>
        {images.length === 0 && <p className="text-muted text-sm">No images yet.</p>}
        <div className="space-y-3">
          {images.map((row, i) => (
            <div key={row._key} className="grid grid-cols-12 gap-2 items-end bg-surface/50 p-3 rounded-lg">
              <span className="col-span-12 text-xs text-muted">
                {i === 0 ? 'Primary' : `#${i + 1}`}
              </span>
              <div className="col-span-12 md:col-span-4">
                <span className={labelCls}>S3 key</span>
                <input
                  value={row.s3Key}
                  onChange={(e) => patchImage(row._key, { s3Key: e.target.value })}
                  className={inputCls}
                  placeholder="product-images/…/0-display.webp"
                />
              </div>
              <div className="col-span-12 md:col-span-3">
                <span className={labelCls}>Thumb key</span>
                <input value={row.thumbKey} onChange={(e) => patchImage(row._key, { thumbKey: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-6 md:col-span-2">
                <span className={labelCls}>Width</span>
                <input value={row.width} onChange={(e) => patchImage(row._key, { width: e.target.value })} className={inputCls} inputMode="numeric" />
              </div>
              <div className="col-span-6 md:col-span-2">
                <span className={labelCls}>Height</span>
                <input value={row.height} onChange={(e) => patchImage(row._key, { height: e.target.value })} className={inputCls} inputMode="numeric" />
              </div>
              <div className="col-span-12 md:col-span-1">
                <button type="button" onClick={() => removeImage(row._key)} className="text-red-300 hover:text-red-200 text-sm py-2">
                  Remove
                </button>
              </div>
              <div className="col-span-12">
                <span className={labelCls}>Supplier URL (fallback)</span>
                <input value={row.supplierUrl} onChange={(e) => patchImage(row._key, { supplierUrl: e.target.value })} className={inputCls} />
              </div>
            </div>
          ))}
        </div>
        <input
          type="hidden"
          name="imagesJson"
          value={JSON.stringify(
            images.map((r) => ({
              s3Key: r.s3Key,
              thumbKey: r.thumbKey,
              supplierUrl: r.supplierUrl,
              width: r.width,
              height: r.height,
            })),
          )}
        />
      </section>

      <div className="flex items-center gap-4 pt-2">
        <button
          disabled={isPending}
          className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
