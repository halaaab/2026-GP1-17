// The checks around every delegation from the Conversational Agent to the Competitor Agent.
// They use Mastra's delegation hooks (supervisor pattern, @mastra/core 1.80):
//
//   onDelegationStart     before the Competitor Agent runs: checks the handoff the supervisor wrote against the
//                         Handoff schema, and adds assessment_id and idea_id from the server, never from the model.
//                         Code also sets the founder's language from their message, and drops known_facts the
// founder never said (stated facts only).
// messageFilter the Competitor Agent sees only the handoff, not the founder's chat.
//   onDelegationComplete  after it runs: takes the Result from finalize_result, checks it with the Result schema
//                         (or builds a valid fallback), and adds the notes as sentences in the founder's language.
//                         The supervisor sees only this, never the Competitor Agent's own text. It also tells the
//                         reply guard (lib/reply-guard.ts) what the founder must see, and writes one run log line.
//
// Also decided here, in code:
// limits a founder who used their daily or monthly analyses gets the limit note; nothing is searched
//   clarification  the founder sees the Competitor Agent's question word for word, and when the supervisor forgets
// to send their answer on the next call, the hook adds it from the question it remembers
//   what-if        runs only after the founder answered Darb's confirmation question; it becomes a new assessment
//                  linked to this one, and the founder gets an exact before → after comparison (lib/what-if.ts)
//   no "new" twice a conversation's analysis is never replaced by a "new" one: a changed idea is a what-if and a
//                  correction is a rerun.
// There is no consent step: an idea, or a question about who already does it, is analysed right away. Whether the
// founder's message is that is read by the Conversational Agent, never by a word list.
import type { DelegationCompleteContext, DelegationConfig, DelegationStartContext, DelegationStartResult } from '@mastra/core/agent';
import { z } from 'zod';
import { Handoff, Result, RunLog } from '../schemas/competitor';
import { analyseIdeaTool } from '../tools/analyse-idea';
import { finalizeResultTool, HANDOFF_KEY, STARTED_AT_KEY } from '../tools/finalize-result';
import { getUserId, loadOwnedAssessment } from './assessments';
import { fallbackResult } from './competitor-result';
import { newRunState, RUN_STATE_KEY, type RunState } from './competitor-run';
import { analysedAt, analysisLimit, loadStoredResult, type StoredResult } from './competitor-store';
import { askedBeforeLatestReply, compareResults, comparisonSentences, createWhatIf, removeWhatIf } from './what-if';
import { cardsSentence, noteSentences, opportunitySentences, summarySentences } from './competitor-notes';
import { conversationLanguage, isAffirmative, keepStatedFacts } from './founder-text';
import { REPLY_RULES_KEY, type ReplyRules } from './reply-guard';

export const COMPETITOR_AGENT_ID = 'competitor-agent';

// Most steps the Competitor Agent may take in one run: one, the analyse_idea call. Only the
// tool's Result is used, so its closing "Done." line was dropped: it took 13 of the 38 s of a vague idea's answer.
export const COMPETITOR_MAX_STEPS = 1;

// What the supervisor writes. The ids are left out: the server adds them.
export const SupervisorHandoff = Handoff.omit({ assessment_id: true, idea_id: true });

// What the supervisor sees after a delegation.
export type DelegationReply = {
  result: Result;
  note_sentences: string[];
  summary_sentences: string[];
  opportunity_sentences: string[];
  comparison_sentences?: string[]; // a what-if only: before → after, written in code
};

type Running = {
  handoff: Handoff;
  startedAt: number;
  droppedFacts: string[];
  replyRules?: ReplyRules;
  state: RunState;
  conversationAssessmentId: string; // the assessment of the chat; a what-if's own assessment is handoff.assessment_id
  whatIf?: { original: StoredResult | null; created: boolean };
};

// Handoffs of the delegations still running, by tool call id (both hooks receive it).
const running = new Map<string, Running>();

// The question each assessment is waiting on, by assessment_id. Kept in server memory: after a restart the
// supervisor's own re-call (with clarification) still works; only this backup is lost.
export const pendingQuestions = new Map<string, string>();

// The JSON object inside the supervisor's message (it may wrap it in a code block).
export function jsonInside(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

// Optional fields the supervisor left empty ({}, [], "" or null) mean "not stated", so they are dropped before the
// check, instead of rejecting the handoff and costing the supervisor another call. Filled fields are checked as written.
export function withoutEmptyFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const isEmpty = (v: unknown) =>
    v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
  const kept: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    // inside an object field (known_facts, founder_startup), empty parts are dropped too
    const inner = v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => !isEmpty(x))) : v;
    if (!isEmpty(inner)) kept[key] = inner;
  }
  return kept;
}

