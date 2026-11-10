// Tests for the agents' setup: every tool their instructions name really exists, and the limits are in place.
import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test'; // never connected to in these tests

const { competitorAgent } = await import('../../src/mastra/agents/competitor-agent');
const { conversationalAgent } = await import('../../src/mastra/agents/conversational-agent');
const { COMPETITOR_MAX_STEPS, competitorDelegation } = await import('../../src/mastra/lib/competitor-delegation');
const { RequestContext } = await import('@mastra/core/request-context');

// Tool names look like similarity_search: lowercase words joined by underscores, ending in a known suffix.
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)*_(?:search|competitors|analysis|details|if|profile|survival|result)\b/g;
const RESULT_FIELDS = new Set(['needs_web_search', 'named_competitors', 'idea_profile']); // named in the instructions, but fields, not tools
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
    expect([...named].sort()).toEqual(['finalize_result']);
    for (const name of named) expect(tools).toContain(name);
  });

  it('stops after the step limit', async () => {
    const options = await competitorAgent.getDefaultOptions();
    expect(options.maxSteps).toBe(COMPETITOR_MAX_STEPS);
  });
});

describe('Conversational Agent', () => {
  it('has every tool its instructions name', async () => {
    const tools = Object.keys(await conversationalAgent.listTools());
    const named = toolNames(await instructionsOf(conversationalAgent));
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(tools).toContain(name);
  });

  it('has the Competitor Agent as its child agent, with the delegation checks', async () => {
    const agents = await conversationalAgent.listAgents();
    expect(Object.values(agents).map((a) => a.id)).toContain('competitor-agent');
    const options = await conversationalAgent.getDefaultOptions();
    expect(options.delegation).toBe(competitorDelegation);
  });

  it('is connected to the survival prediction', async () => {
    expect(Object.keys(await conversationalAgent.listTools())).toContain('predict_survival');
    expect(await instructionsOf(conversationalAgent)).toContain('predict_survival');
  });

  it('can delegate only when the server started an assessment', async () => {
    const withAssessment = new RequestContext();
    withAssessment.set('assessmentId', '11111111-1111-4111-8111-111111111111');
    expect(await instructionsOf(conversationalAgent, withAssessment)).toContain('An assessment has been started');
    expect(await instructionsOf(conversationalAgent)).toContain('No assessment has been started');
  });

  it('never asks the founder to fill in a form before delegating (design §4)', async () => {
    const text = await instructionsOf(conversationalAgent);
    expect(text).toContain('Only check that the message is an idea');
    expect(text).not.toContain('ISIC4 divisions (code');
  });
});
