/* The Insights tab: what the sign-up answers say about Darb's audience.
   It only shows totals, never names. Everything is worked out from the founders
   list that the Founders tab already loaded (admin_list_founders, migration 0017). */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { TYPE_FIELDS, TYPE_LABELS, TYPE_COLORS, TYPES, groupOf, groupText } from './founder-fields.js';

const box = document.querySelector('#insights');
let founders = [];
let selectedType = 'student';
let openInFounders = () => {};  // set by founder-management.js

/* ---------- Small helpers ---------- */

function safe(text) {
  const holder = document.createElement('span');
  holder.textContent = text;
  return holder.innerHTML;
}

function number(value) {
  return value.toLocaleString(getLanguage() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB');
}

function fill(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function typeName(type) {
  return TYPE_LABELS[type] ? t(TYPE_LABELS[type]) : t('overview.notSet');
}

function regionName(region) {
  if (!region) return t('overview.notSet');
  const key = `signup.region.${region}`;
  return t(key) === key ? region : t(key);
}

// founders → [{ value, count }], biggest first
function countBy(list, valueOf) {
  const counts = new Map();
  list.forEach((founder) => {
    const value = valueOf(founder);
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

function countWhere(list, column) {
  return list.filter((founder) => founder[column]).length;
}

// One pastel: icons and bars inside follow it (see overview-dashboard.css)
function pastel(color) {
  return `--bar: var(--pastel-${color}-text); --bar-tint: var(--pastel-${color}-tint);`;
}

function colorStyle(type) {
  return TYPE_COLORS[type] ? pastel(TYPE_COLORS[type]) : '';
}

/* ---------- The numbers at the top ---------- */

// Built with the overview page's classes, so the two pages look the same
function summary() {
  const total = founders.length;
  const tile = (name, color, title, value, foot, share) => `
    <article class="card ov-kpi" style="${pastel(color)}">
      <div class="ov-kpi-top"><span class="ov-kpi-title"><span class="ov-kpi-icon">${icon(name)}</span><span class="stat-label">${t(title)}</span></span></div>
      <span class="stat-value">${value}</span>
      ${share === undefined ? '' : `<span class="ov-progress-track insight-track"><span class="ov-progress-fill" style="width: ${share}%"></span></span>`}
      ${foot ? `<div class="ov-kpi-foot"><span class="text-3">${foot}</span></div>` : ''}
    </article>`;
  const share = (name, color, title, column) => {
    const part = countWhere(founders, column);
    return tile(name, color, title, `${percent(part, total)}%`, fill('insights.ofFounders', { part: number(part), whole: number(total) }), percent(part, total));
  };
  return `
    <section class="ov-kpis">
      ${tile('users', 1, 'insights.total', number(total), '')}
      ${share('file', 2, 'insights.createdIdea', 'has_idea')}
      ${share('checkCircle', 3, 'insights.finished', 'finished_assessment')}
      ${share('clock', 4, 'insights.cameBack', 'came_back')}
    </section>`;
}

/* ---------- What the numbers mean ---------- */

// One card per finding
function takeaways() {
  const cards = [];
  const groups = countBy(founders, (founder) => founder.user_type);

  const largest = groups[0];
  if (largest) {
    cards.push({
      name: 'users',
      style: colorStyle(largest.value),
      label: t('insights.largestLabel'),
      headline: typeName(largest.value),
      detail: fill('insights.largestDetail', { n: percent(largest.count, founders.length) }),
    });
  }

  const engaged = groups
    .map((group) => {
      const members = founders.filter((founder) => founder.user_type === group.value);
      const finished = countWhere(members, 'finished_assessment');
      return { type: group.value, finished, total: members.length, share: percent(finished, members.length) };
    })
    .sort((a, b) => b.share - a.share);
  if (engaged.length > 1 && engaged[0].finished > 0) {
    cards.push({
      name: 'trendUp',
      style: colorStyle(engaged[0].type),
      label: t('insights.engagedLabel'),
      headline: typeName(engaged[0].type),
      detail: fill('insights.engagedDetail', { part: number(engaged[0].finished), whole: number(engaged[0].total) }),
    });
  }

  const steps = [
    { key: 'insights.dropIdea', from: founders.length, to: countWhere(founders, 'has_idea') },
    { key: 'insights.dropFinish', from: countWhere(founders, 'has_idea'), to: countWhere(founders, 'finished_assessment') },
  ].filter((step) => step.from > 0);
  if (steps.length) {
    const biggest = steps.sort((a, b) => percent(a.to, a.from) - percent(b.to, b.from))[0];
    cards.push({
      name: 'trendDown',
      style: '--bar: var(--risk-text); --bar-tint: var(--risk-tint);',
      label: t('insights.dropLabel'),
      headline: t(`${biggest.key}Title`),
      detail: fill(`${biggest.key}Detail`, { n: 100 - percent(biggest.to, biggest.from) }),
    });
  }

  return `
    <section class="insight-takeaways">
      ${cards.map((card) => `
        <article class="card ov-kpi insight-takeaway" style="${card.style}">
          <span class="ov-kpi-title"><span class="ov-kpi-icon">${icon(card.name)}</span><span class="stat-label">${safe(card.label)}</span></span>
          <strong class="insight-headline">${safe(card.headline)}</strong>
          <span class="text-3 insight-detail">${safe(card.detail)}</span>
        </article>`).join('')}
    </section>`;
}

/* ---------- Charts ---------- */

// One card's head: the overview page's title and subtitle
function cardHead(title, sub, extra = '') {
  return `
    <div class="ov-card-head">
      <div>
        <h3 class="section-title">${safe(title)}</h3>
        ${sub ? `<p class="text-3">${safe(sub)}</p>` : ''}
      </div>
      ${extra}
    </div>`;
}

// A list of answers: a bar each. A click on a bar opens those founders in the Founders tab.
function barRows(items, total, nameOf, filterOf, styleOf) {
  const widest = Math.max(1, ...items.map((item) => item.count));
  return items.map((item) => {
    const filter = filterOf ? filterOf(item) : null;
    const attributes = filter ? `data-open='${safe(JSON.stringify(filter))}'` : 'disabled';
    return `
      <button type="button" class="insight-bar" style="${styleOf ? styleOf(item) : ''}" ${attributes}>
        <span class="insight-bar-line">
          <span class="insight-bar-name">${safe(nameOf(item))}</span>
          <span class="insight-bar-count">${number(item.count)} <span class="text-3">${percent(item.count, total)}%</span></span>
        </span>
        <span class="ov-progress-track insight-track"><span class="ov-progress-fill" style="width: ${percent(item.count, widest)}%"></span></span>
      </button>`;
  }).join('') || `<p class="text-3">${t('insights.noAnswers')}</p>`;
}

function barCard(title, items, total, nameOf, filterOf, styleOf) {
  return `
    <section class="card ov-card">
      ${cardHead(title)}
      <div class="insight-bars">${barRows(items, total, nameOf, filterOf, styleOf)}</div>
    </section>`;
}

// The same table and "2/5" bars as the overview page's audience table
function funnelTable() {
  const progress = (part, whole) => `
    <div class="ov-progress">
      <span class="ov-progress-text">${number(part)}<span class="text-3">/${number(whole)}</span></span>
      <span class="ov-progress-track"><span class="ov-progress-fill" style="width: ${percent(part, whole)}%"></span></span>
    </div>`;
  const rows = countBy(founders, (founder) => founder.user_type).map(({ value, count }) => {
    const members = founders.filter((founder) => founder.user_type === value);
    return `
      <tr style="${colorStyle(value)}">
        <td class="ov-audience-name"><span class="chip chip-pastel-${TYPE_COLORS[value] || 1}">${safe(typeName(value))}</span></td>
        <td><strong>${number(count)}</strong> <span class="text-3">${percent(count, founders.length)}%</span></td>
        <td>${progress(countWhere(members, 'has_idea'), count)}</td>
        <td>${progress(countWhere(members, 'finished_assessment'), count)}</td>
        <td>${progress(countWhere(members, 'came_back'), count)}</td>
      </tr>`;
  }).join('');

  return `
    <section class="card ov-card ov-wide">
      ${cardHead(t('insights.funnel'), t('insights.funnelSub'))}
      <div class="table-wrap">
        <table class="table ov-audience">
          <thead>
            <tr>
              <th>${t('founders.userType')}</th>
              <th>${t('insights.signedUp')}</th>
              <th>${t('insights.createdIdea')}</th>
              <th>${t('insights.finished')}</th>
              <th>${t('insights.cameBack')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function typeDetails() {
  const members = founders.filter((founder) => founder.user_type === selectedType);

  const chooser = `
    <div class="insight-types" role="group" aria-label="${safe(t('insights.byType'))}">
      ${TYPES.map((type) => `
        <button type="button" class="pill ${type === selectedType ? 'is-active' : ''}" style="${colorStyle(type)}" data-insight-type="${type}">
          <span class="insight-dot"></span>${safe(typeName(type))}
        </button>`).join('')}
    </div>`;

  let content;
  if (selectedType === 'other') {
    // their own words, without names
    const words = members.map((founder) => founder.status_description).filter(Boolean);
    content = `
      <div class="insight-field">
        <h4 class="insight-field-title">${t('insights.ownWords')}</h4>
        ${words.length
          ? `<ul class="insight-words">${words.map((text) => `<li>${safe(text)}</li>`).join('')}</ul>`
          : `<p class="text-3">${t('insights.noAnswers')}</p>`}
      </div>`;
  } else {
    content = TYPE_FIELDS[selectedType].map((field) => `
      <div class="insight-field">
        <h4 class="insight-field-title">${safe(t(field.title))}</h4>
        <div class="insight-bars">${barRows(
          countBy(members, (founder) => groupOf(field, founder)),
          members.length,
          (item) => groupText(field, item.value),
          (item) => ({ type: selectedType, column: field.column, value: item.value }),
          () => colorStyle(selectedType),
        )}</div>
      </div>`).join('');
  }

  return `
    <section class="card ov-card ov-wide">
      ${cardHead(t('insights.byType'), fill('insights.ofFounders', { part: number(members.length), whole: number(founders.length) }), chooser)}
      <div class="insight-fields">${content}</div>
    </section>`;
}

function draw() {
  if (founders.length === 0) {
    box.innerHTML = `<p class="empty">${t('founders.none')}</p>`;
    return;
  }

  box.innerHTML = `
    ${summary()}
    ${takeaways()}
    <div class="ov-row">
      ${barCard(
        t('insights.audience'),
        countBy(founders, (founder) => founder.user_type),
        founders.length,
        (item) => typeName(item.value),
        (item) => ({ type: item.value }),
        (item) => colorStyle(item.value),
      )}
      ${barCard(
        t('insights.regions'),
        countBy(founders, (founder) => founder.region || ''),
        founders.length,
        (item) => regionName(item.value),
      )}
    </div>
    ${funnelTable()}
    ${typeDetails()}
    <p class="text-3 ov-updated">${t('insights.privacy')}</p>`;
}

/* ---------- What founder-management.js calls ---------- */

box.addEventListener('click', (event) => {
  const typeButton = event.target.closest('[data-insight-type]');
  if (typeButton) {
    selectedType = typeButton.dataset.insightType;
    draw();
    return;
  }
  const bar = event.target.closest('[data-open]');
  if (bar) openInFounders(JSON.parse(bar.dataset.open));
});

export function setUpInsights(onOpenFounders) {
  openInFounders = onOpenFounders;
}

export function showInsights(list, type) {
  founders = list;
  if (TYPES.includes(type)) selectedType = type;
  draw();
}
