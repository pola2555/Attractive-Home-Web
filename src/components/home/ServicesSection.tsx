import Link from 'next/link';
import { t, type Dictionary } from '@/i18n/getDictionary';
import type { Locale } from '@/i18n/config';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

// Four connected services on the dark navy band — matches the old site's card
// treatment (lighter #111E29 panels with a slate border, caramel index, cream
// title). Cards 1–3 open the portfolio categories; card 4 (furniture/joinery)
// opens the live catalog — an upgrade over the old site, where the catalog was
// hidden behind a launch flag.
export default function ServicesSection({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const cards = [
    { title: t(dict, 'svc1Title'), body: t(dict, 'svc1Body'), href: `/${locale}/portfolio/architectural` },
    { title: t(dict, 'svc2Title'), body: t(dict, 'svc2Body'), href: `/${locale}/portfolio/interior` },
    { title: t(dict, 'svc3Title'), body: t(dict, 'svc3Body'), href: `/${locale}/portfolio/fit` },
    { title: t(dict, 'svc4Title'), body: t(dict, 'svc4Body'), href: `/${locale}/catalog` },
  ];

  return (
    <Section tone="navyDeep">
      <Eyebrow>{t(dict, 'servicesLabel')}</Eyebrow>
      <Heading tone="navyDeep">{t(dict, 'servicesHeading')}</Heading>
      <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed">{t(dict, 'servicesIntro')}</p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {cards.map((card, i) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block rounded-xl border border-[#22323F] bg-[#111E29] p-7 sm:p-8 h-full transition-colors hover:border-[#C08B5C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C08B5C]"
          >
            <span className="block text-xs font-semibold tracking-[0.2em]" style={{ color: GOLD }}>
              0{i + 1}
            </span>
            <h3 className="mt-5 text-xl sm:text-2xl font-bold" style={{ color: '#F3E3CE' }}>
              {card.title}
            </h3>
            <p className="mt-4 text-[15px] sm:text-base leading-relaxed">{card.body}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}
