/* History: four numbers, then one card for each of the founder's projects, with a filter and a search box.
   Each card has a trash button that deletes the chat after a confirmation pop-up. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import '../../../shared/guard.js';
import { showErrorPage } from '../../../shared/errors.js';
import { showToast } from '../../../shared/ui.js';
import {
  say, label, scoreBand, whenText, chatLink, getAssessments, assessmentsFailed, isListed, hasIdea,
  deleteAssessment, showSidebarHistory,
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

    // a what-if opens straight on its competitor analysis; it has no conversation of its own
    const isWhatIf = Boolean(assessment.whatIf);
    const status = isWhatIf
      ? '<span class="chip chip-teal chip-what-if"></span>'
      : isAssessed
        ? `<span>${t('history.messages').replace('{n}', assessment.messages)}</span>`
        : `<span class="chip chip-wait">${t('history.notAssessed')}</span>`;
    const openLink = isWhatIf ? chatLink(assessment.id, 'similar') : chatLink(assessment.id);

    return `
      <article class="project" data-id="${assessment.id}">
        ${ring}
        <div class="project-main">
          <a class="project-title" href="${openLink}"></a>
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
          <a class="btn ${isAssessed || isWhatIf ? 'btn-secondary' : 'btn-primary'} btn-sm" href="${openLink}">${t(isAssessed || isWhatIf ? 'history.open' : 'history.continue')}</a>
          <button type="button" class="btn-icon is-delete" data-action="delete" aria-label="${t('history.delete')}" title="${t('history.delete')}">${icon('trash')}</button>
        </div>
      </article>`;
  }).join('');

  // titles and typed answers are written by founders, so they are added as text
  rows.querySelectorAll('.project').forEach((card, index) => {
    const assessment = visible[index];
    card.querySelector('.project-title').textContent = say(assessment.title);
    const sector = card.querySelector('.chip-sector');
    const city = card.querySelector('.chip-city');
    const whatIf = card.querySelector('.chip-what-if');
    if (whatIf) whatIf.textContent = t('whatIf.label').replace('{change}', assessment.whatIf);
    if (sector) sector.textContent = label(assessment.sector);
    if (city) city.textContent = label(assessment.city);
  });

  // nothing to show: either the founder has no projects yet, or the search found none
  const empty = document.querySelector('#empty');
  empty.hidden = visible.length > 0;
  empty.textContent = t(assessments.length === 0 ? 'history.none' : 'history.empty');
}

/* ---------- Delete a chat ---------- */

const deleteModal = document.querySelector('#delete-modal');
const deleteConfirm = document.querySelector('#delete-confirm');
let deleteId = null;   // the chat the pop-up is asking about

// "Delete “{name}”? ..." with the chat's title in the current language
function deleteText() {
  const assessment = assessments.find((item) => item.id === deleteId);
  return t('history.deleteText').replace('{name}', assessment ? say(assessment.title) : '');
}

// the trash button on a card opens the pop-up
rows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;

  deleteId = button.closest('.project').dataset.id;
  document.querySelector('#delete-text').textContent = deleteText();   // the title is the founder's text
  deleteModal.showModal();
});

deleteConfirm.addEventListener('click', async () => {
  const assessment = assessments.find((item) => item.id === deleteId);
  if (!assessment) return;

  deleteConfirm.classList.add('is-loading');
  const deleted = await deleteAssessment(assessment);
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (!deleted) {
    showToast(t('history.deleteError'), 'risk');
    return;
  }

  // gone at once: from the list, the four numbers and the sidebar
  assessments = assessments.filter((item) => item.id !== assessment.id);
  showStats();
  showRows();
  showSidebarHistory();
  showToast(t('history.deleted'), 'good');
});

document.querySelector('#delete-icon').innerHTML = icon('trash');

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
  if (deleteModal.open) document.querySelector('#delete-text').textContent = deleteText();
});

document.querySelector('#search-icon').innerHTML = icon('search');
// the icons of the four numbers
document.querySelectorAll('[data-icon]').forEach((box) => {
  box.innerHTML = icon(box.dataset.icon);
});

// every conversation the founder wrote in (the ones without a score show a dashed circle)
assessments = (await getAssessments()).filter(isListed);
if (assessmentsFailed) {
  showErrorPage(500);   // the history could not be loaded: the 500 page offers "Try again"
} else {
  showStats();
  showRows();
}
