/* History: four numbers, then one card for each of the founder's projects, with a filter and a search box. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import '../../../shared/guard.js';
import { showErrorPage } from '../../../shared/errors.js';
import {
  say, label, scoreBand, whenText, chatLink, getAssessments, assessmentsFailed,
} from '../../../shared/assessments.js';

const rows = document.querySelector('#rows');
const search = document.querySelector('#search');

let assessments = [];
let filter = 'all';   // 'all', 'assessed' or 'conversation'

/* The four numbers at the top */
function showStats() {
  const assessed = assessments.filter((assessment) => assessment.score);
  const average = assessed.length
    ? Math.round(assessed.reduce((sum, assessment) => sum + assessment.score, 0) / assessed.length)
    : '—';

  document.querySelector('[data-stat="projects"]').textContent = assessments.length;
  document.querySelector('[data-stat="assessed"]').textContent = assessed.length;
  document.querySelector('[data-stat="average"]').textContent = average;
  document.querySelector('[data-stat="roadmaps"]').textContent = assessments.filter((assessment) => assessment.roadmapShown).length;
}

/* One card for each project that fits the filter and the search */
function showRows() {
  const words = search.value.trim().toLowerCase();

  const visible = assessments.filter((assessment) => {
    const isAssessed = Boolean(assessment.score);
    const fitsFilter = filter === 'all' || (filter === 'assessed') === isAssessed;
    const fitsSearch = say(assessment.title).toLowerCase().includes(words);
    return fitsFilter && fitsSearch;
  });

  rows.innerHTML = visible.map((assessment) => {
    const isAssessed = Boolean(assessment.score);

    // the score ring, or a dashed circle for a conversation that has no score yet
    const ring = isAssessed
      ? `<a class="ring is-${scoreBand(assessment.score)}" style="--p: ${assessment.score}" href="${chatLink(assessment.id, 'score')}"><span>${assessment.score}</span></a>`
      : `<span class="ring is-none">${icon('spark')}</span>`;

    const status = isAssessed
      ? `<span>${t('history.messages').replace('{n}', assessment.messages)}</span>`
      : `<span class="chip chip-wait">${t('history.notAssessed')}</span>`;

    return `
      <article class="project">
        ${ring}
        <div class="project-main">
          <a class="project-title" href="${chatLink(assessment.id)}"></a>
          <div class="project-meta">
            ${assessment.sector ? '<span class="chip chip-sector"></span>' : ''}
            ${assessment.city ? '<span class="chip chip-city"></span>' : ''}
            ${status}
          </div>
        </div>
        <span class="project-when">${icon('clock')}${whenText(assessment.updated)}</span>
        <div class="project-actions">
          ${isAssessed ? `
            <a class="btn-icon" href="${chatLink(assessment.id, 'roadmap')}" aria-label="${t('history.viewRoadmapFull')}" title="${t('history.viewRoadmapFull')}">${icon('map')}</a>
            <a class="btn-icon" href="${chatLink(assessment.id, 'report')}" aria-label="${t('history.report')}" title="${t('history.report')}">${icon('download')}</a>` : ''}
          <a class="btn ${isAssessed ? 'btn-secondary' : 'btn-primary'} btn-sm" href="${chatLink(assessment.id)}">${t(isAssessed ? 'history.open' : 'history.continue')}</a>
        </div>
      </article>`;
  }).join('');

  // titles and typed answers are written by founders, so they are added as text
  rows.querySelectorAll('.project').forEach((card, index) => {
    const assessment = visible[index];
    card.querySelector('.project-title').textContent = say(assessment.title);
    const sector = card.querySelector('.chip-sector');
    const city = card.querySelector('.chip-city');
    if (sector) sector.textContent = label(assessment.sector);
    if (city) city.textContent = label(assessment.city);
  });

  // nothing to show: either the founder has no projects yet, or the search found none
  const empty = document.querySelector('#empty');
  empty.hidden = visible.length > 0;
  empty.textContent = t(assessments.length === 0 ? 'history.none' : 'history.empty');
}

document.querySelector('#filter').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;

  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
  showRows();
});

search.addEventListener('input', showRows);

// the rows are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  showRows();
  showStats();
});

document.querySelector('#search-icon').innerHTML = icon('search');
// the icons of the four numbers
document.querySelectorAll('[data-icon]').forEach((box) => {
  box.innerHTML = icon(box.dataset.icon);
});

assessments = await getAssessments();
if (assessmentsFailed) {
  showErrorPage(500);   // the history could not be loaded: the 500 page offers "Try again"
} else {
  showStats();
  showRows();
}
