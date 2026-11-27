/* ==========================================================
   Assessments: the ONE place that knows where assessments come from.

   The founder's ideas, answers and messages are saved in Supabase
   (tables startup_ideas, assessments and messages, migration 0005).
   The competitor analysis is what the Competitor Agent saved (similar_startup_results with its
   links in result_sources, migrations 0032–0036). The market numbers and roadmap come from the real datasets
   in the database (migration 0006). The conversation itself is answered by the
   agent server (see shared/agent.js); this file only reads and saves it.

     import { getAssessments, getAssessment, saveAssessment } from '../../../shared/assessments.js';
     const list = await getAssessments();        // newest first
     const one  = await getAssessment(id);
     await loadResult(one);                      // adds one.result = { competitors, market, roadmap }

   One assessment, as the pages see it:
     {
       id:      'the assessment id',
       title:   'Home food booking app',
       idea:    'the first message the founder wrote',
       sector, city, model, hiring:   the founder's answers (empty until answered)
       noted:   ['city'],             // answers Darb understood from the description, without asking
       score:   72,                   // empty until the analysis has run
       iss:     64,                   // Idea Similarity Score 0–100; empty when no competitors were found
       issBasis, marketLevel, competitorNotes, analysedAt:   the competitor analysis (empty until it ran)
       whatIf:             a what-if's short name ("Jeddah instead of Riyadh"), kept in its confirmed_inputs (what_if_label)
       factors: [14, 12, -3, -1],     // what moved the score up or down from 50
       roadmapShown: false,           // did the founder ask for the roadmap in the chat?
       extra:   [{ from: 'user', text: '...' }, { from: 'agent' }],   // follow-up messages after the result
       history: [{ from: 'user', text: '...' }, { from: 'agent', text: '...' }],   // every message, oldest first
       threadId: 'the agent's conversation id (column thread_id), empty until the server saves one',
       messages: 9,                   // how many messages the conversation has
       updated: '2026-10-05T10:00:00.000Z',
     }

   Sample text is written in both languages: { en: '...', ar: '...' }.
   say(text) returns the right one.
   ========================================================== */

import { getLanguage, t } from './language.js';
import { supabase } from './supabase.js';
import { IDEA_DIVISIONS, REQUIREMENT_COLUMNS, withIsic, divisionsOf, fitsDivisions } from './regulatory.js';

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

/* ---------- The score (filled once the prediction model is connected) ---------- */

/* What moves the score. The numbers for one assessment are in its "factors" list, in this order. */
export const SCORE_FACTORS = ['score.factor.demand', 'score.factor.difference', 'score.factor.competition', 'score.factor.sectorRisk'];


/* ---------- Competitors, market and roadmap (REAL data from the database) ----------
   The competitors are the ones the Competitor Agent checked and saved for this assessment.
   The market and roadmap rows are real (tables market_indicators and regulatory_requirements,
   filled from the Excel files in datasets/). What is still simple is HOW they are chosen:
   by the idea's sector. Later the Roadmap Agent decides which requirements apply to this venture. */

/* The economic activity (ISIC code) shown for each sector until the agent matches the exact one */
const MAIN_ACTIVITY = { ai: '62', food: '56', fashion: '14', furniture: '31' };

/* Requirements that depend on an answer Darb already has */
const ALWAYS_SHOWN = ['GEN-005', 'GEN-006'];            // municipal license, VAT: shown as conditional
const WHEN_HIRING  = ['GEN-008', 'GEN-010', 'FOOD-001']; // GOSI, Saudization, health certificate

/* The order of the business stages on the roadmap */
const STAGE_ORDER = ['Establishment', 'Pre-operation', 'Planning', 'Design', 'Pre-market', 'Product launch', 'Hiring', 'Operation'];

function stageRank(stage) {
  const position = STAGE_ORDER.findIndex((name) => (stage || '').startsWith(name));
  return position === -1 ? STAGE_ORDER.length : position;
}

/* The competitors the Competitor Agent saved for this assessment, closest first (up to 3).
   The database's security rules return only the founder's own. Empty until the analysis ran. */
