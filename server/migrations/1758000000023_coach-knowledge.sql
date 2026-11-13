-- The coach's knowledge base as a searchable copy (server/knowledge/README.md).
--
-- The cards in server/knowledge/cards/ are the source of truth; this table is
-- what `search_knowledge` (aiCoach.js) queries by meaning. It is filled and
-- kept in step by `npm run knowledge:ingest` (scripts/ingest-knowledge.js),
-- never edited by hand and never written by the app.
--
-- Needs the pgvector extension. On Render it is available to the database
-- owner; a Postgres without it (plain `postgres:16`) fails here, which is why
-- CI runs on the `pgvector/pgvector` image.
--
-- vector(1536) is the size of OpenAI text-embedding-3-small
-- (services/coachKnowledge.js EMBEDDING_MODEL). A model with another size
-- needs a new migration; a model of the same size only needs a re-ingest,
-- because the model name is part of content_hash.
--
-- No ANN index on purpose: a few hundred rows are scanned exactly in well
-- under a millisecond, and an exact scan has no recall loss.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS coach_knowledge (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  evidence TEXT NOT NULL,
  contested BOOLEAN NOT NULL DEFAULT FALSE,
  body TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
