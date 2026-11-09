import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Heading } from './primitives';
import ConsultationButton from './ConsultationButton';

export default function BottomCta({ dict, whatsapp }: { dict: Dictionary; whatsapp: string }) {
  return (
    <Section tone="navyDeep">
      <div className="text-center">
        <div className="mx-auto max-w-3xl">
          <Heading tone="navyDeep">{t(dict, 'bottomCtaHeading')}</Heading>
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-relaxed">{t(dict, 'bottomCtaBody')}</p>
        <div className="mt-8 sm:mt-10">
          <ConsultationButton number={whatsapp} label={t(dict, 'ctaConsultation')} location="home_bottom_cta" />
        </div>
        <p className="mt-5 text-sm" style={{ color: '#7C8A96' }}>
          {t(dict, 'bottomCtaNote')}
        </p>
      </div>
    </Section>
  );
}
