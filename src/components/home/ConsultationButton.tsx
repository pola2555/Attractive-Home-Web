'use client';

import { track } from '@/lib/analytics/track';
import SocialIcon from '../SocialIcon';

// Primary WhatsApp CTA used in the hero and the closing section. Fires
// whatsapp_click with its placement so entry points stay comparable. Styled to
// match the old site's ConsultationButton exactly: a cream pill with a dark
// label and the WhatsApp glyph, full width on phones and auto from sm up.
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
      className="w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-full font-semibold text-sm sm:text-base px-6 py-3 sm:px-8 sm:py-4 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{ backgroundColor: '#F3E3CE', color: '#0D1822' }}
    >
      <SocialIcon platform="whatsapp" className="w-5 h-5 sm:w-6 sm:h-6" />
      {label}
    </a>
  );
}
