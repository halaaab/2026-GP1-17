// Tests for the agents' setup: every tool their instructions name really exists, and the limits are in place.
import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test'; // never connected to in these tests

const { competitorAgent } = await import('../../src/mastra/agents/competitor-agent');
const { conversationalAgent } = await import('../../src/mastra/agents/conversational-agent');
const { MAX_TOOL_STEPS } = await import('../../src/mastra/config/limits');
const { RequestContext } = await import('@mastra/core/request-context');

// Tool names look like similarity_search: lowercase words joined by underscores, ending in a known suffix.
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)*_(?:search|competitors|analysis|details|if|profile|survival)\b/g;
const RESULT_FIELDS = new Set(['needs_web_search']); // named in the instructions, but fields of a tool result
const toolNames = (text: string) => new Set((text.match(TOOL_NAME) ?? []).filter((n) => !RESULT_FIELDS.has(n)));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function instructionsOf(agent: any, requestContext = new RequestContext()) {
  const value = await agent.getInstructions({ requestContext });
  return typeof value === 'string' ? value : JSON.stringify(value);
}

describe('Competitor Agent', () => {
  it('has every tool its instructions name', async () => {
    const tools = Object.keys(await competitorAgent.listTools());
    const named = toolNames(await instructionsOf(competitorAgent));
    expect([...named].sort()).toEqual(['extract_and_verify_profile', 'finalize_competitors', 'similarity_search', 'web_search']);
    for (const name of named) expect(tools).toContain(name);
  });

  it('stops after the step limit', async () => {
    const options = await competitorAgent.getDefaultOptions();
    expect(options.maxSteps).toBe(MAX_TOOL_STEPS);
  });
});

describe('Conversational Agent', () => {
  it('has every tool its instructions name', async () => {
    const tools = Object.keys(await conversationalAgent.listTools());
    const named = toolNames(await instructionsOf(conversationalAgent));
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(tools).toContain(name);
  });

  it('is connected to the survival prediction', async () => {
    expect(Object.keys(await conversationalAgent.listTools())).toContain('predict_survival');
    expect(await instructionsOf(conversationalAgent)).toContain('predict_survival');
  });

  it('is told the current assessment only when the server gave one', async () => {
    const withAssessment = new RequestContext();
    withAssessment.set('assessmentId', '11111111-1111-4111-8111-111111111111');
    expect(await instructionsOf(conversationalAgent, withAssessment)).toContain('11111111-1111-4111-8111-111111111111');
    expect(await instructionsOf(conversationalAgent)).toContain('No assessment has been started');
  });

  it('lists all 85 ISIC4 divisions for the founder to choose from', async () => {
    const text = await instructionsOf(conversationalAgent);
    expect(text).toContain('85 (in section P): Education');
    expect(text).toContain('64 (in section K)');
  });
});