// Analogy words in front of a reference ("like Mrsool", "مثل طلبات") are removed, so the name matches the company
// ("like Mrsool" never matched "Mrsool", which was then shown).
const ANALOGY_WORDS = /^\s*(?:(?:just\s+)?(?:like|similar\s+to|same\s+as|such\s+as|as|a\s+version\s+of|مثل|زي|زيّ|شبه|على\s+غرار|نفس)\s+|كـ\s*)/i;
export function referenceName(text: string): string {
  return text.replace(ANALOGY_WORDS, '').replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
}

// The names a founder compares the idea to: the words right after an analogy word, up to "but", a comma or the end.
const ANALOGY_IN_TEXT = /(?:^|[^\p{L}])(?:like|similar to|same as|such as|مثل|زي|شبه|على غرار)\s+([^,،.;!?\n]+?)(?=\s+(?:but|except|only|for|with|بس|لكن|ولكن|غير)(?![\p{L}])|\s*[,،.;!?\n]|$)/giu;
export function analogiesIn(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(ANALOGY_IN_TEXT)) {
    const name = m[1].trim().split(/\s+/).slice(0, 3).join(' ');
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

// The name lists of the supervisor's handoff, made safe before the check: a single name written as text becomes a list
// (instead of rejecting the delegation and costing a retry), references lose their analogy words, and a company
// the founder used as an analogy is never also checked as a named competitor (the analogy rule wins).
export function withNamesCleaned(value: unknown, founderText = ''): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const v = { ...(value as Record<string, unknown>) };
  const list = (x: unknown) => (typeof x === 'string' ? [x] : x);
  for (const key of ['named_competitors', 'references'] as const) if (key in v) v[key] = list(v[key]);
  if (Array.isArray(v.references)) v.references = v.references.map((r) => (typeof r === 'string' ? referenceName(r) : r)).filter((r) => r !== '');
  // The founder's own words decide what is an analogy, not the model's lists or its rewrite of the idea: every name the
  // founder puts right after an analogy word ("like Mrsool but only for groceries", "مثل طلبات بس للصيدليات") is a
  // reference. In the K3 re-runs the model sometimes listed Mrsool only as a named competitor, or rewrote the idea
  // without it, so Mrsool was shown.
  const analogies = analogiesIn(founderText);
  if (analogies.length) v.references = [...new Set([...(Array.isArray(v.references) ? v.references : []), ...analogies])];
  const refs = new Set((Array.isArray(v.references) ? v.references : []).filter((r): r is string => typeof r === 'string').map((r) => r.toLowerCase()));
  if (Array.isArray(v.named_competitors)) {
    v.named_competitors = v.named_competitors.filter((n) => !(typeof n === 'string' && refs.has(referenceName(n).toLowerCase())));
    if ((v.named_competitors as unknown[]).length === 0) delete v.named_competitors;
  }
  return v;
}

// The text of the founder's messages the supervisor saw, oldest first.
type ModelMessageLike = { role: string; content: unknown };
export function founderMessages(messages: readonly ModelMessageLike[] | undefined): string[] {
  return (messages ?? [])
    .filter((m) => m.role === 'user')
    .map((m) =>
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : '')).join(' ')
          : '',
    )
    .filter((t) => t.trim());
}

const reject = (reason: string): DelegationStartResult => ({ proceed: false, rejectionReason: reason });

