import { uuidv7 } from 'uuidv7';
import type { PrismaClient } from '@prisma/client';

type BlockSeed = {
  key: string;
  notes: string;
  // A row exists only when there is real content (docs/DATABASE.md §3) —
  // locales identical to `en` are omitted; missing locale = fallback to en.
  translations: Partial<Record<'en' | 'ar' | 'fr' | 'ru', string>>;
};

// docs/DATABASE.md §7 — ONLY admin-editable marketing atoms. UI chrome strings
// stay in code i18n files. Copy sourced from the old repo i18n namespaces:
// about.json, home.json, contacts.json (address), visualizer.json (facts).
const BLOCKS: BlockSeed[] = [
  {
    key: 'home.title',
    notes: 'Hero title on the home page (identical in every language)',
    translations: { en: 'Attractive Home' },
  },
  {
    key: 'home.subtitle',
    notes: 'Hero subtitle on the home page',
    translations: {
      en: 'Interior Design and Fit-Out',
      ar: 'التصميم الداخلي والتشطيبات',
      fr: "Design d'intérieur et aménagement",
      ru: 'Дизайн интерьера и отделка',
    },
  },
  {
    key: 'about.intro',
    notes: 'About page intro paragraph ("since 2013" copy)',
    translations: {
      en: 'Since 2013, Attractive Home has been bringing creative architectural, interior, and fit-out solutions that combine elegance, functionality, and artistry. We transform spaces into personalized expressions of style and comfort.',
      ar: 'منذ عام 2013، تقدّم Attractive Home حلولاً معمارية وداخلية وتشطيبية مبتكرة تجمع بين الأناقة والوظيفية والإبداع. نحوّل المساحات إلى تعبير شخصي عن الذوق والراحة.',
      fr: "Depuis 2013, Attractive Home propose des solutions créatives en architecture, design d'intérieur et aménagement, alliant élégance, fonctionnalité et sens artistique. Nous transformons les espaces en expressions personnalisées de style et de confort.",
      ru: 'С 2013 года Attractive Home предлагает креативные решения в области архитектуры, дизайна интерьера и отделки, сочетающие элегантность, функциональность и художественный вкус. Мы превращаем пространства в персональное выражение стиля и комфорта.',
    },
  },
  {
    key: 'about.map_title',
    notes: 'Heading above the portfolio map on the about page ("100+ projects" stat)',
    translations: {
      en: 'Over 100 Projects Across Dubai',
      ar: 'أكثر من 100 مشروع في أنحاء دبي',
      fr: 'Plus de 100 projets à travers Dubaï',
      ru: 'Более 100 проектов по всему Дубаю',
    },
  },
  {
    key: 'about.map_subtitle',
    notes: 'Subheading of the portfolio map on the about page',
    translations: {
      en: 'Explore our portfolio on the map from architectural and interior design to fit-out. Click a marker to view the project.',
      ar: 'استكشف أعمالنا على الخريطة، من التصميم المعماري والداخلي إلى التشطيبات. اضغط على العلامة لعرض المشروع.',
      fr: "Découvrez notre portfolio sur la carte, de la conception architecturale et du design d'intérieur à l'aménagement. Cliquez sur un repère pour voir le projet.",
      ru: 'Изучите наше портфолио на карте — от архитектурного проектирования и дизайна интерьера до отделки. Нажмите на маркер, чтобы посмотреть проект.',
    },
  },
  {
    key: 'contact.address',
    notes:
      'Displayed address on the contacts page (translatable; geo lives in settings contact.geo)',
    translations: {
      en: '79P6+86, Al Qusais, Al Nahda 1, Dubai, United Arab Emirates',
      ar: '79P6+86، القصيص، النهدة 1، دبي، الإمارات العربية المتحدة',
      fr: '79P6+86, Al Qusais, Al Nahda 1, Dubaï, Émirats arabes unis',
      ru: '79P6+86, Аль-Кусайс, Аль-Нахда 1, Дубай, Объединённые Арабские Эмираты',
    },
  },
  // Visualizer intro fact rotator. Facts are aligned across languages by
  // meaning; ar has one extra fact (HQ location) seeded as ar-only fact.6.
  {
    key: 'visualizer.fact.1',
    notes: 'Room Visualizer intro fact 1 ("since 2013" stat)',
    translations: {
      en: 'Creating attractive spaces across the UAE since 2013.',
      ar: 'نصمّم مساحات جذّابة في الإمارات منذ عام 2013.',
      fr: 'Nous créons des espaces attrayants aux Émirats arabes unis depuis 2013.',
      ru: 'Создаём привлекательные пространства по всем ОАЭ с 2013 года.',
    },
  },
  {
    key: 'visualizer.fact.2',
    notes: 'Room Visualizer intro fact 2 ("100+ projects" stat)',
    translations: {
      en: 'Over 100 projects delivered across Dubai.',
      ar: 'أنجزنا أكثر من 100 مشروع في دبي.',
      fr: 'Plus de 100 projets réalisés à travers Dubaï.',
      ru: 'Более 100 проектов реализовано по всему Дубаю.',
    },
  },
  {
    key: 'visualizer.fact.3',
    notes: 'Room Visualizer intro fact 3 (all-in-one studio)',
    translations: {
      en: 'Architecture, interior design & fit-out — all in one studio.',
      ar: 'هندسة معمارية وتصميم داخلي وتشطيبات — في مكان واحد.',
      fr: "Architecture, design d'intérieur et aménagement — le tout dans un même studio.",
      ru: 'Архитектура, дизайн интерьера и отделка — всё в одной студии.',
    },
  },
  {
    key: 'visualizer.fact.4',
    notes: 'Room Visualizer intro fact 4 ("4,000+ materials" stat)',
    translations: {
      en: 'Explore 4,000+ real materials in our catalog.',
      ar: 'استكشف أكثر من 4000 مادة حقيقية في الكتالوج.',
      fr: 'Explorez plus de 4 000 matériaux réels dans notre catalogue.',
      ru: 'Изучите более 4000 реальных материалов в нашем каталоге.',
    },
  },
  {
    key: 'visualizer.fact.5',
    notes: 'Room Visualizer intro fact 5 (construction management / MEP)',
    translations: {
      en: 'From construction management and MEP to the final finishing touch.',
      ar: 'من إدارة الإنشاءات وحلول MEP إلى اللمسة الأخيرة.',
      fr: 'De la gestion de chantier et des solutions MEP à la touche de finition finale.',
      ru: 'От управления строительством и инженерных систем до финальных штрихов отделки.',
    },
  },
  {
    key: 'visualizer.fact.6',
    notes: 'Room Visualizer intro fact 6 (HQ location — exists only in Arabic today)',
    translations: {
      ar: 'مقرّنا في النهدة 1، دبي — ونخدم كل الإمارات.',
    },
  },
];

export async function seedContentBlocks(prisma: PrismaClient): Promise<void> {
  let translationCount = 0;
  for (const block of BLOCKS) {
    const row = await prisma.contentBlock.upsert({
      where: { key: block.key },
      update: {},
      create: { id: uuidv7(), key: block.key, notes: block.notes },
    });
    for (const [localeCode, body] of Object.entries(block.translations)) {
      // update: {} — re-running the seed never clobbers admin-edited copy.
      await prisma.contentBlockTranslation.upsert({
        where: { contentBlockId_localeCode: { contentBlockId: row.id, localeCode } },
        update: {},
        create: { id: uuidv7(), contentBlockId: row.id, localeCode, body },
      });
      translationCount += 1;
    }
  }
  console.log(`  content blocks: ${BLOCKS.length} keys, ${translationCount} translations ensured`);
}
