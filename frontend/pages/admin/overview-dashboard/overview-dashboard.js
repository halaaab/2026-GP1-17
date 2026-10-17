/* Admin overview: a live picture of Darb.
   Reads what admins may read (migrations 0001, 0005, 0006): founders, their ideas
   and assessments, and the reference data (startups, programs, requirements,
   market indicators). Every number is counted here, in the browser.

   Sections, in page order:
     1. KPIs for the chosen period (7, 30 or 90 days), each with its change and a sparkline
     2. Founder journey: signed up → described an idea → got a score → opened a roadmap
     3. Score health: how the scores are spread across the three bands
     4. Activity rhythm: founder actions per day, last 12 weeks
     5. Who is on Darb: founders by type, region or language
     6. Data health: what needs the admin's attention, with links to fix it
     7. Latest activity */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { supabase } from '../../../shared/supabase.js';
import { getAccount } from '../../../shared/auth.js';
import { scoreBand, whenText } from '../../../shared/assessments.js';
import { completeness } from '../../founder/incubators-accelerators/programs.js';
import '../../../shared/guard.js';

const ROOT = new URL('../../../', import.meta.url).href;
const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 12;              // weeks in the activity heatmap
const STALE_DAYS = 180;        // a requirement not checked for this long needs a look
const STALLED_DAYS = 7;        // a conversation left this long without a result is stalled

const PAGES = {
  founders:     'pages/admin/founder-management/founder-management.html',
  startups:     'pages/admin/startup-management/startup-management.html',
  regulatory:   'pages/admin/regulatory-management/regulatory-management.html',
  programs:     'pages/admin/incubator-accelerator-management/incubator-accelerator-management.html',
};

// founder types → their words in translations (from the sign-up page)
const TYPE_WORDS = {
  student: 'signup.student', entrepreneur: 'signup.entrepreneur', business_owner: 'signup.owner',
  investor: 'signup.investor', other: 'signup.other',
};

let data = null;       // everything loaded from the database
let days = 30;         // the KPI period
let peopleGroup = 'type';
let adminName = '';
let loadedAt = null;

/* ---------- Small helpers ---------- */

// Text typed by founders and admins is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function locale() {
  return getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
}

