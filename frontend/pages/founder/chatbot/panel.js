/* The assessment: a full page that takes the place of the chat and shows one
   assessment in five tabs (Score, Competitor analysis, Market, Roadmap, Report).

   chatbot.js opens it:
     import { openPanel } from './panel.js';
     openPanel(assessment, 'score');

   Each tab is one function below that returns HTML. The competitors, market numbers
   and roadmap are in assessment.result, loaded by loadResult() in shared/assessments.js.
   The "similar" tab is the Competitor Analysis: what the Competitor Agent checked and saved. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import {
  say, label, scoreBand, whenText, SCORE_FACTORS,
} from '../../../shared/assessments.js';

const TABS = ['score', 'similar', 'market', 'roadmap', 'report'];
// A what-if is only a competitor analysis of a changed idea: it has no survival score, market or roadmap of its own.
const WHAT_IF_TABS = ['similar', 'report'];
const tabsOf = (shown) => (shown.whatIf ? WHAT_IF_TABS : TABS);

// the Darb logo, for the top of the report
const LOGO = new URL('../../../assets/images/%20Darb-logo-horizontal.png', import.meta.url).href;

// the folder with the logos of the authorities and of Monsha'at
const LOGOS = new URL('../../../assets/images/logos/', import.meta.url).href;

const panel = document.querySelector('#assess');

let assessment = null;       // the assessment being shown
let currentTab = 'score';
let roadmapView = 'list';    // 'list' or 'diagram'

/* Founders type the idea title themselves, so it is made safe before it goes into HTML */
function safe(text) {
  const box = document.createElement('span');
  box.textContent = text;
  return box.innerHTML;
}

/* ---------- Open, close, switch tab ---------- */

export function openPanel(assessmentToShow, tab = 'score') {
  assessment = assessmentToShow;
  currentTab = tabsOf(assessment).includes(tab) ? tab : tabsOf(assessment)[0];

  drawPanel();
  panel.classList.add('is-open');
  document.body.classList.add('assess-open');   // chatbot.css hides the chat while this is on
  window.scrollTo({ top: 0, behavior: 'instant' });
  playScore(currentTab === 'report');
}

export function closePanel() {
  panel.classList.remove('is-open');
  document.body.classList.remove('assess-open');
}

function showTab(tab, withoutAnimation = false) {
  currentTab = tab;
  drawPanel();
  window.scrollTo({ top: 0, behavior: 'instant' });
  // the report is a document, so its score is shown at once, without counting up
  playScore(withoutAnimation || tab === 'report');
}

function drawPanel() {
  // the sector and city under the title; the ones not known yet are left out,
  // and when neither is known a short note says so instead of a lonely "·"
  const known = ['sector', 'city'].filter((field) => assessment[field]);
  const facts = known.length
    ? known.map((field) => safe(label(assessment[field]))).join(' · ')
    : t('assess.factsEmpty');

  panel.innerHTML = `
    <div class="assess-head">
      <button type="button" class="assess-back" data-close>${icon('arrowBack')} ${t('assess.back')}</button>
      <button type="button" class="btn btn-secondary btn-sm" data-export>${icon('download')} ${t('panel.export')}</button>
    </div>

    <h2 class="assess-title">${safe(say(assessment.title))}</h2>
    <p class="assess-sub">${facts}</p>
    ${assessment.whatIf ? `<p class="assess-sub"><span class="chip chip-teal">${safe(t('whatIf.label').replace('{change}', assessment.whatIf))}</span></p>` : ''}

    <nav class="assess-nav" role="tablist">
      ${tabsOf(assessment).map((tab) => `
        <button type="button" role="tab" class="assess-tab ${tab === currentTab ? 'is-active' : ''}" data-tab="${tab}">${t(`tab.${tab}`)}</button>`).join('')}
    </nav>

    <div class="assess-body">
      ${TAB_CONTENT[currentTab]()}
      <p class="assess-note">${t('panel.sample')}</p>
    </div>`;
}

/* ---------- Pieces used by more than one tab ---------- */

/* The score, big, in a blue box: a half-circle dial on one side and the verdict in
   words on the other. The dial is an arc from 0 (left) to 100 (right). It always runs
   left to right (dir="ltr"), in Arabic too.
   The arc, its knob and the number start at 0; playScore() moves them to the score. */
const DIAL_LENGTH = 282.7;   // the length of the arc drawn below (half a circle of radius 90)

/* The assessment's score, or null when it has none yet (the prediction model is not
   connected). Without a score the page says "not available yet": it never shows a number
   Darb did not calculate, and never "NaN". */