export async function onCompetitorDelegationStart(ctx: DelegationStartContext): Promise<DelegationStartResult | void> {
  if (ctx.primitiveId !== COMPETITOR_AGENT_ID) return;

  const assessmentId = ctx.requestContext.get('assessmentId');
  const userId = getUserId({ requestContext: ctx.requestContext }) ?? ctx.resourceId ?? null;
  if (typeof assessmentId !== 'string' || !assessmentId || !userId) {
    return reject('No assessment has been started for this conversation, so the analysis cannot run.');
  }

  const written = SupervisorHandoff.safeParse(withNamesCleaned(withoutEmptyFields(jsonInside(ctx.prompt)), founderMessages(ctx.messages as ModelMessageLike[]).join('\n')));
  if (!written.success) {
    return reject(
      `The handoff is not valid. Send one JSON object with mode, language, idea_text and only the optional fields that apply.\n${z.prettifyError(written.error)}`,
    );
  }

  const assessment = await loadOwnedAssessment(assessmentId, userId);
  if (!assessment) return reject('That assessment does not exist for this founder.');

  // Decided in code from what the founder wrote, not taken from the model.
  const said = founderMessages(ctx.messages as ModelMessageLike[]);
  const language = conversationLanguage(said) ?? written.data.language;
  const facts = said.length ? keepStatedFacts(written.data.known_facts, said.join('\n')) : { kept: written.data.known_facts, dropped: [] };

  // The Competitor Agent asked a question last time, and the supervisor did not pass the answer: the founder's
  // latest message is the answer to it.
  const asked = pendingQuestions.get(assessment.assessment_id);
  const clarification = written.data.clarification ?? (asked && said.length ? { question: asked, answer: said.at(-1)! } : undefined);

  // A what-if needs its short name, and runs only after the founder answered Darb's confirmation question.
  const isWhatIf = written.data.mode === 'what_if';
  if (isWhatIf && !written.data.scenario_label) {
    return reject('A what-if needs scenario_label: a short name for the change in the founder\'s language, such as "Jeddah instead of Riyadh".');
  }
  // Darb asked a question, and the founder answered it with a clear yes (any earlier question
  // from Darb, such as "anything else you'd like to explore?", let "what if I targeted teachers?" run at once).
  if (isWhatIf && (!askedBeforeLatestReply(ctx.messages as ModelMessageLike[]) || !isAffirmative(said.at(-1) ?? ''))) {
    return reject(
      'Confirm the what-if first: restate the changed idea to the founder in one short question (for example "Same idea, but in Jeddah instead of Riyadh. Shall I run it?") and wait for their answer. If they agree, delegate again.',
    );
  }

  const mode = written.data.mode;
  // A conversation's original analysis is never replaced by a "new" one: a changed idea is a what-if (kept beside it),
  // and a correction is a rerun (a confirmed what-if was sent as "new").
  if (mode === 'new' && (await analysedAt(assessment.assessment_id))) {
    return reject(
      'This conversation already has an analysis. For a changed version of the idea ("what if…"), delegate with mode "what_if" and scenario_label. For a correction of the idea, delegate with mode "rerun". For a question about the results, use get_competitor_result.',
    );
  }

  const state = newRunState();
  state.limitNote = await analysisLimit(userId, isWhatIf ? null : assessment.assessment_id);

  // The what-if's own assessment, linked to this one (not created when the founder has no analyses left).
  let runAssessmentId = assessment.assessment_id;
  let whatIf: Running['whatIf'];
  if (isWhatIf && !state.limitNote) {
    try {
      const original = await loadStoredResult(assessment.assessment_id);
      runAssessmentId = await createWhatIf(assessment, written.data.scenario_label!, written.data.idea_text);
      whatIf = { original, created: true };
    } catch (error) {
      console.error('Starting the what-if failed:', error);
      return reject('The what-if could not be started right now. Tell the founder and offer to try again.');
    }
  }

  const handoff = Handoff.parse({
    ...written.data,
    ...(clarification ? { clarification } : {}),
    language,
    known_facts: facts.kept,
    assessment_id: runAssessmentId,
    idea_id: assessment.idea_id,
  });
  const startedAt = Date.now();
  // The reply rules box of this run (set by the reply guard). The request context copy shares it with the parent run.
  const replyRules = ctx.requestContext.get(REPLY_RULES_KEY) as ReplyRules | undefined;
  // A fresh run state for every run (made above), so nothing gathered by an earlier run leaks into this one.
  running.set(ctx.toolCallId, {
    handoff,
    startedAt,
    droppedFacts: facts.dropped,
    replyRules,
    state,
    conversationAssessmentId: assessment.assessment_id,
    whatIf,
  });
  ctx.requestContext.set(HANDOFF_KEY, handoff);
  ctx.requestContext.set(RUN_STATE_KEY, state);
  ctx.requestContext.set(STARTED_AT_KEY, startedAt);

  return {
    proceed: true,
    modifiedPrompt: state.limitNote
      ? `Handoff:\n${JSON.stringify(handoff)}\nThe founder has no analyses left for now: call analyse_idea now.`
      : `Handoff:\n${JSON.stringify(handoff)}`,
    modifiedMaxSteps: COMPETITOR_MAX_STEPS,
  };
}

// One log line per run, in the shared format (schemas/competitor.ts RunLog). Ids and codes only, never idea text.
export function runLog(started: Running, result: Result, resultValid: boolean): RunLog {
  const { handoff } = started;
  return RunLog.parse({
    event: 'competitor_run',
    trace_id: result.usage.trace_id,
    assessment_id: handoff.assessment_id,
    idea_id: handoff.idea_id,
    mode: handoff.mode,
    language: handoff.language,
    started_at: new Date(started.startedAt).toISOString(),
    duration_ms: Math.max(0, Date.now() - started.startedAt),
    status: result.status,
    result_valid: resultValid,
    competitors_shown: result.competitors.length,
    iss: result.iss,
    notes: result.notes,
    dropped_known_facts: started.droppedFacts,
    tavily_calls: result.usage.tavily_calls,
    judge_calls: started.state.judgeCalls,
    // The steps the capabilities recorded; a run that recorded none (or whose result failed the check) logs the guardrails step.
    steps:
      started.state.steps.length && resultValid
        ? started.state.steps
        : [...started.state.steps, { capability: 'guardrails', outcome: resultValid ? 'ok' : 'failed', duration_ms: result.usage.duration_ms }],
  });
}

