import { t, type Dictionary } from '@/i18n/getDictionary';
import { Section, Eyebrow, Heading } from './primitives';

export default function Introduction({ dict }: { dict: Dictionary }) {
  return (
    <Section tone="cream">
      <div className="max-w-3xl">
        <Eyebrow>{t(dict, 'introLabel')}</Eyebrow>
        <Heading tone="cream">{t(dict, 'introHeading')}</Heading>
        <div className="mt-6 space-y-5 text-base sm:text-lg leading-relaxed">
          <p>{t(dict, 'introP1')}</p>
          <p>{t(dict, 'introP2')}</p>
          <p>{t(dict, 'introP3')}</p>
        </div>
      </div>
    </Section>
  );
}
