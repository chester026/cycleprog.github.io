// SQL for coach_knowledge — the searchable copy of server/knowledge/cards
// (migration 1758000000023). Written only by scripts/ingest-knowledge.js,
// read by the coach's search_knowledge tool. Not per-user: every rider's
// coach reads the same cards.
const { pool } = require('../db');

// pgvector takes a vector as its text form, '[0.1,0.2,…]'.
const toVector = (embedding) => `[${embedding.join(',')}]`;

/** @returns {Promise<Map<string, string>>} card id → content_hash of what is stored */
async function listHashes() {
  const result = await pool.query('SELECT id, content_hash FROM coach_knowledge');
  return new Map(result.rows.map((row) => [row.id, row.content_hash]));
}

async function upsertCard(card, { contentHash, embedding }) {
  await pool.query(
    `INSERT INTO coach_knowledge (id, section, title, tags, evidence, contested, body, sources, content_hash, embedding, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::vector, NOW())
     ON CONFLICT (id) DO UPDATE SET
       section = EXCLUDED.section, title = EXCLUDED.title, tags = EXCLUDED.tags, evidence = EXCLUDED.evidence,
       contested = EXCLUDED.contested, body = EXCLUDED.body, sources = EXCLUDED.sources,
       content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, updated_at = NOW()`,
    [
      card.id, card.section, card.title, card.tags, card.evidence, card.contested, card.body,
      JSON.stringify(card.sources), contentHash, toVector(embedding),
    ]
  );
}

/** Removes the given cards; returns how many rows went. */
async function deleteCards(ids) {
  if (ids.length === 0) return 0;
  const result = await pool.query('DELETE FROM coach_knowledge WHERE id = ANY($1::text[])', [ids]);
  return result.rowCount;
}

/**
 * The `limit` cards closest in meaning to `embedding`, closest first.
 * `similarity` is cosine similarity (1 = same direction).
 */
async function searchByEmbedding(embedding, { section = null, limit }) {
  const result = await pool.query(
    `SELECT id, section, title, evidence, contested, body, sources,
            1 - (embedding <=> $1::vector) AS similarity
     FROM coach_knowledge
     WHERE ($2::text IS NULL OR section = $2)
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [toVector(embedding), section, limit]
  );
  return result.rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}

module.exports = { listHashes, upsertCard, deleteCards, searchByEmbedding };
