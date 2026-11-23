// Tests for analyse_idea: the Competitor Agent's four steps in a fixed order, in code (16 Nov 2026).
// The four tools are replaced by fakes that record when they run: nothing is searched or paid for.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ran: string[] = [];
let ready = true;
const fake = (name: string, answer: () => unknown) => ({ id: name, execute: vi.fn(async () => (ran.push(name), answer())) });
vi.mock('../../src/mastra/tools/understand-idea', () => ({ understandIdeaTool: fake('understand_idea', () => ({ ready })) }));
vi.mock('../../src/mastra/tools/find-competitors', () => ({ findCompetitorsAgentTool: fake('find_competitors', () => ({ searched: true })) }));
vi.mock('../../src/mastra/tools/judge-candidates', () => ({ judgeCandidatesTool: fake('judge_candidates', () => ({ judged: [] })) }));
vi.mock('../../src/mastra/tools/finalize-result', () => ({
  finalizeResultTool: fake('finalize_result', () => ({ status: 'complete' })),
  HANDOFF_KEY: 'competitorHandoff',
}));

const { analyseIdeaTool } = await import('../../src/mastra/tools/analyse-idea');
const analyse = () => analyseIdeaTool.execute!({}, {} as never);

beforeEach(() => {
  ran.length = 0;
});

describe('analyse_idea', () => {
  it('runs understand, find, judge and finalize in that order, and returns the Result', async () => {
    ready = true;
    expect(await analyse()).toEqual({ status: 'complete' });
    expect(ran).toEqual(['understand_idea', 'find_competitors', 'judge_candidates', 'finalize_result']);
  });

  it('never searches an idea that needs a question: straight to finalize_result', async () => {
    ready = false;
    await analyse();
    expect(ran).toEqual(['understand_idea', 'finalize_result']);
  });

  it('records each step as its own trace span under analyse_idea, and returns the same Result', async () => {
    ready = true;
    const spans: { name: string; input: unknown; ended: unknown }[] = [];
    const parent = {
      createChildSpan: ({ name, input }: { name: string; input: unknown }) => {
        const span = { name, input, ended: undefined as unknown, end: (options: unknown) => (span.ended = options ?? {}), error: () => {} };
        spans.push(span);
        return span;
      },
    };
    const result = await analyseIdeaTool.execute!({}, { tracingContext: { currentSpan: parent } } as never);
    expect(result).toEqual({ status: 'complete' });
    expect(spans.map((span) => span.name)).toEqual(['understand_idea', 'find_competitors', 'judge_candidates', 'finalize_result']);
    expect(spans.every((span) => span.ended !== undefined)).toBe(true);
    // each span shows what its step returned
    expect(spans.map((span) => span.ended)).toEqual([
      { output: { ready: true } },
      { output: { searched: true } },
      { output: { judged: [] } },
      { output: { status: 'complete' } },
    ]);
  });

  it('runs exactly the same when there is no trace (no span to report under)', async () => {
    ready = true;
    expect(await analyse()).toEqual({ status: 'complete' });
    expect(ran).toEqual(['understand_idea', 'find_competitors', 'judge_candidates', 'finalize_result']);
  });
});