async function loadCompetitors(assessment) {
  if (!assessment.isSaved) return [];
  // "*" keeps this working while columns are still being added to the design; the links are in result_sources
  const read = (columns) => supabase.from('similar_startup_results').select(columns).eq('assessment_id', assessment.id).order('rank');
  // a startup from Darb's list brings its logo (startups.logo, migration 0034): no extra wait for the founder
  let { data, error } = await read('*, result_sources (url, source_type, accessed_at), startups (logo)');
  if (error) ({ data, error } = await read('*, result_sources (url, source_type, accessed_at)'));
  if (error) ({ data, error } = await read('*'));   // the links could not be read: show the competitors anyway

  if (error) {
    report('load the competitors', error);
    return [];
  }
  return data.map((row) => {
    const first = (row.result_sources && row.result_sources[0]) || {};
    // stored with the design's four values; "possible difference" whose customer is only partly the same is
    // the customer rule (checked first), whose next step is to interview customers
    const customerPartly = row.comparison && row.comparison.customer && row.comparison.customer.answer === 'partly';
    const opportunity = row.opportunity === 'possible_difference' && customerPartly ? 'possible_customer_difference' : row.opportunity || '';
    return {
    id: row.result_id || String(row.rank),
    rank: row.rank,
    name: row.competitor_name,
    about: row.description || '',
    city: row.city_region || '',
    label: row.label,                       // direct / indirect
    evidence: row.evidence_status,          // confirmed / likely
    reason: row.reason || '',
    comparison: row.comparison || {},       // { problem, customer, offering }: { answer, note }
    source: first.url || row.source_url || '',
    sourceType: first.source_type || '',   // official_site, app_store, ecosystem, news, government
    checkedAt: first.accessed_at || '',    // when Darb checked it
    website: row.website || '',
    logo: (row.startups && row.startups.logo) || '',   // only startups from Darb's list have one
    score: row.similarity_score,
    opportunity,                            // proven / possible / no clear difference, or not enough evidence
    difference: row.difference || '',       // the judge's one sentence (migration 0038)
    };
  });
}

// part as a percent of whole, with two decimals (0.049% shows as 0.05%); null when either is missing
function shareOf(part, whole) {
  if (part === null || part === undefined || !whole) return null;
  return Math.round((part / whole) * 10000) / 100;
}

/* The names of the economic activities the market data covers, by their ISIC Rev. 4 code
   (GASTAT's classification, as Monsha'at publishes them). Two-digit codes are divisions, letters are sections. */
const ACTIVITY_NAMES = {
  10: { en: 'Manufacture of food products', ar: 'صنع المنتجات الغذائية' },
  11: { en: 'Manufacture of beverages', ar: 'صنع المشروبات' },
  13: { en: 'Manufacture of textiles', ar: 'صنع المنسوجات' },
  14: { en: 'Manufacture of wearing apparel', ar: 'صنع الملبوسات' },
  15: { en: 'Manufacture of leather and related products', ar: 'صُنع المنتجات الجلدية والمنتجات ذات الصلة' },
  31: { en: 'Manufacture of furniture', ar: 'صنع الأثاث' },
  56: { en: 'Food and beverage service activities', ar: 'أنشطة خدمات الأطعمة والمشروبات' },
  58: { en: 'Publishing activities (includes software publishing, 582)', ar: 'أنشطة المنشورات' },
  62: { en: 'Computer programming, consultancy and related activities', ar: 'أنشطة البرمجة الحاسوبية والخبرة الاستشارية وما يتصل بها من أنشطة' },
  63: { en: 'Information service activities', ar: 'أنشطة خدمات المعلومات' },
  C: { en: 'Manufacturing', ar: 'الصناعة التحويلية' },
  J: { en: 'Information and communication', ar: 'المعلومات والاتصالات' },
};

async function loadMarket(assessment) {
  const code = MAIN_ACTIVITY[assessment.sector];
  if (!code) return null;

  const { data, error } = await supabase
    .from('market_indicators')
    .select('*')
    .eq('economic_activity_code', code)
    .order('year', { ascending: false });

  if (error) {
    report('load market indicators', error);
    return null;
  }

  // the newest year that has numbers
  const row = data.find((item) => item.total_enterprises !== null);
  if (!row) return null;

  return {
    // the activity's name comes from its code (migration 0043 keeps only the code in the database)
    activity: ACTIVITY_NAMES[row.economic_activity_code] || { en: row.economic_activity_code, ar: row.economic_activity_code },
    year: row.year,
    sourceUrl: row.source_url || '',
    enterprises: row.total_enterprises,
    newEnterprises: row.new_enterprises_total,
    employees: row.employees_total,
    growth: row.enterprises_growth_pct,   // percent, compared with the year before
    // each size's share of all enterprises, in percent (migration 0026 stores the counts only)
    sizes: [
      { label: 'size.micro',  value: shareOf(row.micro, row.total_enterprises) },
      { label: 'size.small',  value: shareOf(row.small, row.total_enterprises) },
      { label: 'size.medium', value: shareOf(row.medium, row.total_enterprises) },
      { label: 'size.large',  value: shareOf(row.large, row.total_enterprises) },
    ].filter((size) => size.value !== null),
  };
}

