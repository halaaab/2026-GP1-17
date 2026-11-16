// Tests for Task 9, the monthly re-check (test plan TC-9.1 to TC-9.4). Fake pages and a fake AI: no Tavily,
// no OpenAI, no database. The real run is `npm run recheck:startups` (see the test cases).
import { describe, expect, it, vi } from 'vitest';
import { recheckStartups, startupsDue, type StartupToRecheck } from '../../src/mastra/lib/recheck-startups';
import type { ReadPages } from '../../src/mastra/lib/validate-candidate';

const NOW = new Date('2026-11-14T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const row = (id: string, name: string, validated_at: string | null): StartupToRecheck => ({ startup_id: id, startup_name: name, startup_name_ar: null, website: `https://${name.toLowerCase()}.sa`, validated_at });

describe('which startups are due', () => {
  const rows = [row('ST_073', '1pass', null), row('ST_291', 'Aajil', daysAgo(10)), row('ST_489', 'Bayut', daysAgo(100))];

  it('TC-9.1 and TC-9.3: never checked, or checked over 90 days ago, is due', () => {
    expect(startupsDue(rows, NOW).due.map((r) => r.startup_id)).toEqual(['ST_073', 'ST_489']);
  });

  it('TC-9.2: checked in the last 90 days is skipped', () => {
    expect(startupsDue(rows, NOW).skipped.map((r) => r.startup_id)).toEqual(['ST_291']);
  });

  it('--ids limits the run to those startups', () => {
    expect(startupsDue(rows, NOW, { ids: ['ST_073', 'ST_291'] })).toMatchObject({ due: [{ startup_id: 'ST_073' }], skipped: [{ startup_id: 'ST_291' }] });
  });
});

describe('the re-check', () => {
  const read: ReadPages = async (urls) => ({
    pages: urls
      .filter((u) => !u.endsWith('/ar'))
      .map((url) => ({ url: url.replace(/\/$/, ''), text: url.includes('shgardi') ? 'Shgardi has closed. © 2025 Shgardi' : `${url} info@${new URL(url).host} © 2026 Order now`, about_url: null, about_text: null })),
    failed: [],
    tavily_calls: 1,
  });
  const askAi = vi.fn(async (name: string) =>
    name === 'Shgardi'
      ? { offering: [], blocking: [{ signal: 'closed or discontinued' as const, quote: 'Shgardi has closed', page: 1 }], dated: [], saudi_address: [] }
      : { offering: [{ signal: 'sign up, download or order' as const, quote: 'Order now', page: 1 }], blocking: [], dated: [], saudi_address: [] },
  );

  it('TC-9.4: a closed startup is saved as fail (so the search leaves it out); an active one as pass', async () => {
    const save = vi.fn();
    const out = await recheckStartups([row('ST_073', '1pass', null), row('ST_999', 'Shgardi', null)], { read, askAi, save }, undefined, NOW);
    expect(out.lines.map((l) => [l.name, l.evidence_status, l.saved_as])).toEqual([
      ['1pass', 'likely', 'pass'],
      ['Shgardi', 'unconfirmed', 'fail'],
    ]);
    expect(save).toHaveBeenCalledWith('ST_999', { validation_status: 'fail', evidence_status: null, validated_at: NOW.toISOString() });
  });

  it('a site that did not answer is "not saved", so it stays due for the next run (Dinar, 15 Nov 2026)', async () => {
    const save = vi.fn();
    const nothing: ReadPages = async (urls) => ({ pages: [], failed: urls.map((url) => ({ url })), tavily_calls: 1 });
    const readRaw = async (url: string) => ({ status: 'down' as const, url, reason: 'no answer' });
    const out = await recheckStartups([row('ST_181', 'Dinar', null)], { read: nothing, askAi, readRaw, save }, undefined, NOW);
    expect(out.lines[0]).toMatchObject({ evidence_status: 'unconfirmed', saved_as: 'not saved' });
    expect(save).not.toHaveBeenCalled();
  });

  it('checks 10 startups per batch', async () => {
    const calls: number[] = [];
    const counting: ReadPages = async (urls, o) => (calls.push(urls.length), read(urls, o));
    const many = Array.from({ length: 23 }, (_, i) => row(`ST_${i}`, `Co${i}`, null));
    const out = await recheckStartups(many, { read: counting, askAi, save: async () => {} }, undefined, NOW);
    expect(out.lines).toHaveLength(23);
    expect(calls).toEqual([20, 20, 6]); // homepage + Arabic page for 10, 10 and 3 startups
  });
});