function number(value) {
  return new Intl.NumberFormat(getLanguage() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(value);
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function fill(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

// 'YYYY-MM-DD' in local time, used to count things per day
function dayKey(date) {
  const day = new Date(date);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function shortDate(date) {
  return new Date(date).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function isBetween(date, from, to) {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= from && time < to;
}

/* ---------- Loading ---------- */

// Supabase returns at most 1000 rows at a time, so bigger tables are read in pages
async function readAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) {
      console.error(`Overview: could not read ${table}:`, error.code, error.message);
      return { rows, failed: true };
    }
    rows.push(...page);
    if (page.length < 1000) return { rows, failed: false };
  }
}

async function load() {
  const results = await Promise.all([
    readAll('users', 'user_id, full_name, user_type, region, status, locale, created_at'),
    readAll('startup_ideas', 'idea_id, user_id, idea_name, sector, created_at'),
    readAll('assessments', 'assessment_id, idea_id, status, fis_score, risk_level, started_at, completed_at, roadmap_generated_at'),
    readAll('startups', 'startup_id, sector, startup_description'),
    readAll('support_organisations', '*'),
    readAll('regulatory_requirements', 'requirement_id, sector, last_verified'),
    readAll('market_indicators', 'record_id, year'),
  ]);

  const [users, ideas, assessments, startups, programs, requirements, market] = results.map((result) => result.rows);
  document.querySelector('#load-error').hidden = !results.some((result) => result.failed);

  // quick look-ups: idea → founder, founder → name
  const ideaById = new Map(ideas.map((idea) => [idea.idea_id, idea]));
  const userById = new Map(users.map((user) => [user.user_id, user]));

  loadedAt = new Date();
  return { users, ideas, assessments, startups, programs, requirements, market, ideaById, userById };
}

/* ---------- Tooltip (one for the whole page) ---------- */

const tip = document.querySelector('#tip');

function moveTip(event) {
  const margin = 14;
  const box = tip.getBoundingClientRect();
  let left = event.clientX + margin;
  let top = event.clientY + margin;
  if (left + box.width > window.innerWidth - 8) left = event.clientX - box.width - margin;
  if (top + box.height > window.innerHeight - 8) top = event.clientY - box.height - margin;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

document.addEventListener('pointerover', (event) => {
  const target = event.target.closest('[data-tip]');
  if (!target) return;
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  moveTip(event);
});
document.addEventListener('pointermove', (event) => {
  if (!tip.hidden) moveTip(event);
});
document.addEventListener('pointerout', (event) => {
  if (event.target.closest('[data-tip]')) tip.hidden = true;
});
// a chart drawn again, or the page scrolled, leaves nothing under the pointer
window.addEventListener('scroll', () => { tip.hidden = true; }, true);

/* ---------- Head: greeting and pulse ---------- */

function showHead() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  document.querySelector('#today').textContent = new Date().toLocaleDateString(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  document.querySelector('#hello').textContent = fill(`overview.hello.${part}`, { name: adminName || t('role.admin') });
  document.querySelector('#refresh').innerHTML = icon('chevrons');
}

function showPulse({ founders, ideas, done }) {
  const pulse = document.querySelector('#pulse');
  pulse.textContent = founders + ideas + done === 0
    ? fill('overview.pulseQuiet', { days })
    : fill('overview.pulse', { days, founders: number(founders), ideas: number(ideas), done: number(done) });
}

/* ---------- 1. KPIs ---------- */

// One count per day of the period, oldest first
function perDay(dates, from) {
  const counts = new Map();
  dates.forEach((date) => {
    const key = dayKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(from + index * DAY);
    return { day, value: counts.get(dayKey(day)) || 0 };
  });
}

// The average score per day; days without a score stay empty
function averagePerDay(items, from) {
  const byDay = new Map();
  items.forEach((item) => {
    const key = dayKey(item.completed_at);
    byDay.set(key, [...(byDay.get(key) || []), item.fis_score]);
  });
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(from + index * DAY);
    const scores = byDay.get(dayKey(day));
    return { day, value: scores ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
  });
}

/* A small line chart. Time runs left to right in both languages.
   Each day has an invisible column that shows its number on hover. */
function sparkline(points, unit) {
  const width = 160;
  const height = 40;
  const known = points.filter((point) => point.value !== null);
  if (known.length === 0) return '<div class="ov-spark ov-spark-empty"></div>';

  const max = Math.max(1, ...known.map((point) => point.value));
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const x = (index) => index * step;
  const y = (value) => height - 3 - (value / max) * (height - 8);

  const line = points
    .map((point, index) => (point.value === null ? null : `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`))
    .filter(Boolean);
  const lastIndex = points.map((point) => point.value !== null).lastIndexOf(true);
  const area = `M${line[0]} L${line.join(' L')} L${x(lastIndex).toFixed(1)},${height} L${line[0].split(',')[0]},${height} Z`;

  const columns = points.map((point, index) => `
    <rect class="ov-spark-hit" x="${(x(index) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${height}"
      data-tip="${safe(`${shortDate(point.day)} · ${point.value === null ? '—' : `${number(point.value)} ${unit}`}`)}"></rect>`).join('');

  return `
    <svg class="ov-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path class="ov-spark-area" d="${area}"></path>
      <polyline class="ov-spark-line" points="${line.join(' ')}"></polyline>
      <circle class="ov-spark-dot" cx="${x(lastIndex).toFixed(1)}" cy="${y(points[lastIndex].value).toFixed(1)}" r="3"></circle>
      ${columns}
    </svg>`;
}

// "+12%" against the previous period; up is good for every KPI here
function change(current, previous, inPoints = false) {
  if (current === null || previous === null) return { text: '—', kind: 'flat' };
  if (inPoints) {
    const difference = current - previous;
    return { text: `${difference > 0 ? '+' : ''}${difference} ${t('overview.pts')}`, kind: difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat' };
  }
  if (previous === 0) return current === 0 ? { text: '0%', kind: 'flat' } : { text: t('overview.newChange'), kind: 'up' };
  const difference = Math.round(((current - previous) / previous) * 100);
  return { text: `${difference > 0 ? '+' : ''}${difference}%`, kind: difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat' };
}

function kpiCard({ label: name, value, delta, spark, foot, link }, index) {
  const chip = { up: 'chip-good', down: 'chip-risk', flat: '' }[delta.kind];
  const arrow = delta.kind === 'flat' ? '' : `<span class="ov-arrow ${delta.kind === 'down' ? 'is-down' : ''}">${icon('arrowUp')}</span>`;
  return `
    <article class="card ov-kpi fade-up" style="--i: ${index}">
      <div class="ov-kpi-top">
        <span class="stat-label">${name}</span>
        <span class="chip ${chip}" title="${safe(fill('overview.vsPrevious', { days }))}">${arrow}<span dir="ltr">${delta.text}</span></span>
      </div>
      <span class="stat-value">${value}</span>
      ${spark}
      <div class="ov-kpi-foot">
        <span class="text-3">${foot}</span>
        ${link ? `<a class="link ov-kpi-link" href="${ROOT}${link}" aria-label="${safe(name)}">${icon('chevron')}</a>` : ''}
      </div>
    </article>`;
}

function showKpis() {
  const now = Date.now();
  const to = startOfDay(now).getTime() + DAY;   // the end of today
  const from = to - days * DAY;
  const before = from - days * DAY;

  const inWindow = (date) => isBetween(date, from, to);
  const inPrevious = (date) => isBetween(date, before, from);

  const newFounders = data.users.filter((user) => inWindow(user.created_at));
  const oldFounders = data.users.filter((user) => inPrevious(user.created_at));
  const newIdeas = data.ideas.filter((idea) => inWindow(idea.created_at));
  const oldIdeas = data.ideas.filter((idea) => inPrevious(idea.created_at));

  const scored = data.assessments.filter((item) => item.fis_score !== null && item.completed_at);
  const done = scored.filter((item) => inWindow(item.completed_at));
  const doneBefore = scored.filter((item) => inPrevious(item.completed_at));
  const started = data.assessments.filter((item) => inWindow(item.started_at));

  const average = (items) => (items.length ? Math.round(items.reduce((sum, item) => sum + item.fis_score, 0) / items.length) : null);
  const activeFounders = data.users.filter((user) => user.status === 'active').length;
  const ideaAuthors = new Set(newIdeas.map((idea) => idea.user_id)).size;
  const ideasPerFounder = ideaAuthors ? (newIdeas.length / ideaAuthors).toFixed(1) : '0';

  const cards = [
    {
      label: t('overview.kNewFounders'),
      value: number(newFounders.length),
      delta: change(newFounders.length, oldFounders.length),
      spark: sparkline(perDay(newFounders.map((user) => user.created_at), from), t('overview.uFounders')),
      foot: fill('overview.kFoundersFoot', { total: number(data.users.length), active: percent(activeFounders, data.users.length) }),
      link: PAGES.founders,
    },
    {
      label: t('overview.kIdeas'),
      value: number(newIdeas.length),
      delta: change(newIdeas.length, oldIdeas.length),
      spark: sparkline(perDay(newIdeas.map((idea) => idea.created_at), from), t('overview.uIdeas')),
      foot: fill('overview.kIdeasFoot', { n: ideasPerFounder }),
    },
    {
      label: t('overview.kDone'),
      value: number(done.length),
      delta: change(done.length, doneBefore.length),
      spark: sparkline(perDay(done.map((item) => item.completed_at), from), t('overview.uDone')),
      foot: fill('overview.kDoneFoot', { rate: percent(started.filter((item) => item.completed_at).length, started.length) }),
    },
    {
      label: t('overview.kScore'),
      value: average(done) === null ? '—' : number(average(done)),
      delta: change(average(done), average(doneBefore), true),
      spark: sparkline(averagePerDay(done, from), t('overview.uScore')),
      foot: average(done) === null ? t('overview.kScoreNone') : t(`score.band.${scoreBand(average(done))}`),
    },
  ];

  document.querySelector('#kpis').innerHTML = cards.map(kpiCard).join('');
  showPulse({ founders: newFounders.length, ideas: newIdeas.length, done: done.length });
}

/* ---------- 2. Founder journey ---------- */

function showFunnel() {
  const founderOf = (assessment) => data.ideaById.get(assessment.idea_id)?.user_id;

  const steps = [
    { key: 'overview.fSigned',  people: new Set(data.users.map((user) => user.user_id)) },
    { key: 'overview.fIdea',    people: new Set(data.ideas.map((idea) => idea.user_id)) },
    { key: 'overview.fScore',   people: new Set(data.assessments.filter((item) => item.fis_score !== null).map(founderOf).filter(Boolean)) },
    { key: 'overview.fRoadmap', people: new Set(data.assessments.filter((item) => item.roadmap_generated_at).map(founderOf).filter(Boolean)) },
  ].map((step) => ({ ...step, count: step.people.size }));

  const first = steps[0].count;
  let biggestDrop = null;

  document.querySelector('#funnel').innerHTML = steps.map((step, index) => {
    const share = percent(step.count, first);
    const previous = index > 0 ? steps[index - 1].count : null;
    const kept = previous ? percent(step.count, previous) : null;
    if (previous && (!biggestDrop || 100 - kept > biggestDrop.lost)) {
      biggestDrop = { lost: 100 - kept, from: steps[index - 1].key, to: step.key };
    }
    return `
      <li class="ov-step">
        <div class="ov-step-label">
          <span class="ov-step-number">${index + 1}</span>
          <span>${t(step.key)}</span>
          <strong class="ov-step-count">${number(step.count)}</strong>
          ${kept !== null ? `<span class="ov-step-kept" title="${safe(t('overview.keptTitle'))}">${kept}%</span>` : ''}
        </div>
        <div class="ov-step-bar" data-tip="${safe(`${t(step.key)} · ${number(step.count)} (${share}%)`)}">
          <div class="ov-step-fill" style="width: ${first ? Math.max(share, 1.5) : 0}%"></div>
        </div>
      </li>`;
  }).join('');

  const insight = document.querySelector('#funnel-insight');
  insight.innerHTML = first === 0
    ? `${icon('spark')}<span>${t('overview.fEmpty')}</span>`
    : biggestDrop && biggestDrop.lost > 0
      ? `${icon('spark')}<span>${fill('overview.fInsight', { from: t(biggestDrop.from), to: t(biggestDrop.to), n: biggestDrop.lost })}</span>`
      : `${icon('check')}<span>${t('overview.fNoDrop')}</span>`;
}

/* ---------- 3. Score health ---------- */

function showScores() {
  const scores = data.assessments.map((item) => item.fis_score).filter((score) => score !== null);
  const box = document.querySelector('#scores');

  if (scores.length === 0) {
    box.innerHTML = `<p class="empty ov-empty">${t('overview.scoresEmpty')}</p>`;
    return;
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // ten columns: 0–9, 10–19 ... 90–100
  const bins = Array.from({ length: 10 }, (_, index) => ({ from: index * 10, count: 0 }));
  scores.forEach((score) => { bins[Math.min(9, Math.floor(score / 10))].count += 1; });
  const tallest = Math.max(...bins.map((bin) => bin.count));

  const bands = ['good', 'warn', 'risk'].map((band) => ({
    band, count: scores.filter((score) => scoreBand(score) === band).length,
  }));

  const risks = ['low', 'moderate', 'high'].map((level) => ({
    level, count: data.assessments.filter((item) => item.risk_level === level).length,
  })).filter((risk) => risk.count > 0);

  box.innerHTML = `
    <div class="ov-score-top">
      <div class="ov-score-big">
        <span class="ov-score-number">${median}</span>
        <span class="text-3">${t('overview.median')}</span>
      </div>
      <div class="ov-score-facts">
        <span><strong>${number(scores.length)}</strong> ${t('overview.scored')}</span>
        <span><strong>${average}</strong> ${t('overview.average')}</span>
      </div>
    </div>

    <div class="ov-histogram" role="img" aria-label="${safe(t('overview.histogramLabel'))}">
      ${bins.map((bin) => `
        <div class="ov-bin" data-tip="${safe(`${bin.from}–${bin.from === 90 ? 100 : bin.from + 9} · ${number(bin.count)} ${t('overview.uDone')}`)}">
          <div class="ov-bin-fill ov-${scoreBand(bin.from)}" style="height: ${tallest ? (bin.count / tallest) * 100 : 0}%"></div>
        </div>`).join('')}
    </div>
    <div class="ov-axis" dir="ltr">${[0, 40, 70, 100].map((mark) => `<span style="left: ${mark}%">${mark}</span>`).join('')}</div>

    <div class="ov-stack" role="img" aria-label="${safe(bands.map((item) => `${t(`score.band.${item.band}`)}: ${item.count}`).join(', '))}">
      ${bands.filter((item) => item.count).map((item) => `<div class="ov-${item.band}" style="flex: ${item.count}" data-tip="${safe(`${t(`score.band.${item.band}`)} · ${number(item.count)} (${percent(item.count, scores.length)}%)`)}"></div>`).join('')}
    </div>
    <ul class="ov-legend">
      ${bands.map((item) => `
        <li><i class="ov-${item.band}"></i><span>${t(`score.band.${item.band}`)}</span><strong>${percent(item.count, scores.length)}%</strong></li>`).join('')}
    </ul>
    ${risks.length ? `<div class="ov-risks"><span class="text-3">${t('overview.riskLevels')}</span>${risks.map((risk) => `<span class="chip">${t(`overview.risk.${risk.level}`)} · ${number(risk.count)}</span>`).join('')}</div>` : ''}`;
}

/* ---------- 4. Activity rhythm ---------- */

function showRhythm() {
  // founder actions: signing up, describing an idea, finishing an assessment
  const counts = new Map();
  const add = (date) => {
    if (!date) return;
    const key = dayKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  data.users.forEach((user) => add(user.created_at));
  data.ideas.forEach((idea) => add(idea.created_at));
  data.assessments.forEach((item) => add(item.completed_at));

  // The grid starts on a Sunday (the Saudi week), WEEKS weeks ago
  const today = startOfDay(Date.now());
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);

  const cells = [];
  for (let index = 0; index < WEEKS * 7; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    cells.push({ day, value: day > today ? null : counts.get(dayKey(day)) || 0 });
  }

  const shown = cells.filter((cell) => cell.value !== null);
  const max = Math.max(0, ...shown.map((cell) => cell.value));
  const level = (value) => (value === 0 || max === 0 ? 0 : Math.max(1, Math.ceil((value / max) * 4)));

  // weekday names, Sunday first
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day.toLocaleDateString(locale(), { weekday: 'short' });
  });

  // month names above the first week of each month
  const months = Array.from({ length: WEEKS }, (_, week) => {
    const day = cells[week * 7].day;
    const previous = week > 0 ? cells[(week - 1) * 7].day : null;
    return !previous || previous.getMonth() !== day.getMonth() ? day.toLocaleDateString(locale(), { month: 'short' }) : '';
  });

  document.querySelector('#heatmap').innerHTML = `
    <div class="ov-heat-months">${months.map((month) => `<span>${month}</span>`).join('')}</div>
    <div class="ov-heat-days">${weekdays.map((name, index) => `<span>${index % 2 ? name : ''}</span>`).join('')}</div>
    <div class="ov-heat-grid" role="img" aria-label="${safe(fill('overview.heatLabel', { n: number(shown.reduce((sum, cell) => sum + cell.value, 0)), weeks: WEEKS }))}">
      ${cells.map((cell) => (cell.value === null
        ? '<i class="ov-cell is-future"></i>'
        : `<i class="ov-cell ov-level-${level(cell.value)}" data-tip="${safe(`${cell.day.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' })} · ${number(cell.value)} ${t('overview.uActions')}`)}"></i>`)).join('')}
    </div>`;

  // facts beside the grid
  const total = shown.reduce((sum, cell) => sum + cell.value, 0);
  const byWeekday = Array(7).fill(0);
  shown.forEach((cell) => { byWeekday[cell.day.getDay()] += cell.value; });
  const busiestWeekday = byWeekday.indexOf(Math.max(...byWeekday));
  const best = shown.reduce((top, cell) => (cell.value > (top?.value ?? 0) ? cell : top), null);

  // days in a row with activity, counting back from today (or yesterday, if today is still quiet)
  let streak = 0;
  for (let index = shown.length - 1; index >= 0; index -= 1) {
    if (shown[index].value > 0) streak += 1;
    else if (index === shown.length - 1) continue;
    else break;
  }

  const fact = (title, value, detail = '') => `
    <div class="ov-fact">
      <span class="text-3">${title}</span>
      <strong>${value}</strong>
      ${detail ? `<span class="text-3">${detail}</span>` : ''}
    </div>`;

  document.querySelector('#rhythm-facts').innerHTML = total === 0
    ? `<p class="text-3">${t('overview.rhythmEmpty')}</p>`
    : [
      fact(fill('overview.actionsIn', { weeks: WEEKS }), number(total), fill('overview.perDay', { n: (total / shown.length).toFixed(1) })),
      fact(t('overview.busiestDay'), new Date(start.getTime() + busiestWeekday * DAY).toLocaleDateString(locale(), { weekday: 'long' })),
      fact(t('overview.bestDay'), best ? shortDate(best.day) : '—', best ? `${number(best.value)} ${t('overview.uActions')}` : ''),
      fact(t('overview.streak'), fill('overview.streakDays', { n: streak })),
    ].join('');
}

/* ---------- 5. Who is on Darb ---------- */

function groupName(group, value) {
  if (!value) return t('overview.notSet');
  if (group === 'type') return t(TYPE_WORDS[value] || value);
  if (group === 'locale') return value === 'en' ? 'English' : 'العربية';
  const key = `signup.region.${value}`;
  return t(key) === key ? value : t(key);
}

function showPeople() {
  const counts = new Map();
  data.users.forEach((user) => {
    const value = user[peopleGroup === 'type' ? 'user_type' : peopleGroup] || '';
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  // the six biggest groups, then the rest together
  let groups = [...counts].sort((a, b) => b[1] - a[1]);
  if (groups.length > 7) {
    const rest = groups.slice(6).reduce((sum, [, count]) => sum + count, 0);
    groups = [...groups.slice(0, 6), ['__other', rest]];
  }
  const top = Math.max(1, ...groups.map(([, count]) => count));

  document.querySelector('#people-sub').textContent = fill('overview.peopleSub', { n: number(data.users.length) });
  document.querySelector('#people').innerHTML = groups.length === 0
    ? `<li class="text-3">${t('overview.peopleEmpty')}</li>`
    : groups.map(([value, count]) => `
      <li class="ov-bar-row" data-tip="${safe(`${value === '__other' ? t('overview.others') : groupName(peopleGroup, value)} · ${number(count)} (${percent(count, data.users.length)}%)`)}">
        <span class="ov-bar-label">${safe(value === '__other' ? t('overview.others') : groupName(peopleGroup, value))}</span>
        <div class="ov-bar-track"><div class="ov-bar-fill" style="width: ${(count / top) * 100}%"></div></div>
        <span class="ov-bar-value">${number(count)} <span class="text-3">${percent(count, data.users.length)}%</span></span>
      </li>`).join('');
}

/* ---------- 6. Data health ---------- */

function showHealth() {
  const now = Date.now();
  const currentYear = new Date().getFullYear();

  const stale = data.requirements.filter((rule) => !rule.last_verified || now - new Date(rule.last_verified) > STALE_DAYS * DAY).length;
  const incompletePrograms = data.programs.filter((program) => completeness(program) < 100).length;
  const noDescription = data.startups.filter((startup) => !(startup.startup_description || '').trim()).length;
  const latestYear = data.market.reduce((year, row) => Math.max(year, row.year || 0), 0);
  const stalled = data.assessments.filter((item) => item.status === 'in_progress' && !item.completed_at
    && now - new Date(item.started_at) > STALLED_DAYS * DAY).length;
  const deactivated = data.users.filter((user) => user.status === 'deactivated').length;

  // ok: true (done), false (needs work); empty tables always need work
  const checks = [
    {
      ok: data.requirements.length > 0 && stale === 0,
      title: t('overview.hRules'),
      detail: data.requirements.length ? fill('overview.hRulesDetail', { n: number(stale), total: number(data.requirements.length), days: STALE_DAYS }) : t('overview.hEmptyTable'),
      link: PAGES.regulatory,
    },
    {
      ok: data.programs.length > 0 && incompletePrograms === 0,
      title: t('overview.hPrograms'),
      detail: data.programs.length ? fill('overview.hProgramsDetail', { n: number(incompletePrograms), total: number(data.programs.length) }) : t('overview.hEmptyTable'),
      link: PAGES.programs,
    },
    {
      ok: data.startups.length > 0 && noDescription === 0,
      title: t('overview.hStartups'),
      detail: data.startups.length ? fill('overview.hStartupsDetail', { n: number(noDescription), total: number(data.startups.length) }) : t('overview.hEmptyTable'),
      link: PAGES.startups,
    },
    {
      ok: latestYear >= currentYear - 1,
      title: t('overview.hMarket'),
      detail: latestYear ? fill('overview.hMarketDetail', { year: latestYear, n: number(data.market.length) }) : t('overview.hEmptyTable'),
    },
    {
      ok: stalled === 0,
      title: t('overview.hStalled'),
      detail: fill('overview.hStalledDetail', { n: number(stalled), days: STALLED_DAYS }),
    },
    {
      ok: true,
      info: true,
      title: t('overview.hDeactivated'),
      detail: fill('overview.hDeactivatedDetail', { n: number(deactivated) }),
      link: PAGES.founders,
    },
  ];

  const scored = checks.filter((check) => !check.info);
  const health = percent(scored.filter((check) => check.ok).length, scored.length);
  const band = health >= 80 ? 'good' : health >= 50 ? 'warn' : 'risk';
  const length = 2 * Math.PI * 24;

  document.querySelector('#health-ring').innerHTML = `
    <svg viewBox="0 0 60 60" role="img" aria-label="${safe(fill('overview.healthScore', { n: health }))}">
      <circle class="ov-ring-track" cx="30" cy="30" r="24"></circle>
      <circle class="ov-ring-fill ov-${band}-stroke" cx="30" cy="30" r="24" stroke-dasharray="${length}" stroke-dashoffset="${length * (1 - health / 100)}"></circle>
    </svg>
    <strong>${health}%</strong>`;

  document.querySelector('#health').innerHTML = checks.map((check) => `
    <li class="ov-check">
      <span class="ov-check-icon ${check.info ? 'is-info' : check.ok ? 'is-ok' : 'is-todo'}">${icon(check.info ? 'users' : check.ok ? 'check' : 'flag')}</span>
      <div class="ov-check-text">
        <strong>${check.title}</strong>
        <span class="text-3">${check.detail}</span>
      </div>
      <span class="chip ${check.info ? '' : check.ok ? 'chip-good' : 'chip-warn'}">${t(check.info ? 'overview.hInfo' : check.ok ? 'overview.hOk' : 'overview.hTodo')}</span>
      ${check.link ? `<a class="btn-icon ov-check-link" href="${ROOT}${check.link}" aria-label="${safe(`${t('overview.hOpen')}: ${check.title}`)}">${icon('chevron')}</a>` : '<span class="ov-check-link"></span>'}
    </li>`).join('');
}

/* ---------- 7. Latest activity ---------- */

function showFeed() {
  const nameOf = (userId) => data.userById.get(userId)?.full_name || t('overview.aFounder');

  const events = [
    ...data.users.map((user) => ({
      at: user.created_at, who: user.full_name, kind: 'joined',
      text: fill('overview.eJoined', { name: `<strong>${safe(user.full_name)}</strong>` }),
    })),
    ...data.ideas.map((idea) => ({
      at: idea.created_at, who: nameOf(idea.user_id), kind: 'idea',
      text: fill('overview.eIdea', { name: `<strong>${safe(nameOf(idea.user_id))}</strong>`, idea: safe(idea.idea_name) }),
    })),
    ...data.assessments.filter((item) => item.completed_at && item.fis_score !== null).map((item) => {
      const idea = data.ideaById.get(item.idea_id);
      return {
        at: item.completed_at, who: nameOf(idea?.user_id), kind: 'score', score: item.fis_score,
        text: fill('overview.eScore', { name: `<strong>${safe(nameOf(idea?.user_id))}</strong>`, idea: safe(idea?.idea_name || '') }),
      };
    }),
  ]
    .filter((event) => event.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 7);

  document.querySelector('#feed').innerHTML = events.length === 0
    ? `<li class="text-3">${t('overview.feedEmpty')}</li>`
    : events.map((event) => `
      <li class="ov-event">
        <span class="avatar avatar-sm">${safe(initials(event.who))}</span>
        <div class="ov-event-text">
          <span>${event.text}</span>
          <span class="text-3">${whenText(event.at)}</span>
        </div>
        ${event.kind === 'score'
          ? `<span class="chip chip-${scoreBand(event.score)}">${event.score}</span>`
          : `<span class="ov-event-kind">${icon(event.kind === 'joined' ? 'user' : 'spark')}</span>`}
      </li>`).join('');
}

/* ---------- Drawing everything ---------- */

function showAll() {
  tip.hidden = true;
  showHead();
  if (!data) return;
  showKpis();
  showFunnel();
  showScores();
  showRhythm();
  showPeople();
  showHealth();
  showFeed();
  document.querySelector('#updated').textContent = fill('overview.updated', {
    time: loadedAt.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
  });
}

/* ---------- Events ---------- */

document.querySelector('#period').addEventListener('click', (event) => {
  const button = event.target.closest('[data-days]');
  if (!button || !data) return;
  days = Number(button.dataset.days);
  document.querySelectorAll('[data-days]').forEach((item) => item.classList.toggle('is-active', item === button));
  try {
    localStorage.setItem('darb-overview-days', days);
  } catch {
    // private windows may block storage; the period still changes
  }
  tip.hidden = true;
  showKpis();
});

document.querySelector('#people-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-group]');
  if (!button || !data) return;
  peopleGroup = button.dataset.group;
  document.querySelectorAll('[data-group]').forEach((item) => item.classList.toggle('is-active', item === button));
  showPeople();
});

const refreshButton = document.querySelector('#refresh');
refreshButton.addEventListener('click', async () => {
  refreshButton.classList.add('is-spinning');
  data = await load();
  refreshButton.classList.remove('is-spinning');
  showAll();
});

// every label is text in the current language, so draw again when it changes
document.addEventListener('darb:language', showAll);

/* ---------- Start ---------- */

try {
  const saved = Number(localStorage.getItem('darb-overview-days'));
  if ([7, 30, 90].includes(saved)) days = saved;
} catch {
  // keep 30 days
}
document.querySelectorAll('[data-days]').forEach((item) => item.classList.toggle('is-active', Number(item.dataset.days) === days));

const account = await getAccount();
adminName = (account.profile?.full_name || '').trim().split(/\s+/)[0];
showHead();

data = await load();
showAll();
