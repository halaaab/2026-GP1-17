/* The conversation with Darb.

   How it works today (frontend only):
     1. The founder describes an idea.
     2. Darb asks the QUESTIONS below, one at a time, and skips what it can already
        tell from the description (for example the city).
     3. Darb shows its steps, then the result with a card that opens the assessment panel.
   The answers and results go through shared/assessments.js. When the agents are
   connected, askNext() and runAnalysis() are the two places that will call them. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { getAccount } from '../../../shared/auth.js';
import {
  say, label, scoreBand, whenText, chatLink, loadResult,
  getAssessments, getAssessment, saveAssessment, saveMessage, newAssessment, sampleResult,
  showSidebarHistory, AGENT_STEPS,
} from '../../../shared/assessments.js';
import { showToast } from '../../../shared/ui.js';
import { openPanel, closePanel, roadmapList } from './panel.js';

/* What Darb needs before it can run the analysis */
const QUESTIONS = [
  { field: 'sector', ask: 'chat.askSector', options: ['ai', 'food', 'fashion', 'furniture'] },
  { field: 'city',   ask: 'chat.askCity',   options: ['riyadh', 'jeddah', 'dammam'] },
  { field: 'model',  ask: 'chat.askModel',  options: ['commission', 'subscription', 'sales'] },
  { field: 'hiring', ask: 'chat.askHiring', options: ['yes', 'no', 'unsure'] },
];

/* Words in the description that already answer a question */
const HINTS = {
  city: {
    riyadh: ['riyadh', 'الرياض'],
    jeddah: ['jeddah', 'جدة', 'جده'],
    dammam: ['dammam', 'الدمام'],
  },
};

const STEP_TIME = 850;   // milliseconds each agent step takes on screen

const chat = document.querySelector('#chat');
const thread = document.querySelector('#thread');
const composer = document.querySelector('#composer');
const input = document.querySelector('#composer-input');
const contextBox = document.querySelector('#composer-context');

let current = null;           // the assessment of this conversation (empty on the home state)
let waitingFor = null;        // the question Darb is waiting an answer for
let askingAbout = null;       // the startup the next question is about
let busy = false;             // true while Darb is "working"

let account = { role: 'none' };   // who is signed in; filled when the page opens (see the end of this file)

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/* Saves the conversation's state. If saving fails, the founder is told once
   and can keep talking; the conversation just will not be in History. */
let saveFailed = false;

async function save() {
  const worked = await saveAssessment(current);
  if (!worked && !saveFailed) {
    saveFailed = true;
    showToast(t('chat.notSaved'), 'risk');
  }
}

/* ---------- Adding messages to the conversation ---------- */

function scrollToEnd() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/* A message from the founder (grey bubble). about = the startup it refers to */
function addUser(text, about = null) {
  const row = document.createElement('div');
  row.className = 'msg msg-user';
  row.innerHTML = `${about ? `<span class="chip chip-teal msg-about"></span>` : ''}<p class="bubble"></p>`;
  if (about) row.querySelector('.msg-about').textContent = about.name;
  row.querySelector('.bubble').textContent = text;   // as text, never as HTML
  thread.append(row);
  scrollToEnd();
}

/* A message from Darb (small avatar, plain text). Returns the box so more can be added to it. */
function addAgent(text = '') {
  const row = document.createElement('div');
  row.className = 'msg msg-agent';
  row.innerHTML = `<span class="avatar avatar-sm">${icon('spark')}</span><div class="msg-body"></div>`;

  const body = row.querySelector('.msg-body');
  if (text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    body.append(paragraph);
  }

  thread.append(row);
  scrollToEnd();
  return body;
}

/* Three dots while Darb "thinks", then the message */
async function agentSays(text) {
  const body = addAgent();
  body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  await wait(650);
  body.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  body.append(paragraph);
  scrollToEnd();
  return body;
}

/* A question with quick answers. chosen = the answer already given (for saved conversations) */
function addQuestion(question, chosen = '') {
  const body = addAgent(t(question.ask));
  const replies = document.createElement('div');
  replies.className = 'replies';
  replies.innerHTML = question.options
    .map((option) => `<button type="button" class="pill ${option === chosen ? 'is-active' : ''}" data-answer="${option}" ${chosen ? 'disabled' : ''}>${label(option)}</button>`)
    .join('');
  body.append(replies);
  scrollToEnd();
}

