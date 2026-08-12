import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Heading } from './primitives';
import ConsultationButton from './ConsultationButton';

export default function BottomCta({ dict, whatsapp }: { dict: Dictionary; whatsapp: string }) {
  return (
    <Section tone="navyDeep">
      <div className="max-w-2xl mx-auto text-center">
        <Heading tone="navyDeep">{t(dict, 'bottomCtaHeading')}</Heading>
        <p className="mt-4 text-base sm:text-lg leading-relaxed">{t(dict, 'bottomCtaBody')}</p>
        <div className="mt-8">
          <ConsultationButton number={whatsapp} label={t(dict, 'ctaConsultation')} location="home_bottom_cta" />
        </div>
        <p className="mt-4 text-sm opacity-80">{t(dict, 'bottomCtaNote')}</p>
      </div>
    </Section>
  );
}
