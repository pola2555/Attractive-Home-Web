import Link from 'next/link';
import { t, type Dictionary } from '@/i18n/getDictionary';
import type { Locale } from '@/i18n/config';
import { Section, Eyebrow, Heading, GOLD } from './primitives';

// Four connected services. Cards 1–3 open the portfolio categories; card 4
// (furniture/joinery) opens the live catalog — an upgrade over the old site,
// where the catalog was hidden behind a launch flag.
export default function ServicesSection({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const cards = [
    { title: t(dict, 'svc1Title'), body: t(dict, 'svc1Body'), href: `/${locale}/portfolio/architectural` },
    { title: t(dict, 'svc2Title'), body: t(dict, 'svc2Body'), href: `/${locale}/portfolio/interior` },
    { title: t(dict, 'svc3Title'), body: t(dict, 'svc3Body'), href: `/${locale}/portfolio/fit` },
    { title: t(dict, 'svc4Title'), body: t(dict, 'svc4Body'), href: `/${locale}/catalog` },
  ];

  return (
    <Section tone="navy">
      <div className="max-w-3xl">
        <Eyebrow>{t(dict, 'servicesLabel')}</Eyebrow>
        <Heading tone="navy">{t(dict, 'servicesHeading')}</Heading>
        <p className="mt-4 text-base sm:text-lg leading-relaxed">{t(dict, 'servicesIntro')}</p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {cards.map((card, i) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block rounded-xl p-6 sm:p-7 transition-transform hover:-translate-y-1"
            style={{ backgroundColor: '#0D1822', border: '1px solid rgba(192,139,92,0.25)' }}
          >
            <span className="text-sm font-semibold" style={{ color: GOLD }}>
              0{i + 1}
            </span>
            <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
            <p className="mt-3 leading-relaxed">{card.body}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}