/* The agent's steps. live = play them one by one; otherwise show them finished and folded. */
async function addTrace(live) {
  const body = addAgent();
  body.innerHTML = `
    <details class="trace" ${live ? 'open' : ''}>
      <summary><span class="trace-title">${t(live ? 'chat.working' : 'chat.worked').replace('{n}', AGENT_STEPS.length)}</span>${icon('chevron')}</summary>
      <ol class="trace-steps">
        ${AGENT_STEPS.map((step) => `<li class="${live ? '' : 'is-done'}"><span class="trace-dot">${icon('check')}</span>${t(step)}</li>`).join('')}
      </ol>
    </details>`;

  if (!live) return;

  const trace = body.querySelector('.trace');
  for (const step of trace.querySelectorAll('li')) {
    step.classList.add('is-running');
    scrollToEnd();
    await wait(STEP_TIME);
    step.classList.replace('is-running', 'is-done');
  }
  trace.querySelector('.trace-title').textContent = t('chat.worked').replace('{n}', AGENT_STEPS.length);
  trace.open = false;
}

/* The result: a short summary and the card that opens the assessment */
function addResult() {
  const band = scoreBand(current.score);
  const body = addAgent(`${t('chat.result').replace('{score}', current.score)} ${t(`chat.result.${band}`)}`);

  const more = document.createElement('p');
  more.textContent = t('chat.resultEnd');

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'result-card';
  card.dataset.openTab = 'score';
  card.innerHTML = `
    <span class="result-score is-${band}">${current.score}</span>
    <span class="result-text"><strong>${t('chat.cardTitle')}</strong><small>${t('chat.cardSub')}</small></span>
    <span class="chip chip-navy">${t('chat.open')}</span>`;

  body.append(more, card);
  scrollToEnd();
}

/* The roadmap inside the chat, with a button that opens it in the panel */
function addRoadmap() {
  const steps = current.result.roadmap.length;
  const body = addAgent(t('chat.roadmapIntro').replace('{n}', steps));

  const card = document.createElement('div');
  card.className = 'card roadmap-card';
  card.innerHTML = `
    <div class="roadmap-card-head">
      <span class="roadmap-card-icon">${icon('map')}</span>
      <span class="result-text"><strong>${t('chat.roadmapCard')}</strong><small>${t('chat.roadmapSteps').replace('{n}', steps)}</small></span>
      <button type="button" class="btn btn-secondary btn-sm" data-open-tab="roadmap">${t('chat.openRoadmap')}</button>
    </div>
    ${roadmapList(current)}`;
  body.append(card);
  scrollToEnd();
}

/* Suggestions under the last message, once there is a result */
function addFollowUps() {
  thread.querySelectorAll('.follow-ups').forEach((old) => old.remove());

  const row = document.createElement('div');
  row.className = 'follow-ups';
  row.innerHTML = `
    <button type="button" class="pill" data-open-tab="score">${t('chat.followScore')}</button>
    <button type="button" class="pill" data-open-tab="similar">${t('chat.followSimilar')}</button>
    ${current.roadmapShown ? '' : `<button type="button" class="pill" data-build-roadmap>${t('chat.followRoadmap')}</button>`}
    <button type="button" class="pill" data-open-tab="report">${t('chat.followReport')}</button>`;
  thread.append(row);
  scrollToEnd();
}

/* One of the similar startups of this assessment, by its id */
function findStartup(id) {
  return current.result.similar.find((item) => item.id === id) || null;
}

/* The text of one follow-up answer from Darb */
function replyText(message) {
  const startup = findStartup(message.about);
  if (startup) {
    const facts = [startup.name, startup.region, startup.stage].filter(Boolean);
    return `${t('chat.startupReply')} ${facts.join(' · ')}. ${startup.about}`;
  }
  return t('chat.sampleReply');
}

/* ---------- The home state ---------- */

function showGreeting() {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = account.profile ? account.profile.full_name.trim().split(' ')[0] : '';

  // without a name the greeting ends before the comma: "Good morning"
  const greeting = t(`chat.greet.${time}`).replace('{name}', firstName);
  document.querySelector('#greeting').textContent = firstName ? greeting : greeting.replace(/[,،]\s*$/, '');
}

async function showHome() {
  showGreeting();

  document.querySelector('#examples').innerHTML = [0, 1, 2]
    .map((number) => `<button type="button" class="pill" data-example>${t(`chat.example.${number}`)}</button>`)
    .join('');

  const recent = (await getAssessments()).slice(0, 3);
  document.querySelector('#recent').hidden = recent.length === 0;

  const grid = document.querySelector('#recent-grid');
  grid.innerHTML = recent.map((assessment) => `
    <a class="card card-hover recent-card" href="${chatLink(assessment.id)}">
      <span class="recent-top">
        <span class="text-3">${assessment.sector ? `${label(assessment.sector)} · ` : ''}${label(assessment.city)}</span>
        ${assessment.score ? `<span class="chip chip-${scoreBand(assessment.score)}">${assessment.score}</span>` : ''}
      </span>
      <strong class="recent-title"></strong>
      <span class="text-3">${whenText(assessment.updated)}</span>
    </a>`).join('');

  // titles are written by founders, so they are added as text
  grid.querySelectorAll('.recent-title').forEach((title, index) => {
    title.textContent = say(recent[index].title);
  });
}

