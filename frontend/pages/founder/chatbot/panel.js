/* The assessment: a full page that takes the place of the chat and shows one
   assessment in five tabs (Score, Similar startups, Market, Roadmap, Report).

   chatbot.js opens it:
     import { openPanel } from './panel.js';
     openPanel(assessment, 'score');

   Each tab is one function below that returns HTML. The startups, market numbers
   and roadmap are in assessment.result, loaded by loadResult() in shared/assessments.js. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import {
  say, label, scoreBand, whenText, SCORE_FACTORS,
} from '../../../shared/assessments.js';

const TABS = ['score', 'similar', 'market', 'roadmap', 'report'];

// the Darb logo, for the top of the report
const LOGO = new URL('../../../assets/images/%20Darb-logo-horizontal.png', import.meta.url).href;

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
  currentTab = TABS.includes(tab) ? tab : 'score';

  drawPanel();
  panel.classList.add('is-open');
  document.body.classList.add('assess-open');   // chatbot.css hides the chat while this is on
  window.scrollTo(0, 0);
  playScore(currentTab === 'report');
}

export function closePanel() {
  panel.classList.remove('is-open');
  document.body.classList.remove('assess-open');
}

function showTab(tab, withoutAnimation = false) {
  currentTab = tab;
  drawPanel();
  window.scrollTo(0, 0);
  // the report is a document, so its score is shown at once, without counting up
  playScore(withoutAnimation || tab === 'report');
}

function drawPanel() {
  const facts = ['sector', 'city'].map((field) => safe(label(assessment[field]))).join(' · ');

  panel.innerHTML = `
    <div class="assess-head">
      <button type="button" class="assess-back" data-close>${icon('arrowBack')} ${t('assess.back')}</button>
      <button type="button" class="btn btn-secondary btn-sm" data-export>${icon('download')} ${t('panel.export')}</button>
    </div>

    <h2 class="assess-title">${safe(say(assessment.title))}</h2>
    <p class="assess-sub">${facts}</p>

    <nav class="assess-nav" role="tablist">
      ${TABS.map((tab) => `
        <button type="button" role="tab" class="assess-tab ${tab === currentTab ? 'is-active' : ''}" data-tab="${tab}">${t(`tab.${tab}`)}</button>`).join('')}
    </nav>

    <div class="assess-body">
      ${TAB_CONTENT[currentTab]()}
      <p class="assess-note">${t('panel.sample')}</p>
    </div>`;
}

/* ---------- Pieces used by more than one tab ---------- */

/* The score on its path: a big number, and a line from 0 to 100 with a marker on it.
   The line has three parts, one for each score band (0–39, 40–69, 70–100).
   It always runs from 0 on the left to 100 on the right (dir="ltr"), in Arabic too,
   the way number lines and charts are normally drawn.
   The number and the marker start at 0; playScore() moves them to the score. */
function scoreOnPath() {
  const band = scoreBand(assessment.score);

  return `
    <div class="fis is-${band}">
      <p class="fis-label">${t('score.title')}</p>
      <p class="fis-number"><strong data-score="${assessment.score}">0</strong><span>${t('score.outOf')}</span></p>
      <p class="fis-sentence">${t(`score.sentence.${band}`)}</p>

      <div class="fis-path" dir="ltr">
        <span class="fis-part is-risk"></span><span class="fis-part is-warn"></span><span class="fis-part is-good"></span>
        <span class="fis-marker" data-marker></span>
      </div>
      <div class="fis-scale" dir="ltr" aria-hidden="true">
        <span>0</span><span>100</span>
      </div>
    </div>`;
}

/* Counts the number up and slides the marker along the path.
   withoutAnimation = put both at the score straight away (used before printing). */
