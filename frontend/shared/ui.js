/* ==========================================================
   Small interactive pieces: toast, modal, side panel, password show / hide,
   and dropdowns you can type in to search.

   Add it to a page once:
     <script type="module" src="../../../shared/ui.js"></script>

   Toast (from JavaScript):
     import { showToast } from '../../../shared/ui.js';
     showToast('Saved', 'good');          // 'good', 'risk' or leave empty

   Modal (HTML only, no JavaScript needed):
     <button data-modal-open="my-modal">Open</button>
     <dialog class="modal" id="my-modal">
       ...
       <button data-modal-close>Cancel</button>
     </dialog>

   Side panel (HTML only):
     <button data-panel-open="my-panel">Open</button>
     <aside class="panel" id="my-panel">
       ...
       <button data-panel-close>Close</button>
     </aside>

   Searchable dropdown (HTML only): write a normal dropdown and add data-searchable.
     <select class="input" name="country" data-searchable> ...options... </select>
   The first option should be the empty "Choose…" one. Read and set the answer
   on the <select> as usual; the box you type in is only its face.

   Password show / hide (HTML only):
     <div class="input-group">
       <input class="input" type="password">
       <button type="button" class="btn-icon" data-password-toggle aria-label="Show password">(svg)</button>
     </div>
   ========================================================== */

import { t } from './language.js';

const TOAST_TIME = 3000;   // milliseconds a toast stays on screen

/* The admin add / edit panels (shared.css, .edit-panel): after a page checks its form, this counts the fields
   that show a problem (a red frame or a red message), writes "N fields need attention" in the form's
   .form-summary and scrolls to the first one. words(n) gives the sentence in the page's language.
   Returns the number of problems (0 hides the summary). */
export function showFormSummary(form, words) {
  const summary = form.querySelector('.form-summary');
  const fields = [...form.querySelectorAll('.field, .form-section > fieldset')].filter((field) =>
    field.querySelector('.is-error, .field-error:not([hidden]):not(:empty)') || field.classList.contains('is-error'));
  const count = fields.length;
  if (summary) {
    summary.hidden = count === 0;
    summary.textContent = count ? words(count) : '';
  }
  if (count) {
    (summary || fields[0]).scrollIntoView({ block: 'start', behavior: 'smooth' });
    const first = fields[0].querySelector('input:not([type="hidden"]), select, textarea');
    if (first && first.type !== 'checkbox') first.focus({ preventScroll: true });
  }
  return count;
}

export function showToast(message, type = '') {
  let stack = document.querySelector('.toast-stack');

  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    document.body.append(stack);
  }

  const toast = document.createElement('div');
  toast.className = type ? `toast toast-${type}` : 'toast';
  toast.textContent = message;
  stack.append(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 300);
  }, TOAST_TIME);
}

document.addEventListener('click', (event) => {
  // Open a modal
  const openButton = event.target.closest('[data-modal-open]');
  if (openButton) {
    document.getElementById(openButton.dataset.modalOpen).showModal();
  }

  // Close the modal this button is inside
  const closeButton = event.target.closest('[data-modal-close]');
  if (closeButton) {
    closeButton.closest('dialog').close();
  }

  // Clicking the dark area around a modal closes it
  if (event.target.matches('dialog.modal')) {
    event.target.close();
  }

  // Open a side panel
  const panelOpenButton = event.target.closest('[data-panel-open]');
  if (panelOpenButton) {
    document.getElementById(panelOpenButton.dataset.panelOpen).classList.add('is-open');
  }

  // Close the side panel this button is inside
  const panelCloseButton = event.target.closest('[data-panel-close]');
  if (panelCloseButton) {
    panelCloseButton.closest('.panel').classList.remove('is-open');
  }

  // Show or hide a password
  const passwordButton = event.target.closest('[data-password-toggle]');
  if (passwordButton) {
    const input = passwordButton.closest('.input-group').querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
  }
});

// Escape closes any open side panel (the browser already does this for modals)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.panel.is-open').forEach((panel) => panel.classList.remove('is-open'));
  }
});

