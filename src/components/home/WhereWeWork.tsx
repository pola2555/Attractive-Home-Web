import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading } from './primitives';

export default function WhereWeWork({ dict }: { dict: Dictionary }) {
  const areas = Array.isArray(dict.areas) ? (dict.areas as string[]) : [];

  return (
    <Section tone="cream">
      <Eyebrow>{t(dict, 'areasLabel')}</Eyebrow>
      {/* Heading spans the full container (one line, like the old site); only
          the body paragraph is narrowed. */}
      <Heading tone="cream">{t(dict, 'areasHeading')}</Heading>
      <p className="mt-5 max-w-3xl text-base sm:text-lg leading-relaxed" style={{ color: '#5A6873' }}>
        {t(dict, 'areasIntro')}
      </p>

      {/* Outline chips with no fill — they sit directly on the cream band, so
          only the thin tan border separates them (matches the old site). */}
      <ul className="mt-10 flex flex-wrap gap-3">
        {areas.map((area) => (
          <li
            key={area}
            className="rounded-full border px-4 py-2 text-sm sm:text-[15px]"
            style={{ borderColor: '#E3D5BF', color: '#0D1822' }}
          >
            {area}
          </li>
        ))}
      </ul>
    </Section>
  );
}
