// Tests for analyse_idea: the Competitor Agent's four steps in a fixed order, in code (16 Nov 2026).
// The four tools are replaced by fakes that record when they run: nothing is searched or paid for.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ran: string[] = [];
let ready = true;
const fake = (name: string, answer: () => unknown) => ({ execute: vi.fn(async () => (ran.push(name), answer())) });
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

  it('never searches in a check run, even when the idea is ready (no consent yet)', async () => {
    ready = true;
    const requestContext = { get: (key: string) => (key === 'competitorHandoff' ? { mode: 'check' } : undefined) };
    await analyseIdeaTool.execute!({}, { requestContext } as never);
    expect(ran).toEqual(['understand_idea', 'finalize_result']);
  });

  it('never searches an idea that needs a question: straight to finalize_result', async () => {
    ready = false;
    await analyse();
    expect(ran).toEqual(['understand_idea', 'finalize_result']);
  });
});
