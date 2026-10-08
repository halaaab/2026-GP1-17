/* Incubator / accelerator details: one program, opened with ?id=<support_org_id>.
   The layout follows the Regulatory requirement page: head, key facts, then
   sections one under the other, and the official website at the end.
   Also suggests up to three similar programs (same sectors, then same type). */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import '../../../../shared/guard.js';
import {
  getProgram, getPrograms, programType, sectorList, isOpenToAll, cityOf, clean, text,
  listItems, websiteOf, detailsLink, logoHtml, TYPE_CHIP,
} from '../programs.js';

const id = new URLSearchParams(window.location.search).get('id');
let program = null;
let similar = [];

// Program text is typed by admins, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/* ---------- Similar programs ----------
   Score: 2 for every shared sector, 1 for the same type, 1 for the same city. */

function findSimilar(all) {
  const mySectors = sectorList(program).map((sector) => sector.toLowerCase());
  return all
    .filter((other) => other.support_org_id !== program.support_org_id)
    .map((other) => {
      const shared = sectorList(other).filter((sector) => mySectors.includes(sector.toLowerCase())).length;
      const score = shared * 2
        + (programType(other) === programType(program) ? 1 : 0)
        + (cityOf(other) && cityOf(other) === cityOf(program) ? 1 : 0);
      return { other, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.other);
}

/* ---------- Drawing ---------- */

// A tick in a circle, before each row of a list (layout.js has none)
const TICK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/></svg>';

// A share arrow for the "Copy link" button (layout.js has none)
const SHARE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';

function fact(label, valueHtml) {
  return `
    <div class="detail-fact">
      <span class="detail-fact-label">${label}</span>
      <strong class="detail-fact-value">${valueHtml}</strong>
    </div>`;
}

function row(text) {
  return `<li>${TICK}<span>${text}</span></li>`;
}

function show() {
  const kind = programType(program);
  const sectors = sectorList(program);
  const website = websiteOf(program);
  const name = text(program, 'name');

  document.title = `${name} — Darb`;

  // Head: logo, name, where it is and its type
  document.querySelector('#detail-logo').innerHTML = logoHtml(program);
  document.querySelector('#detail-name').textContent = name;
  document.querySelector('#detail-place').textContent = text(program, 'location') || '—';
  document.querySelector('#detail-type').textContent = t(`programs.type.${kind}`);
  document.querySelector('#share').innerHTML = `${SHARE}<span>${t('programs.share')}</span>`;

  // Key facts: stage, duration, website
  const host = website ? new URL(website).hostname.replace(/^www\./, '') : '';
  document.querySelector('#facts').innerHTML = [
    fact(t('programs.stage'), `${icon('flag')}<span>${safe(text(program, 'target_stage') || '—')}</span>`),
    fact(t('programs.duration'), `${icon('clock')}<span>${safe(text(program, 'program_duration') || '—')}</span>`),
    fact(t('programs.websiteLabel'), website
      ? `<a class="detail-fact-link" href="${safe(website)}" target="_blank" rel="noopener" dir="ltr">${safe(host)}</a>`
      : '<span>—</span>'),
  ].join('');

  // Who can apply: each condition, then the sectors it is for
  const rules = listItems(text(program, 'eligibility')).map((rule) => row(safe(rule)));
  const sectorLine = isOpenToAll(program) ? t('programs.openToAll') : sectors.join(t('programs.listComma'));
  if (sectorLine) rules.push(row(safe(t('programs.focusRow').replace('{list}', sectorLine))));
  document.querySelector('#eligibility-section').hidden = rules.length === 0;
  document.querySelector('#eligibility').innerHTML = rules.join('');

  document.querySelector('#about').textContent = text(program, 'description') || t('programs.noDescription');

  const services = listItems(text(program, 'services_support'));
  document.querySelector('#services-section').hidden = services.length === 0;
  document.querySelector('#services').innerHTML = services.map((service) => row(safe(service))).join('');

  const funding = text(program, 'funding_investment');
  document.querySelector('#funding-section').hidden = !funding;
  document.querySelector('#funding').textContent = funding;

  // Official website
  document.querySelector('#source-logo').innerHTML = logoHtml(program);
  document.querySelector('#source-name').textContent = name;
  document.querySelector('#source-url').textContent = website || '—';
  const websiteButton = document.querySelector('#website');
  websiteButton.hidden = !website;
  websiteButton.href = website || '#';
  websiteButton.innerHTML = `<span>${t('programs.visit')}</span>${icon('external')}`;

  document.querySelector('#similar-section').hidden = similar.length === 0;
  document.querySelector('#similar').innerHTML = similar.map((other, index) => `
    <a class="card card-hover detail-similar-card fade-up" style="--i: ${index}" href="${detailsLink(other.support_org_id)}">
      <div class="detail-similar-top">
        ${logoHtml(other)}
        <span class="chip ${TYPE_CHIP[programType(other)]}">${t(`programs.type.${programType(other)}`)}</span>
      </div>
      <strong>${safe(text(other, 'name'))}</strong>
      <span class="text-3">${safe(cityOf(other) || '—')} · ${safe(sectorList(other).slice(0, 2).join(t('programs.listComma')) || '—')}</span>
    </a>`).join('');
}

/* ---------- Share ----------
   Phones open their own share sheet (WhatsApp, Messages, email...).
   Where there is none, the link is copied instead. */

document.querySelector('#share').addEventListener('click', async () => {
  const link = window.location.href;

  if (navigator.share) {
    try {
      await navigator.share({ title: text(program, 'name'), url: link });
      return;
    } catch (error) {
      // closing the share sheet is not an error
      if (error.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(link);
    showToast(t('programs.copied'), 'good');
  } catch {
    showToast(link);
  }
});

// labels are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  if (program) show();
});

/* ---------- Start ---------- */

document.querySelector('#back-icon').innerHTML = icon('arrowBack');
document.querySelector('#not-found-icon').innerHTML = icon('sprout');

// Going back keeps the explorer's filters when the person came from there
if (document.referrer.includes('incubators-accelerators-explorer')) {
  document.querySelector('#back-link').href = document.referrer;
}

program = id ? await getProgram(id) : null;
document.querySelector('#loading').hidden = true;

if (!program) {
  document.querySelector('#not-found').hidden = false;
} else {
  similar = findSimilar((await getPrograms()) || []);
  document.querySelector('#detail').hidden = false;
  show();
}
