/* ==========================================================
   Assessments: the ONE place that knows where assessments come from.

   Today it returns SAMPLE data and keeps new conversations in this browser.
   In the next sprints the agents and the database replace the inside of
   these functions. The pages that use them (chatbot, history) do not change.

     import { getAssessments, getAssessment, saveAssessment } from '../../../shared/assessments.js';
     const list = await getAssessments();        // newest first
     const one  = await getAssessment('a-101');

   One assessment looks like this:
     {
       id:      'a-101',
       title:   'Home food booking app',
       idea:    'the first message the founder wrote',
       sector, city, model, hiring:   the founder's answers (empty until answered)
       score:   72,                   // empty until the analysis has run
       factors: [14, 12, -3, -1],     // what moved the score up or down from 50
       roadmapShown: false,           // did the founder ask for the roadmap in the chat?
       noted:   ['city'],             // answers Darb understood from the description, without asking
       extra:   [{ from: 'user', text: '...' }, { from: 'agent' }],   // follow-up messages after the result
       updated: '2026-10-05T10:00:00.000Z',
     }

   Sample text is written in both languages: { en: '...', ar: '...' }.
   say(text) returns the right one.
   ========================================================== */

import { getLanguage, t } from './language.js';

const STORAGE_KEY = 'darb-assessments';
const ROOT = new URL('..', import.meta.url).href;
const CHAT_PAGE = `${ROOT}pages/founder/chatbot/chatbot.html`;

/* ---------- Small helpers ---------- */

/* Returns the text in the current language. Plain text passes through unchanged. */
export function say(text) {
  if (text && typeof text === 'object') {
    return text[getLanguage()] || text.en;
  }
  return text || '';
}

/* Turns an answer into its label: 'riyadh' → "Riyadh" / "الرياض".
   An answer the founder typed themselves has no label and is shown as written. */
export function label(answer) {
  const key = `option.${answer}`;
  return t(key) === key ? say(answer) : t(key);
}

/* 70–100 good, 40–69 warn, 0–39 risk (the score bands from the Sprint 0 report) */
export function scoreBand(score) {
  if (score >= 70) return 'good';
  if (score >= 40) return 'warn';
  return 'risk';
}

/* Address of the chat page for one assessment. tab opens the assessment panel on that tab. */
export function chatLink(id, tab = '') {
  return `${CHAT_PAGE}?id=${id}${tab ? `&tab=${tab}` : ''}`;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysSince(date) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date).setHours(0, 0, 0, 0);
  return Math.round((startOfToday - startOfThatDay) / (24 * 60 * 60 * 1000));
}

/* "Today", "3 days ago" or a date */
export function whenText(date) {
  const days = daysSince(date);
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.daysAgo').replace('{n}', days);
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
}

/* How many messages the conversation has (shown on the history page) */
export function messageCount(assessment) {
  const answers = ['sector', 'city', 'model', 'hiring'].filter((field) => assessment[field]).length;
  const result = assessment.score ? 2 : 0;
  return 1 + answers * 2 + result + (assessment.extra ? assessment.extra.length : 0);
}

/* ---------- SAMPLE DATA (replaced by the database later) ---------- */

