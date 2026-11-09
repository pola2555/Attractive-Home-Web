import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading } from './primitives';

// Five-step process band, under the Services section — matches the old site:
// a single row on desktop (steps down to two, then one), with a dark-navy
// numbered disc ABOVE each step title. Marked up as an <ol> so the numbers are
// a real ordered sequence; the disc is aria-hidden since the list conveys order.
export default function HowWeWork({ dict }: { dict: Dictionary }) {
  const steps = [1, 2, 3, 4, 5].map((n) => ({
    title: t(dict, `step${n}Title`),
    body: t(dict, `step${n}Body`),
  }));

  return (
    <Section tone="cream">
      <Eyebrow>{t(dict, 'processLabel')}</Eyebrow>
      <Heading tone="cream">{t(dict, 'processHeading')}</Heading>

      <ol className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-10">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
              style={{ backgroundColor: '#0D1822', color: '#F3E3CE' }}
            >
              {i + 1}
            </span>
            <h3 className="mt-5 text-base sm:text-lg font-bold leading-snug" style={{ color: '#0D1822' }}>
              {step.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: '#5A6873' }}>
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
