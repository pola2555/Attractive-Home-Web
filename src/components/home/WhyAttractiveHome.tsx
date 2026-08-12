import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

export default function WhyAttractiveHome({ dict }: { dict: Dictionary }) {
  const cols = [1, 2, 3, 4].map((n) => ({
    title: t(dict, `why${n}Title`),
    body: t(dict, `why${n}Body`),
  }));

  return (
    <Section tone="navy">
      <div className="max-w-3xl">
        <Eyebrow>{t(dict, 'whyLabel')}</Eyebrow>
        <Heading tone="navy">{t(dict, 'whyHeading')}</Heading>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {cols.map((col) => (
          <div key={col.title} className="ps-5" style={{ borderInlineStart: `2px solid ${GOLD}` }}>
            <h3 className="text-lg font-semibold text-white">{col.title}</h3>
            <p className="mt-2 leading-relaxed">{col.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
