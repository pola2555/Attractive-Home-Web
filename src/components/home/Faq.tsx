import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

// Native <details>/<summary> accordion (no JS) with a +/− affordance, matching
// the old site. The FAQPage JSON-LD is emitted by the home page from the same
// strings.
export default function Faq({ dict }: { dict: Dictionary }) {
  const items = [1, 2, 3, 4, 5].map((n) => ({
    q: t(dict, `faq${n}Q`),
    a: t(dict, `faq${n}A`),
  }));

  return (
    <Section tone="creamAlt">
      <div className="max-w-3xl mx-auto">
        <div className="text-center">
          <Eyebrow>{t(dict, 'faqLabel')}</Eyebrow>
          <Heading tone="creamAlt">{t(dict, 'faqHeading')}</Heading>
        </div>

        <div className="mt-10 divide-y" style={{ borderColor: 'rgba(13,24,34,0.12)' }}>
          {items.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold" style={{ color: '#0D1822' }}>
                {item.q}
                <span
                  className="shrink-0 text-2xl leading-none transition-transform group-open:rotate-45"
                  style={{ color: GOLD }}
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
