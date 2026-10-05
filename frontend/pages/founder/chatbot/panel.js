/* The assessment panel: slides in beside the chat and shows one assessment
   in six tabs (Overview, Score, Similar, Market, Roadmap, Report).

   chatbot.js opens it:
     import { openPanel } from './panel.js';
     openPanel(assessment, 'score');

   Each tab is one function below that returns HTML. The numbers come from
   shared/assessments.js (sample data today, the agents later). */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import {
  say, label, scoreBand, whenText, roadmapFor,
  SCORE_FACTORS, SIMILAR_STARTUPS, MARKET,
} from '../../../shared/assessments.js';

const TABS = ['overview', 'score', 'similar', 'market', 'roadmap', 'report'];
const STARTUP_PAGE = '../startups/startup-details/startup-details.html';

const panel = document.querySelector('#assess');

let assessment = null;       // the assessment being shown
let currentTab = 'overview';
let roadmapView = 'list';    // 'list' or 'diagram'

/* Founders type the idea title themselves, so it is made safe before it goes into HTML */
function safe(text) {
  const box = document.createElement('span');
  box.textContent = text;
  return box.innerHTML;
}

/* ---------- Open, close, switch tab ---------- */

export function openPanel(assessmentToShow, tab = 'overview') {
  assessment = assessmentToShow;
  currentTab = TABS.includes(tab) ? tab : 'overview';

  drawPanel();
  panel.classList.add('is-open');
  document.body.classList.add('assess-open');
}

export function closePanel() {
  panel.classList.remove('is-open');
  document.body.classList.remove('assess-open');
}

function showTab(tab) {
  currentTab = tab;
  drawPanel();
  panel.querySelector('.assess-body').scrollTop = 0;
}

function drawPanel() {
  const when = t('panel.updated').replace('{when}', whenText(assessment.updated));

  panel.innerHTML = `
    <div class="assess-head">
      <div class="assess-heading">
        <h2 class="assess-title">${t('chat.cardTitle')}</h2>
        <p class="assess-sub">${safe(say(assessment.title))} · ${when}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-export>${icon('download')} ${t('panel.export')}</button>
      <button type="button" class="btn-icon" data-close aria-label="${t('panel.close')}">${icon('close')}</button>
    </div>

    <div class="assess-tabs">
      <div class="segmented" role="tablist">
        ${TABS.map((tab) => `
          <button type="button" role="tab" class="segmented-item ${tab === currentTab ? 'is-active' : ''}" data-tab="${tab}">${t(`tab.${tab}`)}</button>`).join('')}
      </div>
    </div>

    <div class="assess-body">
      ${TAB_CONTENT[currentTab]()}
      <p class="assess-note">${t('panel.sample')}</p>
    </div>`;
}

/* ---------- Pieces used by more than one tab ---------- */

/* The half-circle gauge with the score inside */
function gauge(score) {
  const arcLength = 251.3;                       // length of the half circle drawn below
  const angle = Math.PI * (score / 100);
  const knobX = 100 - 80 * Math.cos(angle);
  const knobY = 100 - 80 * Math.sin(angle);

  return `
    <div class="gauge is-${scoreBand(score)}" dir="ltr">
      <svg viewBox="0 0 200 112" aria-hidden="true">
        <defs>
          <linearGradient id="gauge-colors" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" class="gauge-stop-risk"/><stop offset="0.5" class="gauge-stop-warn"/><stop offset="1" class="gauge-stop-good"/>
          </linearGradient>
        </defs>
        <path class="gauge-track" d="M20 100 A80 80 0 0 1 180 100"/>
        <path class="gauge-arc" d="M20 100 A80 80 0 0 1 180 100" stroke="url(#gauge-colors)" stroke-dasharray="${arcLength}" stroke-dashoffset="${arcLength * (1 - score / 100)}"/>
        <circle class="gauge-knob" cx="${knobX.toFixed(1)}" cy="${knobY.toFixed(1)}" r="9"/>
      </svg>
      <strong class="gauge-number">${score}</strong>
    </div>`;
}

