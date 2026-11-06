/* The sign-up questions for each user type, in one place. The Founders tab
   (filters and side panel) and the Insights tab (charts) all read this list,
   so adding a question here adds it everywhere. */

import { t } from '../../../shared/language.js';
import { SECTORS, label as startupLabel } from '../../../shared/startups.js';

// title: the question's name. other: the word for typed answers that are not on the list.
const SECTOR = { kind: 'sector', other: 'signup.sector.other' };

export const TYPE_FIELDS = {
  student: [
    { column: 'field_of_study', title: 'signup.fieldOfStudy', prefix: 'signup.study.', other: 'signup.study.other' },
    { column: 'education_level', title: 'signup.academicLevel', prefix: 'signup.level.', other: 'signup.level.other' },
    { column: 'has_prior_venture', title: 'signup.priorTitle', kind: 'yesNo' },
    { column: 'project_sector', title: 'signup.projectSector', ...SECTOR },
    { column: 'project_stage', title: 'signup.projectStage', prefix: 'signup.stage.' },
  ],
  entrepreneur: [
    { column: 'project_sector', title: 'signup.projectSector', ...SECTOR },
    { column: 'project_stage', title: 'signup.projectStage', prefix: 'signup.stage.' },
  ],
  business_owner: [
    { column: 'current_business_sector', title: 'signup.businessSector', ...SECTOR },
    { column: 'business_age', title: 'signup.businessAge', prefix: 'signup.age.' },
    { column: 'business_size', title: 'signup.businessSize', prefix: 'signup.size.' },
  ],
  investor: [
    { column: 'investor_type', title: 'signup.investorType', prefix: 'signup.itype.', other: 'signup.itype.other' },
  ],
  other: [],
};

export const TYPES = Object.keys(TYPE_FIELDS);

// the user types from sign-up, and the words shown for them
export const TYPE_LABELS = {
  student: 'signup.student',
  entrepreneur: 'signup.entrepreneur',
  business_owner: 'signup.owner',
  investor: 'signup.investor',
  other: 'signup.other',
};

// one pastel color per user type (chip-pastel-N in shared.css); no mint (6), it sits next to the green "Active"
export const TYPE_COLORS = { student: 1, entrepreneur: 2, business_owner: 3, investor: 4, other: 5 };

function isOnList(field, value) {
  if (field.kind === 'yesNo') return true;
  if (field.kind === 'sector') return SECTORS.includes(value);
  const key = `${field.prefix}${value}`;
  return t(key) !== key;
}

/* The group a founder's answer belongs to: '' when empty, and 'other' for words they typed
   themselves, so one-off answers count together instead of filling the charts. */
export function groupOf(field, founder) {
  const value = founder[field.column];
  if (value === null || value === undefined || value === '') return '';
  if (field.kind === 'yesNo') return value ? 'yes' : 'no';
  return isOnList(field, value) ? value : 'other';
}

// The words for one of those groups, in the page's language
export function groupText(field, group) {
  if (group === '') return t('overview.notSet');
  if (field.kind === 'yesNo') return t(group === 'yes' ? 'founders.yes' : 'founders.no');
  if (group === 'other') return t(field.other || 'signup.other');
  if (field.kind === 'sector') return startupLabel('sector', group);
  return t(`${field.prefix}${group}`);
}

// A founder's own answer: their typed words are kept, so the side panel can show them
export function answerText(field, founder) {
  const group = groupOf(field, founder);
  return group === 'other' && founder[field.column] !== 'other' ? founder[field.column] : groupText(field, group);
}
