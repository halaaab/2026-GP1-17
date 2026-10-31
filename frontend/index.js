/* ==========================================================
   Landing page motion (index.html only).

     1. Scroll path     the thin line at the top fills as you scroll,
                        and the hero photo drifts slowly behind the page
     2. Reveal          elements with data-reveal fade in on scroll
     3. Score gauge     fills and counts up to 72
     4. Roadmap path    the line through the five steps draws on scroll
     5. Typing prompt   the hero prompt box types example ideas
     6. Explorers       switches between the three explorer previews

   Styles for all of these are in index.css.
   ========================================================== */

import { t } from './shared/language.js';

// People who turned off animations in their system settings get none
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. Scroll path + 4. Roadmap path ---------- */

const scrollPath = document.querySelector('.scroll-path');
const heroPhoto = document.querySelector('.hero-photo');
const road = document.querySelector('#road');
const roadSteps = document.querySelectorAll('.road-step');

function updateOnScroll() {
  // How far down the page we are, from 0 to 1
  const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pageProgress = pageHeight > 0 ? window.scrollY / pageHeight : 0;
  scrollPath.style.setProperty('--progress', pageProgress);

  // The city moves at a quarter of the scroll speed, so it feels far away.
  // Only needed while the hero is still on screen.
  if (window.scrollY < window.innerHeight * 1.2) {
    heroPhoto.style.setProperty('--shift', `${window.scrollY * 0.25}px`);
  }

  // How far the roadmap has travelled up the screen, from 0 to 1.
  // It starts when the roadmap's top reaches 85% of the screen height
  // and finishes when its bottom reaches 55%.
  const box = road.getBoundingClientRect();
  const start = window.innerHeight * 0.85;
  const end = window.innerHeight * 0.55;
  const travelled = (start - box.top) / (box.height + start - end);
  const roadProgress = Math.min(1, Math.max(0, travelled));
  road.style.setProperty('--progress', roadProgress);

  // Light up each step the line has reached
  roadSteps.forEach((step, index) => {
    const reachedAt = index / (roadSteps.length - 1) * 0.92;
    step.classList.toggle('is-on', roadProgress >= reachedAt && roadProgress > 0);
  });
  markCurrentStep();
}

// The last step the line has reached is the "current" one (navy); the ones before it are done (teal)
function markCurrentStep() {
  const reached = [...roadSteps].filter((step) => step.classList.contains('is-on'));
  roadSteps.forEach((step) => {
    step.classList.toggle('is-current', step === reached[reached.length - 1]);
  });
}

if (reduceMotion) {
  road.style.setProperty('--progress', 1);
  roadSteps.forEach((step) => step.classList.add('is-on'));
  markCurrentStep();
} else {
  window.addEventListener('scroll', updateOnScroll, { passive: true });
  window.addEventListener('resize', updateOnScroll);
  updateOnScroll();
}

/* ---------- The phone in the About section ----------
   The assessment inside the phone is built 360px wide. Here we measure the screen
   and tell the CSS how much to shrink it (--fit) so it fills the screen exactly. */

const phoneScreen = document.querySelector('.phone-screen');

function fitPhone() {
  phoneScreen.style.setProperty('--fit', phoneScreen.offsetWidth / 360);
}
fitPhone();
new ResizeObserver(fitPhone).observe(phoneScreen);

/* ---------- 2. Reveal on scroll ---------- */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);

      if (entry.target.id === 'gauge') {
        animateGauge();
      }
      if (entry.target.classList.contains('about-stage')) {
        animatePhoneDial();
      }
      entry.target.querySelectorAll('[data-count]').forEach(countUp);
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll('[data-reveal]').forEach((element) => {
  revealObserver.observe(element);
});

/* ---------- 3. Score gauge ---------- */

const GAUGE_SCORE = 72;
const GAUGE_LENGTH = 251.3;   // length of the half circle in the SVG

function drawGauge(score) {
  const share = score / 100;

  // how much of the colored arc is showing
  document.querySelector('#gauge-arc').setAttribute('stroke-dashoffset', GAUGE_LENGTH * (1 - share));

  // the white knob sits at the end of the arc
  const angle = Math.PI * share;
  const knob = document.querySelector('#gauge-knob');
  knob.setAttribute('cx', 100 - 80 * Math.cos(angle));
  knob.setAttribute('cy', 100 - 80 * Math.sin(angle));

  document.querySelector('#gauge-number').textContent = Math.round(score);
}

function animateGauge() {
  if (reduceMotion) return;

  const duration = 1600;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);   // fast at first, then slows down
    drawGauge(GAUGE_SCORE * eased);

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  drawGauge(0);
  requestAnimationFrame(frame);
}

/* The small score dial inside the phone in the About section counts up the same way. */

const PHONE_DIAL_LENGTH = 282.7;   // length of the half circle in the SVG

function drawPhoneDial(score) {
  const share = score / 100;
  const angle = Math.PI * share;
  const knob = document.querySelector('#app-dial-knob');

  document.querySelector('#app-dial-arc').setAttribute('stroke-dashoffset', PHONE_DIAL_LENGTH * (1 - share));
  knob.setAttribute('cx', 110 - 90 * Math.cos(angle));
  knob.setAttribute('cy', 110 - 90 * Math.sin(angle));
  document.querySelector('#app-dial-number').textContent = Math.round(score);
}

function animatePhoneDial() {
  if (reduceMotion) return;

  const duration = 1500;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);   // fast at first, then slows down
    drawPhoneDial(GAUGE_SCORE * eased);

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  drawPhoneDial(0);
  requestAnimationFrame(frame);
}