async function loadRoadmap(assessment) {
  const { data: rows, error } = await supabase.from('regulatory_requirements').select(REQUIREMENT_COLUMNS);
  if (error) {
    report('load the regulatory requirements', error);
    return [];
  }
  const data = rows.map(withIsic);

  // the idea's ISIC4 divisions (the same ones as its market indicators); a requirement is
  // for this idea when its own divisions include one of them, or when it is for every business
  const divisions = IDEA_DIVISIONS[assessment.sector] || [];
  const willHire = assessment.hiring !== 'no';

  return data
    .filter((row) => row.regulatory_status === 'Active')
    .filter((row) => fitsDivisions(row, divisions))
    .filter((row) => {
      const isRequired = row.mandatory === 'Required' || row.mandatory === 'Required when in scope';
      const forEveryBusiness = divisionsOf(row).includes('ALL');
      return (isRequired && (forEveryBusiness ? row.mandatory === 'Required' : true))
        || ALWAYS_SHOWN.includes(row.requirement_id)
        || (willHire && WHEN_HIRING.includes(row.requirement_id));
    })
    // by stage; inside a stage the general (GEN) requirements come before the sector's own
    .sort((a, b) => stageRank(a.business_stage) - stageRank(b.business_stage)
      || b.requirement_id.startsWith('GEN') - a.requirement_id.startsWith('GEN')
      || a.requirement_id.localeCompare(b.requirement_id))
    .map((row) => ({
      id: row.requirement_id,
      title: { en: row.name_en, ar: row.name_ar || row.name_en },
      authority: row.authority || '',   // in English: also used to find the authority's logo
      authorityName: { en: row.authority || '', ar: row.authority_ar || row.authority || '' },
      // "what_darb_surface" is written as instructions for the agent, so until the
      // agent rewrites it for the founder, the plain "applies when" sentence is shown
      guidance: { en: row.applies_when || '', ar: row.applies_when_ar || row.applies_when || '' },
      type: row.mandatory === 'Required' ? 'mandatory' : 'conditional',
      link: row.service_url || row.official_source_url || '',
      source: row.official_source_url || '',
      stage: row.business_stage || '',
      fees: { en: row.fees_thresholds || '', ar: row.fees_thresholds_ar || row.fees_thresholds || '' },
    }));
}

/* An assessment with its competitor note codes, which are kept one per row in their own table (migration 0042) */
const ASSESSMENT_COLUMNS = '*, assessment_competitor_notes (note_code)';

/* The note codes of an assessment as a simple list: ['customer_unknown', 'fewer_than_three'] */
function notesOf(row) {
  return (row.assessment_competitor_notes || []).map((note) => note.note_code);
}

/* After a reply in the chat: was a new competitor analysis just saved for this assessment?
   If so, its numbers and competitors are loaded onto it and true is returned, so the chat can
   show the competitor cards. A what-if is saved on its own assessment, so it never counts here. */
export async function refreshAnalysis(assessment) {
  if (!assessment || !assessment.isSaved) return false;
  const { data, error } = await supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('assessment_id', assessment.id).maybeSingle();
  if (error) {
    report('check for a new competitor analysis', error);
    return false;
  }
  if (!data || !data.analysed_at || data.analysed_at === assessment.analysedAt) return false;

  assessment.analysedAt = data.analysed_at;
  assessment.iss = data.iss === null || data.iss === undefined ? null : Math.round(Number(data.iss));
  assessment.issBasis = data.iss_basis || '';
  assessment.marketLevel = data.market_level || '';
  assessment.competitorNotes = notesOf(data);
  // the idea as Darb understood it, written beside the analysis (startup_ideas.idea_summary, migration 0040)
  const idea = await supabase.from('startup_ideas').select('idea_summary').eq('idea_id', assessment.ideaId).maybeSingle();
  if (idea.data && idea.data.idea_summary) assessment.ideaSummary = idea.data.idea_summary;
  if (assessment.result) assessment.result.competitors = await loadCompetitors(assessment);
  else await loadResult(assessment);
  return true;
}

