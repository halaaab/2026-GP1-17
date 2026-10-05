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

const TOAST_TIME = 3000;   // milliseconds a toast stays on screen

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
