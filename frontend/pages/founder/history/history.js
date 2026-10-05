/* History: the list of the founder's ideas, with a filter and a search box. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import '../../../shared/guard.js';
import {
  say, label, scoreBand, whenText, chatLink, getAssessments,
} from '../../../shared/assessments.js';

const rows = document.querySelector('#rows');
const search = document.querySelector('#search');

let assessments = [];
let filter = 'all';   // 'all', 'assessed' or 'conversation'

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
    const kind = isAssessed
      ? t('history.kindAssessment').replace('{n}', assessment.messages)
      : t('history.kindConversation');

    return `
      <tr>
        <td>
          <a class="cell-title" href="${chatLink(assessment.id)}"></a>
          <span class="cell-detail">${kind}</span>
        </td>
        <td class="hide-small"></td>
        <td>
          ${isAssessed
            ? `<a class="history-link" href="${chatLink(assessment.id, 'score')}"><span class="chip chip-${scoreBand(assessment.score)}">${assessment.score}</span></a>`
            : '<span class="text-3">—</span>'}
        </td>
        <td class="hide-small">
          ${isAssessed
            ? `<a class="history-link" href="${chatLink(assessment.id, 'roadmap')}">${t('history.viewRoadmap')}</a>`
            : '<span class="text-3">—</span>'}
        </td>
        <td class="hide-small text-2">${whenText(assessment.updated)}</td>
        <td>
          <div class="history-actions">
            <a class="btn btn-secondary btn-sm" href="${chatLink(assessment.id)}">${t(isAssessed ? 'history.open' : 'history.continue')}</a>
            ${isAssessed ? `<a class="btn-icon" href="${chatLink(assessment.id, 'report')}" aria-label="${t('history.report')}" title="${t('history.report')}">${icon('download')}</a>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  // titles and typed answers are written by founders, so they are added as text
  rows.querySelectorAll('tr').forEach((row, index) => {
    const assessment = visible[index];
    row.querySelector('.cell-title').textContent = say(assessment.title);
    row.cells[1].textContent = [assessment.sector, assessment.city].filter(Boolean).map(label).join(' · ') || '—';
  });

  // nothing to show: either the founder has no ideas yet, or the search found none
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
document.addEventListener('darb:language', showRows);

document.querySelector('#search-icon').innerHTML = icon('search');
assessments = await getAssessments();
showRows();
