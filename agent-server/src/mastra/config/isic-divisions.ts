// Config: the founder's sub-sector is an ISIC4 division (2 digits) inside their section.
// The 85 divisions and their Arabic names come from GASTAT's SSIC file (Darb DataSets › Gastat).
// The English names are the matching UN ISIC Rev.4 division titles. The survival model's data and the roadmap use these codes.
import type { IsicSection } from './sectors';

export const ISIC_DIVISIONS: Record<string, { section: IsicSection; en: string; ar: string }> = {
  '01': { section: 'A', en: "Crop and animal production, hunting and related service activities", ar: "أنشطة زراعة المحاصيل والإنتاج الحيواني والصيد والخدمات المتصلة" },
  '02': { section: 'A', en: "Forestry and logging", ar: "الحراجة وقطع الأخشاب" },
  '03': { section: 'A', en: "Fishing and aquaculture", ar: "صيد الأسماك وتربية المائيات" },
  '05': { section: 'B', en: "Mining of coal and lignite", ar: "تعدين الفحم والليغنيت" },
  '06': { section: 'B', en: "Extraction of crude petroleum and natural gas", ar: "استخراج النفط الخام والغاز الطبيعي" },
  '07': { section: 'B', en: "Mining of metal ores", ar: "تعدين ركازات الفلزات" },
  '08': { section: 'B', en: "Other mining and quarrying", ar: "الأنشطة الأخرى للتعدين واستغلال المحاجر" },
  '09': { section: 'B', en: "Mining support service activities", ar: "أنشطة خدمات دعم التعدين" },
  '10': { section: 'C', en: "Manufacture of food products", ar: "صُنع المنتجات الغذائية" },
  '11': { section: 'C', en: "Manufacture of beverages", ar: "صُنع المشروبات" },
  '12': { section: 'C', en: "Manufacture of tobacco products", ar: "صُنع منتجات التبغ" },
  '13': { section: 'C', en: "Manufacture of textiles", ar: "صُنع المنسوجات" },
  '14': { section: 'C', en: "Manufacture of wearing apparel", ar: "صُنع الملبوسات" },
  '15': { section: 'C', en: "Manufacture of leather and related products", ar: "صُنع المنتجات الجلدية والمنتجات ذات الصلة" },
  '16': { section: 'C', en: "Manufacture of wood and products of wood and cork, except furniture", ar: "صُنع الخشب ومنتجات الخشب والفلين ، باستثناء الأثاث ، صُنع أصناف من القش ومواد الضفر" },
  '17': { section: 'C', en: "Manufacture of paper and paper products", ar: "صُنع الورق ومنتجات الورق" },
  '18': { section: 'C', en: "Printing and reproduction of recorded media", ar: "الطباعة واستنساخ وسائط الأعلام المسجّلة" },
  '19': { section: 'C', en: "Manufacture of coke and refined petroleum products", ar: "صنع فحم الكوك والمنتجات النفطية المكررة" },
  '20': { section: 'C', en: "Manufacture of chemicals and chemical products", ar: "صُنع المواد الكيميائية والمنتجات الكيميائية" },
  '21': { section: 'C', en: "Manufacture of basic pharmaceutical products and pharmaceutical preparations", ar: "صنع المنتجات الصيدلانية الأساسية والمستحضرات الصيدلانية" },
  '22': { section: 'C', en: "Manufacture of rubber and plastics products", ar: "صنع منتجات المطاط واللدائن" },
  '23': { section: 'C', en: "Manufacture of other non-metallic mineral products", ar: "صنع منتجات المعادن اللافلزية الأخرى" },
  '24': { section: 'C', en: "Manufacture of basic metals", ar: "صنع الفلزات القاعدية" },
  '25': { section: 'C', en: "Manufacture of fabricated metal products, except machinery and equipment", ar: "صنع منتجات المعادن المشكلة ( باستثناء الآلات والمعدات )" },
  '26': { section: 'C', en: "Manufacture of computer, electronic and optical products", ar: "صنع الحواسيب والمنتجات الإلكترونية والبصرية" },
  '27': { section: 'C', en: "Manufacture of electrical equipment", ar: "صنع المعدات الكهربائية" },
  '28': { section: 'C', en: "Manufacture of machinery and equipment n.e.c.", ar: "صناعة الآلات والمعدات غير المصنفة في موضع أخر" },
  '29': { section: 'C', en: "Manufacture of motor vehicles, trailers and semi-trailers", ar: "صناعة المركبات ذات المحركات والمركبات المقطورة ونصف المقطورة" },
  '30': { section: 'C', en: "Manufacture of other transport equipment", ar: "صناعة معدات النقل الأخرى" },
  '31': { section: 'C', en: "Manufacture of furniture", ar: "صنع الأثاث" },
  '32': { section: 'C', en: "Other manufacturing", ar: "الصناعة التحويلية الأخرى" },
  '33': { section: 'C', en: "Repair and installation of machinery and equipment", ar: "إصلاح وتركيب الآلات والمعدات" },
  '35': { section: 'D', en: "Electricity, gas, steam and air conditioning supply", ar: "توصيل الكهرباء والغاز والبخار وتكييف الهواء" },
  '36': { section: 'E', en: "Water collection, treatment and supply", ar: "تجميع المياه ومعالجتها وتوصيلها" },
  '37': { section: 'E', en: "Sewerage", ar: "الصرف الصحي" },
  '38': { section: 'E', en: "Waste collection, treatment and disposal activities; materials recovery", ar: "أنشطة جمع النفايات ومعالجتها وتصريفها ، واسترجاع المواد" },
  '39': { section: 'E', en: "Remediation activities and other waste management services", ar: "أنشطة المعالجة وخدمات إدارة النفايات الأخرى" },
  '41': { section: 'F', en: "Construction of buildings", ar: "تشييد المباني" },
  '42': { section: 'F', en: "Civil engineering", ar: "الهندسة المدنية" },
  '43': { section: 'F', en: "Specialized construction activities", ar: "أنشطة التشييد المتخصصة" },
  '45': { section: 'G', en: "Wholesale and retail trade and repair of motor vehicles and motorcycles", ar: "تجارة الجملة والتجزئة ، وإصلاح المركبات ذات المحركات والدراجات النارية" },
  '46': { section: 'G', en: "Wholesale trade, except of motor vehicles and motorcycles", ar: "تجارة الجملة ، باستثناء المركبات ذات المحركات والدراجات النارية" },
  '47': { section: 'G', en: "Retail trade, except of motor vehicles and motorcycles", ar: "تجارة التجزئة، باستثناء المركبات ذات المحركات والدراجات النارية" },
  '49': { section: 'H', en: "Land transport and transport via pipelines", ar: "النقل البري و النقل عبر الأنابيب" },
  '50': { section: 'H', en: "Water transport", ar: "النقل المائي" },
  '51': { section: 'H', en: "Air transport", ar: "النقل الجوي" },
  '52': { section: 'H', en: "Warehousing and support activities for transportation", ar: "التخزين وأنشطة الدعم للنقل" },
  '53': { section: 'H', en: "Postal and courier activities", ar: "أنشطة البريد ونقل الرسائل والطرود بواسطة مندوبين" },
  '55': { section: 'I', en: "Accommodation", ar: "الإقامة" },
  '56': { section: 'I', en: "Food and beverage service activities", ar: "أنشطة خدمات الأطعمة والمشروبات" },
  '58': { section: 'J', en: "Publishing activities", ar: "أنشطة النشر" },
  '59': { section: 'J', en: "Motion picture, video and television programme production, sound recording and music publishing activities", ar: "أنشطة إنتاج الأفلام والفيديو والبرامج التليفزيونية والتسجيلات الصوتية ونشر الموسيقى" },
  '60': { section: 'J', en: "Programming and broadcasting activities", ar: "أنشطة البرمجة والإذاعة" },
  '61': { section: 'J', en: "Telecommunications", ar: "الاتصالات" },
  '62': { section: 'J', en: "Computer programming, consultancy and related activities", ar: "أنشطة البرمجة الحاسوبية والخبرة الاستشارية وما يتصل بها من أنشطة" },
  '63': { section: 'J', en: "Information service activities", ar: "أنشطة خدمات المعلومات" },
  '64': { section: 'K', en: "Financial service activities, except insurance and pension funding", ar: "أنشطة الخدمات المالية ، فيما عدا تمويل التأمين وصناديق المعاشات" },
  '65': { section: 'K', en: "Insurance, reinsurance and pension funding, except compulsory social security", ar: "تمويل التأمين وإعادة التأمين وصناديق المعاشات التقاعدية باستثناء الضمان الاجتماعي الإلزامي" },
  '66': { section: 'K', en: "Activities auxiliary to financial service and insurance activities", ar: "الأنشطة المساعدة لأنشطة الخدمات المالية وأنشطة التأمين" },
  '68': { section: 'L', en: "Real estate activities", ar: "الأنشطة العقارية" },
  '69': { section: 'M', en: "Legal and accounting activities", ar: "الأنشطة القانونية وأنشطة المحاسبة" },
  '70': { section: 'M', en: "Activities of head offices; management consultancy activities", ar: "أنشطة المكاتب الرئيسية، والأنشطة الاستشارية في مجال الإدارة" },
  '71': { section: 'M', en: "Architectural and engineering activities; technical testing and analysis", ar: "الأنشطة المعمارية والهندسية ، والاختبارات الفنية والتحليل" },
  '72': { section: 'M', en: "Scientific research and development", ar: "البحث والتطوير في المجال العلمي" },
  '73': { section: 'M', en: "Advertising and market research", ar: "أبحاث الإعلان والسوق" },
  '74': { section: 'M', en: "Other professional, scientific and technical activities", ar: "الأنشطة المهنية والعلمية والتقنية الأخرى" },
  '75': { section: 'M', en: "Veterinary activities", ar: "الأنشطة البيطرية" },
  '77': { section: 'N', en: "Rental and leasing activities", ar: "الأنشطة الإيجارية" },
  '78': { section: 'N', en: "Employment activities", ar: "أنشطة الاستخدام" },
  '79': { section: 'N', en: "Travel agency, tour operator, reservation service and related activities", ar: "وكالات السفر ومشغّلو الجولات السياحية وخدمات الحجز والأنشطة المتصلة بها" },
  '80': { section: 'N', en: "Security and investigation activities", ar: "أنشطة الأمن والتحقيقات" },
  '81': { section: 'N', en: "Services to buildings and landscape activities", ar: "أنشطة تقديم الخدمات للمباني وتجميل المواقع" },
  '82': { section: 'N', en: "Office administrative, office support and other business support activities", ar: "الأنشطة الإدارية للمكاتب ، وأنشطة الدعم للمكاتب وغير ذلك من أنشطة الدعم للأعمال" },
  '84': { section: 'O', en: "Public administration and defence; compulsory social security", ar: "الإدارة العامة والدفاع ؛ والضمان الاجتماعي الإلزامي" },
  '85': { section: 'P', en: "Education", ar: "التعليم" },
  '86': { section: 'Q', en: "Human health activities", ar: "الصحة البشرية" },
  '87': { section: 'Q', en: "Residential care activities", ar: "الرعاية مع الإقامة" },
  '88': { section: 'Q', en: "Social work activities without accommodation", ar: "أنشطة العمل الاجتماعي، دون إقامة" },
  '90': { section: 'R', en: "Creative, arts and entertainment activities", ar: "الأنشطة الإبداعية والفنون وأنشطة الترفيه" },
  '91': { section: 'R', en: "Libraries, archives, museums and other cultural activities", ar: "أنشطة المكتبات والمحفوظات والمتاحف والأنشطة الثقافية الأخرى" },
  '93': { section: 'R', en: "Sports activities and amusement and recreation activities", ar: "الأنشطة الرياضية وأنشطة التسلية والترفيه" },
  '94': { section: 'S', en: "Activities of membership organizations", ar: "أنشطة المنظمات ذات العضوية" },
  '95': { section: 'S', en: "Repair of computers and personal and household goods", ar: "إصلاح أجهزة الحاسوب والسلع الشخصية والمنزلية" },
  '96': { section: 'S', en: "Other personal service activities", ar: "أنشطة الخدمات الشخصية الأخرى" },
  '99': { section: 'U', en: "Activities of extraterritorial organizations and bodies", ar: "أنشطة المنظمات والهيئات غير الخاضعة للولاية القضائية الوطنية" },
};

export const isIsicDivision = (code: string): boolean => code in ISIC_DIVISIONS;

// The divisions of one section.
export function divisionsOfSection(section: IsicSection): string[] {
  return Object.entries(ISIC_DIVISIONS)
    .filter(([, d]) => d.section === section)
    .map(([code]) => code);
}

// One line per division, for the agent's instructions: "85 (in section P): Education / التعليم".
export const ISIC_DIVISION_LIST = Object.entries(ISIC_DIVISIONS)
  .map(([code, d]) => `${code} (in section ${d.section}): ${d.en} / ${d.ar}`)
  .join('\n');