/* ---------- Searchable dropdown ----------
   Keeps the real <select> (so forms and validation work as always) but hides it,
   and shows a text box with a list under it that narrows as you type. */

export function makeSearchable(select) {
  const combo = document.createElement('div');
  combo.className = 'combo';
  combo.innerHTML = `
    <input class="input combo-input" type="text" autocomplete="off" role="combobox" aria-expanded="false">
    <ul class="combo-list" role="listbox" hidden></ul>`;

  const input = combo.querySelector('input');
  const list = combo.querySelector('ul');

  // the label now points at the text box instead of the hidden dropdown
  const label = document.querySelector(`label[for="${select.id}"]`);
  input.id = `${select.id}-search`;
  if (label) label.htmlFor = input.id;

  select.classList.add('combo-native');
  select.tabIndex = -1;
  select.after(combo);

  const realOptions = () => [...select.options].filter((option) => option.value !== '');

  // Makes the text box show the chosen answer (or the "Choose…" hint when there is none)
  function showChosen() {
    const chosen = select.selectedOptions[0];
    input.value = chosen && chosen.value !== '' ? chosen.textContent : '';
    input.placeholder = select.options[0] ? select.options[0].textContent : '';
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    showChosen();   // throws away anything half-typed
  }

  function open(searchWords) {
    const words = searchWords.trim().toLowerCase();
    const matches = realOptions().filter((option) => option.textContent.toLowerCase().includes(words));

    list.innerHTML = matches.length
      ? matches.map((option) => `<li role="option" data-value="${option.value}" class="${option.value === select.value ? 'is-chosen' : ''}">${option.textContent}</li>`).join('')
      : `<li class="combo-empty">${select.dataset.emptyText || '—'}</li>`;

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  input.addEventListener('focus', () => { input.select(); open(''); });
  input.addEventListener('input', () => open(input.value));

  // mousedown, not click: it runs before the text box loses focus
  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('[data-value]');
    if (item) {
      event.preventDefault();
      choose(item.dataset.value);
      input.blur();
    }
  });

  input.addEventListener('blur', close);

  input.addEventListener('keydown', (event) => {
    const items = [...list.querySelectorAll('[data-value]')];
    const current = list.querySelector('.is-active');
    let position = items.indexOf(current);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) open('');
      position += event.key === 'ArrowDown' ? 1 : -1;
      const next = items[Math.max(0, Math.min(items.length - 1, position))];
      if (current) current.classList.remove('is-active');
      if (next) {
        next.classList.add('is-active');
        next.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = current || items[0];
      if (pick && !list.hidden) {
        choose(pick.dataset.value);
        input.blur();
      }
    } else if (event.key === 'Escape') {
      input.blur();
    }
  });

  // A click anywhere outside closes the list
  document.addEventListener('mousedown', (event) => {
    if (!combo.contains(event.target)) close();
  });

  // When the answer is changed from code, show the right words.
  // When the language changes, close the list too: its words are in the old language.
  select.addEventListener('change', showChosen);
  document.addEventListener('darb:language', close);
  showChosen();
}

document.querySelectorAll('select[data-searchable]').forEach(makeSearchable);

/* ---------- Searchable dropdown with several choices ----------
   The admin add / edit panels choose several sectors, ISIC sections or regions this way, on every page.
   Write the check boxes as usual inside a box with data-multiselect, and its search hint as a translation key:
     <div class="chip-choices" id="f-sector" data-multiselect data-placeholder-key="form.searchSectors">
       <label class="check"><input type="checkbox" name="sector" value="Retail"> Retail</label> …
     </div>
   The check boxes stay the answer (the page reads :checked, as before) and get a change event when one is
   picked; the box only shows them as a search field, the chosen ones as small chips with ×, and a list
   with a tick beside each chosen one. Keyboard: arrows to move, Enter to pick, Backspace removes the last
   chip, Escape closes. The page may rebuild the check boxes or tick them from code at any time. */
