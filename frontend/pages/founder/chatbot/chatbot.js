/* The conversation with Darb.

   How it works:
     1. The founder describes an idea. The page saves it as a new assessment (Supabase).
     2. Each founder message goes to the agent server's Conversational Agent
        (shared/agent.js). It decides what to do: for an idea, it asks the
        Competitor Agent for the competitor analysis, then answers the founder.
     3. Darb's reply appears here as it arrives, and both messages are saved.
   The agent remembers the conversation itself, so the page sends only the new message.

   Assessments made before the agents were connected may have a (sample) score:
   for those the result card and the assessment panel are still shown. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { getAccount } from '../../../shared/auth.js';
import {
  say, scoreBand, chatLink, loadResult, refreshAnalysis,
  getAssessment, saveAssessment, saveMessage, newAssessment,
  showSidebarHistory, assessmentsFailed, hasIdea, titleFrom,
} from '../../../shared/assessments.js';
import { askDarb } from '../../../shared/agent.js';
import { showErrorPage } from '../../../shared/errors.js';
import { showToast } from '../../../shared/ui.js';
import { openPanel, closePanel, roadmapList } from './panel.js';

/* Text from the database (competitor names, reasons) is made safe before it goes into HTML */
function safe(text) {
  const box = document.createElement('span');
  box.textContent = text ?? '';
  return box.innerHTML;
}

const chat = document.querySelector('#chat');
const thread = document.querySelector('#thread');
const composer = document.querySelector('#composer');
const input = document.querySelector('#composer-input');
const contextBox = document.querySelector('#composer-context');

let current = null;           // the assessment of this conversation (empty on the home state)
let askingAbout = null;       // the startup the next question is about
let busy = false;             // true while Darb is answering

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
  // while the assessment is open the chat is hidden, so there is nothing to scroll to
  if (document.body.classList.contains('assess-open')) return;
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
  row.innerHTML = `<span class="avatar avatar-sm avatar-darb"><img src="../../../assets/images/darb-mark.png" alt=""></span><div class="msg-body"></div>`;

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

/* Darb's reply from the agent server, shown as it arrives.
   Three dots first, then the text grows piece by piece. Returns the full reply,
   or an error message in the founder's language when Darb could not answer. */
