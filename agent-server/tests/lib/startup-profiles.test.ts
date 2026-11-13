// Tests for Task 1, profiles and embeddings (test plan TC-1.4 and TC-1.6). The model, the embedding and the
// database are fakes: nothing is sent or saved. The real run is checked in Supabase (TC-1.1 to TC-1.3, TC-1.5).
import { describe, expect, it, vi } from 'vitest';
import { hasBothLanguages, profileAll, profileStartup, startupsToDo, type ProfileDeps } from '../../src/mastra/lib/startup-profiles';
import type { IdeaProfile } from '../../src/mastra/schemas/competitor';

const profile = (en: string[], ar: string[]): IdeaProfile => ({
  problem: { value: 'Access to many gyms is costly.', origin: 'inferred' },
  customer: { value: 'People who exercise', origin: 'inferred' },
  offering: { value: 'One subscription for many gyms', origin: 'stated' },
  market: { value: 'Saudi Arabia', origin: 'stated' },
  sector: { isic_section: null, isic_division: null },
  business_model: null,
  keywords_en: en,
  keywords_ar: ar,
});
const GOOD = profile(['gym subscription'], ['اشتراك نوادي رياضية']);

function fakes(answers: IdeaProfile[]) {
  const saved = new Map<string, string>();
  const deps: ProfileDeps = {
    buildProfile: vi.fn(async () => answers.shift() ?? GOOD),
    toText: (p) => `Offering: ${p.offering.value}\nKeywords: ${p.keywords_en.join(', ')}`,
    embed: vi.fn(async () => [0.1, 0.2]),
    save: vi.fn(async (id, row) => {
      saved.set(id, row.profile_text);
    }),
  };
  return { deps, saved };
}

const startup = { startup_id: 'ST_073', startup_description: '1 subscription that covers 400+ gyms' };

describe('TC-1.4: keywords in both Arabic and English', () => {
  it('needs at least one English and one Arabic keyword', () => {
    expect(hasBothLanguages(GOOD)).toBe(true);
    expect(hasBothLanguages(profile(['gym'], []))).toBe(false);
    expect(hasBothLanguages(profile([], ['نادي']))).toBe(false);
    expect(hasBothLanguages(profile(['gym'], ['gym']))).toBe(false); // "Arabic" keyword written in English letters
  });

  it('saves a good profile with its embedding', async () => {
    const { deps, saved } = fakes([GOOD]);
    const result = await profileStartup(startup, deps);
    expect(result).toMatchObject({ status: 'saved', tries: 1 });
    expect(saved.get('ST_073')).toContain('One subscription for many gyms');
  });

  it('tries once more when a language is missing', async () => {
    const { deps } = fakes([profile(['gym'], []), GOOD]);
    expect(await profileStartup(startup, deps)).toMatchObject({ status: 'saved', tries: 2 });
  });

  it('after two tries without both languages, reports the startup and saves nothing', async () => {
    const { deps, saved } = fakes([profile(['gym'], []), profile(['gym'], [])]);
    const result = await profileStartup(startup, deps);
    expect(result).toMatchObject({ status: 'failed', reason: 'the profile has no English or no Arabic keyword' });
    expect(saved.size).toBe(0);
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it('a startup with no description is reported, never sent to the model', async () => {
    const { deps } = fakes([]);
    expect(await profileStartup({ startup_id: 'ST_999', startup_description: ' ' }, deps)).toMatchObject({ status: 'failed', reason: 'no description' });
    expect(deps.buildProfile).not.toHaveBeenCalled();
  });

  it('a failure from OpenAI or Supabase is reported, and the other startups still run', async () => {
    const { deps, saved } = fakes([]);
    deps.embed = vi.fn().mockRejectedValueOnce(new Error('429 busy')).mockRejectedValueOnce(new Error('429 busy')).mockResolvedValue([0.1]);
    const results = await profileAll([startup, { startup_id: 'ST_291', startup_description: 'Buy materials now, pay later' }], deps, 1);
    expect(results.map((r) => r.status)).toEqual(['failed', 'saved']);
    expect([...saved.keys()]).toEqual(['ST_291']);
  });
});

describe('TC-1.6: running twice causes no harm', () => {
  const list = [
    { startup_id: 'ST_073', startup_description: 'gyms', profile_text: 'Offering: gyms' },
    { startup_id: 'ST_291', startup_description: 'materials', profile_text: null },
  ];

  it('skips startups that already have a profile', () => {
    const { todo, skipped } = startupsToDo(list);
    expect(todo.map((s) => s.startup_id)).toEqual(['ST_291']);
    expect(skipped.map((s) => s.startup_id)).toEqual(['ST_073']);
  });

  it('redoes a startup only when it is named on purpose, or with --force', () => {
    expect(startupsToDo(list, { ids: ['ST_073'] }).todo.map((s) => s.startup_id)).toEqual(['ST_073']);
    expect(startupsToDo(list, { force: true }).todo).toHaveLength(2);
  });

  it('a second run right after the first does nothing', () => {
    const afterFirstRun = list.map((s) => ({ ...s, profile_text: s.profile_text ?? 'Offering: materials' }));
    expect(startupsToDo(afterFirstRun).todo).toEqual([]);
  });
});
