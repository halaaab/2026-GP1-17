/* Incubators & accelerators management: the list of support programs with a
   search box and type / sector / region filters. Each row has an edit button
   (opens the side panel) and a delete button (asks first). "Add program" opens
   the same panel empty. Only admins can save (database rules, migration 0006).
   Every program needs a logo (migration 0011): it is shrunk in the browser,
   uploaded to the "program-logos" Storage bucket, and its address saved in logo_url. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { showToast, showFormSummary } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import { showErrorPage } from '../../../shared/errors.js';
import '../../../shared/guard.js';
import {
  getPrograms, saveProgramLists, listsMismatch, programType, sectorList, sectorName, isOpenToAll, regionOf, clean, detailsLink,
  text, arabicOf, logoOf, logoHtml, LOGO_BUCKET, ARABIC_FIELDS, TYPE_CHIP,
} from '../../founder/incubators-accelerators/programs.js?v=4';
import { SAUDI_REGIONS, ISIC_CODES, label } from '../../../shared/startups.js?v=4';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;   // what an admin may pick; it is shrunk before upload
const LOGO_SIZE = 400;                    // the longest side of the uploaded logo, in pixels

// The upload arrow (layout.js has none)
const UPLOAD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>';

// The trash icon (layout.js has no delete icon)
const TRASH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';

const rows = document.querySelector('#rows');
const search = document.querySelector('#search');
const typeFilter = document.querySelector('#type-filter');
const sectorFilter = document.querySelector('#sector-filter');
const regionFilter = document.querySelector('#region-filter');
const empty = document.querySelector('#empty');
const panel = document.querySelector('#program-panel');
const form = document.querySelector('#program-form');
const typeSelect = document.querySelector('#f-type');
const saveButton = document.querySelector('#save-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteConfirm = document.querySelector('#delete-confirm');
const sectorChoices = document.querySelector('#sector-choices');

// The sector of a program open to every sector (the other sectors are the 20 ISIC4 sections, ISIC_CODES)
const OPEN_TO_ALL = 'All sectors';

// The form's fields, named like the table's columns
const FIELDS = ['name', 'type', 'location', 'sector', 'description', 'target_stage', 'program_duration', 'services_support', 'funding_investment', 'eligibility', 'website'];

// Every field must be filled except these two (the logo is required too)
const OPTIONAL = ['program_duration', 'funding_investment'];
const REQUIRED = FIELDS.filter((field) => !OPTIONAL.includes(field));

// The Arabic twins of the text fields (migration 0012).
// location_ar and sector_ar have no box of their own: they are written from the chosen
// region (see locationOf) and the ticked sectors (see sectorArabic).
const ARABIC = ARABIC_FIELDS.map((field) => `${field}_ar`).filter((field) => field !== 'location_ar' && field !== 'sector_ar');
// An Arabic field is required when its English twin is (duration and funding stay optional)
const REQUIRED_ARABIC = ARABIC.filter((field) => !OPTIONAL.includes(field.replace(/_ar$/, '')));
let hasArabic = false;   // true once the table has the Arabic columns

let programs = [];
let selectedId = null;   // the program open in the panel; null while adding a new one
let deleteId = null;     // the program the delete question is about

// The logo in the open panel: the saved one, a new picture waiting to upload, or removed
const logo = { current: '', file: null, preview: '', removed: false };

let loadFailed = false;

// The Arabic translation file, read once at the start, for the Arabic words of the sectors
let arabicWords = {};

/* ---------- Small helpers ---------- */

// Program text is typed by admins, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function dateText(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function findProgram(id) {
  return programs.find((program) => program.support_org_id === id);
}

// "Open to all sectors", or the program's sectors as one line
function appliesTo(program) {
  if (isOpenToAll(program)) return t('programs.openToAll');
  return sectorList(program).map((sector) => sectorName(program, sector)).join(t('programs.listComma')) || '—';
}

/* ---------- Filters ---------- */

