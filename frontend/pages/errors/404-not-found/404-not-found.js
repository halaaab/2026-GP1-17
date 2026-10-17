/* 404: Back and Home buttons. */

import { icon } from '../../../shared/layout.js';
import { setUpErrorPage } from '../../../shared/errors.js';

document.querySelector('#icon').innerHTML = icon('search');
setUpErrorPage();
