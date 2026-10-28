/* 500: "Try again" reopens the page that failed; Home goes to the person's first page. */

import { icon } from '../../../shared/layout.js';
import { setUpErrorPage, cameFrom } from '../../../shared/errors.js';

document.querySelector('#icon').innerHTML = icon('alert');
setUpErrorPage();

document.querySelector('#retry').addEventListener('click', () => {
  const page = cameFrom();
  if (page) window.location.href = page;
  else window.location.reload();
});