/* ---------- The conversation ---------- */

function setPlaceholder() {
  let key = 'chat.placeholder';
  if (current) key = waitingFor ? 'chat.placeholderAnswer' : 'chat.placeholderFollow';
  input.dataset.i18nPlaceholder = key;
  input.placeholder = t(key);
}

/* Switches the page from the home state to the conversation */
function showChat() {
  chat.classList.add('is-started');
  showHeaderButton();
}

/* The "Assessment 72" button in the header, once there is a score */
function showHeaderButton() {
  const actions = document.querySelector('#header-actions');
  actions.innerHTML = current && current.score
    ? `<button type="button" class="btn btn-secondary btn-sm" data-open-tab="score"><span class="chip chip-${scoreBand(current.score)}">${current.score}</span> ${t('chat.assessment')}</button>`
    : '';
}

/* Asks the next question that has no answer yet. With all answers in, runs the analysis. */
async function askNext() {
  waitingFor = QUESTIONS.find((question) => !current[question.field]) || null;
  setPlaceholder();

  if (waitingFor) {
    addQuestion(waitingFor);
    await saveMessage(current, 'agent', { text: t(waitingFor.ask) });
  } else {
    await runAnalysis();
  }
}

/* The first message: the idea */
async function startConversation(idea) {
  current = newAssessment(idea);

  // does the description already answer a question?
  const words = idea.toLowerCase();
  for (const [field, answers] of Object.entries(HINTS)) {
    for (const [answer, hints] of Object.entries(answers)) {
      if (hints.some((hint) => words.includes(hint))) {
        current[field] = answer;
        current.noted.push(field);
      }
    }
  }

  showChat();
  addUser(idea);
  await save();
  await saveMessage(current, 'user', { text: idea });
  history.replaceState(null, '', chatLink(current.id));
  showSidebarHistory();

  busy = true;
  await agentSays(introText());
  await saveMessage(current, 'agent', { text: introText() });
  busy = false;
  await askNext();
}

/* "Got it…" plus what was understood from the description */
function introText() {
  const noted = current.noted.map((field) => `${t(`chat.field.${field}`)}: ${label(current[field])}`).join(' · ');
  return noted ? `${t('chat.gotIdea')} ${t('chat.noted')} ${noted}.` : t('chat.gotIdea');
}

/* The founder answered the question Darb was waiting for */
async function answerQuestion(answer) {
  const question = waitingFor;
  waitingFor = null;

  // lock the quick answers of that question and mark the chosen one
  thread.querySelectorAll('.replies .pill:not([disabled])').forEach((pill) => {
    pill.disabled = true;
    pill.classList.toggle('is-active', pill.dataset.answer === answer);
  });

  addUser(label(answer));
  current[question.field] = answer;
  await save();
  await saveMessage(current, 'user', { text: label(answer) });
  await askNext();
}

/* All answers are in: show the steps, then the result.
   Later, this is where the page waits for the agents instead of sampleResult(). */
async function runAnalysis() {
  busy = true;
  await agentSays(t('chat.confirm'));
  await addTrace(true);

  Object.assign(current, sampleResult());
  await loadResult(current);   // the similar startups, market numbers and roadmap from the database
  await save();
  busy = false;

  addResult();
  await saveMessage(current, 'agent', { text: t('chat.result').replace('{score}', current.score) });
  addFollowUps();
  showHeaderButton();
  setPlaceholder();
  showSidebarHistory();
}

/* A free question after the result */
async function followUp(text) {
  const about = askingAbout;
  setAskingAbout(null);

  addUser(text, about);
  const reply = { from: 'agent', about: about ? about.id : '' };
  current.extra.push({ from: 'user', text, about: about ? about.id : '' }, reply);

  busy = true;
  await agentSays(replyText(reply));
  busy = false;

  await save();
  await saveMessage(current, 'user', { text, followUp: true, about: reply.about });
  await saveMessage(current, 'agent', { text: replyText(reply), followUp: true, about: reply.about });
  addFollowUps();
}

