import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

// Four selling points on the dark navy band — plain columns (not cards), each
// with a short caramel rule above the title, matching the old site.
export default function WhyAttractiveHome({ dict }: { dict: Dictionary }) {
  const cols = [1, 2, 3, 4].map((n) => ({
    title: t(dict, `why${n}Title`),
    body: t(dict, `why${n}Body`),
  }));

  return (
    <Section tone="navyDeep">
      <Eyebrow>{t(dict, 'whyLabel')}</Eyebrow>
      <Heading tone="navyDeep">{t(dict, 'whyHeading')}</Heading>

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
        {cols.map((col) => (
          <div key={col.title}>
            <span aria-hidden="true" className="block w-10 border-t-2" style={{ borderColor: GOLD }} />
            <h3 className="mt-5 text-base sm:text-lg font-bold leading-snug" style={{ color: '#F3E3CE' }}>
              {col.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed">{col.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
