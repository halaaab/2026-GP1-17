/* Startup details: one startup, read from ?id= in the address.
   A colored head (the startup's color, as on its card in the explorer), then
   two columns: sectors and market, about, products and services and tags
   on one side; the key facts and the links in a card on the other. */

import { t, getLanguage } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadStartup, listOf, listText, label, tagsOf, countryName, colorOf, descriptionOf,
  nameOf, logoOf, logoHtml,
} from '../../../../shared/startups.js?v=4';

const id = new URLSearchParams(window.location.search).get('id');
let startup = null;

// Startup text comes from the dataset, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/* One key fact in the side card: a small colored icon, a label, the value */
function fact(iconName, tone, labelKey, value) {
  return `
    <div class="std-fact">
      <span class="std-fact-icon chip-pastel-${tone}">${icon(iconName)}</span>
      <span class="std-fact-text">
        <span class="std-fact-label">${t(labelKey)}</span>
        <strong class="std-fact-value">${safe(value)}</strong>
      </span>
    </div>`;
}

// Shows or hides a link, and points it at the address
function setLink(link, address) {
  link.href = address || '#';
  link.hidden = !address;
}

/* ---------- Drawing (in the current language) ---------- */

function show() {
  const row = startup;
  const comma = getLanguage() === 'ar' ? '، ' : ', ';
  const sectors = listOf(row, 'sector');
  const stage = listText(row, 'stage');
  const region = listText(row, 'region', comma);

  document.title = `${nameOf(row)} · Darb`;

  // Head, in the startup's color
  document.querySelector('#hero').className = `std-hero color-${colorOf(row)}`;
  const logo = document.querySelector('#logo');
  logo.classList.toggle('has-logo', Boolean(logoOf(row)));
  logo.innerHTML = logoHtml(row);
  document.querySelector('#name').textContent = nameOf(row);
  document.querySelector('#place').textContent = [region, countryName(row.country)].filter(Boolean).join(' · ') || '—';

  // Tags: the funding stage (with its icon), then up to three sectors
  document.querySelector('#tags').innerHTML = [
    stage ? `<span class="std-tag is-strong">${icon('flag')}${safe(stage)}</span>` : '',
    ...sectors.slice(0, 3).map((sector) => `<span class="std-tag">${safe(label('sector', sector))}</span>`),
  ].join('');

  // Sectors: the line only when the dataset has them
  const lines = [
    sectors.length ? t('startups.sectorsLine').replace('{list}', listText(row, 'sector', comma)) : '',
  ].filter(Boolean);
  document.querySelector('#market-section').hidden = lines.length === 0;
  document.querySelector('#market').innerHTML = lines.map((line) => `<li>${icon('checkCircle')}<span>${safe(line)}</span></li>`).join('');

  document.querySelector('#about').textContent = descriptionOf(row) || t('startups.noDescription');

  const tags = tagsOf(row);
  document.querySelector('#tags-section').hidden = tags.length === 0;
  document.querySelector('#tag-chips').innerHTML = tags.map((tag) => `<span class="chip">${safe(tag)}</span>`).join('');

  // Side card: the key facts the dataset has for this startup (empty ones are left out), then the links
  const facts = [
    // icon colors: shades of blue (sky, aqua, indigo, steel)
    ['flag', 3, 'startups.stage', stage],
    ['pin', 7, 'startups.region', region],
    ['globe', 12, 'startups.country', countryName(row.country)],
  ].filter(([, , , value]) => value);
  document.querySelector('#facts').innerHTML = facts.map((item) => fact(...item)).join('');
  document.querySelector('#facts').hidden = facts.length === 0;
  setLink(document.querySelector('#website'), row.website);
  setLink(document.querySelector('#profile'), row.ecosystemsa_profile_url);

}

/* ---------- Share ----------
   Phones open their own share sheet; elsewhere the link is copied. */

document.querySelector('#share').addEventListener('click', async () => {
  const link = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: nameOf(startup), url: link });
    } catch {
      // the person closed the share sheet
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast(t('reg.linkCopied'), 'good');
  } catch {
    showToast(t('reg.copyFailed'), 'risk');
  }
});

document.addEventListener('darb:language', () => {
  if (startup) show();
});

/* ---------- Start ---------- */

document.querySelector('#back-icon').innerHTML = icon('arrowBack');
document.querySelector('#share-icon').innerHTML = icon('share');
document.querySelector('#hero-art').innerHTML = icon('store');
document.querySelector('#website-icon').innerHTML = icon('external');
document.querySelector('#profile-icon').innerHTML = icon('external');
document.querySelector('#note-icon').innerHTML = icon('info');

// Going back keeps the explorer's filters when the person came from there
if (document.referrer.includes('startup-explorer')) {
  document.querySelector('#back-link').href = document.referrer;
}

// no id, or a startup that does not exist → 404; the database did not answer → 500
const result = id ? await loadStartup(id) : { startup: null, failed: false };
if (result.failed) {
  showErrorPage(500);
} else if (!result.startup) {
  showErrorPage(404);
} else {
  startup = result.startup;
  document.querySelector('#loading').hidden = true;
  document.querySelector('#details').hidden = false;
  show();
}