function scoreOrNull() {
  const score = Number(assessment.score);
  return assessment.score === null || assessment.score === undefined || !Number.isFinite(score) ? null : score;
}

function scoreHero() {
  const score = scoreOrNull();
  const band = score === null ? 'none' : scoreBand(score);

  return `
    <div class="score-hero is-${band}">
      <div class="dial" dir="ltr">
        <svg viewBox="0 0 220 122" aria-hidden="true">
          <defs>
            <linearGradient id="dial-colors" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" class="dial-stop-start"/><stop offset="1" class="dial-stop-end"/>
            </linearGradient>
          </defs>
          <path class="dial-track" d="M20 110 A90 90 0 0 1 200 110"/>
          <path class="dial-arc" data-dial-arc d="M20 110 A90 90 0 0 1 200 110" stroke="url(#dial-colors)" stroke-dasharray="${DIAL_LENGTH}" stroke-dashoffset="${DIAL_LENGTH}"/>
          ${score === null ? '' : '<circle class="dial-knob" data-dial-knob cx="20" cy="110" r="9"/>'}
        </svg>
        ${score === null
          ? '<p class="dial-number"><strong>—</strong></p>'
          : `<p class="dial-number"><strong data-score="${score}">0</strong><span>/ 100</span></p>`}
      </div>
      <div class="score-verdict">
        <p class="fis-label">${t('score.title')}</p>
        <p class="fis-about">${t('score.about')}</p>
        <h3>${t(score === null ? 'score.notYet' : `score.band.${band}`)}</h3>
        <p class="fis-sentence">${t(score === null ? 'score.notYetSentence' : `score.sentence.${band}`)}</p>
      </div>
    </div>`;
}

/* Puts the dial at one value between 0 and the score */
function setDial(value) {
  const number = panel.querySelector('[data-score]');
  const angle = Math.PI * (value / 100);

  number.textContent = Math.round(value);
  panel.querySelector('[data-dial-arc]').style.strokeDashoffset = DIAL_LENGTH * (1 - value / 100);

  const knob = panel.querySelector('[data-dial-knob]');
  knob.setAttribute('cx', 110 - 90 * Math.cos(angle));
  knob.setAttribute('cy', 110 - 90 * Math.sin(angle));
}

/* Sweeps the dial from 0 up to the score, and lets the boxes of the page rise in.
   withoutAnimation = show everything in its final place at once (used before printing). */