function scoreHead() {
  const band = scoreBand(assessment.score);

  return `
    <div class="score-head">
      ${gauge(assessment.score)}
      <div>
        <span class="chip chip-${band}">${t(`score.band.${band}`)}</span>
        <h3 class="score-title">${t('score.title')}</h3>
        <p class="text-2">${t('score.about')}</p>
      </div>
    </div>`;
}

/* Sector, city and revenue model as three small tiles */
function facts() {
  return `
    <div class="facts">
      ${['sector', 'city', 'model'].map((field) => `
        <div class="tile">
          <span class="fact-label">${t(`chat.field.${field}`)}</span>
          <strong>${safe(label(assessment[field]))}</strong>
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

/* ---------- Tab: Overview ---------- */

function overviewTab() {
  const factors = assessment.factors;
  const best = factors.indexOf(Math.max(...factors));
  const worst = factors.indexOf(Math.min(...factors));
  const steps = roadmapFor(assessment).length;

  return `
    ${scoreHead()}
    ${facts()}

    <div class="insights">
      <div class="card insight is-good">
        <span class="insight-kind">${t('insight.strength')}</span>
        <strong>${t(SCORE_FACTORS[best])}</strong>
      </div>
      <div class="card insight is-risk">
        <span class="insight-kind">${t('insight.risk')}</span>
        <strong>${t(SCORE_FACTORS[worst])}</strong>
      </div>
      <div class="card insight is-info">
        <span class="insight-kind">${t('insight.consider')}</span>
        <strong>${t('insight.considerText')}</strong>
      </div>
    </div>

    ${sectionTitle(t('overview.inside'))}
    <div class="inside">
      ${insideLink('score', t('score.built'))}
      ${insideLink('similar', t('overview.similar').replace('{n}', SIMILAR_STARTUPS.length))}
      ${insideLink('market', t('overview.market'))}
      ${insideLink('roadmap', t('overview.roadmap').replace('{n}', steps))}
      ${insideLink('report', t('overview.report'))}
    </div>`;
}

function insideLink(tab, text) {
  return `<button type="button" class="inside-link" data-tab="${tab}"><span>${text}</span>${icon('chevron')}</button>`;
}

/* ---------- Tab: Score ---------- */

function scoreTab() {
  const band = scoreBand(assessment.score);
  const riskLevel = { good: 'low', warn: 'medium', risk: 'high' }[band];
  const sectorIsGood = assessment.factors[3] >= -1;

  // each row starts where the row before it ended, like steps of a staircase
  let total = 50;
  const rows = assessment.factors.map((change, index) => {
    const from = Math.min(total, total + change);
    total += change;
    return `
      <div class="wf-row">
        <span class="wf-name">${t(SCORE_FACTORS[index])}</span>
        <span class="wf-track"><span class="wf-fill ${change >= 0 ? 'is-good' : 'is-risk'}" style="inset-inline-start: ${from}%; width: ${Math.max(Math.abs(change), 1.5)}%"></span></span>
        <span class="wf-value ${change >= 0 ? 'is-good' : 'is-risk'}" dir="ltr">${change >= 0 ? '+' : '−'}${Math.abs(change)}</span>
      </div>`;
  }).join('');

  return `
    ${scoreHead()}

    <div class="card">
      <h3 class="section-title">${t('score.built')}</h3>
      <div class="wf">
        <div class="wf-row">
          <span class="wf-name is-light">${t('score.average')}</span>
          <span class="wf-track"><span class="wf-fill is-average" style="inset-inline-start: 0; width: 50%"></span></span>
          <span class="wf-value is-light">50</span>
        </div>
        ${rows}
        <div class="wf-row wf-total">
          <span class="wf-name">${t('score.yours')}</span>
          <span class="wf-track"><span class="wf-fill is-${band}" style="inset-inline-start: 0; width: ${assessment.score}%"></span></span>
          <span class="wf-value is-${band}">${assessment.score}</span>
        </div>
      </div>
    </div>

    <div class="facts">
      <div class="tile"><span class="fact-label">${t('score.survival')}</span><strong>${t(`score.band.${band}`)}</strong></div>
      <div class="tile"><span class="fact-label">${t('score.risk')}</span><strong>${t(`level.${riskLevel}`)}</strong></div>
      <div class="tile"><span class="fact-label">${t('score.sector')}</span><strong>${t(sectorIsGood ? 'sector.favourable' : 'sector.challenging')}</strong></div>
    </div>

    ${sectionTitle(t('score.keyFactors'))}
    <ul class="factors">
      ${assessment.factors.map((change, index) => `
        <li>
          <span class="chip ${change >= 0 ? 'chip-good' : 'chip-risk'}" dir="ltr">${change >= 0 ? '+' : '−'}${Math.abs(change)}</span>
          <div>
            <strong>${t(SCORE_FACTORS[index])}</strong>
            <p class="text-2">${t(`${SCORE_FACTORS[index]}.why`)}</p>
          </div>
        </li>`).join('')}
    </ul>`;
}

/* ---------- Tab: Similar startups ---------- */

function similarTab() {
  return `
    ${sectionTitle(t('similar.title'), t('similar.sub'))}
    <div class="similar">
      ${SIMILAR_STARTUPS.map((startup, index) => `
        <article class="card startup">
          <div class="startup-top">
            <span class="startup-rank">${index + 1}</span>
            <div class="startup-name">
              <strong>${say(startup.name)}</strong>
              <span class="text-3">${label(startup.city)} · ${t('similar.founded').replace('{year}', startup.year)}</span>
            </div>
            <span class="chip chip-dot ${startup.status === 'operating' ? 'chip-good' : 'chip-risk'}">${t(`status.${startup.status}`)}</span>
          </div>
          <p class="text-2">${say(startup.about)}</p>
          <div class="startup-match">
            <div class="bar"><div class="bar-fill" style="width: ${startup.match}%"></div></div>
            <span><strong>${startup.match}%</strong> ${t('similar.match')}</span>
          </div>
          <div class="startup-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-ask="${startup.id}">${t('similar.ask')}</button>
            <a class="btn btn-ghost btn-sm" href="${STARTUP_PAGE}">${t('similar.view')}</a>
          </div>
        </article>`).join('')}
    </div>`;
}

/* ---------- Tab: Market ---------- */

function marketTiles() {
  return `
    <div class="kpis">
      ${MARKET.tiles.map((tile) => `
        <div class="tile">
          <span class="fact-label">${t(tile.label)}</span>
          <span class="tile-value" dir="ltr">${tile.value}</span>
        </div>`).join('')}
    </div>`;
}

function marketTab() {
  const highest = Math.max(...MARKET.years.map((point) => point.value));

  return `
    ${sectionTitle(t('market.title'))}
    <div class="tile activity">
      <span class="fact-label">${t('market.activity')}</span>
      <strong>${say(MARKET.activity)}</strong>
    </div>

    ${marketTiles()}

    <div class="card">
      <h3 class="section-title">${t('market.chart')}</h3>
      <div class="chart" dir="ltr">
        ${MARKET.years.map((point) => `
          <div class="chart-column">
            <span class="chart-value">${point.value}</span>
            <span class="chart-bar" style="height: ${(point.value / highest) * 100}%"></span>
            <span class="chart-year">${point.year}</span>
          </div>`).join('')}
      </div>
    </div>

    <p class="text-3 market-source">${t('market.source')}</p>
    <button type="button" class="btn btn-secondary btn-sm" data-tab="overview">${t('market.back')}</button>`;
}

/* ---------- Tab: Roadmap ---------- */

function typeChip(step) {
  return `<span class="chip ${step.type === 'mandatory' ? 'chip-navy' : 'chip-warn'}">${t(`roadmap.${step.type}`)}</span>`;
}

/* The roadmap as a numbered list. chatbot.js shows the same list inside the chat. */
export function roadmapList(forAssessment) {
  return `
    <ol class="rm-list">
      ${roadmapFor(forAssessment).map((step, index) => `
        <li class="rm-step">
          <span class="rm-number">${index + 1}</span>
          <div class="rm-text">
            <div class="rm-title"><strong>${say(step.title)}</strong>${typeChip(step)}</div>
            <p class="text-2">${say(step.authority)}</p>
            <div class="rm-links">
              <a class="rm-action" href="${step.link}" target="_blank" rel="noopener">${say(step.action)} ${icon('external')}</a>
              <span class="chip" dir="ltr">${step.source}</span>
            </div>
          </div>
        </li>`).join('')}
    </ol>`;
}

/* The same steps as a diagram: cards on both sides of one line, from top to bottom */
function roadmapDiagram() {
  return `
    <div class="rm-diagram">
      <span class="chip chip-dot rm-start">${t('roadmap.start')}</span>
      <ol class="rm-wave">
        ${roadmapFor(assessment).map((step, index) => `
          <li>
            <span class="rm-number">${index + 1}</span>
            <div class="card rm-card">
              ${typeChip(step)}
              <strong>${say(step.title)}</strong>
              <span class="text-3">${say(step.authority)}</span>
            </div>
          </li>`).join('')}
      </ol>
      <span class="rm-end">${icon('flag')} ${t('roadmap.end')}</span>
    </div>`;
}

function roadmapTab() {
  const steps = roadmapFor(assessment).length;

  return `
    <div class="rm-head">
      ${sectionTitle(t('roadmap.title'), t('roadmap.sub').replace('{n}', steps))}
      <div class="segmented">
        <button type="button" class="segmented-item ${roadmapView === 'list' ? 'is-active' : ''}" data-roadmap-view="list">${t('roadmap.list')}</button>
        <button type="button" class="segmented-item ${roadmapView === 'diagram' ? 'is-active' : ''}" data-roadmap-view="diagram">${t('roadmap.diagram')}</button>
      </div>
    </div>
    ${roadmapView === 'list' ? roadmapList(assessment) : roadmapDiagram()}`;
}

/* ---------- Tab: Report (everything in one view; this is what Export PDF prints) ---------- */

function reportSection(tab, title, content) {
  return `
    <section class="report-section">
      <div class="report-head">
        <h3 class="section-title">${title}</h3>
        <button type="button" class="link report-link" data-tab="${tab}">${t('report.view')}</button>
      </div>
      ${content}
    </section>`;
}

function reportTab() {
  const similar = `
    <ul class="report-list">
      ${SIMILAR_STARTUPS.map((startup) => `
        <li>
          <strong>${say(startup.name)}</strong>
          <span class="text-3">${label(startup.city)} · ${t(`status.${startup.status}`)}</span>
          <span class="report-match" dir="ltr">${startup.match}%</span>
        </li>`).join('')}
    </ul>`;

  const roadmap = `
    <ol class="report-steps">
      ${roadmapFor(assessment).map((step) => `<li><strong>${say(step.title)}</strong> ${typeChip(step)}</li>`).join('')}
    </ol>`;

  return `
    <div class="report-title">
      <h3>${t('report.title')}</h3>
      <p class="text-2">${safe(say(assessment.title))} · ${whenText(assessment.updated)}</p>
    </div>

    ${reportSection('score', t('score.title'), scoreHead() + facts())}
    ${reportSection('market', t('market.title'), marketTiles())}
    ${reportSection('similar', t('similar.title'), similar)}
    ${reportSection('roadmap', t('roadmap.title'), roadmap)}`;
}

const TAB_CONTENT = {
  overview: overviewTab,
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
    showTab('report');
    window.print();
  }

  // "Ask about it" on a startup card: tell the chat which startup the next question is about
  const askButton = event.target.closest('[data-ask]');
  if (askButton) {
    const startup = SIMILAR_STARTUPS.find((item) => item.id === askButton.dataset.ask);
    document.dispatchEvent(new CustomEvent('darb:ask-startup', { detail: startup }));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});

// the panel is text in the current language, so draw it again when the language changes
document.addEventListener('darb:language', () => {
  if (assessment && panel.classList.contains('is-open')) drawPanel();
});
