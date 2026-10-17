/* Incubator / accelerator details: one program, opened with ?id=<support_org_id>.
   A colored head (the program's color, as on its card in the explorer), then
   two columns: who can apply, about, what you get and similar programs on one
   side; the key facts and the official website in a card on the other.
   Similar programs: up to three (same sectors, then same type, then same city). */

import { t, getLanguage } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import '../../../../shared/guard.js';
import {
  getProgram, getPrograms, programType, sectorList, isOpenToAll, cityOf, text,
  listItems, websiteOf, detailsLink, logoOf, logoHtml, colorOf, TYPE_ICON,
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

// Small icons layout.js does not have
const SVG = (paths) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const TICK = SVG('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/>');
const SHARE = SVG('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>');
const COINS = SVG('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>');
const CALENDAR = SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>');
const INFO = SVG('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>');

/* One key fact in the side card: a small colored icon, a label, the value */
function fact(iconHtml, tone, label, value) {
  return `
    <div class="detail-fact">
      <span class="detail-fact-icon chip-pastel-${tone}">${iconHtml}</span>
      <span class="detail-fact-text">
        <span class="detail-fact-label">${label}</span>
        <strong class="detail-fact-value">${safe(value || '—')}</strong>
      </span>
    </div>`;
}

// "8 Sept 2026" / "٨ سبتمبر ٢٠٢٦" in Latin digits, as on the other pages
function dateText(date) {
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function show() {
  const kind = programType(program);
  const sectors = sectorList(program);
  const website = websiteOf(program);
  const name = text(program, 'name');

  document.title = `${name} — Darb`;

  // Head, in the program's color
  document.querySelector('#detail-hero').className = `detail-hero color-${colorOf(program)}`;
  document.querySelector('#detail-art').innerHTML = icon(TYPE_ICON[kind]);
  document.querySelector('#detail-logo').innerHTML = logoHtml(program);
  document.querySelector('#detail-name').textContent = name;
  document.querySelector('#detail-place').textContent = text(program, 'location') || '—';
  document.querySelector('#share').innerHTML = `${SHARE}<span>${t('programs.share')}</span>`;

  // Tags: its type (with its icon), then its sectors
  const sectorTags = isOpenToAll(program) ? [t('programs.openToAll')] : sectors.slice(0, 3);
  document.querySelector('#detail-tags').innerHTML = [
    `<span class="detail-tag is-strong">${icon(TYPE_ICON[kind])}${t(`programs.type.${kind}`)}</span>`,
    ...sectorTags.map((sector) => `<span class="detail-tag">${safe(sector)}</span>`),
  ].join('');

  // Who can apply: each condition, then the sectors it is for
  const rules = listItems(text(program, 'eligibility'));
  const sectorLine = isOpenToAll(program) ? t('programs.openToAll') : sectors.join(t('programs.listComma'));
  if (sectorLine) rules.push(t('programs.focusRow').replace('{list}', sectorLine));
  document.querySelector('#eligibility-section').hidden = rules.length === 0;
  document.querySelector('#eligibility').innerHTML = rules.map((rule) => `<li>${TICK}<span>${safe(rule)}</span></li>`).join('');

  document.querySelector('#about').textContent = text(program, 'description') || t('programs.noDescription');

  // What you get: numbered rows
  const services = listItems(text(program, 'services_support'));
  document.querySelector('#services-section').hidden = services.length === 0;
  document.querySelector('#services-count').textContent = t('programs.servicesCount').replace('{n}', services.length);
  document.querySelector('#services').innerHTML = services
    .map((service, index) => `<li><span class="detail-step-number">${index + 1}</span><span>${safe(service)}</span></li>`)
    .join('');

  // Side card: key facts, the website, a note
  const updated = program.updated_at || program.created_at;
  document.querySelector('#facts').innerHTML = [
    fact(icon(TYPE_ICON[kind]), 1, t('programs.type'), t(`programs.type.${kind}`)),
    fact(icon('map'), 7, t('programs.location'), text(program, 'location')),
    fact(icon('flag'), 6, t('programs.stage'), text(program, 'target_stage')),
    fact(icon('clock'), 3, t('programs.duration'), text(program, 'program_duration')),
    fact(COINS, 2, t('programs.funding'), text(program, 'funding_investment')),
    updated ? fact(CALENDAR, 12, t('programs.lastUpdated'), dateText(updated)) : '',
  ].join('');

  const websiteButton = document.querySelector('#website');
  websiteButton.hidden = !website;
  websiteButton.href = website || '#';
  websiteButton.innerHTML = `<span>${t('programs.visit')}</span>${icon('external')}`;
  document.querySelector('#note').innerHTML = `${INFO}<span>${t('programs.verifyNote')}</span>`;

  // Similar programs, each in its own color: its logo, or its type's icon when it has none
  document.querySelector('#similar-section').hidden = similar.length === 0;
  document.querySelector('#similar').innerHTML = similar.map((other, index) => `
    <a class="detail-similar-card color-${colorOf(other)} fade-up" style="--i: ${index}" href="${detailsLink(other.support_org_id)}">
      <span class="detail-similar-icon ${logoOf(other) ? 'has-logo' : ''}" aria-hidden="true">
        ${logoOf(other) ? `<img src="${safe(logoOf(other))}" alt="" loading="lazy">` : icon(TYPE_ICON[programType(other)])}
      </span>
      <span class="detail-similar-text">
        <strong>${safe(text(other, 'name'))}</strong>
        <span>${t(`programs.type.${programType(other)}`)} · ${safe(cityOf(other) || '—')}</span>
      </span>
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