// The program's region in the Kingdom, in the page's language: "Eastern Province",
// "All of Saudi Arabia" for a program that covers the whole country, '' when unknown
function regionText(program) {
  const region = regionOf(program);
  if (region === 'saudi') return t('programs.nationwide');
  return region ? label('region', region) : '';
}

// The sector dropdown lists the sectors the programs really have, A to Z, in the page's language
// (the same words as the Startup Explorer). The values are English words, so a choice stays
// chosen when the language changes.
// The region dropdown lists the Saudi regions that have a program, in the order of the 13 regions.
function fillDropdowns() {
  const keep = sectorFilter.value;
  const sectors = [...new Set(programs.flatMap(sectorList))]
    .sort((a, b) => (ISIC_CODES.indexOf(a) + 1 || 99) - (ISIC_CODES.indexOf(b) + 1 || 99) || a.localeCompare(b))
    .map((sector) => [sector, sectorName({}, sector)]);

  sectorFilter.querySelectorAll('option:not(:first-child)').forEach((option) => option.remove());
  sectorFilter.insertAdjacentHTML('beforeend', sectors.map(([value, words]) => `<option value="${safe(value)}">${safe(words)}</option>`).join(''));

  sectorFilter.value = keep;

  const keepRegion = regionFilter.value;
  regionFilter.querySelectorAll('option:not(:first-child)').forEach((option) => option.remove());
  regionFilter.insertAdjacentHTML('beforeend', SAUDI_REGIONS
    .filter((region) => programs.some((program) => regionOf(program) === region))
    .map((region) => `<option value="${safe(region)}">${safe(label('region', region))}</option>`).join(''));
  regionFilter.value = keepRegion;
}

function matches(program) {
  const words = search.value.trim().toLowerCase();
  const kind = programType(program);
  const fitsSearch = ['name', 'sector', 'location', 'target_stage']
    .flatMap((field) => [clean(program[field]), arabicOf(program, field)])
    .concat(regionText(program))
    .join(' ').toLowerCase().includes(words);
  const fitsType = !typeFilter.value || kind === typeFilter.value || kind === 'both';
  const fitsSector = !sectorFilter.value || sectorList(program).includes(sectorFilter.value) || isOpenToAll(program);
  // a program for all of Saudi Arabia fits any region (the same as the founder explorer)
  const fitsRegion = !regionFilter.value || regionOf(program) === regionFilter.value || regionOf(program) === 'saudi';
  return fitsSearch && fitsType && fitsSector && fitsRegion;
}

/* ---------- The table ---------- */

