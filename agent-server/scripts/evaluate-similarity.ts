// Script: measures the similarity search and its thresholds on a labelled test set.
// Run with: npm run eval:similarity                       (uses tests/data/similarity-eval.csv)
//           npm run eval:similarity -- path/to/other.csv  (columns: test_id, kind, language, query_text, expected_startup, note)
// "related" rows name the startup a founder with that idea should find; "unrelated" rows are ideas the dataset
// should not cover. Each query is searched exactly as similarity_search does (English, same embedding model),
// but with no threshold, so every raw cosine similarity can be seen. Results are saved to tests/results/.
import { readFileSync, writeFileSync } from 'node:fs';
import { MAX_COMPETITORS, SIMILARITY_THRESHOLD, WEB_SEARCH_THRESHOLD } from '../src/mastra/config/models';
import { embedTexts, toPgVector } from '../src/mastra/lib/embeddings';
import { toEnglish } from '../src/mastra/lib/startup-text';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');
const file = process.argv[2] ?? 'tests/data/similarity-eval.csv';
const K = 10;

type Row = { test_id: string; kind: 'related' | 'unrelated'; language: string; query_text: string; expected_startup: string; note: string };
type Match = { startup_id: string; startup_name: string; similarity: number };

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) (cells.push(cell), (cell = ''));
      else cell += ch;
    }
    cells.push(cell);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])) as Row;
  });
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