export async function onCompetitorDelegationComplete(ctx: DelegationCompleteContext): Promise<{ resultText: string } | void> {
  if (ctx.primitiveId !== COMPETITOR_AGENT_ID) return;
  const started = running.get(ctx.toolCallId);
  running.delete(ctx.toolCallId);
  if (!started) return; // the delegation was rejected before it started: keep the rejection message

  // analyse_idea returns finalize_result's Result (tools/analyse-idea.ts); finalize_result alone is still accepted.
  const tools = ctx.result?.subAgentToolResults ?? [];
  const called = tools.find((r) => r.toolName === 'analyse_idea' || r.toolName === 'finalize_result');
  let checked = Result.safeParse(called && !called.isError ? called.result : undefined);
  // The analysis always runs, in code, even when the agent did not call it. The agent has one
  // step and the delegation does not pass its "tool required" setting on, so it sometimes wrote a line instead of
  // calling analyse_idea; earlier it also called its memory tool instead of finalize_result. When nothing ran, the
  // whole analysis runs here; when it ran and failed, finalize_result builds the result from what was gathered.
  if (!checked.success) {
    const values = new Map<string, unknown>([[HANDOFF_KEY, started.handoff], [RUN_STATE_KEY, started.state], [STARTED_AT_KEY, started.startedAt]]);
    const requestContext = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => void values.set(key, value) };
    try {
      const tool = called ? finalizeResultTool : analyseIdeaTool;
      checked = Result.safeParse(await tool.execute!({} as never, { requestContext } as never));
    } catch (error) {
      console.error('Building the result in code failed:', error);
    }
  }
  const result = checked.success
    ? checked.data
    : fallbackResult(started.handoff, { durationMs: Date.now() - started.startedAt, traceId: null });

  const sentences = noteSentences(result.notes, started.handoff.language);
  const question = result.status === 'needs_clarification' ? result.clarification?.question : undefined;
  if (question) pendingQuestions.set(started.conversationAssessmentId, question);
  else pendingQuestions.delete(started.conversationAssessmentId);

  // A what-if whose result was not saved (a question, a limit or a failed run) is removed, so History never
  // shows an empty what-if. When it was saved, the founder gets the exact comparison with the original.
  const saved = started.state.steps.some((s) => s.capability === 'guardrails' && s.outcome === 'ok' && /\bsaved\b/.test(s.detail ?? ''));
  let comparison: string[] | undefined;
  if (started.whatIf?.created && !saved) {
    removeWhatIf(started.handoff.assessment_id).catch((error) => console.error('Removing an unsaved what-if failed:', error));
  } else if (started.whatIf?.created) {
    comparison = comparisonSentences(compareResults(started.whatIf.original, result), started.handoff.language);
  }

  if (started.replyRules) {
    started.replyRules.language = started.handoff.language;
    if (question) {
      // A question to ask: the founder sees exactly that one question, written by code.
      started.replyRules.sentences = [question];
      started.replyRules.codeWritesReply = true;
    } else if (result.competitors.length > 0 && !started.whatIf?.created) {
      // Cards are shown under the reply: code writes the whole reply, so the model never lists the competitors again
      // Only one sentence and the notes are shown (the score, the market and the
      // opportunities made the reply crowded; the cards and the analysis panel already show them).
      // A what-if has no cards, so the model still lists its competitors in text.
      const language = started.handoff.language;
      started.replyRules.sentences = [cardsSentence(result.competitors.length, language), ...sentences];
      started.replyRules.codeWritesReply = true;
    } else {
      started.replyRules.sentences = sentences;
      // Nothing to present: the founder sees exactly the note sentences, written by code.
      started.replyRules.codeWritesReply = result.competitors.length === 0 && sentences.length > 0;
    }
  }
  console.info(JSON.stringify(runLog(started, result, checked.success)));

  const language = started.handoff.language;
  const reply: DelegationReply = {
    result,
    note_sentences: sentences,
    summary_sentences: summarySentences(result, language),
    opportunity_sentences: opportunitySentences(result, language),
    ...(comparison ? { comparison_sentences: comparison } : {}),
  };
  return { resultText: JSON.stringify(reply) };
}

export const competitorDelegation: DelegationConfig = {
  onDelegationStart: onCompetitorDelegationStart,
  onDelegationComplete: onCompetitorDelegationComplete,
  messageFilter: ({ primitiveId, messages }) => (primitiveId === COMPETITOR_AGENT_ID ? [] : messages),
  // A failing check stops the delegation instead of letting an unchecked handoff or result through.
  hookErrorStrategy: 'throw',
};
