/* ==========================================================
   Language (English / Arabic)

   How to use it in a page:
     Text:         <h1 data-i18n="home.title"></h1>
     Placeholder:  <input data-i18n-placeholder="login.email">
     Aria label:   <button data-i18n-aria-label="common.close">

   The words live in translations/en.json and translations/ar.json.
   Every key must exist in BOTH files.

   In JavaScript:
     import { t } from '../../shared/language.js';
     showToast(t('common.saved'));
   ========================================================== */

const STORAGE_KEY = 'darb-language';
const DEFAULT_LANGUAGE = 'en';

let currentLanguage = DEFAULT_LANGUAGE;
let words = {};

/* Returns 'en' or 'ar' */
export function getLanguage() {
  return currentLanguage;
}

/* Returns the text for a key in the current language.
   If the key is missing, it returns the key itself so the gap is easy to spot. */
export function t(key) {
  return words[key] ?? key;
}

/* Fills in every element that has a data-i18n attribute */
export function translatePage(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });

  // Language buttons: <button data-language="ar">. Highlight the current one.
  root.querySelectorAll('[data-language]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.language === currentLanguage);
  });

  // Single toggle button: <button data-language-toggle><span></span></button>.
  // It shows the name of the OTHER language, the one a click switches to.
  root.querySelectorAll('[data-language-toggle] span').forEach((label) => {
    label.textContent = currentLanguage === 'ar' ? 'English' : 'العربية';
  });
}

/* Switches the whole page to 'en' or 'ar' and remembers the choice */
export async function setLanguage(language) {
  const file = new URL(`../translations/${language}.json`, import.meta.url);
  // 'no-cache' = always check with the server for a newer file, so new words show up
  // straight away instead of an old saved copy
  const response = await fetch(file, { cache: 'no-cache' });
  words = await response.json();

  currentLanguage = language;
  localStorage.setItem(STORAGE_KEY, language);

  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

  translatePage();

  // Lets a page react to the change: document.addEventListener('darb:language', ...)
  document.dispatchEvent(new CustomEvent('darb:language'));
}

/* Call once when the page loads. layout.js already does this for you. */
export async function initLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  await setLanguage(saved === 'ar' ? 'ar' : DEFAULT_LANGUAGE);
}

// One click listener for every language button on the page
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-language]');
  if (button) {
    setLanguage(button.dataset.language);
  }

  if (event.target.closest('[data-language-toggle]')) {
    setLanguage(currentLanguage === 'ar' ? 'en' : 'ar');
  }
});
