/* ===================================================   Layout: builds the sidebar, header and footer around a page.
   How to use it in a page:

     <body data-layout="founder" data-page="startups" data-title="nav.startups">
       <main> ...your page content... </main>
       <script type="module" src="../../../shared/layout.js"></script>
     </body>

   data-layout   which frame the page gets:
                   "founder"  sidebar + header, for founder pages
                   "admin"    sidebar + header, for admin console pages
                   "public"   top bar + footer, for the landing page
                   "auth"     logo + centered card, for sign up / log in pages
                   "error"    logo + language button, for the 403 / 404 / 500 pages
   data-page     the id of this page in the menus below (highlights it in the sidebar).
                 On an "auth" page, data-page="admin" shows the ADMIN badge.
   data-title    translation key for the title shown in the header

   To add a page to a sidebar, add one line to FOUNDER_MENU or ADMIN_MENU.
   ========================================================== */

import { initLanguage, translatePage, t } from './language.js';

// Address of the frontend/ folder, so links work from any page depth
const ROOT = new URL('..', import.meta.url).href;

/* ---------- Menus ---------- */

const FOUNDER_MENU = [
  {
    label: 'nav.explore',
    items: [
      { id: 'startups',     label: 'nav.startups',     icon: 'store',  href: 'pages/founder/startups/startup-explorer/startup-explorer.html' },
      { id: 'incubators',   label: 'nav.incubators',   icon: 'rocket', href: 'pages/founder/incubators-accelerators/incubators-accelerators-explorer/incubators-accelerators-explorer.html' },
      { id: 'requirements', label: 'nav.requirements', icon: 'shield', href: 'pages/founder/regulatory-requirements/requirements-explorer/requirements-explorer.html' },
    ],
  },
];

const ADMIN_MENU = [
  {
    label: null,
    items: [
      { id: 'overview', label: 'admin.overview', icon: 'grid', href: 'pages/admin/overview-dashboard/overview-dashboard.html' },
    ],
  },
  {
    label: 'admin.people',
    items: [
      { id: 'founders', label: 'admin.founders', icon: 'users', href: 'pages/admin/founder-management/founder-management.html' },
      { id: 'admins',   label: 'admin.admins',   icon: 'user',  href: 'pages/admin/admin-management/admin-management.html' },
    ],
  },
  {
    label: 'admin.platformData',
    items: [
      { id: 'admin-startups',   label: 'admin.startups',   icon: 'briefcase', href: 'pages/admin/startup-management/startup-management.html' },
      { id: 'admin-regulatory', label: 'admin.regulatory', icon: 'shield',    href: 'pages/admin/regulatory-management/regulatory-management.html' },
      { id: 'admin-incubators', label: 'admin.incubators', icon: 'sprout',    href: 'pages/admin/incubator-accelerator-management/incubator-accelerator-management.html' },
    ],
  },
];

// Shown in the landing page footer. Replace these with Darb's real details.
// An empty link ('') hides that account.
const CONTACT = {
  email:     'darb.ai.saudi@gmail.com',
  x:         'https://x.com/',
  linkedin:  'https://www.linkedin.com/',
  instagram: 'https://www.instagram.com/',
};

const PAGES = {
  home:          'index.html',
  chatbot:       'pages/founder/chatbot/chatbot.html',
  history:       'pages/founder/history/history.html',
  profile:       'pages/founder/profile/profile.html',
  login:         'pages/auth/login/login.html',
  signUp:        'pages/auth/sign-up/sign-up.html',
  adminHome:     'pages/admin/overview-dashboard/overview-dashboard.html',
  adminSettings: 'pages/admin/admin-settings/admin-settings.html',
};

/* ---------- Icons (Lucide style, 2px stroke) ---------- */

