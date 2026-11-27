// The Understand capability's rules ("Idea template", PBI 34), decided in code:
//
//   understandText   what is profiled: the founder's idea, plus their answer when this is a re-call after a question
//   withStatedFacts  the facts the founder stated always win over what the profile model read
//   clarificationFor the minimum to search is the problem and the offering; when one is missing, ONE question,
//                    written here in Arabic and English so its wording never depends on a model
import type { Handoff, IdeaProfile, Language } from '../schemas/competitor';

type MissingField = 'problem' | 'offering';
export type Clarification = { question: string; missing_field: MissingField };

// One question per case. When both are missing, one question asks for both (the product first, as PBI 34 says).
// Written in Darb's voice (config/darb-persona.ts).
export const CLARIFY_QUESTIONS: Record<MissingField | 'both', Record<Language, string>> = {
  problem: {
    en: 'Thanks for sharing! What problem does your idea solve, and who is it for?',
    ar: 'جميل! ممكن توضح لي أكثر: ما المشكلة التي تحلّها فكرتك، ولمن؟',
  },
  offering: {
    en: 'Thanks for sharing! What exactly will your product or service do for its customers?',
    ar: 'جميل! ممكن توضح لي أكثر: ماذا سيقدّم منتجك أو خدمتك لعملائك بالتحديد؟',
  },
  both: {
    en: "I'd love to hear more about your idea! 💡 What will your product do, and what problem does it solve?",
    ar: 'ممكن توضح لي أكثر عن الفكرة؟ 💡 ماذا سيقدّم منتجك، وما المشكلة التي يحلّها؟',
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
