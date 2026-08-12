import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

export default function WhereWeWork({ dict }: { dict: Dictionary }) {
  const areas = Array.isArray(dict.areas) ? (dict.areas as string[]) : [];

  return (
    <Section tone="creamAlt">
      <div className="max-w-3xl">
        <Eyebrow>{t(dict, 'areasLabel')}</Eyebrow>
        <Heading tone="creamAlt">{t(dict, 'areasHeading')}</Heading>
        <p className="mt-4 text-base sm:text-lg leading-relaxed">{t(dict, 'areasIntro')}</p>
      </div>

      <ul className="mt-10 flex flex-wrap gap-3">
        {areas.map((area) => (
          <li
            key={area}
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: '#FFFFFF', color: '#0D1822', border: `1px solid ${GOLD}` }}
          >
            {area}
          </li>
        ))}
      </ul>
    </Section>
  );
}
