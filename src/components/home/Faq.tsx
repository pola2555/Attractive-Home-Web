import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading } from './primitives';

// Native <details>/<summary> accordion (no JS), open by default and left-aligned
// to match the old site. The +/- is two bars; on open the vertical one rotates
// onto the horizontal one and reads as a minus. The FAQPage JSON-LD is emitted
// by the home page from the same strings.
export default function Faq({ dict }: { dict: Dictionary }) {
  const items = [1, 2, 3, 4, 5].map((n) => ({
    q: t(dict, `faq${n}Q`),
    a: t(dict, `faq${n}A`),
  }));

  return (
    <Section tone="creamAlt">
      <Eyebrow>{t(dict, 'faqLabel')}</Eyebrow>
      <Heading tone="creamAlt">{t(dict, 'faqHeading')}</Heading>

      <div className="mt-10 max-w-4xl border-t border-[#E3D5BF]">
        {items.map((item) => (
          <details key={item.q} open className="group border-b border-[#E3D5BF]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C08B5C]">
              <h3 className="text-base sm:text-lg font-bold leading-snug text-[#0D1822]">{item.q}</h3>
              <span aria-hidden="true" className="relative h-4 w-4 shrink-0">
                <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-[#C08B5C]" />
                <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-[#C08B5C] transition-transform duration-200 group-open:rotate-90" />
              </span>
            </summary>
            <p className="pb-6 pe-10 text-[15px] sm:text-base leading-relaxed text-[#5A6873]">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