const ICON_PATHS = {
  menu:      '<path d="M4 6h16M4 12h16M4 18h16"/>',
  panel:     '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
  pencil:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  store:     '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  rocket:    '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.5-3 2-4c1.6-1.1 5 0 5 0"/><path d="M12 15v5s3-.5 4-2c1.1-1.6 0-5 0-5"/>',
  shield:    '<path d="M12 22s8-3.5 8-9.5V5.5L12 2 4 5.5v7C4 18.5 12 22 12 22z"/>',
  grid:      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user:      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  sprout:    '<path d="M7 20h10"/><path d="M12 20v-9"/><path d="M12 11c0-3 2-5 6-5 0 3-2 5-6 5z"/><path d="M12 14c0-2-1.5-4-5-4 0 2.5 1.5 4 5 4z"/>',
  settings:  '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  globe:     '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/>',
  mail:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  x:         '<path d="M4 4l16 16M20 4 4 20"/>',
  linkedin:  '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  arrowBack: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowUp:   '<path d="M12 19V5M5 12l7-7 7 7"/>',
  spark:     '<path d="M12 3l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/>',
  chevrons:  '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close:     '<path d="M6 6l12 12M18 6 6 18"/>',
  check:     '<path d="m5 12 5 5 9-10"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download:  '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  external:  '<path d="M8 16 16 8"/><path d="M9 8h7v7"/>',
  chevron:   '<path d="m9 6 6 6-6 6"/>',
  map:       '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  flag:      '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  trendUp:   '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  trash:     '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  file:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  landmark:  '<path d="M3 21h18"/><path d="M5 21v-9M10 21v-9M14 21v-9M19 21v-9"/><path d="M2 10 12 4l10 6z"/>',
  share:     '<path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert:     '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  lock:      '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info:      '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
};

/* A small line icon. Pages can use it too:
     import { icon } from '../../../shared/layout.js';
     button.innerHTML = icon('download');
   The names are the keys of ICON_PATHS above. */