async function main() {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const supabase = getSupabase();

  // The expected startups, by name.
  const names = rows.filter((r) => r.kind === 'related').map((r) => r.expected_startup);
  const { data: startups, error } = await supabase.from('startups').select('startup_id, startup_name').in('startup_name', names);
  if (error) throw error;
  const idOf = new Map((startups ?? []).map((s) => [s.startup_name as string, s.startup_id as string]));
  const missing = names.filter((n) => !idOf.has(n));
  if (missing.length) console.warn(`Not found in the dataset (check the spelling): ${missing.join(', ')}`);

  // Search every query the way similarity_search does, with no threshold.
  const english = await Promise.all(rows.map((r) => toEnglish(r.query_text)));
  const embeddings = await embedTexts(english);
  const results: { row: Row; english: string; matches: Match[]; rank: number | null; score: number | null }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const { data, error: rpcError } = await supabase.rpc('match_startups', { query_embedding: toPgVector(embeddings[i]), match_count: K, min_similarity: 0 });
    if (rpcError) throw rpcError;
    const matches = (data as Match[]).map((m) => ({ startup_id: m.startup_id, startup_name: m.startup_name, similarity: Number(m.similarity) }));
    const expectedId = idOf.get(rows[i].expected_startup);
    const at = expectedId ? matches.findIndex((m) => m.startup_id === expectedId) : -1;
    results.push({ row: rows[i], english: english[i], matches, rank: at >= 0 ? at + 1 : null, score: at >= 0 ? matches[at].similarity : null });
  }

  const related = results.filter((r) => r.row.kind === 'related' && idOf.has(r.row.expected_startup));
  const unrelated = results.filter((r) => r.row.kind === 'unrelated');

  // 1. Does the right startup come back?
  const hit = (k: number) => related.filter((r) => r.rank !== null && r.rank <= k).length;
  const mrr = related.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / (related.length || 1);
  console.log(`\n=== Finding the right startup (${related.length} founder-style descriptions)`);
  console.log(`Top 1: ${pct(hit(1), related.length)} · Top 3: ${pct(hit(3), related.length)} · Top 10: ${pct(hit(10), related.length)} · MRR: ${mrr.toFixed(2)}`);
  for (const lang of ['en', 'ar']) {
    const subset = related.filter((r) => r.row.language === lang);
    console.log(`  ${lang === 'ar' ? 'Arabic ' : 'English'}: top 3 ${pct(subset.filter((r) => r.rank !== null && r.rank <= 3).length, subset.length)} of ${subset.length}`);
  }

  // 2. What scores do right answers and unrelated ideas get?
  const correctScores = related.map((r) => r.score).filter((s): s is number => s !== null);
  const unrelatedBest = unrelated.map((r) => r.matches[0]?.similarity ?? 0);
  const relatedBest = related.map((r) => r.matches[0]?.similarity ?? 0);
  console.log(`\n=== Scores (cosine similarity)`);
  console.log(`Right startup's score:        min ${Math.min(...correctScores).toFixed(3)} · median ${median(correctScores).toFixed(3)} · max ${Math.max(...correctScores).toFixed(3)}`);
  console.log(`Best score, related ideas:    min ${Math.min(...relatedBest).toFixed(3)} · median ${median(relatedBest).toFixed(3)}`);
  console.log(`Best score, unrelated ideas:  min ${Math.min(...unrelatedBest).toFixed(3)} · median ${median(unrelatedBest).toFixed(3)} · max ${Math.max(...unrelatedBest).toFixed(3)}`);

  // 3. Every threshold: right answers kept vs unrelated ideas that still get "competitors".
  console.log(`\n=== Thresholds (now: floor ${SIMILARITY_THRESHOLD}, web ${WEB_SEARCH_THRESHOLD})`);
  console.log('threshold | right startup kept (top 3 and above it) | unrelated ideas still given a competitor | related ideas sent to the web');
  for (let t = 0.3; t <= 0.601; t += 0.05) {
    const kept = related.filter((r) => r.rank !== null && r.rank <= 3 && (r.score ?? 0) >= t).length;
    const falseAlarm = unrelatedBest.filter((s) => s >= t).length;
    const toWeb = related.filter((r) => r.matches.filter((m) => m.similarity >= t).length < MAX_COMPETITORS).length;
    console.log(`  ${t.toFixed(2)}    | ${pct(kept, related.length).padStart(4)} (${kept}/${related.length})                        | ${pct(falseAlarm, unrelated.length).padStart(4)} (${falseAlarm}/${unrelated.length})                              | ${pct(toWeb, related.length)}`);
  }

  // 4. The misses, to read by hand.
  const misses = related.filter((r) => r.rank === null || r.rank > 3);
  if (misses.length) {
    console.log(`\n=== Not in the top 3 (${misses.length})`);
    for (const r of misses) {
      console.log(`  ${r.row.test_id} ${r.row.expected_startup}: rank ${r.rank ?? '>10'}${r.score ? ` (${r.score.toFixed(3)})` : ''} · top: ${r.matches.slice(0, 3).map((m) => `${m.startup_name} ${m.similarity.toFixed(3)}`).join(', ')}`);
      console.log(`      "${r.english}"`);
    }
  }
  console.log(`\n=== Best match for each unrelated idea`);
  for (const r of unrelated) console.log(`  ${r.row.test_id} ${r.matches[0]?.similarity.toFixed(3)} ${r.matches[0]?.startup_name}  ← ${r.english}`);

  // 5. Saved per row, for the report.
  const date = new Date().toISOString().slice(0, 10);
  const out = `tests/results/similarity-eval-${date}.csv`;
  const csv = ['test_id,kind,language,query_text,english,expected_startup,rank,score,top1,top1_score,top2,top3']
    .concat(
      results.map((r) =>
        [r.row.test_id, r.row.kind, r.row.language, r.row.query_text, r.english, r.row.expected_startup, r.rank ?? '', r.score?.toFixed(3) ?? '', r.matches[0]?.startup_name ?? '', r.matches[0]?.similarity.toFixed(3) ?? '', r.matches[1]?.startup_name ?? '', r.matches[2]?.startup_name ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    )
    .join('\n');
  writeFileSync(out, csv);
  console.log(`\nSaved: ${out}`);
}

main().catch((error) => {
  console.error('Evaluation failed:', error.message ?? error);
  process.exit(1);
});
