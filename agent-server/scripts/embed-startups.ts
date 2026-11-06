// Script: builds each startup's embed_text and embeds it, so similarity_search can find it.
// Run with: npm run embed:startups               (only startups that have no embedding yet)
//           npm run embed:startups -- --rebuild   (rebuilds embed_text for all startups and re-embeds them,
//                                                  e.g. after the text format or the ISIC4 codes change)
// embed_text is English only: description, target market, ISIC4 activity (see lib/startup-text.ts).
import { EMBED_BATCH_SIZE } from '../src/mastra/config/limits';
import { EMBEDDING_MODEL } from '../src/mastra/config/models';
import { embedTexts, toPgVector } from '../src/mastra/lib/embeddings';
import { startupEmbedText } from '../src/mastra/lib/startup-text';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');
const rebuild = process.argv.includes('--rebuild');

async function main() {
  const supabase = getSupabase();

  let query = supabase
    .from('startups')
    .select('startup_id, startup_description, target_market, isic_section, isic_division')
    .order('startup_id');
  if (!rebuild) query = query.is('embedding', null);
  const { data: startups, error } = await query;
  if (error) throw error;

  const missingIsic = startups.filter((s) => !s.isic_division).length;
  console.log(`${startups.length} startups to embed (model: ${EMBEDDING_MODEL}).`);
  if (missingIsic > 0) console.log(`Note: ${missingIsic} have no ISIC4 codes yet, so their text has no activity line.`);

  let done = 0;
  for (let start = 0; start < startups.length; start += EMBED_BATCH_SIZE) {
    const batch = startups.slice(start, start + EMBED_BATCH_SIZE);
    const texts = batch.map(startupEmbedText);
    const embeddings = await embedTexts(texts);

    const embeddedAt = new Date().toISOString();
    for (let i = 0; i < batch.length; i++) {
      const { error: updateError } = await supabase
        .from('startups')
        .update({
          embed_text: texts[i],
          embedding: toPgVector(embeddings[i]),
          embedding_model: EMBEDDING_MODEL,
          embedded_at: embeddedAt,
        })
        .eq('startup_id', batch[i].startup_id);
      if (updateError) throw updateError;
    }

    done += batch.length;
    console.log(`Embedded ${done} of ${startups.length}`);
  }

  const { count } = await supabase.from('startups').select('startup_id', { count: 'exact', head: true }).not('embedding', 'is', null);
  console.log(`Done. ${count} startups now have an embedding.`);
}

main().catch((error) => {
  console.error('Embedding failed:', error.message ?? error);
  process.exit(1);
});