function playScore(withoutAnimation = false) {
  const number = panel.querySelector('[data-score]');
  const marker = panel.querySelector('[data-marker]');
  if (!number) return;

  const score = Number(number.dataset.score);

  if (withoutAnimation) {
    number.textContent = score;
    marker.style.transition = 'none';
    marker.style.insetInlineStart = `${score}%`;
    return;
  }

  const started = performance.now();
  const duration = 900;   // milliseconds

  // the browser draws the marker at 0 first, then moves it (chatbot.css animates the move)
  requestAnimationFrame(() => { marker.style.insetInlineStart = `${score}%`; });

  function tick(now) {
    const progress = Math.min((now - started) / duration, 1);
    number.textContent = Math.round(score * progress);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* Survival potential, risk level and sector viability, side by side */
function readings() {
  const band = scoreBand(assessment.score);
  const riskLevel = { good: 'low', warn: 'medium', risk: 'high' }[band];
  const sectorIsGood = assessment.factors[3] >= -1;

  return `
    <dl class="readings">
      <div><dt>${t('score.survival')}</dt><dd class="is-${band}">${t(`survival.${band}`)}</dd></div>
      <div><dt>${t('score.risk')}</dt><dd class="is-${band}">${t(`level.${riskLevel}`)}</dd></div>
      <div><dt>${t('score.sector')}</dt><dd class="is-${sectorIsGood ? 'good' : 'warn'}">${t(sectorIsGood ? 'sector.favourable' : 'sector.challenging')}</dd></div>
    </dl>`;
}

function sectionTitle(title, sub = '') {
  return `
    <div class="assess-section">
      <h3 class="section-title">${title}</h3>
      ${sub ? `<p class="text-2">${sub}</p>` : ''}
    </div>`;
}

/* ---------- Tab: Score ---------- */

/* One list of factors: the ones that push the score up, or the ones that pull it down */
function factorList(title, wanted) {
  const rows = assessment.factors
    .map((change, index) => ({ change, name: SCORE_FACTORS[index] }))
    .filter((factor) => (wanted === 'up' ? factor.change >= 0 : factor.change < 0))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return `
    <div class="moves">
      <h3 class="moves-title">${title}</h3>
      ${rows.length === 0 ? `<p class="text-3">${t('score.none')}</p>` : ''}
      <ul>
        ${rows.map((factor) => `
          <li>
            <span class="moves-value is-${wanted}" dir="ltr">${factor.change >= 0 ? '+' : '−'}${Math.abs(factor.change)}</span>
            <span title="${t(`${factor.name}.why`)}">${t(factor.name)}</span>
          </li>`).join('')}
      </ul>
    </div>`;
}

function scoreTab() {
  return `
    ${scoreOnPath()}
    ${readings()}

    <div class="moves-grid">
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

/* ---------- Tab: Similar startups ---------- */

function similarTab() {
  const startups = assessment.result.similar;

  return `
    ${sectionTitle(t('similar.title'), t('similar.sub'))}
    ${startups.length === 0 ? nothingYet() : ''}
    <div class="similar">
      ${startups.map((startup) => `
        <article class="startup">
          <div class="startup-top">
            <strong>${safe(startup.name)}</strong>
            <span class="text-3">${safe([startup.sector, startup.region, startup.stage].filter(Boolean).join(' · '))}</span>
          </div>
          <p class="text-2" dir="auto">${safe(shorten(startup.about))}</p>
          <div class="startup-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-ask="${startup.id}">${t('similar.ask')}</button>
            ${startup.website ? `<a class="btn btn-ghost btn-sm" href="${safe(startup.website)}" target="_blank" rel="noopener">${t('similar.website')} ${icon('external')}</a>` : ''}
          </div>
        </article>`).join('')}
    </div>`;
}

/* ---------- Tab: Market ---------- */

function showNumber(number) {
  if (number.isPercent) return `${number.value > 0 ? '+' : ''}${number.value}%`;
  return Number(number.value).toLocaleString('en');
}

function marketNumbers(market) {
  return `
    <div class="kpis">
      ${market.numbers.map((number) => `
        <div class="tile">
          <span class="fact-label">${t(number.label)}</span>
          <span class="tile-value" dir="ltr">${showNumber(number)}</span>
        </div>`).join('')}
    </div>`;
}

function marketSource(market) {
  const text = t('market.source').replace('{year}', market.year);
  return market.sourceUrl
    ? `<a class="link market-source" href="${safe(market.sourceUrl)}" target="_blank" rel="noopener">${text}</a>`
    : `<p class="text-3 market-source">${text}</p>`;
}

/* Micro, small, medium and large enterprises as four bars */
function marketSizes(market) {
  if (market.sizes.length === 0) return '';

  return `
    <div class="sizes">
      <h3 class="section-title">${t('market.sizeTitle')}</h3>
      ${market.sizes.map((size) => `
        <div class="size-row">
          <span>${t(size.label)}</span>
          <div class="bar"><div class="bar-fill" style="width: ${size.value}%"></div></div>
          <strong dir="ltr">${size.value}%</strong>
        </div>`).join('')}
    </div>`;
}

function marketTab() {
  const market = assessment.result.market;
  if (!market) return `${sectionTitle(t('market.title'))}${nothingYet()}`;

  return `
    ${sectionTitle(t('market.title'), `${t('market.activity')}: ${safe(say(market.activity))} · ${market.year}`)}
    ${marketNumbers(market)}
    ${marketSizes(market)}
    ${marketSource(market)}`;
}

/* ---------- Tab: Roadmap ---------- */

function typeChip(step) {
  return `<span class="chip ${step.type === 'mandatory' ? 'chip-navy' : 'chip-warn'}">${t(`roadmap.${step.type}`)}</span>`;
}

/* The address without "https://" and the page: https://business.sa/x → business.sa */
function siteName(address) {
  try {
    return new URL(address).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

/* The roadmap as a numbered list. chatbot.js shows the same list inside the chat. */
export function roadmapList(forAssessment) {
  const steps = forAssessment.result.roadmap;
  if (steps.length === 0) return nothingYet();

  return `
    <ol class="rm-list">
      ${steps.map((step, index) => `
        <li class="rm-step">
          <span class="rm-number">${index + 1}</span>
          <div class="rm-text">
            <div class="rm-title"><strong>${safe(say(step.title))}</strong>${typeChip(step)}</div>
            <p class="rm-authority">${safe(step.authority)}</p>
            <p class="text-2" dir="auto">${safe(step.guidance)}</p>
            <div class="rm-links">
              ${step.link ? `<a class="rm-action" href="${safe(step.link)}" target="_blank" rel="noopener">${t('roadmap.apply')} ${icon('external')}</a>` : ''}
              ${step.source ? `<a class="chip" dir="ltr" href="${safe(step.source)}" target="_blank" rel="noopener">${siteName(step.source)}</a>` : ''}
            </div>
          </div>
        </li>`).join('')}
    </ol>`;
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
              <span class="text-3">${safe(step.authority)}</span>
            </div>
          </li>`).join('')}
      </ol>
      <span class="rm-end">${icon('flag')} ${t('roadmap.end')}</span>
    </div>`;
}

function roadmapTab() {
  const steps = assessment.result.roadmap.length;

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
  const { similar, market, roadmap } = assessment.result;
  const facts = ['sector', 'city', 'model'].map((field) => safe(label(assessment[field]))).join(' · ');
  const today = new Date().toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const score = `
    ${scoreOnPath()}
    ${readings()}
    <div class="moves-grid">
      ${factorList(t('score.up'), 'up')}
      ${factorList(t('score.down'), 'down')}
    </div>`;

  const marketPart = !market ? nothingYet() : `
    <p class="report-line">${t('market.activity')}: <strong>${safe(say(market.activity))}</strong> · ${market.year}</p>
    ${marketNumbers(market)}
    ${marketSizes(market)}
    ${marketSource(market)}`;

  const startups = similar.length === 0 ? nothingYet() : `
    <div class="report-startups">
      ${similar.map((startup) => `
        <div class="report-startup">
          <strong>${safe(startup.name)}</strong>
          <span class="text-3">${safe([startup.sector, startup.region, startup.stage].filter(Boolean).join(' · '))}</span>
          <p class="text-2" dir="auto">${safe(shorten(startup.about, 180))}</p>
        </div>`).join('')}
    </div>`;

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

      ${reportSection(1, 'score', t('score.title'), score)}
      ${reportSection(2, 'market', t('market.title'), marketPart)}
      ${reportSection(3, 'similar', t('similar.title'), startups)}
      ${reportSection(4, 'roadmap', t('roadmap.title'), roadmapList(assessment))}
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

  // "Ask about it" on a startup card: tell the chat which startup the next question is about
  const askButton = event.target.closest('[data-ask]');
  if (askButton) {
    const startup = assessment.result.similar.find((item) => item.id === askButton.dataset.ask);
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
