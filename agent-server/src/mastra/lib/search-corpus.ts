// Task 2: finds the 15 startups in Darb's list closest to an idea (the shortlist the judge reads).
// Logic approved by Hala on 13 Nov 2026; design: Darb_Competitor_Agent_Design §3 ("cosine similarity in
// pgvector plus keyword search"). The shortlist only orders the list: it never decides who is a competitor.
//
//   1. The idea's profile becomes a vector, with the same model as the startups (Task 1).
//   2. Two rankings: A. by meaning (cosine similarity, in Supabase); B. by keywords (English and Arabic).
//   3. The two are combined fairly with Reciprocal Rank Fusion: near the top of either list moves a startup up,
//      near the top of both moves it up most.
//   4. The 15 closest are kept. Startups that failed the validity re-check (Task 9) never appear.
//   5. Same idea, same result (design §4, §12): with an idea_id, the idea's profile and vector are saved the
//      first time (startup_ideas.profile_text and .embedding, migration 0037) and reused every time after.
import type { Candidate, IdeaProfile } from '../schemas/competitor';
import { cleanLink, siteOf } from './identify-candidates';

export const SHORTLIST_SIZE = 15;
// The usual constant of Reciprocal Rank Fusion: it keeps one list from dominating the other.
const RRF_K = 60;

export type CorpusRow = {
  startup_id: string;
  startup_name: string;
  startup_name_ar: string | null;
  startup_description: string | null;
  profile_text: string;
  website: string | null;
  ecosystemsa_profile_url: string | null;
  similarity: number;
};

export type ShortlistEntry = {
  rank: number;
  startup_id: string;
  name: string;
  similarity: number; // meaning, 0 to 1
  keyword_matches: string[]; // keyword words the idea and the startup share
  meaning_rank: number;
  keyword_rank: number | null; // null when no keyword is shared
};

export type SearchCorpusOutput = {
  idea_profile_text: string;
  reused_saved_profile: boolean; // true when the idea's saved profile and vector were used
  shortlist: ShortlistEntry[];
  candidates: Candidate[];
};

export type SearchDeps = {
  embed: (text: string) => Promise<number[]>;
  searchByVector: (vector: number[]) => Promise<CorpusRow[]>;
};

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

// Words too common to show that two businesses are alike.
const COMMON = new Set([
  'and', 'for', 'the', 'with', 'app', 'apps', 'platform', 'platforms', 'online', 'digital', 'services', 'service', 'solutions',
  'solution', 'saudi', 'arabia', 'business', 'businesses', 'management', 'technology', 'mobile', 'application', 'system', 'systems',
  'منصة', 'تطبيق', 'خدمات', 'حلول', 'السعودية', 'السعوديه', 'إدارة', 'اداره', 'ادارة', 'تقنية', 'تقنيه', 'تكنولوجيا', 'الأعمال', 'الاعمال',
  'رقمية', 'رقميه', 'الإنترنت', 'الانترنت', 'عبر', 'موبايل',
]);

// Lowercase words of 3+ letters, Arabic letter forms unified and "ال" removed, common words dropped.
export function keywordWords(keywords: string[]): Set<string> {
  const words = new Set<string>();
  for (const phrase of keywords) {
    for (let w of phrase
      .toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .split(/[^a-z0-9؀-ۿ]+/)) {
      if (COMMON.has(w)) continue;
      if (w.startsWith('ال') && w.length > 4) w = w.slice(2);
      if (w.length >= 3 && !COMMON.has(w)) words.add(w);
    }
  }
  return words;
}

