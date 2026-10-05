/* ==========================================================
   Assessments: the ONE place that knows where assessments come from.

   The founder's ideas, answers and messages are saved in Supabase
   (tables startup_ideas, assessments and messages, migration 0005).
   The similar startups, market numbers and roadmap come from the real datasets
   in the database (migration 0006). The SCORE is still a sample until the
   prediction model is connected. When the agents arrive, only this file
   changes; the chat and history pages stay as they are.

     import { getAssessments, getAssessment, saveAssessment } from '../../../shared/assessments.js';
     const list = await getAssessments();        // newest first
     const one  = await getAssessment(id);
     await loadResult(one);                      // adds one.result = { similar, market, roadmap }

   One assessment, as the pages see it:
     {
       id:      'the assessment id',
       title:   'Home food booking app',
       idea:    'the first message the founder wrote',
       sector, city, model, hiring:   the founder's answers (empty until answered)
       noted:   ['city'],             // answers Darb understood from the description, without asking
       score:   72,                   // empty until the analysis has run
       factors: [14, 12, -3, -1],     // what moved the score up or down from 50
       roadmapShown: false,           // did the founder ask for the roadmap in the chat?
       extra:   [{ from: 'user', text: '...' }, { from: 'agent' }],   // follow-up messages after the result
       messages: 9,                   // how many messages the conversation has
       updated: '2026-10-05T10:00:00.000Z',
     }

   Sample text is written in both languages: { en: '...', ar: '...' }.
   say(text) returns the right one.
   ========================================================== */

import { getLanguage, t } from './language.js';
import { supabase } from './supabase.js';

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

/* ---------- The score (SAMPLE until the prediction model is connected) ---------- */

/* What moves the score. The numbers for one assessment are in its "factors" list, in this order. */
export const SCORE_FACTORS = ['score.factor.demand', 'score.factor.difference', 'score.factor.competition', 'score.factor.sectorRisk'];

/* The steps the agent shows while it works */
export const AGENT_STEPS = ['agent.step.understand', 'agent.step.similar', 'agent.step.market', 'agent.step.score', 'agent.step.explain'];

/* ---------- Similar startups, market and roadmap (REAL data from the database) ----------
   The rows are real (tables startups, market_indicators and regulatory_requirements,
   filled from the Excel files in datasets/). What is still simple is HOW they are
   chosen: by the idea's sector. Later the similarity engine ranks the startups by
   meaning, and the Roadmap Agent decides which requirements apply to this venture. */

/* Darb's four sectors: the answer in the chat → the sector name used in the datasets */
const SECTORS = { ai: 'AI & Software', food: 'Food & Beverages', fashion: 'Fashion', furniture: 'Furniture' };

/* How to find startups of a sector: which column to look in, and for which word */
const STARTUP_SEARCH = {
  ai:        ['sector', 'Tech'],
  food:      ['sector', 'Food'],
  fashion:   ['sector', 'Fashion'],
  furniture: ['startup_description', 'furniture'],
};

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

async function loadSimilar(assessment) {
  const search = STARTUP_SEARCH[assessment.sector];
  if (!search) return [];

  const { data, error } = await supabase
    .from('startups')
    .select('startup_id, startup_name, startup_description, sector, region, stage, website')
    .ilike(search[0], `%${search[1]}%`)
    .limit(4);

  if (error) {
    report('load similar startups', error);
    return [];
  }
  return data.map((row) => ({
    id: row.startup_id,
    name: row.startup_name,
    about: row.startup_description || '',
    sector: row.sector || '',
    region: row.region || '',
    stage: row.stage || '',
    website: row.website || '',
  }));
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
  const row = data.find((item) => item.enterprises_total !== null);
  if (!row) return null;

  return {
    activity: { en: row.economic_activity_name_en, ar: row.economic_activity_name_ar || row.economic_activity_name_en },
    year: row.year,
    sourceUrl: row.source_url || '',
    numbers: [
      { label: 'market.establishments', value: row.enterprises_total },
      { label: 'market.newEnterprises', value: row.new_enterprises_total },
      { label: 'market.employees',      value: row.employees_total },
      { label: 'market.growth',         value: row.enterprises_growth_pct, isPercent: true },
    ].filter((number) => number.value !== null),
    sizes: [
      { label: 'size.micro',  value: row.share_micro_pct },
      { label: 'size.small',  value: row.share_small_pct },
      { label: 'size.medium', value: row.share_medium_pct },
      { label: 'size.large',  value: row.share_large_pct },
    ].filter((size) => size.value !== null),
  };
}

async function loadRoadmap(assessment) {
  const { data, error } = await supabase.from('regulatory_requirements').select('*');
  if (error) {
    report('load the regulatory requirements', error);
    return [];
  }

  const sectorName = SECTORS[assessment.sector] || '';
  const willHire = assessment.hiring !== 'no';

  return data
    .filter((row) => row.regulatory_status === 'Active')
    .filter((row) => row.sector === 'All' || (sectorName && row.sector.includes(sectorName)))
    .filter((row) => {
      const isRequired = row.mandatory === 'Required' || row.mandatory === 'Required when in scope';
      const isForThisSector = row.sector !== 'All' && !row.sector.includes(';');
      return (isRequired && (row.sector === 'All' ? row.mandatory === 'Required' : isForThisSector))
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
      authority: row.authority || '',
      // "what_darb_should_surface" is written as instructions for the agent, so until the
      // agent rewrites it for the founder, the plain "applies when" sentence is shown
      guidance: row.applies_when || '',
      type: row.mandatory === 'Required' ? 'mandatory' : 'conditional',
      link: row.service_url || row.official_source_url || '',
      source: row.official_source_url || '',
    }));
}

/* Loads the similar startups, the market numbers and the roadmap of one assessment
   and keeps them on it as assessment.result, so the pages can show them. */
export async function loadResult(assessment) {
  const [similar, market, roadmap] = await Promise.all([
    loadSimilar(assessment), loadMarket(assessment), loadRoadmap(assessment),
  ]);
  assessment.result = { similar, market, roadmap };
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
    factors: assessment.explanation ? assessment.explanation.factors : [],
    roadmapShown: Boolean(assessment.roadmap_generated_at),
    roadmapAt: assessment.roadmap_generated_at,
    completedAt: assessment.completed_at,
    extra: followUps.map((message) => ({
      from: message.sender_role,
      text: message.content.text || '',
      about: message.content.about || '',
    })),
    messages: messages.length,
    updated: idea.updated_at || idea.created_at,
  };
}

/* Every assessment of the signed-in founder, newest first.
   The database's security rules return only this founder's rows. */
export async function getAssessments() {
  const ideas = await supabase.from('startup_ideas').select('*');
  const assessments = await supabase.from('assessments').select('*');
  const messages = await supabase.from('messages').select('assessment_id, sender_role, content').order('message_id');

  const failed = ideas.error || assessments.error || messages.error;
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

    ({ error } = await supabase.from('startup_ideas').insert({ idea_id: assessment.ideaId, user_id: userId, ...ideaColumns }));
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
  if (!assessment.isSaved) return;

  const { error } = await supabase.from('messages').insert({
    assessment_id: assessment.id,
    sender_role: from,
    agent_name: from === 'agent' ? 'conversational' : null,
    content,
  });
  if (error) report('save a message', error);
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
