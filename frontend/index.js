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
   The assessment inside the phone is built 360px wide. Here we measure the photo
   and tell the CSS how much to shrink it (--fit) so it fills the photo's screen exactly.
   The screen is 35.9% of the photo's width. */

const hand = document.querySelector('.hand');

function fitPhone() {
  const screenWidth = hand.offsetWidth * 0.359;
  hand.style.setProperty('--fit', screenWidth / 360);
}
fitPhone();
new ResizeObserver(fitPhone).observe(hand);

/* ---------- 2. Reveal on scroll ---------- */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);

      if (entry.target.id === 'gauge') {
        animateGauge();
      }
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

    // "send" it
    await wait(900);
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

/* ---------- 6. Explorers ---------- */

const explore = document.querySelector('.x-explore');
const explorers = [...document.querySelectorAll('.x-item')];

function showExplorer(index) {
  explorers.forEach((item, itemIndex) => {
    const isActive = itemIndex === index;
    item.classList.toggle('is-active', isActive);
    item.querySelector('.x-head').setAttribute('aria-expanded', isActive);
  });
}

explorers.forEach((item, index) => {
  // Choosing one by hand stops the automatic switching
  item.querySelector('.x-head').addEventListener('click', () => {
    explore.classList.remove('is-auto');
    showExplorer(index);
  });

  // When the timer bar is full, open the next explorer
  item.querySelector('.x-timer').addEventListener('animationend', () => {
    showExplorer((index + 1) % explorers.length);
  });
});

if (!reduceMotion) {
  explore.classList.add('is-auto');
}