function showRows() {
  const visible = programs.filter(matches);

  rows.innerHTML = visible.map((program) => {
    const kind = programType(program);
    const name = text(program, 'name');
    const place = regionText(program);
    return `
      <tr class="${program.support_org_id === selectedId ? 'is-selected' : ''}">
        <td class="manage-name">
          <div class="manage-program">
            ${logoHtml(program)}
            <div>
              <span class="cell-title">${safe(name)}</span>
              <span class="cell-detail">${safe(place || '—')}</span>
            </div>
          </div>
        </td>
        <td><span class="chip manage-chip ${TYPE_CHIP[kind]}">${t(`programs.type.${kind}`)}</span></td>
        <td class="hide-small manage-text">${safe(text(program, 'target_stage') || '—')}</td>
        <td class="hide-small manage-text">${safe(appliesTo(program))}</td>
        <td class="hide-small manage-text">${dateText(program.updated_at || program.created_at)}</td>
        <td>
          <div class="manage-actions">
            <button type="button" class="btn-icon" data-edit="${program.support_org_id}" aria-label="${safe(`${t('programsAdmin.edit')}: ${name}`)}" title="${t('programsAdmin.edit')}">${icon('pencil')}</button>
            <button type="button" class="btn-icon manage-delete" data-delete="${program.support_org_id}" aria-label="${safe(`${t('programsAdmin.delete')}: ${name}`)}" title="${t('programsAdmin.delete')}">${TRASH}</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  empty.textContent = t(loadFailed ? 'programsAdmin.loadError' : programs.length ? 'programsAdmin.noMatch' : 'programsAdmin.none');
  empty.hidden = visible.length > 0;
}

/* ---------- The region of a program ----------
   The form asks for the region in the Kingdom, not a city. The region is saved as the
   program's location in both languages, "Eastern Province, Saudi Arabia", so the
   explorers find it with regionOf(). */

const REGION_WORDS = {
  Riyadh: ['Riyadh', 'الرياض'],
  Makkah: ['Makkah', 'مكة المكرمة'],
  Madinah: ['Madinah', 'المدينة المنورة'],
  Eastern: ['Eastern Province', 'المنطقة الشرقية'],
  Qassim: ['Qassim', 'القصيم'],
  Asir: ['Asir', 'عسير'],
  Tabuk: ['Tabuk', 'تبوك'],
  Hail: ['Hail', 'حائل'],
  'Northern Borders': ['Northern Borders', 'الحدود الشمالية'],
  Jazan: ['Jazan', 'جازان'],
  Najran: ['Najran', 'نجران'],
  'Al Baha': ['Al Baha', 'الباحة'],
  'Al Jouf': ['Al Jouf', 'الجوف'],
};

// The choices: "Choose a region", all of Saudi Arabia, then the 13 regions
function fillRegionChoices() {
  const select = form.elements.location;
  const keep = select.value;
  select.innerHTML = `<option value="">${t('programsAdmin.f.chooseRegion')}</option>`
    + `<option value="saudi">${t('programs.nationwide')}</option>`
    + SAUDI_REGIONS.map((region) => `<option value="${safe(region)}">${safe(label('region', region))}</option>`).join('');
  select.value = keep;
}

/* The location to save, in English and Arabic. A program edited without changing
   its region keeps its own words ("Thuwal, Saudi Arabia / KAUST"). */
function locationOf(region, program) {
  if (program && regionOf(program) === region) {
    return { location: clean(program.location) || null, location_ar: arabicOf(program, 'location') || null };
  }
  if (region === 'saudi') return { location: 'Saudi Arabia', location_ar: 'المملكة العربية السعودية' };
  const [english, arabic] = REGION_WORDS[region];
  return { location: `${english}, Saudi Arabia`, location_ar: `${arabic}، المملكة العربية السعودية` };
}

/* ---------- The sectors of a program ----------
   The form asks the admin to tick ISIC4 sections (the same sectors as the Startup Explorer),
   from what the program's own website says it supports. "All sectors" is for a program open to every sector. */

// The ticked sectors, as kept in the hidden sector box: "Gaming; AI & Deep Tech" → ['Gaming', 'AI & Deep Tech']
function tickedSectors() {
  return form.elements.sector.value.split(';').map((sector) => sector.trim()).filter(Boolean);
}

// The check boxes, in the page's language: "All sectors", the startups' sectors, then any
// other sector the program already has, so editing a program never loses one
function fillSectorChoices() {
  const ticked = tickedSectors();
  const values = [...new Set([OPEN_TO_ALL, ...ISIC_CODES, ...ticked])];
  sectorChoices.innerHTML = values.map((value) => `
    <label class="check"><input type="checkbox" value="${safe(value)}"> ${safe(value === OPEN_TO_ALL ? t('isic.all') : sectorName({}, value))}</label>`).join('');
  sectorChoices.querySelectorAll('input').forEach((box) => { box.checked = ticked.includes(box.value); });
}

// A box ticked or unticked: the hidden sector box keeps the ticked ones, in the list's order
sectorChoices.addEventListener('change', () => {
  const ticked = [...sectorChoices.querySelectorAll('input:checked')].map((box) => box.value);
  form.elements.sector.value = ticked.join('; ');
  if (ticked.length) showError(form.elements.sector, '');
});

// The Arabic of a sector, the same words as the explorers: an ISIC4 section's plain name
// (reg.isic.* in ar.json). A sector with no translation keeps the program's own Arabic, or the English.
function sectorArabic(sector) {
  if (sector === OPEN_TO_ALL) return 'جميع القطاعات';
  if (arabicWords[`reg.isic.${sector}`]) return arabicWords[`reg.isic.${sector}`];
  // "Food & Beverages" → "food_beverages", as label() in shared/startups.js makes the key
  const key = sector.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const saved = (findProgram(selectedId)?.sectors || []).find((item) => item.sector === sector);
  return arabicWords[`startup.sector.${key}`] || clean(saved?.sector_ar) || sector;
}

/* ---------- The side panel ---------- */

function fillForm(program) {
  // A type from the dataset that is not one of the three choices is kept as it is
  typeSelect.querySelectorAll('[data-custom]').forEach((option) => option.remove());
  const type = clean(program?.type);
  if (type && ![...typeSelect.options].some((option) => option.value === type)) {
    const option = new Option(type, type);
    option.dataset.custom = '';
    typeSelect.append(option);
  }

  FIELDS.forEach((field) => {
    form.elements[field].value = program ? clean(program[field]) : '';
  });
  ARABIC.forEach((field) => {
    form.elements[field].value = program ? arabicOf(program, field.replace(/_ar$/, '')) : '';
  });
  if (!program) typeSelect.value = 'Incubator';
  // the sector boxes are ticked from the hidden sector box filled above
  fillSectorChoices();
  // the location box is a region choice: its value is the program's region
  fillRegionChoices();
  form.elements.location.value = program ? regionOf(program) : '';

  clearErrors();
}

function openPanel(id) {
  selectedId = id;
  const program = id ? findProgram(id) : null;

  document.querySelector('#panel-title').textContent = t(program ? 'programsAdmin.editTitle' : 'programsAdmin.addTitle');
  document.querySelector('#panel-sub').innerHTML = program
    ? `${t('programsAdmin.lastUpdated')} ${dateText(program.updated_at || program.created_at)} · <a class="link" href="${detailsLink(program.support_org_id)}" target="_blank" rel="noopener">${t('programsAdmin.viewAsFounder')}</a>`
    : t('programsAdmin.addSub');

  fillForm(program);
  resetLogo(program);
  showSaveLabel();
  panel.classList.add('is-open');
  showRows();
  form.elements.name.focus();
}

function closePanel() {
  selectedId = null;
  panel.classList.remove('is-open');
  showRows();
}

// "AlMashtal will be removed from the list ..." in the page's language
function deleteText() {
  return t('programsAdmin.deleteText').replace('{name}', text(findProgram(deleteId), 'name'));
}

// The edit and delete buttons in each row
rows.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  if (edit) {
    openPanel(edit.dataset.edit);
    return;
  }

  const remove = event.target.closest('[data-delete]');
  if (remove) {
    deleteId = remove.dataset.delete;
    document.querySelector('#delete-text').textContent = deleteText();
    deleteModal.showModal();
  }
});

// ui.js closes the panel; here we only clear the highlighted row
panel.addEventListener('click', (event) => {
  if (event.target.closest('[data-panel-close]')) {
    selectedId = null;
    showRows();
  }
});

/* ---------- Save button ---------- */

// "Save changes" when editing a program, "Add program" when adding one
function showSaveLabel() {
  saveButton.textContent = t(selectedId ? 'programsAdmin.saveChanges' : 'programsAdmin.add');
}

/* ---------- Logo (required) ---------- */

const logoInput = document.querySelector('#f-logo');
const logoError = document.querySelector('#logo-error');

function showLogo() {
  const preview = document.querySelector('#logo-preview');
  const shown = logo.preview || (logo.removed ? '' : logo.current);
  preview.classList.toggle('has-image', Boolean(shown));
  preview.innerHTML = shown
    ? `<img src="${safe(shown)}" alt="">`
    : logoHtml({ name: form.elements.name.value || '?' });
  document.querySelector('#logo-choose').innerHTML = `${UPLOAD}<span>${t(shown ? 'programsAdmin.f.logoReplace' : 'programsAdmin.f.logoUpload')}</span>`;
  document.querySelector('#logo-remove').hidden = !shown;
}

function resetLogo(program) {
  if (logo.preview) URL.revokeObjectURL(logo.preview);
  Object.assign(logo, { current: program ? logoOf(program) : '', file: null, preview: '', removed: false });
  logoInput.value = '';
  logoError.hidden = true;
  showLogo();
}

/* Makes the picture at most LOGO_SIZE pixels on its longest side and saves it
   as WebP (PNG where the browser cannot), keeping a transparent background. */
async function shrinkLogo(file) {
  const picture = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_SIZE / Math.max(picture.width, picture.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(picture.width * scale);
  canvas.height = Math.round(picture.height * scale);
  canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
  picture.close();

  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  const webp = await toBlob('image/webp');
  return webp && webp.type === 'image/webp' ? webp : toBlob('image/png');
}

async function pickLogo(file) {
  logoError.hidden = true;
  if (!file) return;

  if (!LOGO_TYPES.includes(file.type)) {
    logoError.textContent = t('programsAdmin.f.logoType');
    logoError.hidden = false;
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    logoError.textContent = t('programsAdmin.f.logoSize');
    logoError.hidden = false;
    return;
  }

  try {
    const small = await shrinkLogo(file);
    if (logo.preview) URL.revokeObjectURL(logo.preview);
    logo.file = small;
    logo.preview = URL.createObjectURL(small);
    logo.removed = false;
    document.querySelector('#logo-picker').classList.remove('is-error');
  } catch {
    logoError.textContent = t('programsAdmin.f.logoType');
    logoError.hidden = false;
  }
  showLogo();
}

document.querySelector('#logo-choose').addEventListener('click', () => logoInput.click());
logoInput.addEventListener('change', () => pickLogo(logoInput.files[0]));

document.querySelector('#logo-remove').addEventListener('click', () => {
  if (logo.preview) URL.revokeObjectURL(logo.preview);
  Object.assign(logo, { file: null, preview: '', removed: true });
  logoInput.value = '';
  showLogo();
});

// A picture can also be dropped on the picker
const picker = document.querySelector('#logo-picker');
picker.addEventListener('dragover', (event) => {
  event.preventDefault();
  picker.classList.add('is-dragging');
});
picker.addEventListener('dragleave', () => picker.classList.remove('is-dragging'));
picker.addEventListener('drop', (event) => {
  event.preventDefault();
  picker.classList.remove('is-dragging');
  pickLogo(event.dataTransfer.files[0]);
});

// The initials in the preview follow the name while it is typed
form.elements.name.addEventListener('input', () => {
  if (!logo.preview && (logo.removed || !logo.current)) showLogo();
});

// The file's path inside the bucket, from its public address
function logoPath(address) {
  const marker = `/object/public/${LOGO_BUCKET}/`;
  const index = (address || '').indexOf(marker);
  return index === -1 ? '' : decodeURIComponent(address.slice(index + marker.length));
}

async function uploadLogo(programId) {
  const extension = logo.file.type === 'image/webp' ? 'webp' : 'png';
  const path = `${programId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, logo.file, { contentType: logo.file.type });
  if (error) throw error;
  return { path, address: supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl };
}

// Removing an old file is tidying up: if it fails, the program is still saved
async function removeLogoFile(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(LOGO_BUCKET).remove([path]);
  if (error) console.error('remove old logo:', error.message);
}

/* ---------- Saving ---------- */

// What the form holds, with empty fields saved as empty (never as "—")
function formValues() {
  const values = {};
  FIELDS.forEach((field) => {
    values[field] = form.elements[field].value.trim() || null;
  });
  // the Arabic fields are sent only when the database has their columns
  if (hasArabic) {
    ARABIC.forEach((field) => {
      values[field] = form.elements[field].value.trim() || null;
    });
  }
  // the ticked sectors get their Arabic, in the same order
  if (hasArabic) {
    values.sector_ar = tickedSectors().map(sectorArabic).join('؛ ') || null;
  }
  // the chosen region becomes the location (and its Arabic twin)
  if (values.location) {
    const place = locationOf(values.location, selectedId ? findProgram(selectedId) : null);
    values.location = place.location;
    if (hasArabic) values.location_ar = place.location_ar;
  }
  return values;
}

function isValidWebsite(text) {
  try {
    const address = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return address.hostname.includes('.');
  } catch {
    return false;
  }
}

/* ---------- Required fields ---------- */

// The message under a field, made the first time it is needed
function errorFor(input) {
  let message = input.parentElement.querySelector(`[data-error-for="${input.name}"]`);
  if (!message) {
    message = document.createElement('p');
    message.className = 'field-error';
    message.dataset.errorFor = input.name;
    message.id = `${input.id}-error`;
    input.after(message);
  }
  return message;
}

function showError(input, key) {
  const message = errorFor(input);
  message.textContent = key ? t(key) : '';
  message.hidden = !key;
  input.classList.toggle('is-error', Boolean(key));
  if (key) input.setAttribute('aria-describedby', message.id);
  else input.removeAttribute('aria-describedby');
}

function clearErrors() {
  document.querySelector('#form-summary').hidden = true;
  [...FIELDS, ...ARABIC].forEach((field) => showError(form.elements[field], ''));
  logoError.hidden = true;
  document.querySelector('#logo-picker').classList.remove('is-error');
}

function hasLogo() {
  return Boolean(logo.file || (logo.current && !logo.removed));
}

/* Checks every required field and shows what is missing.
   Returns the first field to fix, or null when the form is complete. */
function checkForm(values) {
  let first = null;

  REQUIRED.forEach((field) => {
    const input = form.elements[field];
    let key = '';
    if (!values[field]) key = 'programsAdmin.required';
    else if (field === 'website' && !isValidWebsite(values.website)) key = 'programsAdmin.badWebsite';
    showError(input, key);
    // the sector box is hidden: the first check box is the one to go to
    if (key && !first) first = field === 'sector' ? sectorChoices.querySelector('input') : input;
  });

  // the Arabic version, when the database has its columns
  if (hasArabic) {
    REQUIRED_ARABIC.forEach((field) => {
      const input = form.elements[field];
      const key = values[field] ? '' : 'programsAdmin.required';
      showError(input, key);
      if (key && !first) first = input;
    });
  }

  const logoMissing = !hasLogo();
  document.querySelector('#logo-picker').classList.toggle('is-error', logoMissing);
  if (logoMissing) {
    logoError.textContent = t('programsAdmin.logoRequired');
    logoError.hidden = false;
    first = document.querySelector('#logo-choose');
  }
  return first;
}

// A message goes away as soon as its field is filled
form.addEventListener('input', (event) => {
  if (event.target.classList.contains('is-error') && event.target.value.trim()) showError(event.target, '');
});

saveButton.addEventListener('click', async () => {
  const values = formValues();

  // "N fields need attention" above the form, then the first one, as on the other admin panels
  if (checkForm(values)) {
    showFormSummary(form, (n) => (n === 1 ? t('form.oneProblem') : t('form.problems').replace('{n}', n)));
    return;
  }

  if (values.website && !/^https?:\/\//i.test(values.website)) {
    values.website = `https://${values.website}`;
  }

  saveButton.classList.add('is-loading');

  // A new program gets its id here, so its logo can be uploaded under it first
  const programId = selectedId || crypto.randomUUID();
  const oldLogoPath = logoPath(logo.current);
  // an Arabic list must have as many items as its English list; checked before anything is saved
  if (listsMismatch(values)) {
    saveButton.classList.remove('is-loading');
    showToast(t('programsAdmin.listsMismatch'), 'risk');
    return;
  }

  let uploaded = null;

  try {
    if (logo.file) {
      uploaded = await uploadLogo(programId);
      values.logo_url = uploaded.address;
    } else if (logo.removed) {
      values.logo_url = null;
    }
  } catch (error) {
    saveButton.classList.remove('is-loading');
    console.error('upload logo:', error.message);
    showToast(t('programsAdmin.f.logoNotSaved'), 'risk');
    return;
  }

  // the sectors and services are saved in their own tables after the program (saveProgramLists)
  const { sector, sector_ar, services_support, services_support_ar, ...columns } = values;
  const lists = { sector, sector_ar, services_support, services_support_ar };

  let result;
  if (selectedId) {
    result = await supabase.from('support_organizations').update(columns).eq('support_org_id', selectedId).select().single();
  } else {
    // the database remembers which admin added it (organization_maintenance, migration 0024)
    result = await supabase.from('support_organizations')
      .insert({ ...columns, support_org_id: programId }).select().single();
  }
  const listResult = result.error ? null : await saveProgramLists(programId, lists);
  saveButton.classList.remove('is-loading');

  if (listResult === 'mismatch') {
    showToast(t('programsAdmin.listsMismatch'), 'risk');
    return;
  }
  if (!result.error && listResult) result.error = listResult;
  if (result.error) {
    console.error('save program:', result.error.message);
    if (uploaded) removeLogoFile(uploaded.path);
    // the logo_url column comes with migration 0011
    const needsUpdate = (result.error.message || '').includes('logo_url');
    showToast(t(needsUpdate ? 'programsAdmin.f.logoNotSaved' : 'programsAdmin.saveError'), 'risk');
    return;
  }

  Object.assign(result.data, lists);

  // the old picture is no longer used
  if ((uploaded || logo.removed) && oldLogoPath) removeLogoFile(oldLogoPath);

  const wasEditing = Boolean(selectedId);
  if (wasEditing) {
    programs = programs.map((program) => (program.support_org_id === selectedId ? result.data : program));
  } else {
    programs = [...programs, result.data].sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
  }

  showToast(t(wasEditing ? 'programsAdmin.saved' : 'programsAdmin.added'), 'good');
  fillDropdowns();
  closePanel();
});

/* ---------- Deleting ---------- */

deleteConfirm.addEventListener('click', async () => {
  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.from('support_organizations').delete().eq('support_org_id', deleteId);
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (error) {
    console.error('delete program:', error.message);
    showToast(t('programsAdmin.saveError'), 'risk');
    return;
  }

  programs = programs.filter((program) => program.support_org_id !== deleteId);
  if (selectedId === deleteId) closePanel();
  deleteId = null;
  showToast(t('programsAdmin.deleted'), 'good');
  fillDropdowns();
  showRows();
});

/* ---------- Search and filters ---------- */

search.addEventListener('input', showRows);
[typeFilter, sectorFilter, regionFilter].forEach((select) => select.addEventListener('change', showRows));

document.querySelector('#add-button').addEventListener('click', () => openPanel(null));

document.querySelector('#delete-icon').innerHTML = icon('trash');

function showAddButton() {
  document.querySelector('#add-button').innerHTML = `${icon('plus')}<span>${t('programsAdmin.add')}</span>`;
}

// dates and labels are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  if (deleteModal.open) document.querySelector('#delete-text').textContent = deleteText();
  fillSectorChoices();
  fillRegionChoices();
  fillDropdowns();
  showAddButton();
  showSaveLabel();
  showLogo();
  showRows();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#panel-close').innerHTML = icon('close');
showAddButton();

const data = await getPrograms();
loadFailed = data === null;
if (loadFailed) showErrorPage(500);   // the programs could not be loaded: the 500 page offers "Try again"
programs = data || [];

// the Arabic words of the sectors, so sector_ar is written even when the page is in English
arabicWords = await fetch(new URL('../../../translations/ar.json', import.meta.url))
  .then((response) => response.json())
  .catch(() => ({}));

// After migration 0012 every row has the Arabic columns: show the Arabic part of the form
hasArabic = programs.some((program) => 'name_ar' in program);
// the Arabic fields sit next to their English twins; they show only when the table has the Arabic columns
document.querySelectorAll('[data-arabic]').forEach((field) => { field.hidden = !hasArabic; });

fillDropdowns();
showRows();