const SAMPLE_ASSESSMENTS = [
  {
    id: 'a-101',
    title: { en: 'Home food booking app', ar: 'تطبيق حجز الأكل المنزلي' },
    idea: {
      en: 'I want to launch a booking app for home-based food businesses in Riyadh. Customers order from local home kitchens, and kitchens get a simple dashboard to manage orders.',
      ar: 'أريد إطلاق تطبيق لحجز الطلبات من الأسر المنتجة في الرياض. يطلب العملاء من المطابخ المنزلية القريبة، ويحصل كل مطبخ على لوحة بسيطة لإدارة الطلبات.',
    },
    sector: 'food', city: 'riyadh', model: 'commission', hiring: 'yes',
    score: 72, factors: [14, 12, -3, -1], roadmapShown: true, extra: [], noted: [],
    updated: daysAgo(0),
  },
  {
    id: 'a-102',
    title: { en: 'AI inventory for small shops', ar: 'إدارة مخزون ذكية للمتاجر الصغيرة' },
    idea: {
      en: 'A simple tool that uses AI to tell small grocery shops in Jeddah what to reorder and when, based on their sales.',
      ar: 'أداة بسيطة تستخدم الذكاء الاصطناعي لتخبر البقالات الصغيرة في جدة بما تعيد طلبه ومتى، بناءً على مبيعاتها.',
    },
    sector: 'tech', city: 'jeddah', model: 'subscription', hiring: 'unsure',
    score: 68, factors: [10, 11, -2, -1], roadmapShown: false, extra: [], noted: [],
    updated: daysAgo(3),
  },
  {
    id: 'a-103',
    title: { en: 'Modest fashion online brand', ar: 'علامة أزياء محتشمة عبر الإنترنت' },
    idea: {
      en: 'An online brand for modern modest wear, designed and sold from Riyadh through our own store.',
      ar: 'علامة تجارية إلكترونية للأزياء المحتشمة العصرية، تُصمَّم وتُباع من الرياض عبر متجرنا الخاص.',
    },
    sector: 'fashion', city: 'riyadh', model: 'sales', hiring: 'no',
    score: 54, factors: [6, 4, -4, -2], roadmapShown: false, extra: [], noted: [],
    updated: daysAgo(5),
  },
  {
    // not finished: opening it continues the questions where the founder stopped
    id: 'a-104',
    title: { en: 'Furniture rental idea', ar: 'فكرة تأجير الأثاث' },
    idea: {
      en: 'Renting furniture by the month to people who move to Dammam for work.',
      ar: 'تأجير الأثاث شهريًا لمن ينتقلون إلى الدمام للعمل.',
    },
    sector: '', city: 'dammam', model: '', hiring: '',
    score: null, factors: [], roadmapShown: false, extra: [], noted: ['city'],
    updated: daysAgo(8),
  },
  {
    id: 'a-105',
    title: { en: 'Specialty coffee kiosk', ar: 'كشك قهوة مختصة' },
    idea: {
      en: 'A small specialty coffee kiosk near offices in Riyadh.',
      ar: 'كشك صغير للقهوة المختصة بالقرب من المكاتب في الرياض.',
    },
    sector: 'food', city: 'riyadh', model: 'sales', hiring: 'yes',
    score: 38, factors: [-2, -3, -5, -2], roadmapShown: false, extra: [], noted: [],
    updated: daysAgo(21),
  },
  {
    id: 'a-106',
    title: { en: 'Tutoring marketplace', ar: 'منصة للدروس الخصوصية' },
    idea: {
      en: 'A marketplace that connects school students in Riyadh with university students who tutor them.',
      ar: 'منصة تربط طلاب المدارس في الرياض بطلاب جامعيين يقدّمون لهم دروسًا خصوصية.',
    },
    sector: 'education', city: 'riyadh', model: 'commission', hiring: 'no',
    score: 61, factors: [8, 6, -2, -1], roadmapShown: false, extra: [], noted: [],
    updated: daysAgo(32),
  },
];

/* What moves the score. The numbers for one assessment are in its "factors" list, in this order. */
export const SCORE_FACTORS = ['score.factor.demand', 'score.factor.difference', 'score.factor.competition', 'score.factor.sectorRisk'];

/* The steps the agent shows while it works */
export const AGENT_STEPS = ['agent.step.understand', 'agent.step.similar', 'agent.step.market', 'agent.step.score', 'agent.step.explain'];