/* Whether a new competitor analysis of this assessment has been saved, and how many competitors it shows,
   without changing the page's copy (refreshAnalysis does that next). null while there is none yet. */
export async function newAnalysis(assessment) {
  if (!assessment || !assessment.isSaved) return null;
  const { data } = await supabase.from('assessments').select('analysed_at').eq('assessment_id', assessment.id).maybeSingle();
  if (!data || !data.analysed_at || data.analysed_at === assessment.analysedAt) return null;
  const { count } = await supabase.from('similar_startup_results').select('result_id', { count: 'exact', head: true }).eq('assessment_id', assessment.id);
  return { competitors: count || 0 };
}

/* Loads the competitors, the market numbers and the roadmap of one assessment
   and keeps them on it as assessment.result, so the pages can show them. */
/* Until Darb asks for the idea's sector (not built yet), Market and Roadmap use this sample
   sector, so the founder sees them as they will look. The note under the tabs says so.
   Only used to show the tabs: the assessment's own sector stays empty and nothing is saved. */
const SAMPLE_SECTOR = 'ai';   // software and information technology (ISIC 62)

export async function loadResult(assessment) {
  const shown = assessment.sector ? assessment : { ...assessment, sector: SAMPLE_SECTOR };
  const [competitors, market, roadmap] = await Promise.all([
    loadCompetitors(assessment), loadMarket(shown), loadRoadmap(shown),
  ]);
  assessment.result = { competitors, market, roadmap, sampleSector: !assessment.sector };
}

/* ---------- Reading and saving (Supabase) ---------- */

function report(action, error) {
  // shown in the browser console (Developer Tools) so the real cause is easy to find
  console.error(`Assessments: could not ${action}:`, error.code, error.message);
}

/* Builds the object the pages use from the three database rows */
function fromRows(idea, assessment, messages) {
  const answers = assessment.model_input || {};
  const followUps = messages.filter((message) => message.content.followUp);

  return {
    id: assessment.assessment_id,
    ideaId: idea.idea_id,
    isSaved: true,
    title: idea.idea_name,
    ideaSummary: idea.idea_summary || null,   // the idea as Darb understood it, in the founder's language (0040)
    savedTitle: idea.idea_name,   // the name as last saved, to notice when the agent server renamed the idea
    idea: idea.idea_description || '',
    sector: idea.sector || '',
    city: idea.city || '',
    model: answers.revenue_model || '',
    hiring: answers.hiring || '',
    noted: answers.noted || [],
    score: assessment.fis_score,
    // the competitor analysis (migrations 0032, 0036, 0038); empty until the Competitor Agent saved one
    iss: assessment.iss === null || assessment.iss === undefined ? null : Math.round(Number(assessment.iss)),
    issBasis: assessment.iss_basis || '',
    marketLevel: assessment.market_level || '',
    competitorNotes: notesOf(assessment),
    analysedAt: assessment.analysed_at || '',
    // a what-if is a new assessment of the same idea; its link and name are in its confirmed_inputs
    whatIf: (assessment.confirmed_inputs && assessment.confirmed_inputs.what_if_label) || '',
    factors: assessment.explanation ? assessment.explanation.factors : [],
    roadmapShown: Boolean(assessment.roadmap_generated_at),
    roadmapAt: assessment.roadmap_generated_at,
    completedAt: assessment.completed_at,
    extra: followUps.map((message) => ({
      from: message.sender_role,
      text: message.content.text || '',
      about: message.content.about || '',
    })),
    // analysis: the assessment whose competitor cards appear under this reply (several ideas in one conversation)
    history: messages.map((message) => ({ from: message.sender_role, text: message.content.text || '', analysis: message.content.analysis || '' })),
    threadId: assessment.thread_id || '',
    messages: messages.length,
    updated: idea.updated_at || idea.created_at,
  };
}

/* true when the last getAssessments() could not reach the database (it then returns []),
   so a page can tell "no ideas yet" apart from "could not load" and show the 500 page */
export let assessmentsFailed = false;

