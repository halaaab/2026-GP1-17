// Shared helper: turns text into embeddings with OpenAI, using the one EMBEDDING_MODEL for everything.
import { API_TIMEOUT_MS } from '../config/limits';
import { EMBEDDING_MODEL } from '../config/models';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY must be set in .env');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings failed with status ${response.status}`);

  const body = (await response.json()) as { data: { index: number; embedding: number[] }[] };
  // OpenAI may return them in any order, so they are put back in the order they were sent.
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

// pgvector reads a vector as text like "[0.1,0.2,...]".
export const toPgVector = (embedding: number[]) => JSON.stringify(embedding);