export function icon(name) {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

/* ---------- Pieces shared by every layout ---------- */

// The Darb logo (the horizontal one, with the Arabic and English name), in both languages
const LOGO = `${ROOT}assets/images/%20Darb-logo-horizontal.png`;

function brand(href, isAdmin = false) {
  return `
    <a class="brand" href="${ROOT}${href}">
      <img class="brand-logo" src="${LOGO}" alt="Darb">
      ${isAdmin ? '<span class="chip chip-navy brand-badge" data-i18n="admin.badge"></span>' : ''}
    </a>`;
}

// The language button, the same on every page: a globe and the name of the
// OTHER language. One click switches to it (language.js does the switching).
function languageSwitch() {
  return `
    <button type="button" class="btn btn-secondary btn-sm language-toggle" data-language-toggle>
      ${icon('globe')}
      <span></span>
    </button>`;
}

/* ---------- App layout (founder and admin) ---------- */

function menuGroups(menu, activePage) {
  return menu
    .map((group) => `
      ${group.label ? `<div class="sidebar-label" data-i18n="${group.label}"></div>` : ''}
      ${group.items.map((item) => `
        <a class="nav-item ${item.id === activePage ? 'is-active' : ''}" href="${ROOT}${item.href}">
          ${icon(item.icon)}
          <span data-i18n="${item.label}"></span>
        </a>`).join('')}`)
    .join('');
}

function sidebarTop(homePage, isAdmin) {
  return `
    <div class="sidebar-top">
      ${brand(homePage, isAdmin)}
      <button type="button" class="btn-icon" data-sidebar-toggle data-i18n-aria-label="nav.toggleMenu">
        ${icon('panel')}
      </button>
    </div>`;
}

function founderSidebar(activePage) {
  return `
    ${sidebarTop(PAGES.chatbot, false)}

    <a class="nav-item nav-item-strong" href="${ROOT}${PAGES.chatbot}">
      ${icon('pencil')}
      <span data-i18n="nav.newAssessment"></span>
    </a>

    <a class="nav-item ${activePage === 'history' ? 'is-active' : ''}" href="${ROOT}${PAGES.history}">
      ${icon('clock')}
      <span data-i18n="nav.history"></span>
    </a>

    ${menuGroups(FOUNDER_MENU, activePage)}

    <!-- Past assessments. shared/assessments.js fills this list. -->
    <div class="sidebar-scroll" id="sidebar-history">
      <p class="sidebar-empty" data-i18n="nav.historyEmpty"></p>
    </div>

    <div class="sidebar-bottom">
      <!-- Settings opens the founder's profile page, like Settings in the admin sidebar -->
      <a class="nav-item ${activePage === 'profile' ? 'is-active' : ''}" href="${ROOT}${PAGES.profile}">
        ${icon('settings')}
        <span data-i18n="nav.settings"></span>
      </a>
      <div class="user-card">
        <!-- the name opens the profile page -->
        <a class="user-card-link" href="${ROOT}${PAGES.profile}">
          <span class="avatar" id="sidebar-user-initial">${icon('user')}</span>
          <span class="user-card-text">
            <strong id="sidebar-user-name" data-i18n="nav.account"></strong>
            <small id="sidebar-user-detail" data-i18n="role.founder"></small>
          </span>
        </a>
        <!-- works on pages that include shared/guard.js -->
        <button type="button" class="btn-icon" data-logout data-i18n-aria-label="auth.logout">
          ${icon('logout')}
        </button>
      </div>
    </div>`;
}

function adminSidebar(activePage) {
  return `
    ${sidebarTop(PAGES.adminHome, true)}

    ${menuGroups(ADMIN_MENU, activePage)}

    <div class="sidebar-scroll"></div>

    <div class="sidebar-bottom">
      <a class="nav-item ${activePage === 'settings' ? 'is-active' : ''}" href="${ROOT}${PAGES.adminSettings}">
        ${icon('settings')}
        <span data-i18n="admin.settings"></span>
      </a>
      <div class="user-card">
        <span class="avatar" id="sidebar-user-initial">${icon('user')}</span>
        <span class="user-card-text">
          <strong id="sidebar-user-name" data-i18n="role.admin"></strong>
          <small id="sidebar-user-detail"></small>
        </span>
        <!-- works on pages that include shared/guard.js -->
        <button type="button" class="btn-icon" data-logout data-i18n-aria-label="auth.logout">
          ${icon('logout')}
        </button>
      </div>
    </div>`;
}

/* Shows the signed-in person at the bottom of the sidebar.
   auth.js calls this after it knows who is logged in:
     setSidebarUser('Nora', 'Founder') */
export function setSidebarUser(name, detail) {
  const nameElement = document.querySelector('#sidebar-user-name');
  if (!nameElement) return;

  // Stop the language switch from replacing the real name with the placeholder
  nameElement.removeAttribute('data-i18n');
  nameElement.textContent = name;

  document.querySelector('#sidebar-user-initial').textContent = name.trim().charAt(0).toUpperCase();

  if (detail) {
    const detailElement = document.querySelector('#sidebar-user-detail');
    detailElement.removeAttribute('data-i18n');
    detailElement.textContent = detail;
  }
}

function buildAppLayout(layout) {
  const main = document.querySelector('main');
  const activePage = document.body.dataset.page;
  const titleKey = document.body.dataset.title;
  const isAdmin = layout === 'admin';

  // Admin pages show "Admin console / Page". Founder pages show the page title.
  let title = '';
  if (titleKey && isAdmin) {
    title = `
      <nav class="breadcrumb">
        <span data-i18n="admin.console"></span>
        <span aria-hidden="true">/</span>
        <strong data-i18n="${titleKey}"></strong>
      </nav>`;
  } else if (titleKey) {
    title = `<h1 class="app-header-title" data-i18n="${titleKey}"></h1>`;
  }

  const app = document.createElement('div');
  app.className = 'app';
  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      ${isAdmin ? adminSidebar(activePage) : founderSidebar(activePage)}
    </aside>
    <div class="sidebar-backdrop" data-sidebar-close></div>

    <div class="app-main">
      <header class="app-header ${titleKey ? '' : 'is-bare'}">
        <button type="button" class="btn-icon header-toggle" data-sidebar-toggle data-i18n-aria-label="nav.toggleMenu">
          ${icon('menu')}
        </button>
        ${title}
        <span class="app-header-space"></span>
        <!-- A page can put its own buttons here: document.querySelector('#header-actions') -->
        <div class="app-header-actions" id="header-actions"></div>
        ${languageSwitch()}
      </header>

      <footer class="app-footer">
        <p class="disclaimer" data-i18n="footer.disclaimer"></p>
      </footer>
    </div>`;

  // Put the page's <main> between the header and the footer
  document.body.prepend(app);
  main.classList.add('app-content');
  app.querySelector('.app-header').after(main);

  setUpSidebarToggle();
}

function setUpSidebarToggle() {
  const isSmallScreen = () => window.matchMedia('(max-width: 960px)').matches;

  // Remember on desktop whether the sidebar was hidden
  if (localStorage.getItem('darb-sidebar') === 'collapsed') {
    document.body.classList.add('sidebar-collapsed');
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-sidebar-toggle]')) {
      if (isSmallScreen()) {
        document.body.classList.toggle('sidebar-open');
      } else {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('darb-sidebar', collapsed ? 'collapsed' : 'open');
      }
    }

    if (event.target.closest('[data-sidebar-close]')) {
      document.body.classList.remove('sidebar-open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.body.classList.remove('sidebar-open');
    }
  });
}

/* ---------- Public layout (landing page) ---------- */

// The landing page links jump to sections of the landing page itself
const PUBLIC_LINKS = [
  { label: 'nav.features',       section: 'features' },
  { label: 'nav.exploreSection', section: 'explore' },
  { label: 'nav.sources',        section: 'sources' },
  { label: 'nav.about',          section: 'about' },
];

function publicLinks() {
  return PUBLIC_LINKS
    .map((link) => `<a href="${ROOT}${PAGES.home}#${link.section}" data-i18n="${link.label}"></a>`)
    .join('');
}

function buildPublicLayout() {
  const main = document.querySelector('main');
  document.body.classList.add('public');

  const header = document.createElement('header');
  header.className = 'public-header';
  header.innerHTML = `
    <div class="public-header-inner glass">
      ${brand(PAGES.home)}
      <nav class="public-nav">${publicLinks()}</nav>
      <div class="public-header-actions">
        ${languageSwitch()}
        <a class="btn btn-ghost btn-sm public-auth" href="${ROOT}${PAGES.login}" data-i18n="auth.login"></a>
        <a class="btn btn-primary btn-sm public-auth" href="${ROOT}${PAGES.signUp}" data-i18n="auth.signUp"></a>
        <button type="button" class="btn-icon public-menu-button" data-public-menu data-i18n-aria-label="nav.toggleMenu">
          ${icon('menu')}
        </button>
      </div>
    </div>

    <!-- Phone menu: opens under the top bar -->
    <div class="public-menu glass">
      <nav class="public-menu-links">
        ${publicLinks()}
        <a class="btn btn-secondary btn-block" href="${ROOT}${PAGES.login}" data-i18n="auth.login"></a>
        <a class="btn btn-primary btn-block" href="${ROOT}${PAGES.signUp}" data-i18n="auth.signUp"></a>
      </nav>
    </div>`;

  const footer = document.createElement('footer');
  footer.className = 'public-footer';
  // One round icon link per account that has an address in CONTACT
  const accounts = ['x', 'linkedin', 'instagram']
    .filter((name) => CONTACT[name])
    .map((name) => `<a class="btn-icon social" href="${CONTACT[name]}" target="_blank" rel="noopener" aria-label="${name}">${icon(name)}</a>`)
    .join('');

  footer.innerHTML = `
    <div class="public-footer-inner">
      <div class="public-footer-top">
        <div class="public-footer-about">
          ${brand(PAGES.home)}
          <p data-i18n="footer.tagline"></p>
        </div>

        <nav class="public-footer-column">
          <strong data-i18n="footer.explore"></strong>
          ${publicLinks()}
        </nav>

        <div class="public-footer-column">
          <strong data-i18n="footer.contact"></strong>
          <a class="public-footer-email" href="mailto:${CONTACT.email}">${icon('mail')}<span dir="ltr">${CONTACT.email}</span></a>
          <div class="public-footer-accounts">${accounts}</div>
        </div>
      </div>

      <div class="public-footer-bottom">
        <span data-i18n="footer.copyright"></span>
        <span data-i18n="footer.disclaimer"></span>
      </div>
    </div>`;

  main.before(header);
  main.after(footer);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-public-menu]')) {
      document.body.classList.toggle('public-menu-open');
    } else if (event.target.closest('.public-menu a')) {
      document.body.classList.remove('public-menu-open');
    }
  });
}

/* ---------- Auth layout (sign up, log in, reset password, admin login) ----------
   A split screen. One side is the page's own content:

     <main> ...form... </main>

   The other side is a small live demo of Darb that plays by itself, inside a
   little chat window: an idea is typed, Darb ticks off its steps, and the
   score appears. Then the next idea. Everyone sees the same demo.
   data-page="admin" shows the ADMIN badge and a plain note instead of the demo.
*/

// The ideas the demo types, and the score each one "gets"
const DEMO_IDEAS = [
  { idea: 'landing.typed.0', score: 72 },
  { idea: 'landing.typed.1', score: 68 },
  { idea: 'landing.typed.2', score: 54 },
];

function buildAuthLayout() {
  const main = document.querySelector('main');
  const isAdmin = document.body.dataset.page === 'admin';

  document.body.classList.add('auth');
  main.classList.add('auth-main');

  const demo = `
    <div class="demo" aria-hidden="true">
      <!-- a small Darb chat window -->
      <div class="demo-head">
        <span class="avatar avatar-sm">${icon('spark')}</span>
        <strong data-i18n="landing.chatName"></strong>
        <span class="demo-online"></span>
      </div>

      <div class="demo-body">
        <!-- 1. the founder's idea, typed into a message -->
        <p class="demo-message"><span id="demo-typed"></span><span class="demo-caret"></span></p>

        <!-- 2. Darb working: each step spins, then gets a tick -->
        <ul class="demo-steps" id="demo-steps">
          <li data-i18n="auth.demoStep1"></li>
          <li data-i18n="auth.demoStep2"></li>
          <li data-i18n="auth.demoStep3"></li>
          <li data-i18n="auth.demoStep4"></li>
        </ul>

        <!-- 3. the answer: the score in a ring -->
        <div class="demo-result" id="demo-result">
          <div class="demo-ring">
            <svg viewBox="0 0 120 120">
              <circle class="demo-ring-track" cx="60" cy="60" r="52"/>
              <circle class="demo-ring-fill" id="demo-arc" cx="60" cy="60" r="52"/>
            </svg>
            <strong id="demo-number">0</strong>
          </div>
          <div class="demo-info">
            <span class="chip" id="demo-label"></span>
            <span class="demo-title" data-i18n="auth.demoScore"></span>
          </div>
        </div>
      </div>
    </div>`;

  const adminNote = `
    <p class="auth-side-title" data-i18n="admin.console"></p>
    <p class="auth-side-note" data-i18n="adminLogin.note"></p>`;

  const side = document.createElement('aside');
  side.className = 'auth-side';
  side.innerHTML = `
    ${brand(PAGES.home, isAdmin)}
    <div class="auth-side-middle">${isAdmin ? adminNote : demo}</div>
    ${isAdmin ? '' : `
    <p class="auth-side-caption">
      <span data-i18n="landing.heroA"></span>
      <span class="accent" data-i18n="landing.heroB"></span>
    </p>`}`;

  // The form side: "Back to home" and the language button on top, then the page's <main>
  const panel = document.createElement('div');
  panel.className = 'auth-panel';
  panel.innerHTML = `
    <div class="auth-top">
      <a class="auth-home" href="${ROOT}${PAGES.home}">
        ${icon('arrowBack')}
        <span data-i18n="auth.backHome"></span>
      </a>
      ${languageSwitch()}
    </div>`;

  main.before(side, panel);
  panel.append(main);

  if (!isAdmin) {
    // start once the words are loaded, and start over when the language changes
    document.addEventListener('darb:language', playDemo);
  }
}

/* Plays the demo in a loop: the idea is typed, Darb works through its steps,
   the score appears, then everything clears for the next idea. */

let demoRun = 0;   // goes up each time the demo restarts, which stops the older loop

async function playDemo() {
  const thisRun = ++demoRun;
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const stillPlaying = () => thisRun === demoRun;

  const typed = document.querySelector('#demo-typed');
  const steps = [...document.querySelectorAll('#demo-steps li')];
  const result = document.querySelector('#demo-result');
  const number = document.querySelector('#demo-number');
  const label = document.querySelector('#demo-label');
  const arc = document.querySelector('#demo-arc');

  const RING_LENGTH = 327;   // the length of the ring's circle in the drawing

  // The colors follow the score bands: 70 and up is good, below that is moderate
  function showScore(score) {
    const isGood = score >= 70;
    label.textContent = t(isGood ? 'landing.promising' : 'auth.demoModerate');
    label.className = isGood ? 'chip chip-good' : 'chip chip-warn';
    result.classList.toggle('is-warn', !isGood);
    // the ring fills as far as the score: 72 fills 72% of the circle
    arc.style.strokeDashoffset = RING_LENGTH * (1 - score / 100);
  }

  function clearScene() {
    typed.textContent = '';
    steps.forEach((step) => step.classList.remove('is-visible', 'is-done'));
    result.classList.remove('is-visible');
    arc.style.strokeDashoffset = RING_LENGTH;
  }

  // People who turned animations off see one finished example and nothing moves
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    typed.textContent = t(DEMO_IDEAS[0].idea);
    steps.forEach((step) => step.classList.add('is-visible', 'is-done'));
    number.textContent = DEMO_IDEAS[0].score;
    showScore(DEMO_IDEAS[0].score);
    result.classList.add('is-visible');
    return;
  }

  let index = 0;

  while (stillPlaying()) {
    const example = DEMO_IDEAS[index];
    const words = t(example.idea);
    clearScene();
    await wait(500);

    // 1. type the idea
    for (let length = 0; length <= words.length; length++) {
      if (!stillPlaying()) return;
      typed.textContent = words.slice(0, length);
      await wait(36);
    }
    await wait(500);

    // 2. Darb's steps: each one appears spinning, then is ticked
    for (const step of steps) {
      if (!stillPlaying()) return;
      step.classList.add('is-visible');
      await wait(620);
      step.classList.add('is-done');
    }
    await wait(250);
    if (!stillPlaying()) return;

    // 3. the score: the ring fills while the number counts up
    showScore(example.score);
    number.textContent = '0';
    result.classList.add('is-visible');
    for (let count = 1; count <= 30; count++) {
      if (!stillPlaying()) return;
      number.textContent = Math.round(example.score * count / 30);
      await wait(32);
    }

    // 4. let it be read, then move to the next idea
    await wait(3600);
    index = (index + 1) % DEMO_IDEAS.length;
  }
}

/* ---------- Error layout (403, 404 and 500 pages) ----------
   The logo and the language button on top, the page's <main> centered under them.
   No sidebar: the person may not be signed in, or the page they wanted may not exist. */

function buildErrorLayout() {
  const main = document.querySelector('main');
  document.body.classList.add('error-layout');
  main.classList.add('error-main');

  const top = document.createElement('header');
  top.className = 'error-top';
  top.innerHTML = `${brand(PAGES.home)}${languageSwitch()}`;
  main.before(top);
}

/* ---------- Start ---------- */

async function startLayout() {
  const layout = document.body.dataset.layout;

  if (layout === 'founder' || layout === 'admin') {
    buildAppLayout(layout);
  } else if (layout === 'public') {
    buildPublicLayout();
  } else if (layout === 'auth') {
    buildAuthLayout();
  } else if (layout === 'error') {
    buildErrorLayout();
  }

  await initLanguage();
  translatePage();
}

startLayout();