// The keywords written at the end of a profile_text (Task 1): "Keywords: …" and "الكلمات المفتاحية: …".
export function keywordsOfProfileText(profileText: string): string[] {
  const lines = profileText.split('\n');
  const en = lines.find((l) => l.startsWith('Keywords:'))?.slice('Keywords:'.length) ?? '';
  const ar = lines.find((l) => l.startsWith('الكلمات المفتاحية:'))?.slice('الكلمات المفتاحية:'.length) ?? '';
  return [...en.split(','), ...ar.split('،')].map((k) => k.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

export function rankStartups(rows: CorpusRow[], ideaKeywords: string[], size = SHORTLIST_SIZE): ShortlistEntry[] {
  const ideaWords = keywordWords(ideaKeywords);

  // A. By meaning: Supabase already returns the rows from closest to farthest; ties keep a fixed order.
  const byMeaning = [...rows].sort((a, b) => b.similarity - a.similarity || a.startup_id.localeCompare(b.startup_id));
  const meaningRank = new Map(byMeaning.map((r, i) => [r.startup_id, i + 1]));

  // B. By keywords: how many keyword words the startup shares with the idea (0 means no keyword rank).
  const matches = new Map(rows.map((r) => [r.startup_id, [...keywordWords(keywordsOfProfileText(r.profile_text))].filter((w) => ideaWords.has(w))]));
  const byKeywords = rows
    .filter((r) => matches.get(r.startup_id)!.length > 0)
    .sort((a, b) => matches.get(b.startup_id)!.length - matches.get(a.startup_id)!.length || meaningRank.get(a.startup_id)! - meaningRank.get(b.startup_id)!);
  const keywordRank = new Map(byKeywords.map((r, i) => [r.startup_id, i + 1]));

  // Reciprocal Rank Fusion.
  const fused = (id: string) => 1 / (RRF_K + meaningRank.get(id)!) + (keywordRank.has(id) ? 1 / (RRF_K + keywordRank.get(id)!) : 0);
  const ordered = [...rows].sort((a, b) => fused(b.startup_id) - fused(a.startup_id) || a.startup_id.localeCompare(b.startup_id));

  return ordered.slice(0, size).map((r, i) => ({
    rank: i + 1,
    startup_id: r.startup_id,
    name: r.startup_name,
    similarity: Math.round(r.similarity * 1000) / 1000,
    keyword_matches: matches.get(r.startup_id)!,
    meaning_rank: meaningRank.get(r.startup_id)!,
    keyword_rank: keywordRank.get(r.startup_id) ?? null,
  }));
}

// The first sentence of a description (at most 200 characters), or null.
export function firstSentence(text: string | null): string | null {
  const t = text?.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const end = t.search(/[.!?؟](\s|$)/);
  const one = end >= 0 ? t.slice(0, end + 1) : t;
  return one.length <= 200 ? one : `${one.slice(0, 197).replace(/\s+\S*$/, '')}…`;
}

// A startup from Darb's list in the shared candidate format, with its profile and description as evidence.
export function corpusCandidate(row: CorpusRow, now: Date): Candidate {
  const website = row.website ? cleanLink(row.website) : null;
  const sources: Candidate['sources'] = [];
  if (website) sources.push({ url: website, source_type: 'official_site', accessed_at: now.toISOString() });
  const profileUrl = row.ecosystemsa_profile_url ? cleanLink(row.ecosystemsa_profile_url) : null;
  if (profileUrl) sources.push({ url: profileUrl, source_type: 'ecosystem', accessed_at: now.toISOString() });
  const arabicName = row.startup_name_ar?.trim();
  return {
    candidate_key: `corpus:${row.startup_id}`,
    source_type: 'corpus',
    startup_id: row.startup_id,
    name: row.startup_name,
    name_aliases: arabicName && arabicName !== row.startup_name ? [arabicName] : [],
    website,
    domain: website ? siteOf(website) : null,
    evidence_text: [row.profile_text, row.startup_description ? `Description: ${row.startup_description}` : ''].filter(Boolean).join('\n\n'),
    // Shown on the competitor card: the first sentence of its description in Darb's list (Hala, 16 Nov 2026).
    description: firstSentence(row.startup_description),
    sources,
  };
}

export async function searchCorpus(profile: IdeaProfile, toText: (p: IdeaProfile) => string, deps: SearchDeps, now = new Date()): Promise<SearchCorpusOutput> {
  const idea_profile_text = toText(profile);
  return searchWithProfileText(idea_profile_text, await deps.embed(idea_profile_text), false, deps, now);
}

// The search itself, from a profile text and its vector. The keywords are read from the profile text,
// so a saved profile gives exactly the same search as the first time.
async function searchWithProfileText(idea_profile_text: string, vector: number[], reused: boolean, deps: SearchDeps, now: Date): Promise<SearchCorpusOutput> {
  const rows = await deps.searchByVector(vector);
  const shortlist = rankStartups(rows, keywordsOfProfileText(idea_profile_text));
  const byId = new Map(rows.map((r) => [r.startup_id, r]));
  return { idea_profile_text, reused_saved_profile: reused, shortlist, candidates: shortlist.map((s) => corpusCandidate(byId.get(s.startup_id)!, now)) };
}

// What the search needs to save and reuse an idea's profile (startup_ideas, migration 0037).
export type SavedIdeaDeps = SearchDeps & {
  buildProfile: (ideaText: string) => Promise<IdeaProfile>;
  toText: (p: IdeaProfile) => string;
  loadSaved: (ideaId: string) => Promise<{ profile_text: string | null; embedding: number[] | null } | null>;
  save: (ideaId: string, row: { profile_text: string; embedding: number[] }) => Promise<void>;
};

// Searches for an idea. With an idea_id: reuses its saved profile and vector, or makes, saves and uses them.
// Without one: makes the profile from the text (or uses the profile given) and saves nothing.
export async function searchForIdea(
  input: { idea_id?: string; idea_text?: string; idea_profile?: IdeaProfile },
  deps: SavedIdeaDeps,
  now = new Date(),
): Promise<SearchCorpusOutput> {
  if (input.idea_id) {
    const saved = await deps.loadSaved(input.idea_id);
    if (saved?.profile_text && saved.embedding?.length) return searchWithProfileText(saved.profile_text, saved.embedding, true, deps, now);
  }
  const profile = input.idea_profile ?? (input.idea_text?.trim() ? await deps.buildProfile(input.idea_text) : null);
  if (!profile) throw new Error('Give idea_text or idea_profile (this idea has no saved profile yet).');
  const profileText = deps.toText(profile);
  const vector = await deps.embed(profileText);
  if (input.idea_id) await deps.save(input.idea_id, { profile_text: profileText, embedding: vector });
  return searchWithProfileText(profileText, vector, false, deps, now);
}