function playScore(withoutAnimation = false) {
  // people who asked their device for less motion get no animation either
  const still = withoutAnimation || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.classList.toggle('is-still', still);

  riseIn(still);

  const number = panel.querySelector('[data-score]');
  if (!number) return;
  const score = Number(number.dataset.score);

  if (still) {
    setDial(score);
    return;
  }

  const started = performance.now();
  const duration = 1400;   // milliseconds

  function tick(now) {
    const progress = Math.min((now - started) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;   // fast at first, then slowing down
    setDial(score * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* Every box of the page starts a little lower and faded, and rises into place when it
   comes onto the screen, one after the other. chatbot.css has the movement (.rise). */
function riseIn(still) {
  const pieces = panel.querySelectorAll('.score-hero, .readings > *, .assess-body .box, .step-row, .phase-title');

  if (still) {
    pieces.forEach((piece) => piece.classList.add('is-in'));
    return;
  }

  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        watcher.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  pieces.forEach((piece, index) => {
    piece.classList.add('rise');
    piece.style.setProperty('--i', index % 4);   // neighbors rise one after the other
    watcher.observe(piece);
  });
}

/* Survival potential, risk level and sector viability: three tinted tiles
   that sit over the bottom edge of the picture */
function readings() {
  const score = scoreOrNull();
  const band = score === null ? null : scoreBand(score);
  const riskLevel = { good: 'low', warn: 'medium', risk: 'high' }[band];
  const sectorIsGood = assessment.factors[3] >= -1;

  const tiles = [
    { icon: 'sprout', name: 'score.survival', value: t(`survival.${band}`), color: band },
    { icon: 'shield', name: 'score.risk',     value: t(`level.${riskLevel}`), color: band },
    { icon: 'store',  name: 'score.sector',   value: t(sectorIsGood ? 'sector.favourable' : 'sector.challenging'), color: sectorIsGood ? 'good' : 'warn' },
  ];
  // without a score, each tile says "not available yet" in a neutral color
  if (score === null) {
    tiles.forEach((tile) => { tile.value = t('score.notYet'); tile.color = 'none'; });
  }

  return `
    <div class="readings">
      ${tiles.map((tile) => `
        <div class="reading is-${tile.color}">
          <span class="reading-icon">${icon(tile.icon)}</span>
          <span class="reading-name">${t(tile.name)}</span>
          <strong>${tile.value}</strong>
          <small>${t(`${tile.name}.why`)}</small>
        </div>`).join('')}
    </div>`;
}

function sectionTitle(title, sub = '') {
  return `
    <div class="assess-section">
      <h3 class="section-title">${title}</h3>
      ${sub ? `<p class="text-2">${sub}</p>` : ''}
    </div>`;
}

/* ---------- Tab: Score ---------- */

/* One box of factors: the ones that push the score up, or the ones that pull it down.
   Each has a small bar, so the biggest influence is easy to spot. */
function factorList(title, wanted) {
  const biggest = Math.max(...assessment.factors.map((change) => Math.abs(change)), 1);

  const rows = assessment.factors
    .map((change, index) => ({ change, name: SCORE_FACTORS[index] }))
    .filter((factor) => (wanted === 'up' ? factor.change >= 0 : factor.change < 0))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return `
    <div class="box moves is-${wanted}">
      <h3 class="box-title">${icon(wanted === 'up' ? 'trendUp' : 'trendDown')} ${title}</h3>
      ${rows.length === 0 ? `<p class="text-3">${t('score.none')}</p>` : ''}
      ${rows.map((factor) => `
        <div class="move" title="${t(`${factor.name}.why`)}">
          <span class="move-name">${t(factor.name)}</span>
          <span class="move-bar"><span style="--w: ${(Math.abs(factor.change) / biggest) * 100}%"></span></span>
          <strong dir="ltr">${factor.change >= 0 ? '+' : '−'}${Math.abs(factor.change)}</strong>
        </div>`).join('')}
    </div>`;
}

function scoreTab() {
  return `
    ${scoreHero()}
    ${readings()}
    <div class="score-moves">
      ${factorList(t('score.up'), 'up')}
      ${factorList(t('score.down'), 'down')}
    </div>`;
}

/* Shown in a tab when the database has nothing for this idea's sector */
function nothingYet() {
  return `<p class="empty">${t('result.empty')}</p>`;
}

/* A long description is cut after a few lines' worth of text */
function shorten(text, length = 220) {
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

/* ---------- Tab: Competitor analysis (PBI 35) ----------
   Only what the Competitor Agent checked and saved: up to three competitors (Confirmed before
   Limited evidence, then the closest), the comparison matrix, the ISS and the notes.
   Nothing here is worked out on the page: every label, number and note comes from the analysis. */

/* The notes worth a line on the screen. "None found" is the empty state instead, and the
   market level has its own line. */
const SHOWN_NOTES = ['fewer_than_three', 'only_indirect', 'customer_unknown', 'web_search_failed', 'judge_call_failed', 'time_limit_reached', 'web_changed'];

/* Only web addresses open: anything else from the database is left out */
function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? safe(url) : '';
}

/* The competitor's logo: the one saved with Darb's list of startups (startups.logo), or, when it has none or the
   image does not load, the first letter of its name in a tinted circle. Companies found on the web have no logo yet
   (guessing /favicon.ico showed Al Rajhi with its website builder's icon, 18 Nov 2026). */
export function logoOf(competitor) {
  const name = competitor.name || '';
  const tints = ['navy', 'teal', 'good', 'warn'];
  const tint = tints[name.length % tints.length];
  const logo = /^https:\/\//i.test(competitor.logo || '') ? safe(competitor.logo) : '';
  const img = logo ? `<img src="${logo}" alt="" loading="lazy" onload="this.parentNode.classList.add('has-logo')" onerror="this.remove()">` : '';
  return `<span class="initial is-${tint}"><span>${safe(name.trim().charAt(0).toUpperCase())}</span>${img}</span>`;
}
const initial = (competitor) => logoOf(competitor);

/* The words next to the ISS ("Higher similarity"). The agent server uses the same cut-offs for the chat
   (agent-server/src/mastra/config/scoring.ts, ISS_BANDS): change both together. */
const ISS_BANDS = { higher: 70, moderate: 40 };
const issBand = (iss) => (iss >= ISS_BANDS.higher ? 'higher' : iss >= ISS_BANDS.moderate ? 'moderate' : 'lower');

/* The market level (Definition 4): Open, Competitive or Crowded, from the number of valid direct
   competitors. A lower bound: Open never means none exist. */
const MARKET_LEVELS = ['open', 'competitive', 'crowded'];

/* The Idea Similarity Score: the number, its words, and the market level under it */
function issBox() {
  const band = issBand(assessment.iss);
  const level = MARKET_LEVELS.includes(assessment.marketLevel) ? assessment.marketLevel : '';
  return `
    <div class="box iss is-${band}">
      <p class="iss-number" dir="ltr"><strong>${assessment.iss}</strong><span>/ 100</span></p>
      <div class="iss-words">
        <p class="fis-label">${t('comp.iss')}</p>
        <h3>${t(`comp.iss.${band}`)}</h3>
        <p class="text-2">${t('comp.iss.why')}</p>
        ${level ? `<p class="iss-level">${icon('info')} <span><strong>${t(`comp.market.${level}`)}:</strong> ${t(`comp.market.${level}.why`)}</span></p>` : ''}
      </div>
    </div>`;
}

/* "Source: App Store listing · checked 11 Nov 2026" */
function sourceLine(competitor) {
  const parts = [];
  if (competitor.sourceType) parts.push(t(`comp.source.${competitor.sourceType}`));
  if (competitor.checkedAt) parts.push(`${t('comp.checked')} ${new Date(competitor.checkedAt).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
  return parts.length ? `<p class="competitor-checked">${t('comp.source')}: ${parts.join(' · ')}</p>` : '';
}

/* Competitive opportunities (explainer §6): for each competitor, the rule that matched, what it means (the judge's own
   sentence for a possible difference) and the fixed next step. Never "where you will win". Shown inside its card. */
const OPPORTUNITIES = ['proven_difference', 'possible_customer_difference', 'possible_difference', 'no_clear_difference', 'not_enough_evidence'];

function notesList() {
  const notes = assessment.competitorNotes.filter((code) => SHOWN_NOTES.includes(code));
  if (notes.length === 0) return '';
  return `<ul class="comp-notes">${notes.map((code) => `<li>${icon('info')} ${t(`comp.note.${code}`)}</li>`).join('')}</ul>`;
}

/* The competitor analysis (Hala, 18 Nov 2026): everything about one competitor was spread over its card, a column of
   the comparison table (with long notes in every cell, too wide for a phone) and a row of the opportunities box.
   Now an overview of answers at the top, and one complete card per competitor with its basis of classification. */
const PARTS = ['problem', 'customer', 'offering'];
const ANSWERS = ['same', 'partly', 'different', 'unknown', 'conflicting'];
const answerOf = (part) => (part && ANSWERS.includes(part.answer) ? part.answer : 'unknown');

/* The founder's idea as Darb understood it (Hala, 18 Nov 2026): the comparison below is against these parts, so the
   founder can read "the same problem" knowing which problem. Shown only when the analysis wrote it. */
function yourIdea() {
  const summary = assessment.ideaSummary;
  if (!summary) return '';
  const rows = ['problem', 'customer', 'offering', 'market'].filter((part) => summary[part]);
  if (rows.length === 0) return '';
  return `
    <div class="box your-idea">
      <h3 class="box-title">${icon('bulb')} ${t('comp.yourIdea')}</h3>
      <p class="text-2 comp-overview-sub">${t('comp.yourIdea.sub')}</p>
      ${rows.map((part) => `
        <div class="compare-row">
          <span class="compare-part">${t(`comp.part.short.${part}`)}</span>
          <p dir="auto">${safe(summary[part])}</p>
        </div>`).join('')}
    </div>`;
}

/* The overview: each competitor's three answers in short words (Hala, 18 Nov 2026: marks alone needed a key to read),
   with its kind of competition under its name. Short enough for a phone. */
function overview(competitors) {
  return `
    <div class="box comp-overview">
      <h3 class="box-title">${icon('grid')} ${t('comp.overview')}</h3>
      <p class="text-2 comp-overview-sub">${t('comp.overview.sub')}</p>
      <div class="comp-overview-grid">
        <span></span>${PARTS.map((part) => `<span class="comp-overview-head">${t(`comp.part.short.${part}`)}</span>`).join('')}
        ${competitors.map((c) => `
          <span class="comp-overview-name"><bdi>${safe(c.name)}</bdi><small>${t(`comp.label.short.${c.label}`)}</small></span>
          ${PARTS.map((part) => {
            const answer = answerOf(c.comparison[part]);
            return `<span class="answer-cell"><span class="answer-word is-${answer}">${t(`comp.answer.short.${answer}`)}</span></span>`;
          }).join('')}`).join('')}
      </div>
    </div>`;
}

/* The opportunity of one competitor, in one line */
function opportunityLine(c) {
  if (!OPPORTUNITIES.includes(c.opportunity)) return '';
  const meaning = c.opportunity === 'possible_difference' && c.difference ? safe(c.difference) : t(`comp.opp.${c.opportunity}.text`);
  return `
    <div class="competitor-opp">
      ${icon('bulb')}
      <p dir="auto"><strong>${t(`comp.opp.${c.opportunity}`)}:</strong> ${meaning} <span>${t('comp.opp.next')}: ${t(`comp.opp.${c.opportunity}.next`)}</span></p>
    </div>`;
}

/* One competitor (Hala, 18 Nov 2026): everything shows, in clear sections. What the company does, how close it is,
   then "Compared with your idea": the problem, the customer and the product, each with the judge's answer as a
   calm label (no red: the same as your idea is not an error) and its sentence on how it is the same or different.
   Then the opportunity and the formal note. */
function comparisonRows(c) {
  return PARTS.map((part) => {
    const answer = answerOf(c.comparison[part]);
    const note = c.comparison[part] && c.comparison[part].note;
    return `
      <div class="compare-row">
        <span class="compare-part">${t(`comp.part.short.${part}`)}</span>
        <div>
          <span class="answer-word is-${answer}">${t(`comp.answer.${answer}`)}</span>
          ${note ? `<p dir="auto">${safe(note)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function competitorCard(competitor, withActions = true) {
  const website = safeUrl(competitor.website) || safeUrl(competitor.source);
  const evidence = safeUrl(competitor.source);
  const score = competitor.score !== null && competitor.score !== undefined && Number.isFinite(Number(competitor.score)) ? Math.round(Number(competitor.score)) : null;
  return `
    <article class="box startup competitor">
      <div class="startup-top">
        ${initial(competitor)}
        <div class="startup-name">
          <strong><bdi>${safe(competitor.name)}</bdi></strong>
          ${competitor.city ? `<span class="text-3"><bdi>${safe(competitor.city)}</bdi></span>` : ''}
        </div>
        <span class="competitor-rank" dir="ltr">#${competitor.rank}</span>
      </div>
      <div class="competitor-chips">
        <span class="chip ${competitor.label === 'direct' ? 'chip-risk' : 'chip-warn'}">${t(`comp.label.${competitor.label}`)}</span>
        ${competitor.evidence === 'likely' ? `<span class="chip chip-navy">${t('comp.limited')}</span>` : `<span class="chip chip-good">${t('comp.confirmed')}</span>`}
      </div>
      ${competitor.about ? `<p class="startup-about" dir="auto">${safe(shorten(competitor.about, 220))}</p>` : ''}
      ${competitor.reason ? `<p class="competitor-reason" dir="auto">${safe(competitor.reason)}</p>` : ''}
      ${score === null ? '' : `
        <div class="competitor-score">
          <span>${t('comp.similarity')}</span>
          <span class="competitor-bar"><span style="width: ${Math.max(0, Math.min(100, score))}%"></span></span>
          <span dir="ltr">${score}%</span>
        </div>`}
      <div class="competitor-compare">
        <p class="compare-title">${t('comp.compared')}</p>
        ${comparisonRows(competitor)}
      </div>
      ${opportunityLine(competitor)}
      <p class="text-3 competitor-note">${t('comp.opp.note')}</p>
      ${withActions ? `
        <div class="startup-actions competitor-actions">
          ${website ? `<a class="btn btn-secondary btn-sm" href="${website}" target="_blank" rel="noopener noreferrer">${icon('globe')} ${t('comp.website')}</a>` : ''}
          ${evidence ? `<a class="btn btn-secondary btn-sm" href="${evidence}" target="_blank" rel="noopener noreferrer">${icon('file')} ${t('comp.evidenceShort')}</a>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-ask="${safe(competitor.id)}">${t('similar.ask')}</button>
        </div>` : (website ? `<p class="competitor-source" dir="ltr">${website}</p>` : '')}
    </article>`;
}

/* The whole analysis. withActions is false in the report (paper has no buttons, and every basis is open). */
function competitorAnalysis(withActions = true) {
  if (!assessment.analysedAt) return `<p class="empty">${t('comp.notYet')}</p>`;
  const competitors = assessment.result.competitors;
  if (competitors.length === 0) return `<p class="empty">${t('comp.note.none_found')}</p>`;

  return `
    ${assessment.iss === null ? '' : issBox()}
    ${notesList()}
    ${yourIdea()}
    ${overview(competitors)}
    <div class="startups competitors">${competitors.map((c) => competitorCard(c, withActions)).join('')}</div>`;
}

function similarTab() {
  return `${sectionTitle(t('comp.title'), t('comp.sub'))}${competitorAnalysis()}`;
}

/* ---------- Tab: Market ---------- */

const inNumbers = (value) => Number(value).toLocaleString('en');

/* The four market numbers. Each box has the number, its name and one plain sentence. */
function marketNumbers(market) {
  const perBusiness = market.enterprises && market.employees ? Math.round(market.employees / market.enterprises) : null;
  const newShare = market.enterprises && market.newEnterprises ? Math.round((market.newEnterprises / market.enterprises) * 100) : null;
  const isGrowing = market.growth >= 0;

  const boxes = [
    market.enterprises === null ? null : {
      icon: 'store', value: inNumbers(market.enterprises), name: t('market.establishments'),
      text: t('market.establishments.text'),
    },
    market.newEnterprises === null ? null : {
      icon: 'sprout', value: inNumbers(market.newEnterprises), name: t('market.newEnterprises'),
      text: t('market.new.text').replace('{year}', market.year).replace('{n}', newShare),
    },
    market.employees === null ? null : {
      icon: 'users', value: inNumbers(market.employees), name: t('market.employees'),
      text: t('market.employees.text').replace('{n}', perBusiness),
    },
    market.growth === null ? null : {
      icon: isGrowing ? 'trendUp' : 'trendDown', value: `${isGrowing ? '+' : ''}${market.growth}%`, name: t('market.growth'),
      text: t(isGrowing ? 'market.growth.up' : 'market.growth.down'), color: isGrowing ? 'good' : 'risk',
    },
  ].filter(Boolean);

  return `
    <div class="stats">
      ${boxes.map((box) => `
        <div class="box stat-box">
          <span class="stat-icon ${box.color ? `is-${box.color}` : ''}">${icon(box.icon)}</span>
          <strong class="${box.color ? `is-${box.color}` : ''}" dir="ltr">${box.value}</strong>
          <span class="stat-name">${box.name}</span>
          <small>${box.text}</small>
        </div>`).join('')}
    </div>`;
}

/* The numbers read as plain sentences: what they mean for someone about to start */
function marketMeaning(market) {
  const lines = [];
  const micro = market.sizes.find((size) => size.label === 'size.micro');
  const newShare = market.enterprises && market.newEnterprises ? Math.round((market.newEnterprises / market.enterprises) * 100) : null;

  if (market.growth !== null) {
    let key = 'meaning.stable';
    if (market.growth >= 3) key = 'meaning.growing';
    if (market.growth <= -3) key = 'meaning.shrinking';
    lines.push(t(key));
  }
  if (micro && micro.value >= 60) lines.push(t('meaning.small').replace('{n}', Math.round(micro.value)));
  if (newShare !== null && newShare >= 10) lines.push(t('meaning.entry').replace('{n}', newShare));

  if (lines.length === 0) return '';

  return `
    <div class="box meaning">
      <h3 class="box-title">${icon('spark')} ${t('market.meaning')}</h3>
      <ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>
    </div>`;
}

/* Micro, small, medium and large enterprises as ONE bar cut into four parts */
function marketSizes(market) {
  if (market.sizes.length === 0) return '';

  return `
    <div class="box sizes">
      <h3 class="box-title">${t('market.sizeTitle')}</h3>
      <div class="size-bar" dir="ltr">
        ${market.sizes.map((size, index) => `<span class="size-part is-${index + 1}" style="--w: ${Math.max(size.value, 0.6)}"></span>`).join('')}
      </div>
      <div class="size-legend">
        ${market.sizes.map((size, index) => `
          <span><i class="size-dot is-${index + 1}"></i>${t(size.label)} <strong dir="ltr">${Number(size.value.toFixed(1))}%</strong></span>`).join('')}
      </div>
    </div>`;
}

function marketSource(market) {
  const text = t('market.source').replace('{year}', market.year);
  const logo = `<img class="source-logo" src="${LOGOS}monshaat.png" alt="" onerror="this.remove()">`;
  return market.sourceUrl
    ? `<a class="market-source" href="${safe(market.sourceUrl)}" target="_blank" rel="noopener">${logo}<span>${text}</span>${icon('external')}</a>`
    : `<p class="market-source">${logo}<span>${text}</span></p>`;
}

function marketTab() {
  const market = assessment.result.market;
  if (!market) return `${sectionTitle(t('market.title'))}${nothingYet()}`;

  return `
    ${sectionTitle(safe(say(market.activity)), `${t('market.activity')} · ${market.year}`)}
    ${marketNumbers(market)}
    ${marketMeaning(market)}
    ${marketSizes(market)}
    ${marketSource(market)}`;
}

/* ---------- Tab: Roadmap ---------- */

/* The logo file of each authority, found by a word in its name.
   The files are in assets/images/logos/. Without a file, the authority's initials are shown. */
const AUTHORITY_LOGOS = [
  ['Saudi Business Center', 'sbc'], ['Chambers', 'chambers'], ['Commerce', 'mc'],
  ['SPL', 'spl'], ['Balady', 'balady'], ['ZATCA', 'zatca'], ['Qiwa', 'qiwa'],
  ['GOSI', 'gosi'], ['Human Resources', 'hrsd'], ['SFDA', 'sfda'], ['SASO', 'saso'],
  ['CST', 'cst'], ['SDAIA', 'sdaia'], ['Industry', 'mim'], ['SAIP', 'saip'],
];

function authorityLogo(authority) {
  const match = AUTHORITY_LOGOS.find(([word]) => authority.includes(word));
  const letters = authority.replace(/[^A-Za-z ]/g, '').split(' ').filter((word) => /^[A-Z]/.test(word)).map((word) => word[0]).slice(0, 2).join('');

  return `
    <span class="authority-logo">
      ${match ? `<img src="${LOGOS}${match[1]}.png" alt="" onerror="this.remove()">` : ''}
      <b>${letters}</b>
    </span>`;
}

function typeChip(step) {
  return `<span class="chip ${step.type === 'mandatory' ? 'chip-navy' : 'chip-warn'}">${t(`roadmap.${step.type}`)}</span>`;
}

/* The roadmap has three parts. A step goes into the part its business stage belongs to. */
const PHASES = [
  { name: 'phase.establish', stages: ['Establishment'] },
  { name: 'phase.prepare',   stages: ['Pre-operation', 'Planning', 'Design', 'Pre-market', 'Product launch'] },
  { name: 'phase.operate',   stages: ['Hiring', 'Operation', 'Import', 'Export', 'Pre-import'] },
];

function phaseOf(step) {
  return PHASES.find((phase) => phase.stages.some((stage) => step.stage.startsWith(stage))) || PHASES[2];
}

/* The short roadmap shown inside the chat: number, name and tag only */
export function roadmapList(forAssessment) {
  const steps = forAssessment.result.roadmap;
  if (steps.length === 0) return nothingYet();

  return `
    <ol class="rm-brief">
      ${steps.map((step, index) => `
        <li>
          <span class="rm-number">${index + 1}</span>
          <strong>${safe(say(step.title))}</strong>
          ${typeChip(step)}
        </li>`).join('')}
    </ol>`;
}

/* The full roadmap: the three parts, and a box for every step */
function roadmapFull() {
  const steps = assessment.result.roadmap;
  if (steps.length === 0) return nothingYet();

  const numbered = steps.map((step, index) => ({ ...step, number: index + 1 }));

  return PHASES.map((phase) => {
    const own = numbered.filter((step) => phaseOf(step) === phase);
    if (own.length === 0) return '';

    return `
      <section class="phase">
        <h3 class="phase-title"><span>${t(phase.name)}</span><small>${t('phase.count').replace('{n}', own.length)}</small></h3>
        <div class="phase-steps">
          ${own.map((step) => `
            <div class="step-row is-${step.type}">
              <span class="step-dot">${step.number}</span>
              <article class="box step">
                ${authorityLogo(step.authority)}
                <div class="step-text">
                  <div class="step-title"><strong>${safe(say(step.title))}</strong>${typeChip(step)}</div>
                  <span class="step-authority">${safe(say(step.authorityName))}</span>
                  <p dir="auto">${safe(say(step.guidance))}</p>
                  ${say(step.fees) ? `<p class="step-fees" dir="auto"><b>${t('roadmap.fees')}</b> ${safe(shorten(say(step.fees), 150))}</p>` : ''}
                  <div class="step-links">
                    ${step.link ? `<a class="rm-action" href="${safe(step.link)}" target="_blank" rel="noopener">${t('roadmap.apply')} ${icon('external')}</a>` : ''}
                    ${step.source ? `<a class="link" href="${safe(step.source)}" target="_blank" rel="noopener">${t('roadmap.source')}</a>` : ''}
                  </div>
                </div>
              </article>
            </div>`).join('')}
        </div>
      </section>`;
  }).join('');
}

/* The same steps as a diagram: cards on both sides of one line, from top to bottom */
function roadmapDiagram() {
  const steps = assessment.result.roadmap;
  if (steps.length === 0) return nothingYet();

  return `
    <div class="rm-diagram">
      <span class="chip chip-dot rm-start">${t('roadmap.start')}</span>
      <ol class="rm-wave">
        ${steps.map((step, index) => `
          <li>
            <span class="rm-number">${index + 1}</span>
            <div class="card rm-card">
              ${typeChip(step)}
              <strong>${safe(say(step.title))}</strong>
              <span class="text-3">${safe(say(step.authorityName))}</span>
            </div>
          </li>`).join('')}
      </ol>
      <span class="rm-end">${icon('flag')} ${t('roadmap.end')}</span>
    </div>`;
}

function roadmapTab() {
  const steps = assessment.result.roadmap;
  const mandatory = steps.filter((step) => step.type === 'mandatory').length;
  const summary = t('roadmap.summary').replace('{n}', steps.length).replace('{m}', mandatory).replace('{c}', steps.length - mandatory);

  return `
    <div class="rm-head">
      ${sectionTitle(t('roadmap.title'), summary)}
      <div class="segmented">
        <button type="button" class="segmented-item ${roadmapView === 'list' ? 'is-active' : ''}" data-roadmap-view="list">${t('roadmap.list')}</button>
        <button type="button" class="segmented-item ${roadmapView === 'diagram' ? 'is-active' : ''}" data-roadmap-view="diagram">${t('roadmap.diagram')}</button>
      </div>
    </div>
    ${roadmapView === 'list' ? roadmapFull() : roadmapDiagram()}`;
}

/* ---------- Tab: Report ----------
   Everything in one document. This is what Export PDF prints, so it is written
   like a paper report: the logo and date on top, then four numbered sections. */

function reportSection(number, tab, title, content) {
  return `
    <section class="report-section">
      <div class="report-head">
        <h3><span class="report-number">${number}</span>${title}</h3>
        <button type="button" class="link report-link" data-tab="${tab}">${t('report.view')}</button>
      </div>
      ${content}
    </section>`;
}

function reportTab() {
  const { market } = assessment.result;
  const facts = ['sector', 'city', 'model'].map((field) => safe(label(assessment[field]))).join(' · ');
  const today = new Date().toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const marketPart = !market ? nothingYet() : `
    <p class="report-line">${t('market.activity')}: <strong>${safe(say(market.activity))}</strong> · ${market.year}</p>
    ${marketNumbers(market)}
    ${marketMeaning(market)}
    ${marketSizes(market)}
    ${marketSource(market)}`;

  return `
    <div class="report">
      <header class="report-cover">
        <img src="${LOGO}" alt="Darb">
        <div>
          <strong>${t('report.title')}</strong>
          <span>${today}</span>
        </div>
      </header>

      <div class="report-idea">
        <h3>${safe(say(assessment.title))}</h3>
        <p class="text-2">${facts}</p>
      </div>

      ${assessment.whatIf
        ? reportSection(1, 'similar', t('comp.title'), competitorAnalysis(false))
        : `${reportSection(1, 'score', t('score.title'), scoreTab())}
      ${reportSection(2, 'market', t('market.title'), marketPart)}
      ${reportSection(3, 'similar', t('comp.title'), competitorAnalysis(false))}
      ${reportSection(4, 'roadmap', t('roadmap.title'), roadmapFull())}`}
    </div>`;
}

const TAB_CONTENT = {
  score:    scoreTab,
  similar:  similarTab,
  market:   marketTab,
  roadmap:  roadmapTab,
  report:   reportTab,
};

/* ---------- Clicks inside the panel ---------- */

panel.addEventListener('click', (event) => {
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    showTab(tabButton.dataset.tab);
  }

  const viewButton = event.target.closest('[data-roadmap-view]');
  if (viewButton) {
    roadmapView = viewButton.dataset.roadmapView;
    drawPanel();
  }

  if (event.target.closest('[data-close]')) {
    closePanel();
  }

  // Export PDF: show the report and open the browser's print window,
  // where the founder chooses "Save as PDF". chatbot.css hides everything else on paper.
  if (event.target.closest('[data-export]')) {
    showTab('report', true);   // true = no counting animation, so the paper shows the final score
    window.print();
  }

  // "Ask about it" on a competitor card: tell the chat which competitor the next question is about
  const askButton = event.target.closest('[data-ask]');
  if (askButton) {
    const startup = assessment.result.competitors.find((item) => item.id === askButton.dataset.ask);
    document.dispatchEvent(new CustomEvent('darb:ask-startup', { detail: startup }));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});

// the panel is text in the current language, so draw it again when the language changes
document.addEventListener('darb:language', () => {
  if (assessment && panel.classList.contains('is-open')) {
    drawPanel();
    playScore(currentTab === 'report');
  }
});
