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
       parentId, whatIf:   a what-if: the assessment it changes, and its short name ("Jeddah instead of Riyadh"),
                           kept in its confirmed_inputs (what_if_of, what_if_label)
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
  let { data, error } = await read('*, result_sources (url, source_type, accessed_at)');
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
    activity: { en: row.economic_activity_name_en, ar: row.economic_activity_name_ar || row.economic_activity_name_en },
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

/* Loads the competitors, the market numbers and the roadmap of one assessment
   and keeps them on it as assessment.result, so the pages can show them. */
export async function loadResult(assessment) {
  const [competitors, market, roadmap] = await Promise.all([
    loadCompetitors(assessment), loadMarket(assessment), loadRoadmap(assessment),
  ]);
  assessment.result = { competitors, market, roadmap };
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
    competitorNotes: assessment.competitor_notes || [],
    analysedAt: assessment.analysed_at || '',
    // a what-if is a new assessment of the same idea; its link and name are in its confirmed_inputs
    parentId: (assessment.confirmed_inputs && assessment.confirmed_inputs.what_if_of) || '',
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
    history: messages.map((message) => ({ from: message.sender_role, text: message.content.text || '' })),
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
  const assessments = await supabase.from('assessments').select('*');
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

/* An empty assessment for a new conversation (saved by saveAssessment) */
export function newAssessment(idea) {
  const firstLine = idea.trim().split('\n')[0];

  return {
    id: crypto.randomUUID(),
    ideaId: crypto.randomUUID(),
    isSaved: false,
    title: firstLine.length > 44 ? `${firstLine.slice(0, 44)}…` : firstLine,
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
    band: assessment.score ? { good: 'higher', warn: 'moderate', risk: 'lower' }[scoreBand(assessment.score)] : null,
    risk_level: assessment.score ? { good: 'low', warn: 'moderate', risk: 'high' }[scoreBand(assessment.score)] : null,
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
  assessment.history.push({ from, text: content.text || '' });   // so the page can draw it again
  if (!assessment.isSaved) return;

  const { error } = await supabase.from('messages').insert({
    assessment_id: assessment.id,
    sender_role: from,
    agent_name: from === 'agent' ? 'conversational' : null,
    content,
  });
  if (error) report('save a message', error);
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