async function agentAnswers(text) {
  const body = addAgent();
  body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  const paragraph = document.createElement('p');
  paragraph.className = 'agent-text';

  // the agent's own conversation id for this assessment. The founder cannot write
  // the thread_id column, so until the server saves one, the assessment id is used:
  // it never changes, so the agent finds the same conversation next time.
  const threadId = current.threadId || current.id;

  try {
    return await askDarb({
      text,
      assessmentId: current.id,
      threadId,
      onText: (soFar) => {
        if (!paragraph.isConnected) body.replaceChildren(paragraph);   // the dots make room for the text
        paragraph.textContent = soFar;   // as text, never as HTML
        scrollToEnd();
      },
    });
  } catch (error) {
    console.error('Chat: Darb could not answer:', error.message);
    const message = t(error.kind === 'signin' ? 'chat.agentSignIn' : 'chat.agentOffline');
    paragraph.textContent = message;
    paragraph.classList.add('agent-failed');
    body.replaceChildren(paragraph);
    return null;
  }
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

/* The competitor analysis inside the chat: one card per competitor (at most three), each with its
   labels, the one-sentence reason and its evidence link, then a button that opens the full analysis.
   Everything comes from the saved analysis; nothing is worked out here. */
function addCompetitors() {
  const competitors = (current.result && current.result.competitors) || [];
  if (competitors.length === 0) return;   // nothing found: Darb's message already says so
  const body = addAgent();

  const list = document.createElement('div');
  list.className = 'comp-chat-cards';
  list.innerHTML = competitors.map((competitor) => {
    const source = /^https?:\/\//i.test(competitor.source || '') ? safe(competitor.source) : '';
    return `
      <article class="card comp-chat-card">
        <div class="comp-chat-top">
          <strong><bdi>${safe(competitor.name)}</bdi></strong>
          <span class="comp-chat-rank" dir="ltr">#${competitor.rank}</span>
        </div>
        <div class="comp-chat-chips">
          <span class="chip ${competitor.label === 'direct' ? 'chip-risk' : 'chip-warn'}">${t(`comp.label.${competitor.label}`)}</span>
          <span class="chip ${competitor.evidence === 'likely' ? 'chip-navy' : 'chip-good'}">${t(competitor.evidence === 'likely' ? 'comp.limited' : 'comp.confirmed')}</span>
        </div>
        ${competitor.reason ? `<p dir="auto">${safe(competitor.reason)}</p>` : ''}
        ${source ? `<a class="link comp-chat-evidence" href="${source}" target="_blank" rel="noopener noreferrer">${t('comp.evidence')} ${icon('external')}</a>` : ''}
      </article>`;
  }).join('');

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn btn-secondary btn-sm comp-chat-open';
  open.dataset.openTab = 'similar';
  open.textContent = t('chat.openCompetitors');

  body.append(list, open);
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

/* One of the competitors of this assessment, by its id */
function findStartup(id) {
  return current.result.competitors.find((item) => item.id === id) || null;
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

/* The home state: the greeting, and short example chips above the box.
   A chip shows a short name; clicking it puts the full example in the box.
   Past ideas are in the sidebar (the menu button on the phone), not here. */
function showHome() {
  showGreeting();
  showHeader();

  document.querySelector('#examples').innerHTML = [0, 1, 2]
    .map((number) => `<button type="button" class="pill" data-example="${number}">${t(`chat.exampleLabel.${number}`)}</button>`)
    .join('');
}

/* ---------- The conversation ---------- */

function setPlaceholder() {
  const key = current ? 'chat.placeholderFollow' : 'chat.placeholder';
  input.dataset.i18nPlaceholder = key;
  input.placeholder = t(key);
}

/* Switches the page from the home state to the conversation */
function showChat() {
  chat.classList.add('is-started');
  showHeader();
}

/* The header, like a chat app: the idea's name in the middle, and on the other side
   the "Assessment 72" button (once there is a score) and the new chat button.
   Before Darb has found an idea in the conversation, the middle says "Darb". */
function showHeader() {
  let title = document.querySelector('#chat-title');
  if (!title) {
    title = document.createElement('h1');
    title.id = 'chat-title';
    title.className = 'app-header-title chat-title';
    document.querySelector('.app-header .app-header-space').before(title);
  }
  title.textContent = current && hasIdea(current) ? say(current.title) : t('chat.titleEmpty');   // founder's words: as text

  const actions = document.querySelector('#header-actions');
  actions.innerHTML = `
    ${current && current.score
      ? `<button type="button" class="btn btn-secondary btn-sm" data-open-tab="score"><span class="chip chip-${scoreBand(current.score)}">${current.score}</span> ${t('chat.assessment')}</button>`
      : ''}
    ${current
      ? `<a class="btn-icon chat-new" href="chatbot.html" aria-label="${t('nav.newAssessment')}" title="${t('nav.newAssessment')}">${icon('pencil')}</a>`
      : ''}`;
}

/* The first competitor analysis of this conversation was just saved, so it is about a
   real idea now: it gets its name and shows in History and the sidebar. The name comes
   from the founder's longest message, since that is where the idea was described
   (the first message may only have been "hi"). */
async function becomeIdea() {
  const said = current.history.filter((message) => message.from === 'user').map((message) => message.text);
  const idea = said.reduce((longest, text) => (text.length > longest.length ? text : longest), '');
  if (idea) {
    current.idea = idea;
    current.title = titleFrom(idea);
  }
  await save();
  showHeader();
  showSidebarHistory();
}

/* Sends one founder message to Darb, shows the reply and saves both.
   about = the startup the question is about (from "Ask about it" in the panel) */
async function talk(text, about = null) {
  addUser(text, about);

  // the agent only sees the words, so say which startup the question is about
  const forAgent = about ? `(${t('chat.askingAbout')} ${about.name}) ${text}` : text;

  busy = true;
  const reply = await agentAnswers(forAgent);
  busy = false;

  // Both messages are saved only when Darb answered. A failed answer is shown but
  // not saved, so the founder can send the message again without it appearing twice.
  if (reply) {
    await saveMessage(current, 'user', { text, about: about ? about.id : '' });
    await saveMessage(current, 'agent', { text: reply });
  }
  const wasIdea = hasIdea(current);
  await save();   // updates the time, so the conversation moves to the top of History
  // a competitor analysis was just saved for this idea: show its competitors as cards
  if (reply && await refreshAnalysis(current)) {
    if (!wasIdea) await becomeIdea();
    addCompetitors();
  }
  if (current.score) addFollowUps();
  input.focus();
}

/* The first message: the idea. The assessment must be saved first: the agent
   needs it in the database to run the competitor analysis. */
async function startConversation(idea) {
  current = newAssessment(idea);
  showChat();
  setPlaceholder();

  // saved before Darb answers: the agent needs it in the database to run the analysis.
  // It only shows in History once Darb finds an idea in the conversation (becomeIdea).
  await save();
  history.replaceState(null, '', chatLink(current.id));

  await talk(idea);
}

/* A message after the first one */
async function followUp(text) {
  const about = askingAbout;
  setAskingAbout(null);
  await talk(text, about);
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

  for (const message of current.history) {
    if (message.from === 'user') {
      addUser(say(message.text));
    } else {
      addAgent(say(message.text));
    }
  }

  // the competitor analysis, if this idea has one: the same cards as when it ran
  if (current.analysedAt) {
    if (!current.result) await loadResult(current);
    addCompetitors();
  }

  // older assessments with a score: the result card that opens the assessment panel
  if (current.score) {
    if (!current.result) await loadResult(current);
    addResult();
    if (current.roadmapShown) addRoadmap();
    addFollowUps();
  }

  setPlaceholder();
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
  } else {
    await followUp(text);
  }
});

/* ---------- Clicks ---------- */

document.addEventListener('click', (event) => {
  // an example on the home state fills the box
  const example = event.target.closest('[data-example]');
  if (example) {
    input.value = t(`chat.example.${example.dataset.example}`);
    resizeInput();
    input.focus();
  }

  // anything that opens the assessment panel on a tab
  const opener = event.target.closest('[data-open-tab]');
  if (opener && current && (current.score || current.analysedAt)) {
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
    // a what-if has no survival score, only its competitor analysis, so it opens on that
    if (address.get('tab') && (current.score || current.analysedAt)) {
      if (!current.result) await loadResult(current);
      openPanel(current, address.get('tab'));
    }
  } else {
    // the database did not answer → 500; the conversation does not exist (or is not this founder's) → 404
    showErrorPage(assessmentsFailed ? 500 : 404);
  }
} else {
  showHome();
}

input.focus();

pageIsReady = true;
if (languageCameLate) drawAgain();