/* Any number with data-count="..." counts up from zero when its box comes into view. */

function countUp(element) {
  if (reduceMotion) return;

  const target = Number(element.dataset.count);
  const duration = 1400;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);   // fast at first, then slows down
    element.textContent = Math.round(target * eased).toLocaleString('en-US');

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

/* ---------- 5. Typing prompt ---------- */

const typed = document.querySelector('#typed');
const sendButton = document.querySelector('.composer-send');
const PHRASES = ['landing.typed.0', 'landing.typed.1', 'landing.typed.2'];
let typingRun = 0;   // changes when the language changes, which stops the old loop

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function typeLoop() {
  const thisRun = ++typingRun;
  let phraseIndex = 0;

  if (reduceMotion) {
    typed.textContent = t(PHRASES[0]);
    return;
  }

  // on the first visit, wait for the haze to lift before typing starts
  typed.textContent = '';
  await wait(thisRun === 1 ? 2600 : 300);

  while (thisRun === typingRun) {
    const phrase = t(PHRASES[phraseIndex]);

    // type it, letter by letter
    for (let length = 1; length <= phrase.length; length++) {
      if (thisRun !== typingRun) return;
      typed.textContent = phrase.slice(0, length);
      await wait(42);
    }

    // the send button pulses once, then "sends" it
    sendButton.classList.add('is-ready');
    await wait(900);
    sendButton.classList.remove('is-ready');
    sendButton.classList.add('is-sending');
    await wait(450);
    sendButton.classList.remove('is-sending');
    await wait(700);

    // erase it
    for (let length = phrase.length; length >= 0; length--) {
      if (thisRun !== typingRun) return;
      typed.textContent = phrase.slice(0, length);
      await wait(16);
    }
    await wait(350);

    phraseIndex = (phraseIndex + 1) % PHRASES.length;
  }
}

// Start typing once the words are loaded, and again whenever the language changes
document.addEventListener('darb:language', typeLoop);

/* ---------- The previews follow the mouse ----------
   Each card turns a few degrees towards the mouse, which gives it real depth.
   Only on computers with a mouse, and not for people who turn off animations. */

if (!reduceMotion && window.matchMedia('(hover: hover) and (min-width: 1001px)').matches) {
  document.querySelectorAll('.x-panel').forEach((panel) => {
    panel.addEventListener('pointermove', (event) => {
      const box = panel.getBoundingClientRect();
      const across = (event.clientX - box.left) / box.width - 0.5;   // from -0.5 to 0.5
      const down = (event.clientY - box.top) / box.height - 0.5;
      panel.classList.add('is-following');
      panel.style.setProperty('--mouse-x', `${across * 8}deg`);
      panel.style.setProperty('--mouse-y', `${down * -8}deg`);
    });
    panel.addEventListener('pointerleave', () => {
      panel.classList.remove('is-following');
      panel.style.setProperty('--mouse-x', '0deg');
      panel.style.setProperty('--mouse-y', '0deg');
    });
  });
}

/* ---------- Dots under the swipeable program cards ----------
   The dot of the card nearest the start of the row lights up as you swipe. */

const netRow = document.querySelector('.net-cards');
const netCards = [...netRow.querySelectorAll('.net-card')];
const netDots = [...document.querySelectorAll('.net-dots i')];

netRow.addEventListener('scroll', () => {
  const step = netCards[1].offsetLeft - netCards[0].offsetLeft;
  const nearest = Math.round(Math.abs(netRow.scrollLeft / step));
  netDots.forEach((dot, index) => dot.classList.toggle('is-active', index === nearest));
}, { passive: true });

/* ---------- The startups preview in the Explore section ----------
   The chips and the search box really filter the four tiles. */

const startupDemo = document.querySelector('#startup-demo');
const startupSearch = document.querySelector('#startup-search');
const startupPills = [...startupDemo.querySelectorAll('.pill')];
const startupTiles = [...startupDemo.querySelectorAll('.mock-tile')];
let startupFilter = 'all';

function filterStartups() {
  const words = startupSearch.value.trim().toLowerCase();
  let showing = 0;

  startupTiles.forEach((tile) => {
    const fitsChip = fitsFilter(tile, startupFilter);
    // the name is checked in English too, so "Lean" also works on the Arabic page
    const fitsSearch = `${tile.dataset.name} ${tile.textContent}`.toLowerCase().includes(words);
    const fits = fitsChip && fitsSearch;

    tile.classList.toggle('is-back', fits && tile.classList.contains('is-hidden'));
    tile.classList.toggle('is-hidden', !fits);
    if (fits) showing++;
  });

  document.querySelector('#startup-empty').hidden = showing > 0;
  document.querySelector('#startup-count').textContent = t('landing.showingStartups')
    .replace('{n}', showing)
    .replace('{total}', startupTiles.length);
}

function fitsFilter(tile, filter) {
  return filter === 'all' || filter === tile.dataset.sector || filter === tile.dataset.city;
}

function chooseStartupFilter(filter) {
  startupFilter = filter;
  startupPills.forEach((pill) => pill.classList.toggle('is-active', pill.dataset.filter === filter));
  filterStartups();
}

startupPills.forEach((pill) => {
  pill.dataset.tally = startupTiles.filter((tile) => fitsFilter(tile, pill.dataset.filter)).length;
  pill.addEventListener('click', () => chooseStartupFilter(pill.dataset.filter));
});
startupSearch.addEventListener('input', filterStartups);
document.addEventListener('darb:language', filterStartups);

