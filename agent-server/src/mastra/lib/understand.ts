// The Understand capability's rules (design §4 "Idea template", PBI 34), decided in code:
//
//   understandText   what is profiled: the founder's idea, plus their answer when this is a re-call after a question
//   withStatedFacts  the facts the founder stated always win over what the profile model read
//   clarificationFor the minimum to search is the problem and the offering; when one is missing, ONE question,
//                    written here in Arabic and English so its wording never depends on a model
import type { Handoff, IdeaProfile, Language } from '../schemas/competitor';

type MissingField = 'problem' | 'offering';
export type Clarification = { question: string; missing_field: MissingField };

// One question per case. When both are missing, one question asks for both (the product first, as PBI 34 says).
export const CLARIFY_QUESTIONS: Record<MissingField | 'both', Record<Language, string>> = {
  problem: {
    en: 'Thank you for sharing your idea 😊 Could you tell me what problem it solves, and for whom?',
    ar: 'شكرًا لمشاركتك فكرتك 😊 هل يمكنك أن توضّح لي المشكلة التي تحلّها، ولمن؟',
  },
  offering: {
    en: 'Thank you for sharing your idea 😊 Could you tell me what exactly your product or service will offer its customers?',
    ar: 'شكرًا لمشاركتك فكرتك 😊 هل يمكنك أن توضّح لي ما الذي سيقدّمه منتجك أو خدمتك لعملائك بالتحديد؟',
  },
  both: {
    en: 'I would be glad to help 😊 Could you tell me a bit more: what will your product offer, and what problem does it solve?',
    ar: 'يسعدني مساعدتك 😊 هل يمكنك أن توضّح لي أكثر: ماذا سيقدّم منتجك، وما المشكلة التي يحلّها؟',
  },
};

// The founder's own words: the idea, then the question asked and their answer on a re-call.
export function understandText(handoff: Pick<Handoff, 'idea_text' | 'clarification'>): string {
  const parts = [handoff.idea_text.trim()];
  if (handoff.clarification) parts.push(`Question: ${handoff.clarification.question}`, `Answer: ${handoff.clarification.answer}`);
  return parts.join('\n');
}

// A fact the founder stated (already checked in code by the delegation hook) replaces the model's reading of it.
export function withStatedFacts(profile: IdeaProfile, handoff: Pick<Handoff, 'known_facts'>): IdeaProfile {
  const facts = handoff.known_facts ?? {};
  const next = { ...profile };
  for (const name of ['problem', 'customer', 'offering', 'market'] as const) {
    const value = facts[name]?.trim();
    if (value) next[name] = { value, origin: 'stated' };
  }
  return next;
}

// null when the idea has enough to search (problem and offering, stated or inferred). A re-call asks again only when
// the founder's answer still gave neither, so a founder is never asked the same thing over and over.
export function clarificationFor(profile: IdeaProfile, handoff: Pick<Handoff, 'language' | 'clarification'>): Clarification | null {
  const noProblem = profile.problem.origin === 'unknown';
  const noOffering = profile.offering.origin === 'unknown';
  if (!noProblem && !noOffering) return null;
  if (noProblem && noOffering) return { question: CLARIFY_QUESTIONS.both[handoff.language], missing_field: 'offering' };
  if (handoff.clarification) return null; // already asked once: search with what is known
  const missing: MissingField = noOffering ? 'offering' : 'problem';
  return { question: CLARIFY_QUESTIONS[missing][handoff.language], missing_field: missing };
}
