/* Requirement details: one regulatory requirement, read from ?id= in the address. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import {
  loadRequirement, field, label, sectorsText, stagesText, siteName, dateText,
} from '../../../../shared/regulatory.js';

const status = document.querySelector('#status');
const details = document.querySelector('#details');

const id = new URLSearchParams(window.location.search).get('id');
let requirement = null;

// Fills the page in the current language
function showRequirement() {
  const row = requirement;

  document.querySelector('#name').textContent = field(row, 'name');
  document.querySelector('#category').textContent = field(row, 'category');
  document.querySelector('#authority').textContent = field(row, 'authority');
  document.querySelector('#stage').textContent = stagesText(row) || '—';
  document.querySelector('#applies-when').textContent = field(row, 'applies_when');
  document.querySelector('#sectors').textContent = t('reg.forSectors').replace('{sectors}', sectorsText(row));

  // Required / Conditional …: required ones in navy, the rest in grey
  const mandatory = document.querySelector('#mandatory');
  mandatory.textContent = label('mandatory', row.mandatory || '');
  mandatory.hidden = !row.mandatory;
  mandatory.classList.toggle('chip-navy', (row.mandatory || '').startsWith('Required'));

  // sections with no text in the dataset are hidden
  const guidance = field(row, 'what_darb_should_surface');
  document.querySelector('#guidance').textContent = guidance;
  document.querySelector('#guidance-section').hidden = !guidance;

  const fees = field(row, 'fees_thresholds');
  document.querySelector('#fees').textContent = fees;
  document.querySelector('#fees-section').hidden = !fees;

  // official source: the authority's page, and the service where the founder applies
  const sourceLink = document.querySelector('#source-link');
  sourceLink.textContent = siteName(row.official_source_url) || '—';
  sourceLink.href = row.official_source_url || '#';
  document.querySelector('#source-title').textContent = field(row, 'authority');
  document.querySelector('#source-url').textContent = row.official_source_url || '';
  document.querySelector('#source-open').href = row.official_source_url || '#';
  document.querySelector('#source-open').hidden = !row.official_source_url;
  document.querySelector('#service-open').href = row.service_url || '#';
  document.querySelector('#service-open').hidden = !row.service_url;

  document.querySelector('#verified').textContent = row.last_verified
    ? t('reg.verifiedOn').replace('{date}', dateText(row.last_verified))
    : t('reg.mayChange');

  document.title = `${field(row, 'name')} · Darb`;
}

// Share: the phone's share sheet when there is one, otherwise copy the link
document.querySelector('#share').addEventListener('click', async () => {
  const link = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: field(requirement, 'name'), url: link });
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
  if (requirement) showRequirement();
  else if (!status.querySelector('.spinner')) status.textContent = t('reg.notFound');
});

/* ---------- Start ---------- */

document.querySelector('#back-icon').innerHTML = icon('arrowBack');
document.querySelector('#title-icon').innerHTML = icon('file');
document.querySelector('#share-icon').innerHTML = icon('share');
document.querySelector('#authority-icon').innerHTML = icon('landmark');
document.querySelector('#check-icon').innerHTML = icon('checkCircle');
document.querySelector('#sector-icon').innerHTML = icon('checkCircle');
document.querySelector('#source-icon').innerHTML = icon('landmark');
document.querySelector('#open-icon').innerHTML = icon('external');
document.querySelector('#apply-icon').innerHTML = icon('external');

requirement = id ? await loadRequirement(id) : null;
if (requirement) {
  showRequirement();
  status.hidden = true;
  details.hidden = false;
} else {
  status.textContent = t('reg.notFound');
}
