// coach_knowledge on real Postgres with pgvector (migration 1758000000023):
// the upsert the ingest relies on (same id → one row, updated in place), the
// cosine search behind the coach's search_knowledge tool, and removal of
// cards whose file is gone. Embeddings are hand-made unit vectors — no
// OpenAI call; the service's own embeddings call is stubbed.
const { bootstrap } = require('./setup');

const DIMENSIONS = 1536;
// A vector along one axis, optionally leaning towards a second one — enough
// to make cosine distances predictable.
function vector(axis, lean = null) {
  const v = new Array(DIMENSIONS).fill(0);
  v[axis] = 1;
  if (lean) v[lean.axis] = lean.weight;
  return v;
}

const card = (id, section, overrides = {}) => ({
  id,
  section,
  title: `Title of ${id}`,
  tags: ['one', 'two'],
  evidence: 'B',
  contested: false,
  body: `## Summary\nBody of ${id}`,
  sources: [{ ref: 'Author A. Title. Journal. 2020.', doi: '10.1/abc', type: 'rct' }],
  ...overrides,
});

describe('coach knowledge (real Postgres + pgvector)', () => {
  let pool, repo, knowledge, llm;

  beforeAll(async () => {
    ({ pool } = await bootstrap());
    repo = require('../../repositories/coachKnowledge');
    knowledge = require('../../services/coachKnowledge');
    llm = require('../../lib/openaiResponses');
  }, 30000);

  beforeEach(async () => {
    await pool.query('DELETE FROM coach_knowledge');
    await repo.upsertCard(card('nut-carbs', 'nutrition'), { contentHash: 'h1', embedding: vector(0) });
    await repo.upsertCard(card('nut-caffeine', 'nutrition'), { contentHash: 'h2', embedding: vector(0, { axis: 1, weight: 1 }) });
    await repo.upsertCard(card('per-taper', 'periodization'), { contentHash: 'h3', embedding: vector(2) });
  });

  it('upserting the same id again updates the row in place instead of adding one', async () => {
    await repo.upsertCard(
      card('nut-carbs', 'nutrition', { title: 'Carbs, revised', evidence: 'A', contested: true, tags: ['three'] }),
      { contentHash: 'h1-new', embedding: vector(2) }
    );
    const { rows } = await pool.query("SELECT * FROM coach_knowledge WHERE id = 'nut-carbs'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Carbs, revised', evidence: 'A', contested: true, tags: ['three'], content_hash: 'h1-new' });
    expect(rows[0].sources).toEqual([{ ref: 'Author A. Title. Journal. 2020.', doi: '10.1/abc', type: 'rct' }]);
    expect((await repo.listHashes()).get('nut-carbs')).toBe('h1-new');
    // The new embedding is the one searched: the card now sits with the taper card.
    const hits = await repo.searchByEmbedding(vector(2), { limit: 2 });
    expect(hits.map((hit) => hit.id).sort()).toEqual(['nut-carbs', 'per-taper']);
  });

  it('returns the closest cards first with their cosine similarity', async () => {
    const hits = await repo.searchByEmbedding(vector(0), { limit: 3 });
    expect(hits.map((hit) => hit.id)).toEqual(['nut-carbs', 'nut-caffeine', 'per-taper']);
    expect(hits[0].similarity).toBeCloseTo(1, 5);
    expect(hits[1].similarity).toBeCloseTo(Math.SQRT1_2, 5);
    expect(hits[2].similarity).toBeCloseTo(0, 5);
  });

  it('honours the limit and the section filter', async () => {
    expect(await repo.searchByEmbedding(vector(0), { limit: 1 })).toHaveLength(1);
    const hits = await repo.searchByEmbedding(vector(0), { section: 'periodization', limit: 3 });
    expect(hits.map((hit) => hit.id)).toEqual(['per-taper']);
  });

  it('deleteCards removes only the named cards', async () => {
    expect(await repo.deleteCards(['nut-caffeine', 'no-such-card'])).toBe(1);
    expect(await repo.deleteCards([])).toBe(0);
    expect([...(await repo.listHashes()).keys()].sort()).toEqual(['nut-carbs', 'per-taper']);
  });

  it('search() embeds the query and leaves out cards that are not close enough', async () => {
    const realEmbed = llm.embed;
    llm.embed = async () => ({ embeddings: [vector(0)], tokens: 3 });
    try {
      const cards = await knowledge.search({ query: 'carbohydrate per hour' });
      expect(cards.map((c) => c.id)).toEqual(['nut-carbs', 'nut-caffeine']);
      expect(cards[0]).toMatchObject({ section: 'nutrition', evidence: 'B', similarity: 1, sources: ['Author A. Title. Journal. 2020. doi:10.1/abc'] });
      expect(cards[0]).not.toHaveProperty('embedding');
    } finally {
      llm.embed = realEmbed;
    }
  });
});
