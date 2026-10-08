/* Startup details: one startup, read from ?id= in the address. */

import { t, getLanguage } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadStartup, listOf, listText, tagsOf, initials, countryName, siteName,
} from '../../../../shared/startups.js';

const status = document.querySelector('#status');
const details = document.querySelector('#details');

const id = new URLSearchParams(window.location.search).get('id');
let startup = null;

// Shows or hides a link, and points it at the address
function setLink(link, address) {
  link.href = address || '#';
  link.hidden = !address;
}

// Fills the page in the current language
function showStartup() {
  const row = startup;
  const comma = getLanguage() === 'ar' ? '، ' : ', ';
  const none = t('startups.none');

  document.querySelector('#logo').textContent = initials(row.startup_name);
  document.querySelector('#source-logo').textContent = initials(row.startup_name);
  document.querySelector('#name').textContent = row.startup_name;
  document.querySelector('#sectors').textContent = listText(row, 'sector', comma) || t('startups.noSector');

  // the funding stage: a chip next to the sectors, and a tile
  const stage = listText(row, 'stage');
  document.querySelector('#stage-chip').textContent = stage;
  document.querySelector('#stage-chip').hidden = !stage;
  document.querySelector('#stage').textContent = stage || none;
  document.querySelector('#region').textContent = listText(row, 'region', comma) || none;

  const websiteLink = document.querySelector('#website-link');
  websiteLink.textContent = siteName(row.website);
  setLink(websiteLink, row.website);
  document.querySelector('#website-none').hidden = Boolean(row.website);

  document.querySelector('#description').textContent = row.startup_description || t('startups.noDescription');

  // sections with nothing in the dataset are hidden
  const products = listOf(row, 'products_services');
  document.querySelector('#products').innerHTML = products.map(() => `<li>${icon('checkCircle')}<span></span></li>`).join('');
  document.querySelectorAll('#products span').forEach((span, index) => { span.textContent = products[index]; });
  document.querySelector('#products-section').hidden = products.length === 0;

  // market: who it sells to and its country, each line only when the dataset has it
  const market = listText(row, 'target_market', comma);
  const country = countryName(row.country);
  document.querySelector('#market').textContent = t('startups.marketLine').replace('{market}', market);
  document.querySelector('#market').parentElement.hidden = !market;
  document.querySelector('#country').textContent = t('startups.countryLine').replace('{country}', country);
  document.querySelector('#country').parentElement.hidden = !country;
  document.querySelector('#market-section').hidden = !market && !country;

  const tags = tagsOf(row);
  document.querySelector('#tags').innerHTML = tags.map(() => '<span class="chip"></span>').join('');
  document.querySelectorAll('#tags .chip').forEach((chip, index) => { chip.textContent = tags[index]; });
  document.querySelector('#tags-section').hidden = tags.length === 0;

  // links: the startup's website and its EcosystemSA profile
  document.querySelector('#source-title').textContent = row.startup_name;
  document.querySelector('#source-url').textContent = row.website || row.ecosystemsa_profile_url || '';
  setLink(document.querySelector('#website-open'), row.website);
  setLink(document.querySelector('#profile-open'), row.ecosystemsa_profile_url);

  document.title = `${row.startup_name} · Darb`;
}

// Share: the phone's share sheet when there is one, otherwise copy the link
document.querySelector('#share').addEventListener('click', async () => {
  const link = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: startup.startup_name, url: link });
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
  if (startup) showStartup();
});

/* ---------- Start ---------- */

document.querySelector('#back-icon').innerHTML = icon('arrowBack');
document.querySelector('#share-icon').innerHTML = icon('share');
document.querySelector('#region-icon').innerHTML = icon('map');
document.querySelectorAll('.std-check-icon').forEach((span) => { span.innerHTML = icon('checkCircle'); });
document.querySelector('#profile-icon').innerHTML = icon('external');
document.querySelector('#website-icon').innerHTML = icon('external');

// no id, or a startup that does not exist → 404; the database did not answer → 500
const result = id ? await loadStartup(id) : { startup: null, failed: false };
startup = result.startup;
if (result.failed) {
  showErrorPage(500);
} else if (!startup) {
  showErrorPage(404);
} else {
  showStartup();
  status.hidden = true;
  details.hidden = false;
}
