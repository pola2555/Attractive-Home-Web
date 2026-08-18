'use client';

import { useActionState, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { FacetOptions, FacetOption, ProductFormInitial } from '@/lib/catalogAdmin';
import type { ProductFormState } from './actions';
import ProductImageUploader from './ProductImageUploader';
import UnsavedChangesGuard from '../UnsavedChangesGuard';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;

function optionLabel(o: FacetOption): string {
  const base = o.name === o.code ? o.name : `${o.name} (${o.code})`;
  return o.isActive ? base : `${base} — inactive`;
}

// A small "?" affordance next to a field label. The explanation pops on hover or
// keyboard focus (no JS state — pure group-hover/focus-within), so it works on
// touch via focus too.
function InfoHint({ label, width = 'w-72', children }: { label: string; width?: string; children: React.ReactNode }) {
  return (
    <span className="group/hint relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="ms-1.5 inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold leading-none text-muted transition-colors hover:border-accent hover:text-heading focus:outline-none focus:ring-2 focus:ring-accent"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute start-0 top-full z-30 mt-2 ${width} rounded-lg border border-line-strong bg-surface p-3 text-xs font-normal leading-relaxed text-ink opacity-0 shadow-xl transition group-hover/hint:visible group-hover/hint:opacity-100 group-focus-within/hint:visible group-focus-within/hint:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}

// A worked example of how the meta fields render as a Google search result. The
// line the current field controls is ringed so it's obvious which is which.
function MetaExample({ highlight }: { highlight: 'title' | 'description' }) {
  return (
    <span className="mt-2 block rounded-md border border-line bg-bg-deep p-2">
      <span className="block truncate text-[11px] text-muted">attractivehome.ae › catalog › calacatta-gold</span>
      <span
        className={`block truncate text-[13px] ${
          highlight === 'title' ? 'rounded bg-accent/10 px-0.5 font-medium text-sky-400 ring-1 ring-sky-400/50' : 'text-sky-400/70'
        }`}
      >
        Calacatta Gold Porcelain Slab 120×278 | Attractive Home
      </span>
      <span
        className={`mt-0.5 block text-[11px] ${
          highlight === 'description' ? 'rounded bg-accent/10 px-0.5 text-ink ring-1 ring-accent/50' : 'text-muted'
        }`}
      >
        Large-format Calacatta Gold porcelain with soft grey veining — ideal for feature walls, worktops and floors.
      </span>
    </span>
  );
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
  hint,
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
  hint?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
        {hint}
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
  hint,
}: {
  name: string;
  label: string;
  options: FacetOption[];
  defaultValue?: string;
  required?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
        {hint}
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
  const [imagesBusy, setImagesBusy] = useState(false);

  const t = (locale: Locale) => initial?.translations[locale];

  return (
    <form action={formAction} className="max-w-4xl space-y-10">
      <UnsavedChangesGuard />
      {initial && <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />}
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
                <Text
                  name={`metaTitle_${locale}`}
                  label="Meta title (SEO)"
                  defaultValue={tr?.metaTitle}
                  dir={dirOf(locale)}
                  hint={
                    <InfoHint label="Meta title" width="w-80">
                      The headline shown in Google results and the browser tab — it isn&apos;t printed on the page
                      itself. Aim for ~50–60 characters, lead with the product name, and add a key material or size.
                      Leave blank to fall back to the product name.
                      <MetaExample highlight="title" />
                    </InfoHint>
                  }
                />
                <Text
                  name={`metaDescription_${locale}`}
                  label="Meta description (SEO)"
                  defaultValue={tr?.metaDescription}
                  dir={dirOf(locale)}
                  hint={
                    <InfoHint label="Meta description" width="w-80">
                      The grey summary under the title in Google results. Aim for ~150–160 characters describing the
                      product to earn the click. It doesn&apos;t affect ranking; leave blank and Google writes its own
                      snippet.
                      <MetaExample highlight="description" />
                    </InfoHint>
                  }
                />
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
          <Select
            name="sourceId"
            label="Source"
            options={facets.sources}
            defaultValue={initial?.sourceId}
            required
            hint={
              <InfoHint label="Source">
                Which inventory this product belongs to. <strong className="text-heading">Attractive Home</strong> = our
                own product (images served from our site bucket, badged as our brand).{' '}
                <strong className="text-heading">Catalog</strong> = an imported supplier material (images from the
                supplier bucket). Required — it decides where images load from and how the product is branded.
              </InfoHint>
            }
          />
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
      <ProductImageUploader initial={initial?.images} onBusyChange={setImagesBusy} />

      <div className="flex items-center gap-4 pt-2">
        <button
          disabled={isPending || imagesBusy}
          className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
        >
          {isPending ? 'Saving…' : imagesBusy ? 'Uploading…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