/* Similar startups: SAMPLE names and numbers, not real companies */
export const SIMILAR_STARTUPS = [
  {
    id: 's-1',
    name: { en: 'Sufra Home', ar: 'سُفرة هوم' },
    city: 'riyadh', year: 2021, status: 'operating', match: 86,
    about: {
      en: 'A marketplace for home kitchens with scheduled orders and its own delivery partners.',
      ar: 'سوق إلكتروني للمطابخ المنزلية بطلبات مجدولة وشركاء توصيل خاصين به.',
    },
  },
  {
    id: 's-2',
    name: { en: 'Zad Kitchens', ar: 'مطابخ زاد' },
    city: 'jeddah', year: 2020, status: 'operating', match: 74,
    about: {
      en: 'Home cooks sell weekly meal plans to families through a subscription.',
      ar: 'تبيع الطاهيات المنزليات خطط وجبات أسبوعية للعائلات عبر اشتراك.',
    },
  },
  {
    id: 's-3',
    name: { en: 'Bayti Bites', ar: 'بيتي بايتس' },
    city: 'riyadh', year: 2019, status: 'closed', match: 61,
    about: {
      en: 'An ordering app for home-made desserts. It closed after two years because delivery costs stayed high.',
      ar: 'تطبيق لطلب الحلويات المنزلية. أُغلق بعد عامين بسبب بقاء تكاليف التوصيل مرتفعة.',
    },
  },
];

/* Market insights: SAMPLE numbers. The real ones come from verified Saudi market data. */
export const MARKET = {
  activity: { en: 'Food and beverage service activities', ar: 'أنشطة خدمات الأطعمة والمشروبات' },
  tiles: [
    { label: 'market.establishments', value: '48,200' },
    { label: 'market.growth',         value: '+6.4%' },
    { label: 'market.smeShare',       value: '92%' },
    { label: 'market.survival',       value: '71%' },
  ],
  // establishments in the activity, by year (thousands)
  years: [
    { year: 2020, value: 36 },
    { year: 2021, value: 39 },
    { year: 2022, value: 42 },
    { year: 2023, value: 45 },
    { year: 2024, value: 48 },
  ],
};

/* Roadmap steps, in order. "type" is mandatory or conditional. */
const ROADMAP_STEPS = [
  {
    title:     { en: 'Commercial Registration', ar: 'السجل التجاري' },
    authority: { en: 'Ministry of Commerce · issued through the Saudi Business Center', ar: 'وزارة التجارة · يصدر عبر المركز السعودي للأعمال' },
    type: 'mandatory',
    action: { en: 'Apply on Saudi Business Center', ar: 'التقديم عبر المركز السعودي للأعمال' },
    link: 'https://business.sa', source: 'business.sa',
  },
  {
    title:     { en: 'National Address', ar: 'العنوان الوطني' },
    authority: { en: 'Saudi Post (SPL) · register the business address · after step 1', ar: 'البريد السعودي (سبل) · تسجيل عنوان المنشأة · بعد الخطوة ١' },
    type: 'mandatory',
    action: { en: 'Register on SPL', ar: 'التسجيل في سبل' },
    link: 'https://splonline.com.sa', source: 'splonline.com.sa',
  },
  {
    title:     { en: 'Municipal License', ar: 'الرخصة البلدية' },
    authority: { en: 'Balady · commercial license for your activity · needs steps 1–2', ar: 'بلدي · رخصة تجارية لنشاطك · تتطلب الخطوتين ١ و٢' },
    type: 'mandatory',
    action: { en: 'Apply on Balady', ar: 'التقديم عبر بلدي' },
    link: 'https://balady.gov.sa', source: 'balady.gov.sa',
  },
  {
    title:     { en: 'VAT Registration', ar: 'التسجيل في ضريبة القيمة المضافة' },
    authority: { en: 'ZATCA · required once revenue passes the VAT threshold', ar: 'هيئة الزكاة والضريبة والجمارك · مطلوب عند تجاوز الإيرادات حد التسجيل' },
    type: 'conditional',
    action: { en: 'Register on ZATCA', ar: 'التسجيل في الهيئة' },
    link: 'https://zatca.gov.sa', source: 'zatca.gov.sa',
  },
  {
    title:     { en: 'GOSI and Qiwa', ar: 'التأمينات الاجتماعية وقوى' },
    authority: { en: 'GOSI and Ministry of Human Resources · only if you hire employees', ar: 'التأمينات الاجتماعية ووزارة الموارد البشرية · فقط عند توظيف موظفين' },
    type: 'conditional',
    forHiring: true,   // left out when the founder said they will not hire
    action: { en: 'Open Qiwa', ar: 'فتح منصة قوى' },
    link: 'https://www.qiwa.sa', source: 'qiwa.sa',
  },
];

