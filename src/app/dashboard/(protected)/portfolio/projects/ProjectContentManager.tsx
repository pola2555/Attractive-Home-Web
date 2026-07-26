'use client';

import { useRef, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { SectionInput, ProjectMediaInput } from '@/lib/portfolioAdmin';

// Sections + media for a project, managed together because each media item may
// reference a section id. Uploads go to S3 via /api/dashboard/media/upload
// (kind=project); serialises into the form's `sectionsJson` + `mediaJson`.
// Falls back to manual key entry when uploads aren't configured.

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '');
const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

type Section = { id: string; names: Record<Locale, string> };
type Media = {
  _key: number;
  mediaType: 'image' | 'video';
  s3Key: string;
  sectionId: string;
  alt: string;
  caption: string;
  url: string;
  status: 'ready' | 'uploading' | 'error';
  error?: string;
};

function emptyNames(): Record<Locale, string> {
  return { en: '', ar: '', fr: '', ru: '' };
}
function resolveUrl(key: string): string {
  return /^https?:\/\//.test(key) ? key : `${MEDIA_BASE}/${key.replace(/^\/+/, '')}`;
}

export default function ProjectContentManager({
  initialSections,
  initialMedia,
  onBusyChange,
}: {
  initialSections?: SectionInput[];
  initialMedia?: ProjectMediaInput[];
  onBusyChange?: (busy: boolean) => void;
}) {
  const [sections, setSections] = useState<Section[]>(() =>
    (initialSections ?? []).map((s) => ({ id: s.id, names: { ...emptyNames(), ...s.names } })),
  );
  const [media, setMedia] = useState<Media[]>(() =>
    (initialMedia ?? []).map((m, i) => ({
      _key: i,
      mediaType: m.mediaType,
      s3Key: m.s3Key,
      sectionId: m.sectionId,
      alt: m.alt,
      caption: m.caption,
      url: m.url,
      status: 'ready' as const,
    })),
  );
  const [dragging, setDragging] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [manualType, setManualType] = useState<'image' | 'video'>('image');
  const seq = useRef(1_000_000);
  const pending = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const bump = (n: number) => {
    pending.current += n;
    onBusyChange?.(pending.current > 0);
  };

  // --- sections ---
  const addSection = () =>
    setSections((prev) => [...prev, { id: crypto.randomUUID(), names: emptyNames() }]);
  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setMedia((prev) => prev.map((m) => (m.sectionId === id ? { ...m, sectionId: '' } : m)));
  };
  const moveSection = (id: string, dir: -1 | 1) =>
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const setSectionName = (id: string, locale: Locale, value: string) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, names: { ...s.names, [locale]: value } } : s)));

  // --- media ---
  const uploadOne = async (file: File) => {
    const _key = seq.current++;
    bump(1);
    const objectUrl = URL.createObjectURL(file);
    setMedia((prev) => [
      ...prev,
      { _key, mediaType: 'image', s3Key: '', sectionId: '', alt: '', caption: '', url: objectUrl, status: 'uploading' },
    ]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'project');
      const res = await fetch('/api/dashboard/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMedia((prev) =>
        prev.map((m) => (m._key === _key ? { ...m, s3Key: data.key, url: data.url, status: 'ready' } : m)),
      );
    } catch (e) {
      setMedia((prev) =>
        prev.map((m) => (m._key === _key ? { ...m, status: 'error', error: (e as Error).message } : m)),
      );
    } finally {
      bump(-1);
    }
  };
  const uploadFiles = (files: File[]) => {
    for (const file of files) if (file.type.startsWith('image/')) void uploadOne(file);
  };
  const addManual = () => {
    const key = manualKey.trim();
    if (!key) return;
    setMedia((prev) => [
      ...prev,
      {
        _key: seq.current++,
        mediaType: manualType,
        s3Key: key,
        sectionId: '',
        alt: '',
        caption: '',
        url: resolveUrl(key),
        status: 'ready',
      },
    ]);
    setManualKey('');
  };
  const removeMedia = (key: number) => setMedia((prev) => prev.filter((m) => m._key !== key));
  const moveMedia = (key: number, dir: -1 | 1) =>
    setMedia((prev) => {
      const i = prev.findIndex((m) => m._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const patchMedia = (key: number, patch: Partial<Media>) =>
    setMedia((prev) => prev.map((m) => (m._key === key ? { ...m, ...patch } : m)));

  const savedMedia = media.filter((m) => m.s3Key && m.status === 'ready');
  const savedSections = sections.filter((s) => s.names.en.trim());
  const busy = media.some((m) => m.status === 'uploading');

  return (
    <section className="space-y-8">
      {/* Sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-heading">Sections</h2>
          <button type="button" onClick={addSection} className="text-sm text-accent hover:underline">
            + Add section
          </button>
        </div>
        <p className="text-muted text-xs">
          Optional groupings (e.g. “Kitchen”, “Living room”). Media can be assigned to a section below.
        </p>
        {sections.length === 0 && <p className="text-muted text-sm">No sections — media shows under “Other”.</p>}
        {sections.map((s, i) => (
          <div key={s.id} className="rounded-lg border border-line p-3 bg-surface/40 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={s.names.en}
                onChange={(e) => setSectionName(s.id, 'en', e.target.value)}
                placeholder="Section name (English)"
                className={inputCls}
              />
              <button type="button" title="Move up" onClick={() => moveSection(s.id, -1)} disabled={i === 0} className="px-2 text-ink disabled:opacity-30">
                ▲
              </button>
              <button type="button" title="Move down" onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1} className="px-2 text-ink disabled:opacity-30">
                ▼
              </button>
              <button type="button" title="Remove" onClick={() => removeSection(s.id)} className="px-2 text-red-300">
                ✕
              </button>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Other languages</summary>
              <div className="grid sm:grid-cols-3 gap-2 mt-2">
                {LOCALES.filter((l) => l !== 'en').map((locale) => (
                  <input
                    key={locale}
                    value={s.names[locale]}
                    onChange={(e) => setSectionName(s.id, locale, e.target.value)}
                    placeholder={LOCALE_LABEL[locale]}
                    dir={dirOf(locale)}
                    className={inputCls}
                  />
                ))}
              </div>
            </details>
          </div>
        ))}
      </div>

      {/* Media */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Media</h2>

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
            JPG / PNG / WebP / AVIF · up to 12 MB · order sets how they appear on the project page
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

        {media.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {media.map((m, i) => (
              <div key={m._key} className="rounded-lg border border-line bg-surface-2 overflow-hidden">
                <div className="relative aspect-video bg-surface">
                  {m.mediaType === 'video' ? (
                    <div className="w-full h-full grid place-items-center text-muted text-xs">▶ video</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  )}
                  {m.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/50 grid place-items-center text-white text-xs">Uploading…</div>
                  )}
                  {m.status === 'error' && (
                    <div className="absolute inset-0 bg-red-900/70 grid place-items-center text-white text-[10px] p-2 text-center">
                      {m.error}
                    </div>
                  )}
                  <div className="absolute top-1 end-1 flex gap-1 text-white text-xs">
                    <button type="button" title="Move earlier" onClick={() => moveMedia(m._key, -1)} disabled={i === 0} className="bg-black/50 rounded px-1 disabled:opacity-30">
                      ◄
                    </button>
                    <button type="button" title="Move later" onClick={() => moveMedia(m._key, 1)} disabled={i === media.length - 1} className="bg-black/50 rounded px-1 disabled:opacity-30">
                      ►
                    </button>
                    <button type="button" title="Remove" onClick={() => removeMedia(m._key)} className="bg-black/50 rounded px-1 text-red-300">
                      ✕
                    </button>
                  </div>
                </div>
                <div className="p-2 space-y-1.5">
                  <select
                    value={m.sectionId}
                    onChange={(e) => patchMedia(m._key, { sectionId: e.target.value })}
                    className="w-full px-2 py-1 bg-surface text-ink rounded border border-line-strong text-xs"
                  >
                    <option value="">Other (no section)</option>
                    {savedSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.names.en}
                      </option>
                    ))}
                  </select>
                  <input
                    value={m.alt}
                    onChange={(e) => patchMedia(m._key, { alt: e.target.value })}
                    placeholder="Alt text (SEO)"
                    className="w-full px-2 py-1 bg-surface text-ink rounded border border-line-strong text-xs"
                  />
                  <input
                    value={m.caption}
                    onChange={(e) => patchMedia(m._key, { caption: e.target.value })}
                    placeholder="Caption"
                    className="w-full px-2 py-1 bg-surface text-ink rounded border border-line-strong text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Add by existing S3 key (e.g. a transcoded video)</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <select
              value={manualType}
              onChange={(e) => setManualType(e.target.value as 'image' | 'video')}
              className="px-2 py-2 bg-surface text-ink rounded-lg border border-line-strong text-sm"
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
            <input
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
              placeholder="projects/…/media/master.m3u8"
              className={`${inputCls} flex-1 min-w-[14rem]`}
            />
            <button type="button" onClick={addManual} className="px-3 py-2 rounded-lg border border-line text-ink text-sm shrink-0">
              Add
            </button>
          </div>
        </details>

        {busy && <p className="text-accent text-xs">Uploading… saving is disabled until it finishes.</p>}
      </div>

      <input type="hidden" name="sectionsJson" value={JSON.stringify(savedSections.map((s) => ({ id: s.id, names: s.names })))} />
      <input
        type="hidden"
        name="mediaJson"
        value={JSON.stringify(
          savedMedia.map((m) => ({
            mediaType: m.mediaType,
            s3Key: m.s3Key,
            sectionId: m.sectionId,
            alt: m.alt,
            caption: m.caption,
          })),
        )}
      />
    </section>
  );
}
