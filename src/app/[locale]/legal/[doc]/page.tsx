import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LOCALES, isLocale } from '@/i18n/config';
import { getContactSettings, getContentBlocks } from '@/lib/content';
import { SITE_URL, pageMetadata } from '@/lib/seo';
import { requirePagePublished } from '@/lib/sitePages.server';
import { legalDoc, LEGAL_DOCS, type LegalDocKind } from '@/lib/legal';

export const revalidate = 86400;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, doc })));
}

const COMPANY = 'Attractive Home';

function isDoc(value: string): value is LegalDocKind {
  return (LEGAL_DOCS as string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) return {};
  const settings = await getContactSettings();
  const data = legalDoc(doc, { companyName: COMPANY, email: settings.email, siteUrl: SITE_URL });
  return pageMetadata({
    locale,
    path: `/legal/${doc}`,
    title: data.title,
    description: data.intro.slice(0, 160),
  });
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) notFound();
  await requirePagePublished('legal', locale);

  const [settings, blocks] = await Promise.all([getContactSettings(), getContentBlocks(locale)]);
  const data = legalDoc(doc, {
    companyName: COMPANY,
    email: settings.email,
    siteUrl: SITE_URL,
    address: blocks['contact.address'],
  });

  return (
    <div className="container mx-auto max-w-3xl px-6 py-20 sm:px-8">
      <h1 className="mb-3 text-3xl font-bold text-heading sm:text-4xl">{data.title}</h1>
      <p className="mb-10 text-sm text-muted">Last updated: {data.updated}</p>
      <p className="mb-10 leading-relaxed text-ink">{data.intro}</p>

      <div className="space-y-10">
        {data.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-3 text-xl font-semibold text-heading">{section.heading}</h2>
            <div className="space-y-4 leading-relaxed text-ink/90">
              {section.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
