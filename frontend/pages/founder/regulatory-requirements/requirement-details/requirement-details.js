/* Requirement details: one regulatory requirement, read from ?id= in the address.
   A colored head (the requirement's color, as on its card in the explorer), then
   two columns: when it applies, what to do and the fees on one side; the key facts and the official links in a card on the other. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showToast } from '../../../../shared/ui.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadRequirement, field, label, isicListText, stagesText, colorOf, logoUrl, initials,
  dateText,
} from '../../../../shared/regulatory.js?v=3';

const id = new URLSearchParams(window.location.search).get('id');
let requirement = null;

// Requirement text comes from the database, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/* One key fact in the side card: a small colored icon, a label, the value */
function fact(iconName, tone, labelKey, value) {
  return `
    <div class="req-fact">
      <span class="req-fact-icon tone-${tone}">${icon(iconName)}</span>
      <span class="req-fact-text">
        <span class="req-fact-label">${t(labelKey)}</span>
        <strong class="req-fact-value">${safe(value)}</strong>
      </span>
    </div>`;
}

// Shows or hides a link, and points it at the address
function setLink(link, address) {
  link.href = address || '#';
  link.hidden = !address;
}

/* The authority's logo, or its initials when there is none */
function logoHtml(row) {
  const logo = logoUrl(row);
  return logo ? `<img src="${safe(logo)}" alt="">` : safe(initials(row.authority));
}

/* "What to do" as steps: one step for each sentence */
function stepsOf(text) {
  return (text || '').split(/(?<=[.؛])\s+/).map((step) => step.trim()).filter(Boolean);
}

/* ---------- Drawing (in the current language) ---------- */

function show() {
  const row = requirement;
  const name = field(row, 'name');
  const stage = stagesText(row);

  document.title = `${name} · Darb`;

  // Head, in the requirement's color
  document.querySelector('#hero').className = `req-hero color-${colorOf(row)}`;
  const logo = document.querySelector('#logo');
  logo.innerHTML = logoHtml(row);
  logo.classList.toggle('has-logo', Boolean(logoUrl(row)));
  document.querySelector('#name').textContent = name;
  document.querySelector('#authority').textContent = field(row, 'authority') || '—';

  // Tags: the type (with its icon), how binding it is, then the business stages
  document.querySelector('#tags').innerHTML = [
    row.category ? `<span class="req-tag is-strong">${icon('file')}${safe(field(row, 'category'))}</span>` : '',
    row.mandatory ? `<span class="req-tag">${safe(label('mandatory', row.mandatory))}</span>` : '',
    stage ? `<span class="req-tag">${safe(stage)}</span>` : '',
  ].join('');

  // When it applies, and to which sectors
  const lines = [field(row, 'applies_when'), t('reg.forSectors').replace('{sectors}', isicListText(row))].filter(Boolean);
  document.querySelector('#applies').innerHTML = lines.map((line) => `<li>${icon('checkCircle')}<span>${safe(line)}</span></li>`).join('');

  // What to do: numbered steps
  const steps = stepsOf(field(row, 'what_darb_surface'));
  document.querySelector('#steps-section').hidden = steps.length === 0;
  document.querySelector('#steps-count').textContent = t('reg.stepsCount').replace('{n}', steps.length);
  document.querySelector('#steps').innerHTML = steps
    .map((step, index) => `<li><span class="req-step-number">${index + 1}</span><span>${safe(step)}</span></li>`)
    .join('');

  const fees = field(row, 'fees_thresholds');
  document.querySelector('#fees-section').hidden = !fees;
  document.querySelector('#fees').textContent = fees;

  // Side card: the key facts this requirement has (empty ones are left out), then the links
  const facts = [
    // icon colors: the Saudi greens (tone-N in requirement-details.css)
    ['landmark', 1, 'reg.authority', field(row, 'authority')],
    ['file', 2, 'regAdmin.type', field(row, 'category')],
    ['grid', 3, 'reg.isic', isicListText(row)],
    ['shield', 3, 'reg.obligation', row.mandatory ? label('mandatory', row.mandatory) : ''],
    ['flag', 4, 'reg.stage', stage],
    ['check', 5, 'regAdmin.status', row.regulatory_status ? label('status', row.regulatory_status) : ''],
    ['clock', 6, 'reg.lastChecked', row.last_verified ? dateText(row.last_verified) : ''],
  ].filter(([, , , value]) => value);
  document.querySelector('#facts').innerHTML = facts.map((item) => fact(...item)).join('');
  document.querySelector('#facts').hidden = facts.length === 0;
  setLink(document.querySelector('#service-link'), row.service_url);
  setLink(document.querySelector('#source-link'), row.official_source_url);

  document.querySelector('#note').textContent = row.last_verified
    ? t('reg.verifiedOn').replace('{date}', dateText(row.last_verified))
    : t('reg.mayChange');

}

/* ---------- Share ----------
   Phones open their own share sheet; elsewhere the link is copied. */

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
  if (requirement) show();
});

/* ---------- Start ---------- */

document.querySelector('#back-icon').innerHTML = icon('arrowBack');
document.querySelector('#share-icon').innerHTML = icon('share');
document.querySelector('#hero-art').innerHTML = icon('file');
document.querySelector('#apply-icon').innerHTML = icon('external');
document.querySelector('#source-icon').innerHTML = icon('external');
document.querySelector('#note-icon').innerHTML = icon('info');

// Going back keeps the explorer's filters when the person came from there
if (document.referrer.includes('requirements-explorer')) {
  document.querySelector('#back-link').href = document.referrer;
}

// no id, or a requirement that does not exist → 404; the database did not answer → 500
const result = id ? await loadRequirement(id) : { requirement: null, failed: false };
if (result.failed) {
  showErrorPage(500);
} else if (!result.requirement) {
  showErrorPage(404);
} else {
  requirement = result.requirement;
  document.querySelector('#loading').hidden = true;
  document.querySelector('#details').hidden = false;
  show();
}