/* The roadmap for one assessment */
export function roadmapFor(assessment) {
  return ROADMAP_STEPS.filter((step) => !(step.forHiring && assessment.hiring === 'no'));
}

/* ---------- Reading and saving ---------- */

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/* Every assessment of the founder, newest first */
export async function getAssessments() {
  const stored = readStored();
  const storedIds = stored.map((assessment) => assessment.id);

  // a sample that was continued in this browser is replaced by its saved copy
  const samples = SAMPLE_ASSESSMENTS.filter((sample) => !storedIds.includes(sample.id));

  return [...stored, ...samples].sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

export async function getAssessment(id) {
  const all = await getAssessments();
  return all.find((assessment) => assessment.id === id) || null;
}

/* Saves a new assessment, or the new state of an old one */
export async function saveAssessment(assessment) {
  assessment.updated = new Date().toISOString();

  const others = readStored().filter((stored) => stored.id !== assessment.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([assessment, ...others]));
}

/* An empty assessment for a new conversation */
export function newAssessment(idea) {
  const firstLine = idea.trim().split('\n')[0];

  return {
    id: `a-${Date.now()}`,
    title: firstLine.length > 44 ? `${firstLine.slice(0, 44)}…` : firstLine,
    idea,
    sector: '', city: '', model: '', hiring: '',
    score: null, factors: [], roadmapShown: false, extra: [],
    noted: [],   // answers Darb understood from the description, without asking
    updated: new Date().toISOString(),
  };
}

/* The sample result the "agent" gives today. The real one comes from the prediction model. */
export function sampleResult() {
  return { score: 72, factors: [14, 12, -3, -1] };
}

/* ---------- The list of past assessments in the sidebar ---------- */

/* Fills the sidebar list (layout.js made the empty box). guard.js calls this on
   every founder page; the chat page calls it again after it saves something. */
export async function showSidebarHistory() {
  const box = document.querySelector('#sidebar-history');
  if (!box) return;

  const assessments = await getAssessments();
  if (assessments.length === 0) return;

  const openId = new URLSearchParams(window.location.search).get('id');

  const groups = [
    { title: 'time.today',    items: assessments.filter((a) => daysSince(a.updated) <= 0) },
    { title: 'time.thisWeek', items: assessments.filter((a) => daysSince(a.updated) > 0 && daysSince(a.updated) < 7) },
    { title: 'time.earlier',  items: assessments.filter((a) => daysSince(a.updated) >= 7) },
  ];

  box.innerHTML = groups
    .filter((group) => group.items.length > 0)
    .map((group) => `
      <div class="sidebar-label">${t(group.title)}</div>
      ${group.items.map((assessment) => `
        <a class="nav-item ${assessment.id === openId ? 'is-active' : ''}" href="${chatLink(assessment.id)}">
          <span class="nav-item-text"></span>
        </a>`).join('')}`)
    .join('');

  // titles are written by founders, so they are added as text, never as HTML
  const links = box.querySelectorAll('.nav-item-text');
  groups.flatMap((group) => group.items).forEach((assessment, index) => {
    links[index].textContent = say(assessment.title);
  });
}

// the list is text in the current language, so build it again when the language changes
document.addEventListener('darb:language', showSidebarHistory);
