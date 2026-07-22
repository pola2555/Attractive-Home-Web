'use client';

import { useState } from 'react';
import SmartImage from './SmartImage';

export type GalleryImage = { src: string; fallback: string | null };

// Main image + thumbnail strip. Alt text is the translated product name
// (docs/DATABASE.md §5 — derived at render, no per-image i18n).
export default function ProductGallery({ images, alt }: { images: GalleryImage[]; alt: string }) {
  const [index, setIndex] = useState(0);
  if (!images.length) {
    return <div className="aspect-square bg-surface-2 rounded-lg" aria-hidden="true" />;
  }
  const current = images[Math.min(index, images.length - 1)];

  return (
    <div className="space-y-3">
      <div className="aspect-square bg-surface-2 rounded-lg overflow-hidden">
        <SmartImage
          key={current.src}
          src={current.src}
          fallbackSrc={current.fallback}
          alt={alt}
          loading="eager"
          className="w-full h-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {images.slice(0, 12).map((image, i) => (
            <button
              key={image.src}
              onClick={() => setIndex(i)}
              aria-label={`${alt} ${i + 1}`}
              className={`aspect-square bg-surface-2 rounded overflow-hidden border-2 transition-colors ${
                i === index ? 'border-accent' : 'border-transparent hover:border-line-strong'
              }`}
            >
              <SmartImage
                src={image.src}
                fallbackSrc={image.fallback}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
