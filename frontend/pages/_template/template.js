/* JavaScript for this page only. */

import { t } from '../../shared/language.js';
import { showToast } from '../../shared/ui.js';

const actionButton = document.querySelector('#template-action');

actionButton.addEventListener('click', () => {
  // t('key') returns the text in the current language
  showToast(t('template.action'), 'good');
});
