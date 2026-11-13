// Config: the founder's sector is an ISIC Rev.4 section, as published by GASTAT in the Saudi
// Standard Industrial Classification (SSIC). Darb's regulations, market indicators and survival model
// use ISIC4 too. The names match reg.isic.<letter> in frontend/translations/en.json and ar.json.
export const ISIC_SECTIONS = {
  A: { en: 'Agriculture, forestry and fishing', ar: 'الزراعة والحراجة وصيد الأسماك' },
  B: { en: 'Mining and quarrying', ar: 'التعدين واستغلال المحاجر' },
  C: { en: 'Manufacturing', ar: 'الصناعة التحويلية' },
  D: { en: 'Electricity, gas, steam and air conditioning supply', ar: 'إمدادات الكهرباء والغاز والبخار وتكييف الهواء' },
  E: { en: 'Water supply; sewerage, waste management and remediation', ar: 'إمدادات المياه وأنشطة الصرف الصحي وإدارة النفايات ومعالجتها' },
  F: { en: 'Construction', ar: 'التشييد' },
  G: { en: 'Wholesale and retail trade; repair of motor vehicles and motorcycles', ar: 'تجارة الجملة والتجزئة وإصلاح المركبات ذات المحركات والدراجات النارية' },
  H: { en: 'Transportation and storage', ar: 'النقل والتخزين' },
  I: { en: 'Accommodation and food service activities', ar: 'أنشطة خدمات الإقامة والطعام' },
  J: { en: 'Information and communication', ar: 'المعلومات والاتصالات' },
  K: { en: 'Financial and insurance activities', ar: 'الأنشطة المالية وأنشطة التأمين' },
  L: { en: 'Real estate activities', ar: 'الأنشطة العقارية' },
  M: { en: 'Professional, scientific and technical activities', ar: 'الأنشطة المهنية والعلمية والتقنية' },
  N: { en: 'Administrative and support service activities', ar: 'الخدمات الإدارية وخدمات الدعم' },
  O: { en: 'Public administration and defence; compulsory social security', ar: 'الإدارة العامة والدفاع، والضمان الاجتماعي الإلزامي' },
  P: { en: 'Education', ar: 'التعليم' },
  Q: { en: 'Human health and social work activities', ar: 'أنشطة صحة الإنسان والعمل الاجتماعي' },
  R: { en: 'Arts, entertainment and recreation', ar: 'الفنون والترفيه والتسلية' },
  S: { en: 'Other service activities', ar: 'أنشطة الخدمات الأخرى' },
  U: { en: 'Activities of extraterritorial organizations and bodies', ar: 'المنظمات والهيئات غير الخاضعة للولاية القضائية الوطنية' },
} as const;

export type IsicSection = keyof typeof ISIC_SECTIONS;
export const ISIC_SECTION_LETTERS = Object.keys(ISIC_SECTIONS) as IsicSection[];

export const isIsicSection = (value: string): value is IsicSection => value in ISIC_SECTIONS;

// One line per section, for the agent's instructions: "P: Education / التعليم".
export const ISIC_SECTION_LIST = ISIC_SECTION_LETTERS.map((l) => `${l}: ${ISIC_SECTIONS[l].en} / ${ISIC_SECTIONS[l].ar}`).join('\n');

// The region to save when the founder serves the whole country.
export const NATIONWIDE = 'Nationwide';