/* Every assessment of the signed-in founder, newest first.
   The database's security rules return only this founder's rows. */
export async function getAssessments() {
  const ideas = await supabase.from('startup_ideas').select('*');
  const assessments = await supabase.from('assessments').select(ASSESSMENT_COLUMNS);
  const messages = await supabase.from('messages').select('assessment_id, sender_role, content').order('message_id');

  const failed = ideas.error || assessments.error || messages.error;
  assessmentsFailed = Boolean(failed);
  if (failed) {
    report('load the history', failed);
    return [];
  }

  return assessments.data
    .map((assessment) => {
      const idea = ideas.data.find((row) => row.idea_id === assessment.idea_id);
      const own = messages.data.filter((row) => row.assessment_id === assessment.assessment_id);
      return idea ? fromRows(idea, assessment, own) : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

export async function getAssessment(id) {
  const all = await getAssessments();
  return all.find((assessment) => assessment.id === id) || null;
}

/* true when a conversation is about a real idea: Darb ran a competitor analysis
   on it (or, for older assessments, gave it a score). A chat that only said
   "hi" or asked a question has neither, so it is kept out of History and the
   sidebar, where only ideas belong. */
export function hasIdea(assessment) {
  return Boolean(assessment.analysedAt || assessment.score);
}

/* A conversation the founder wrote in: it is listed in History and the sidebar at once.
   Its name is the founder's first words until Darb finds the idea (becomeIdea). */
export function isListed(assessment) {
  if (isLaterIdea(assessment)) return false;   // it is shown inside its conversation
  return hasIdea(assessment) || assessment.messages > 0;
}

/* An idea the founder described later in another conversation: its own idea and assessment, whose thread_id is
   that conversation's assessment id (the agent server creates it, lib/conversation-ideas.ts). It is not a
   conversation of its own, so History lists its conversation instead. */
export function isLaterIdea(assessment) {
  return Boolean(assessment.threadId && assessment.threadId !== assessment.id);
}

/* After a reply: the later ideas of this conversation whose competitor analysis was just saved (a new idea, or a
   correction of one), each loaded with its result. `shown` maps the ideas already on the page to their assessment. */
export async function newLaterAnalyses(conversation, shown) {
  if (!conversation || !conversation.isSaved) return [];
  const { data, error } = await supabase.from('assessments').select('assessment_id, analysed_at').eq('thread_id', conversation.id).not('analysed_at', 'is', null).order('started_at');
  if (error) {
    report('check the later ideas of a conversation', error);
    return [];
  }
  const fresh = (data || []).filter((row) => !shown.has(row.assessment_id) || shown.get(row.assessment_id).analysedAt !== row.analysed_at);
  const loaded = [];
  for (const row of fresh) {
    const one = await loadOneAssessment(row.assessment_id);
    if (!one) continue;
    await loadResult(one);
    loaded.push(one);
  }
  return loaded;
}

/* One assessment with its idea and messages, without loading the founder's whole History (getAssessment does). */
async function loadOneAssessment(id) {
  const assessment = await supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('assessment_id', id).maybeSingle();
  if (assessment.error || !assessment.data) return null;
  const [idea, messages] = await Promise.all([
    supabase.from('startup_ideas').select('*').eq('idea_id', assessment.data.idea_id).maybeSingle(),
    supabase.from('messages').select('assessment_id, sender_role, content').eq('assessment_id', id).order('message_id'),
  ]);
  if (idea.error || !idea.data) return null;
  return fromRows(idea.data, assessment.data, messages.data || []);
}

/* The title of a conversation, taken from what the founder wrote: the first line,
   cut at 44 letters */
export function titleFrom(text) {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.length > 44 ? `${firstLine.slice(0, 44)}…` : firstLine;
}

/* An empty assessment for a new conversation (saved by saveAssessment) */
export function newAssessment(idea) {
  return {
    id: crypto.randomUUID(),
    ideaId: crypto.randomUUID(),
    isSaved: false,
    title: titleFrom(idea),
    idea,
    sector: '', city: '', model: '', hiring: '',
    noted: [],
    score: null, factors: [], roadmapShown: false, extra: [],
    history: [], threadId: '',
    messages: 0,
    updated: new Date().toISOString(),
  };
}

/* Saves a new assessment, or the new state of one that is already saved.
   Returns true when it worked. */
export async function saveAssessment(assessment) {
  const now = new Date().toISOString();
  assessment.updated = now;
  if (assessment.score && !assessment.completedAt) assessment.completedAt = now;
  if (assessment.roadmapShown && !assessment.roadmapAt) assessment.roadmapAt = now;

  // The agent server names the idea formally once it understands it ("بنك رقمي للتسوق الإلكتروني").
  // A name in the database that this page did not write is that formal name: it is kept, never overwritten.
  if (assessment.isSaved) {
    const { data: row } = await supabase.from('startup_ideas').select('idea_name').eq('idea_id', assessment.ideaId).maybeSingle();
    if (row && row.idea_name && row.idea_name !== assessment.savedTitle) assessment.title = row.idea_name;
  }
  assessment.savedTitle = assessment.title;

  const ideaColumns = {
    idea_name: assessment.title,
    idea_description: assessment.idea,
    sector: assessment.sector || null,
    city: assessment.city || null,
  };

  const assessmentColumns = {
    language: getLanguage(),
    status: assessment.score ? 'complete' : 'in_progress',
    model_input: { revenue_model: assessment.model, hiring: assessment.hiring, noted: assessment.noted },
    fis_score: assessment.score,
    explanation: assessment.score ? { factors: assessment.factors } : null,
    roadmap_generated_at: assessment.roadmapAt || null,
    completed_at: assessment.completedAt || null,
  };

  let error;

  if (!assessment.isSaved) {
    // first save: create the idea, then its assessment
    const { data } = await supabase.auth.getSession();
    const userId = data.session ? data.session.user.id : null;

    ({ error } = await supabase.from('startup_ideas').insert({ idea_id: assessment.ideaId, founder_id: userId, ...ideaColumns }));
    if (!error) {
      ({ error } = await supabase.from('assessments').insert({ assessment_id: assessment.id, idea_id: assessment.ideaId, ...assessmentColumns }));
    }
    if (!error) assessment.isSaved = true;
  } else {
    ({ error } = await supabase.from('startup_ideas').update(ideaColumns).eq('idea_id', assessment.ideaId));
    if (!error) {
      ({ error } = await supabase.from('assessments').update(assessmentColumns).eq('assessment_id', assessment.id));
    }
  }

  if (error) {
    report('save the assessment', error);
    return false;
  }
  return true;
}

/* Adds one message to the saved conversation.
     from     'user' or 'agent'
     content  { text: '...' }  plus, for a follow-up after the result,
              { followUp: true, about: 'the startup id it refers to' } */
export async function saveMessage(assessment, from, content) {
  assessment.messages += 1;
  assessment.history.push({ from, text: content.text || '', analysis: content.analysis || '' });   // so the page can draw it again
  if (!assessment.isSaved) return;

  const { error } = await supabase.from('messages').insert({
    assessment_id: assessment.id,
    sender_role: from,
    agent_name: from === 'agent' ? 'conversational' : null,
    content,
  });
  if (error) report('save a message', error);
}

/* Deletes one chat for good (migration 0041 lets a founder delete only their own).
   Its messages and competitor results are removed with it by the database.
   When it was the last chat of its idea, the idea is deleted too.
   Returns true when it worked. */
export async function deleteAssessment(assessment) {
  // .select() returns the deleted rows, so we can tell "deleted" from "nothing was allowed"
  const { data, error } = await supabase.from('assessments').delete().eq('assessment_id', assessment.id).select('assessment_id');
  if (error || data.length === 0) {
    report('delete the chat', error || { code: '', message: 'no row was deleted' });
    return false;
  }

  // the idea stays while another chat (a what-if) still uses it
  const others = await supabase.from('assessments').select('assessment_id').eq('idea_id', assessment.ideaId);
  if (!others.error && others.data.length === 0) {
    const idea = await supabase.from('startup_ideas').delete().eq('idea_id', assessment.ideaId);
    if (idea.error) report('delete the idea', idea.error);   // the chat is gone anyway
  }
  return true;
}

/* ---------- The list of past assessments in the sidebar ---------- */

/* Fills the sidebar list (layout.js made the empty box). guard.js calls this on
   every founder page; the chat page calls it again after it saves something. */
export async function showSidebarHistory() {
  const box = document.querySelector('#sidebar-history');
  if (!box) return;

  // every conversation the founder wrote in, at once
  const assessments = (await getAssessments()).filter(isListed);
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