function makeMultiSelect(box) {
  const widget = document.createElement('div');
  widget.className = 'multi';
  widget.innerHTML = `
    <div class="input multi-field">
      <span class="multi-chips"></span>
      <input type="text" class="multi-search" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list">
    </div>
    <ul class="combo-list multi-list" role="listbox" aria-multiselectable="true" hidden></ul>`;
  const field = widget.querySelector('.multi-field');
  const chips = widget.querySelector('.multi-chips');
  const search = widget.querySelector('.multi-search');
  const list = widget.querySelector('.multi-list');

  box.classList.add('multi-native');
  box.after(widget);
  // the group's label (its legend) names the search box for screen readers
  const legend = box.closest('fieldset')?.querySelector('legend');
  if (legend) search.setAttribute('aria-label', legend.textContent.trim());

  const boxes = () => [...box.querySelectorAll('input[type="checkbox"]')];
  const words = (input) => input.parentElement.textContent.trim();
  const safeText = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function showChips() {
    chips.innerHTML = boxes().filter((input) => input.checked).map((input) => `
      <span class="multi-chip">${safeText(words(input))}<button type="button" data-remove="${safeText(input.value)}" aria-label="×">×</button></span>`).join('');
    search.placeholder = chips.children.length ? '' : t(box.dataset.placeholderKey || 'form.search');
  }

  function showList() {
    const wanted = search.value.trim().toLowerCase();
    const matches = boxes().filter((input) => words(input).toLowerCase().includes(wanted));
    list.innerHTML = matches.length
      ? matches.map((input) => `<li role="option" data-value="${safeText(input.value)}" aria-selected="${input.checked}" class="${input.checked ? 'is-chosen' : ''}">${safeText(words(input))}</li>`).join('')
      : `<li class="combo-empty">—</li>`;
    list.hidden = false;
    search.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    search.setAttribute('aria-expanded', 'false');
    search.value = '';
  }

  function toggle(value) {
    const input = boxes().find((one) => one.value === value);
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    showChips();
    if (!list.hidden) {
      const active = list.querySelector('.is-active')?.dataset.value;
      showList();
      if (active) list.querySelector(`[data-value="${CSS.escape(active)}"]`)?.classList.add('is-active');
    }
  }

  field.addEventListener('mousedown', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      event.preventDefault();
      toggle(remove.dataset.remove);
      return;
    }
    if (event.target !== search) {
      event.preventDefault();
      search.focus();
    }
  });
  search.addEventListener('focus', showList);
  search.addEventListener('input', showList);
  search.addEventListener('blur', close);
  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('[data-value]');
    if (!item) return;
    event.preventDefault();   // keeps the list open to pick more
    toggle(item.dataset.value);
  });

  search.addEventListener('keydown', (event) => {
    const items = [...list.querySelectorAll('[data-value]')];
    const current = list.querySelector('.is-active');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) showList();
      const position = items.indexOf(current) + (event.key === 'ArrowDown' ? 1 : -1);
      const next = items[Math.max(0, Math.min(items.length - 1, position))];
      current?.classList.remove('is-active');
      next?.classList.add('is-active');
      next?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();   // never sends the form
      const pick = current || (search.value.trim() ? items[0] : null);
      if (pick) {
        toggle(pick.dataset.value);
        search.value = '';
        showList();
      }
    } else if (event.key === 'Backspace' && !search.value) {
      const last = boxes().filter((input) => input.checked).pop();
      if (last) toggle(last.value);
    } else if (event.key === 'Escape') {
      search.blur();
    }
  });

  // The page rebuilds the check boxes (its language, its data) or ticks them when a panel opens
  new MutationObserver(showChips).observe(box, { childList: true });
  box.addEventListener('change', showChips);
  const panel = box.closest('.panel');
  if (panel) new MutationObserver(showChips).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('darb:language', () => { close(); showChips(); });
  showChips();
}

document.querySelectorAll('[data-multiselect]').forEach(makeMultiSelect);
