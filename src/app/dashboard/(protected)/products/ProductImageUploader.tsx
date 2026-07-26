'use client';

import { useRef, useState } from 'react';
import type { ProductImageInput } from '@/lib/catalogAdmin';

// Drag-drop image upload for the product form: uploads to S3 via
// /api/dashboard/media/upload, shows live previews, and lets the user reorder /
// set-primary / remove. Serialises the result into the form's `imagesJson`.
// Falls back to manual S3-key entry when uploads aren't configured.

type Img = ProductImageInput & { _key: number; status: 'ready' | 'uploading' | 'error'; error?: string };

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '');
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

function readDimensions(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

export default function ProductImageUploader({
  initial,
  onBusyChange,
}: {
  initial?: ProductImageInput[];
  onBusyChange?: (busy: boolean) => void;
}) {
  const [images, setImages] = useState<Img[]>(() =>
    (initial ?? []).map((im, i) => ({ ...im, _key: i, status: 'ready' as const })),
  );
  const [dragging, setDragging] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const seq = useRef(1_000_000);
  const pending = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const bump = (n: number) => {
    pending.current += n;
    onBusyChange?.(pending.current > 0);
  };

  const uploadOne = async (file: File) => {
    const _key = seq.current++;
    bump(1);
    const objectUrl = URL.createObjectURL(file);
    const dims = await readDimensions(objectUrl);
    setImages((prev) => [
      ...prev,
      {
        _key,
        s3Key: '',
        thumbKey: '',
        supplierUrl: '',
        width: dims.w ? String(dims.w) : '',
        height: dims.h ? String(dims.h) : '',
        url: objectUrl,
        status: 'uploading',
      },
    ]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/dashboard/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setImages((prev) =>
        prev.map((im) => (im._key === _key ? { ...im, s3Key: data.key, url: data.url, status: 'ready' } : im)),
      );
    } catch (e) {
      setImages((prev) =>
        prev.map((im) => (im._key === _key ? { ...im, status: 'error', error: (e as Error).message } : im)),
      );
    } finally {
      bump(-1);
    }
  };

  const uploadFiles = (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith('image/')) void uploadOne(file);
    }
  };

  const remove = (key: number) => setImages((prev) => prev.filter((im) => im._key !== key));
  const move = (key: number, dir: -1 | 1) =>
    setImages((prev) => {
      const i = prev.findIndex((im) => im._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const makePrimary = (key: number) =>
    setImages((prev) => {
      const i = prev.findIndex((im) => im._key === key);
      if (i <= 0) return prev;
      const next = [...prev];
      const [it] = next.splice(i, 1);
      next.unshift(it);
      return next;
    });

  const addManual = () => {
    const key = manualKey.trim();
    if (!key) return;
    const url = /^https?:\/\//.test(key) ? key : `${MEDIA_BASE}/${key.replace(/^\/+/, '')}`;
    setImages((prev) => [
      ...prev,
      { _key: seq.current++, s3Key: key, thumbKey: '', supplierUrl: '', width: '', height: '', url, status: 'ready' },
    ]);
    setManualKey('');
  };

  const saved = images.filter((im) => im.s3Key && im.status === 'ready');
  const busy = images.some((im) => im.status === 'uploading');

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-heading">Images</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-2/10' : 'border-line-strong hover:border-accent/60'
        }`}
      >
        <p className="text-ink font-medium">Drop images here or click to upload</p>
        <p className="text-muted text-xs mt-1">
          JPG / PNG / WebP / AVIF · up to 12 MB · the first image is the primary
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) uploadFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((im, i) => (
            <div key={im._key} className="relative group rounded-lg overflow-hidden border border-line bg-surface-2">
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="w-full h-full object-cover" />
              </div>
              {i === 0 && (
                <span className="absolute top-1 start-1 text-[10px] font-bold bg-accent text-white px-1.5 py-0.5 rounded">
                  Primary
                </span>
              )}
              {im.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/50 grid place-items-center text-white text-xs">Uploading…</div>
              )}
              {im.status === 'error' && (
                <div className="absolute inset-0 bg-red-900/70 grid place-items-center text-white text-[10px] p-2 text-center">
                  {im.error}
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-2 py-1 text-white text-sm">
                <button type="button" title="Move earlier" onClick={() => move(im._key, -1)} disabled={i === 0} className="disabled:opacity-30">
                  ◄
                </button>
                <button type="button" title="Make primary" onClick={() => makePrimary(im._key)} disabled={i === 0} className="disabled:opacity-30">
                  ★
                </button>
                <button type="button" title="Move later" onClick={() => move(im._key, 1)} disabled={i === images.length - 1} className="disabled:opacity-30">
                  ►
                </button>
                <button type="button" title="Remove" onClick={() => remove(im._key)} className="text-red-300">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Add by existing S3 key</summary>
        <div className="flex gap-2 mt-2">
          <input
            value={manualKey}
            onChange={(e) => setManualKey(e.target.value)}
            placeholder="product-images/…/0-display.webp"
            className={inputCls}
          />
          <button type="button" onClick={addManual} className="px-3 py-2 rounded-lg border border-line text-ink text-sm shrink-0">
            Add
          </button>
        </div>
      </details>

      {busy && <p className="text-accent text-xs">Uploading… saving is disabled until it finishes.</p>}

      <input
        type="hidden"
        name="imagesJson"
        value={JSON.stringify(
          saved.map((im) => ({
            s3Key: im.s3Key,
            thumbKey: im.thumbKey,
            supplierUrl: im.supplierUrl,
            width: im.width,
            height: im.height,
          })),
        )}
      />
    </section>
  );
}
