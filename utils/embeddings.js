import axios from 'axios';

const PROVIDER = (process.env.EMBEDDING_PROVIDER || 'voyage').toLowerCase();
const MODEL = process.env.EMBEDDING_MODEL || 'voyage-3-large';
const DIM = parseInt(process.env.EMBEDDING_DIM) || 1024;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_URL = process.env.VOYAGE_URL || 'https://api.voyageai.com/v1/embeddings';
const GENERIC_URL = process.env.EMBEDDING_URL;
const GENERIC_KEY = process.env.EMBEDDING_API_KEY;

export const EMBEDDING_DIM = DIM;

export async function embedQuery(text) {
  const input = (text || '').trim();
  if (!input) throw new Error('Empty query');

  if (PROVIDER === 'voyage') {
    if (!VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY not set');
    const { data } = await axios.post(
      VOYAGE_URL,
      { input: [input], model: MODEL, input_type: 'query' },
      {
        headers: {
          Authorization: `Bearer ${VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error('Voyage returned no embedding');
    if (vec.length !== DIM) {
      throw new Error(`Embedding dim mismatch: got ${vec.length}, expected ${DIM}`);
    }
    return vec;
  }

  if (PROVIDER === 'generic') {
    if (!GENERIC_URL) throw new Error('EMBEDDING_URL not set');
    const headers = { 'Content-Type': 'application/json' };
    if (GENERIC_KEY) headers.Authorization = `Bearer ${GENERIC_KEY}`;
    const { data } = await axios.post(
      GENERIC_URL,
      { input, model: MODEL },
      { headers, timeout: 15000 }
    );
    const vec = data?.embedding || data?.data?.[0]?.embedding || data?.embeddings?.[0];
    if (!Array.isArray(vec)) throw new Error('Generic provider returned no embedding');
    return vec;
  }

  throw new Error(`Unknown EMBEDDING_PROVIDER: ${PROVIDER}`);
}

export function toPgVectorLiteral(vec) {
  return `[${vec.join(',')}]`;
}