/* "Build my establishment roadmap" */
async function buildRoadmap() {
  addUser(t('chat.followRoadmap'));
  thread.querySelectorAll('.follow-ups').forEach((old) => old.remove());

  busy = true;
  const dots = addAgent();
  dots.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  await wait(900);
  dots.closest('.msg').remove();
  busy = false;

  current.roadmapShown = true;
  await save();
  await saveMessage(current, 'user', { text: t('chat.followRoadmap') });
  await saveMessage(current, 'agent', { text: t('chat.roadmapIntro').replace('{n}', current.result.roadmap.length) });
  addRoadmap();
  addFollowUps();
}

/* Draws a saved conversation from the start, without waiting or animation */
async function showSaved() {
  thread.innerHTML = '';
  showChat();

  addUser(say(current.idea));
  addAgent(introText());

  for (const question of QUESTIONS) {
    const answer = current[question.field];
    if (answer && !current.noted.includes(question.field)) {
      addQuestion(question, answer);
      addUser(label(answer));
    }
  }

  if (!current.score) {
    await askNext();   // not finished: continue where the founder stopped
    return;
  }

  if (!current.result) await loadResult(current);

  addAgent(t('chat.confirm'));
  await addTrace(false);
  addResult();

  if (current.roadmapShown) {
    addUser(t('chat.followRoadmap'));
    addRoadmap();
  }

  for (const message of current.extra) {
    if (message.from === 'user') {
      addUser(message.text, findStartup(message.about));
    } else {
      addAgent(replyText(message));
    }
  }

  waitingFor = null;
  setPlaceholder();
  addFollowUps();
}

/* ---------- The box the founder writes in ---------- */

function setAskingAbout(startup) {
  askingAbout = startup;
  contextBox.hidden = !startup;
  document.querySelector('#composer-context-name').textContent = startup ? startup.name : '';
}

// the box grows with the text, up to a few lines
function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
input.addEventListener('input', resizeInput);

// Enter sends, Shift + Enter makes a new line
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = input.value.trim();
  if (!text || busy) return;

  input.value = '';
  resizeInput();

  if (!current) {
    await startConversation(text);
  } else if (waitingFor) {
    await answerQuestion(text);
  } else {
    await followUp(text);
  }
});

/* ---------- Clicks ---------- */

document.addEventListener('click', (event) => {
  // an example on the home state fills the box
  const example = event.target.closest('[data-example]');
  if (example) {
    input.value = example.textContent;
    resizeInput();
    input.focus();
  }

  // a quick answer to Darb's question
  const answer = event.target.closest('[data-answer]');
  if (answer && waitingFor && !busy) {
    answerQuestion(answer.dataset.answer);
  }

  // anything that opens the assessment panel on a tab
  const opener = event.target.closest('[data-open-tab]');
  if (opener && current && current.score) {
    openPanel(current, opener.dataset.openTab);
  }

  if (event.target.closest('[data-build-roadmap]') && !busy) {
    buildRoadmap();
  }
});

document.querySelector('#composer-context-remove').addEventListener('click', () => setAskingAbout(null));

// "Ask about it" on a startup card in the panel
document.addEventListener('darb:ask-startup', (event) => {
  setAskingAbout(event.detail);

  // go back to the conversation, where the question is written
  closePanel();
  input.focus();
  window.scrollTo(0, document.body.scrollHeight);
});

/* ---------- When the page opens ---------- */

document.querySelector('#composer-send').innerHTML = icon('arrowUp');
document.querySelector('#composer-context-remove').innerHTML = icon('close');

// The conversation is text in the current language, so draw it again when the language
// changes. This also covers a slow start, when the words arrive after this file has run.
let pageIsReady = false;         // false while the page is still opening
let languageCameLate = false;    // the words arrived while the page was opening

function drawAgain() {
  if (current) {
    showSaved();
  } else {
    showHome();
  }
}

document.addEventListener('darb:language', () => {
  if (!pageIsReady) {
    languageCameLate = true;
  } else if (!busy) {
    drawAgain();
  }
});

// Ask who is signed in here, instead of reading it from guard.js: Safari can run this
// file before guard.js has finished, and the greeting would have no name to show.
account = await getAccount();

const address = new URLSearchParams(window.location.search);

if (address.get('id')) {
  current = await getAssessment(address.get('id'));

  if (current) {
    await showSaved();
    if (address.get('tab') && current.score) {
      openPanel(current, address.get('tab'));
    }
  } else {
    await showHome();
    addAgent(t('chat.notFound'));
    chat.classList.add('is-started');
  }
} else {
  await showHome();
}

input.focus();

pageIsReady = true;
if (languageCameLate) drawAgain();
