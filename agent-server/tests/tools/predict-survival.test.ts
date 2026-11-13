// Tests for predict_survival. The ML service is replaced by a fake fetch, so nothing real is called.
import { afterEach, describe, expect, it, vi } from 'vitest';

const { predictSurvivalTool } = await import('../../src/mastra/tools/predict-survival');
const IDEA = { sector: 'K', sub_sector: '64', region: 'Riyadh' };
const run = () => predictSurvivalTool.execute!(IDEA, {} as never) as Promise<any>;
const fakeService = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('predict_survival', () => {
  it('says the model is not connected when ML_SERVICE_URL is not set', async () => {
    vi.stubEnv('ML_SERVICE_URL', '');
    expect(await run()).toEqual({ status: 'model_not_connected', survival_probability: null });
  });

  it('sends the confirmed idea to /predict and returns the probability', async () => {
    vi.stubEnv('ML_SERVICE_URL', 'http://ml.test/');
    fakeService(200, { survival_probability: 0.72 });
    expect(await run()).toEqual({ status: 'ok', survival_probability: 0.72 });
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toBe('http://ml.test/predict');
    expect(JSON.parse(options.body)).toEqual(IDEA);
  });

  it('returns error, never a number, when the service fails or answers wrongly', async () => {
    vi.stubEnv('ML_SERVICE_URL', 'http://ml.test');
    fakeService(500, {});
    expect(await run()).toEqual({ status: 'error', survival_probability: null });
    fakeService(200, { survival_probability: 7 });
    expect(await run()).toEqual({ status: 'error', survival_probability: null });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await run()).toEqual({ status: 'error', survival_probability: null });
  });
});
