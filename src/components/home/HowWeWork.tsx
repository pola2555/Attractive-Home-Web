import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

export default function HowWeWork({ dict }: { dict: Dictionary }) {
  const steps = [1, 2, 3, 4, 5].map((n) => ({
    title: t(dict, `step${n}Title`),
    body: t(dict, `step${n}Body`),
  }));

  return (
    <Section tone="cream">
      <div className="max-w-3xl">
        <Eyebrow>{t(dict, 'processLabel')}</Eyebrow>
        <Heading tone="cream">{t(dict, 'processHeading')}</Heading>
      </div>

      <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="relative ps-14">
            <span
              className="absolute start-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: GOLD, color: '#0D1822' }}
            >
              {i + 1}
            </span>
            <h3 className="text-lg font-semibold" style={{ color: '#0D1822' }}>
              {step.title}
            </h3>
            <p className="mt-2 leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
