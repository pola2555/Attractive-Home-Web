import Link from 'next/link';
import SocialIcon from './SocialIcon';
import TrackedLink from './analytics/TrackedLink';
import type { Locale } from '@/i18n/config';

// Ported from the old Footer.jsx (flex-wrap icon layout). Social links come
// from the DB setting `social.links` — adding a network is a dashboard edit,
// not a deploy (docs/DATABASE.md §7).

export type FooterLabels = {
  aboutUs: string;
  contacts: string;
  services: string;
  portfolio: string;
  architectural: string;
  interior: string;
  fitOut: string;
  companyName: string;
  rights: string;
  privacy: string;
  terms: string;
};

type SocialLink = { platform: string; url: string };

export default function Footer({
  locale,
  labels,
  socialLinks,
  visible,
}: {
  locale: Locale;
  labels: FooterLabels;
  socialLinks: SocialLink[];
  // Which footer-eligible pages are shown (managed at /dashboard/pages). A
  // hidden page drops its link(s); missing key defaults to shown.
  visible?: Record<string, boolean>;
}) {
  const href = (path: string) => `/${locale}${path}`;
  const shown = (key: string) => visible?.[key] ?? true;
  const leftLinks = [
    { label: labels.aboutUs, path: '/about', show: shown('about') },
    { label: labels.contacts, path: '/contacts', show: shown('contacts') },
    { label: labels.services, path: '/services', show: shown('services') },
  ].filter((l) => l.show);
  // The portfolio column (and its three category links) all hang off the one
  // portfolio page's visibility.
  const middleLinks = shown('portfolio')
    ? [
        { label: labels.portfolio, path: '/portfolio' },
        { label: labels.architectural, path: '/portfolio/architectural' },
        { label: labels.interior, path: '/portfolio/interior' },
        { label: labels.fitOut, path: '/portfolio/fit' },
      ]
    : [];

  return (
    <footer className="relative text-ink py-32 overflow-hidden bg-bg-deep">
      <div className="container mx-auto px-12 relative z-0">
        <div className="grid grid-cols-1 space-y-6 gap-8 2xl:gap-32 sm:grid-cols-3 sm:space-y-0">
          <div>
            <ul className="font-semibold space-y-12 uppercase">
              {leftLinks.map((l) => (
                <li key={l.path}>
                  <Link href={href(l.path)} className="hover:text-gray-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ul className="font-semibold space-y-12 uppercase">
              {middleLinks.map((l) => (
                <li key={l.path}>
                  <Link href={href(l.path)} className="hover:text-gray-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-start">
            <h2 className="font-bold text-3xl mb-10">{labels.companyName}</h2>
            <p className="text-sm mb-10">{labels.rights}</p>
            <div className="flex justify-start gap-6 flex-wrap">
              {socialLinks.map((item) => {
                const isWhatsapp = item.platform.toLowerCase() === 'whatsapp';
                return (
                  <TrackedLink
                    key={item.url}
                    event={isWhatsapp ? 'whatsapp_click' : 'social_click'}
                    params={isWhatsapp ? { location: 'footer' } : { location: 'footer', network: item.platform }}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.platform}
                  >
                    <div className="w-8 h-8 rounded-full bg-white flex justify-center items-center shadow-md transition-transform duration-200 transform hover:scale-110">
                      <SocialIcon platform={item.platform} className="w-5 h-5 text-black" />
                    </div>
                  </TrackedLink>
                );
              })}
            </div>
            {shown('legal') && (
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link href={href('/legal/privacy')} className="hover:text-gray-300">
                  {labels.privacy}
                </Link>
                <Link href={href('/legal/terms')} className="hover:text-gray-300">
                  {labels.terms}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
