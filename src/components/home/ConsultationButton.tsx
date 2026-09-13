'use client';

import { track } from '@/lib/analytics/track';

// Primary WhatsApp CTA used in the hero and the closing section. Fires
// whatsapp_click with its placement so entry points stay comparable, matching
// the old site's ConsultationButton.
export default function ConsultationButton({
  number,
  label,
  location,
}: {
  number: string;
  label: string;
  location: string;
}) {
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('whatsapp_click', { location })}
      className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold shadow-lg transition-transform hover:scale-[1.03]"
      style={{ backgroundColor: '#C08B5C', color: '#0D1822' }}
    >
      {label}
    </a>
  );
}
