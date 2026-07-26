'use client';

import { useRef, useState } from 'react';

// Single cover image for a project. Uploads to S3 (kind=project) or takes a
// manual key (e.g. an HLS video cover). Emits `coverKey` + `coverType`.

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '');
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

function resolveUrl(key: string): string {
  return /^https?:\/\//.test(key) ? key : `${MEDIA_BASE}/${key.replace(/^\/+/, '')}`;
}

export default function CoverUploader({
  initialKey = '',
  initialType = '',
  initialUrl = null,
  onBusyChange,
}: {
  initialKey?: string;
  initialType?: 'image' | 'video' | '';
  initialUrl?: string | null;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [type, setType] = useState<'image' | 'video' | ''>(initialType);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [manualType, setManualType] = useState<'image' | 'video'>('image');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setStatus('uploading');
    setError('');
    onBusyChange?.(true);
    setUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'project');
      const res = await fetch('/api/dashboard/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setKey(data.key);
      setUrl(data.url);
      setType('image');
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    } finally {
      onBusyChange?.(false);
    }
  };

  const addManual = () => {
    const k = manualKey.trim();
    if (!k) return;
    setKey(k);
    setType(manualType);
    setUrl(resolveUrl(k));
    setManualKey('');
  };

  const clear = () => {
    setKey('');
    setType('');
    setUrl(null);
    setStatus('idle');
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-heading">Cover</h2>

      <div className="flex flex-wrap items-start gap-4">
        <div className="w-56 shrink-0">
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer aspect-video rounded-lg border-2 border-dashed border-line-strong hover:border-accent/60 overflow-hidden grid place-items-center bg-surface-2 relative"
          >
            {url ? (
              type === 'video' ? (
                <div className="text-muted text-xs">▶ video cover</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <span className="text-muted text-xs px-4 text-center">Click to upload a cover image</span>
            )}
            {status === 'uploading' && (
              <div className="absolute inset-0 bg-black/50 grid place-items-center text-white text-xs">Uploading…</div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
          {key && (
            <button type="button" onClick={clear} className="mt-2 text-xs text-red-300 hover:underline">
              Remove cover
            </button>
          )}
        </div>

        <div className="flex-1 min-w-[16rem] space-y-2">
          {status === 'error' && <p className="text-red-300 text-xs">{error}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Set by existing S3 key (e.g. HLS video)</summary>
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
                placeholder="projects/…/cover/master.m3u8"
                className={`${inputCls} flex-1 min-w-[12rem]`}
              />
              <button type="button" onClick={addManual} className="px-3 py-2 rounded-lg border border-line text-ink text-sm shrink-0">
                Set
              </button>
            </div>
          </details>
          {key && (
            <p className="text-muted text-xs break-all">
              {type} · {key}
            </p>
          )}
        </div>
      </div>

      <input type="hidden" name="coverKey" value={key} />
      <input type="hidden" name="coverType" value={type} />
    </section>
  );
}
