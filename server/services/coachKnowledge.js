// The coach's knowledge base (server/knowledge/README.md): reading the card
// files, and searching their copy in Postgres by meaning.
//
// The card files are the source of truth. scripts/ingest-knowledge.js turns
// them into coach_knowledge rows with the helpers here; the coach's
// search_knowledge tool (aiCoach.js) calls `search`.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const llm = require('../lib/openaiResponses');
const knowledgeRepo = require('../repositories/coachKnowledge');

const CARDS_DIR = path.join(__dirname, '../knowledge/cards');

// 1536 dimensions — the size of coach_knowledge.embedding. The name is part of
// every card's content hash, so changing it re-embeds the whole base on the
// next ingest (a model of another size also needs a migration).
const EMBEDDING_MODEL = 'text-embedding-3-small';

// The folders of server/knowledge/cards; the `section` filter of the tool.
const SECTIONS = [
  'physiology', 'zones-testing', 'training-intensity-distribution', 'workouts', 'periodization', 'load-data',
  'recovery', 'nutrition', 'strength', 'environment', 'bike-performance', 'race-execution', 'populations',
  'health', 'coaching', 'psychology',
];

const DEFAULT_RESULTS = 4;
const MAX_RESULTS = 6;
// Cards below this cosine similarity are left out, so an off-topic question
// gets an empty result (and the coach says it is reasoning on its own)
// instead of the four least-unrelated cards.
// Tuned on scripts/eval-knowledge.js (2026-11-13, text-embedding-3-small,
// English queries): the expected cards scored 0.48–0.77, an off-topic control
// question topped out at 0.40 and same-word-different-topic noise at 0.43
// ("a cold" → cold-weather cards). Russian queries score 0.2–0.3 lower and
// are not separable from noise at any threshold, which is why the tool
// refuses a non-English query (aiCoach.js) instead of lowering this.
const MIN_SIMILARITY = 0.45;

// These two sections are on every card and say how to hedge and how to talk,
// not what the card is about — in the embedding they would pull every card
// towards the same point.
const SECTIONS_LEFT_OUT_OF_EMBEDDING = new Set(['Limits', 'Coach guidance']);

// Two "sources" in the cards are not publications: they mark a claim as
// coaching practice or as a BikeLab product decision. They stay in the files
// and in the table (the card's evidence grade already says "practice"), but
// are not handed to the coach — the prompt lets it name a card's source when a
// rider asks where something comes from, and these are not something to cite.
const PLACEHOLDER_SOURCE = /^(Coaching practice synthesis|BikeLab product principles)\b/;

const EVIDENCE_GRADES = new Set(['A', 'B', 'C']);
const SCALAR_KEYS = new Set(['id', 'title', 'section', 'evidence', 'contested', 'updated']);
const LIST_KEYS = new Set(['tags', 'populations', 'related']);
const SOURCE_KEYS = new Set(['ref', 'doi', 'type', 'verified', 'note']);

function unquote(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
}

function parseInlineList(value, key) {
  const match = value.trim().match(/^\[(.*)\]$/);
  if (!match) throw new Error(`"${key}" must be an inline list: [a, b]`);
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

// The cards use a fixed subset of YAML (README "Card format"), so this reads
// exactly that subset and throws on anything else — a card that a general
// YAML parser would accept in some unexpected shape must fail the ingest, not
// land in the table half-read.
function parseFrontmatter(text) {
  const meta = { sources: [] };
  let source = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const sourceLine = line.match(/^ {2}(- | {2})([a-z]+): (.*)$/);
    if (sourceLine) {
      const [, lead, key, value] = sourceLine;
      if (!SOURCE_KEYS.has(key)) throw new Error(`unknown source field "${key}"`);
      if (lead === '- ') {
        source = {};
        meta.sources.push(source);
      }
      if (!source) throw new Error(`source field "${key}" before the first "- ref:"`);
      source[key] = unquote(value);
      continue;
    }
    if (line === 'sources:') continue;
    const topLine = line.match(/^([a-z]+): (.*)$/);
    if (!topLine) throw new Error(`cannot read frontmatter line: ${line}`);
    const [, key, value] = topLine;
    if (LIST_KEYS.has(key)) meta[key] = parseInlineList(value, key);
    else if (SCALAR_KEYS.has(key)) meta[key] = unquote(value);
    else throw new Error(`unknown field "${key}"`);
  }
  return meta;
}

/**
 * One card file → the fields stored in coach_knowledge.
 * @param {string} raw - the whole .md file
 * @returns {{id: string, section: string, title: string, tags: string[], evidence: string, contested: boolean,
 *   related: string[], body: string, sources: object[]}}
 */
function parseCard(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('no frontmatter block');
  const meta = parseFrontmatter(match[1]);
  const body = match[2].trim();
  for (const key of ['id', 'title', 'section', 'evidence']) {
    if (!meta[key]) throw new Error(`"${key}" is missing`);
  }
  if (!SECTIONS.includes(meta.section)) throw new Error(`unknown section "${meta.section}"`);
  if (!EVIDENCE_GRADES.has(meta.evidence)) throw new Error(`evidence must be A, B or C, got "${meta.evidence}"`);
  if (!body.includes('## Summary')) throw new Error('no "## Summary" section');
  return {
    id: meta.id,
    section: meta.section,
    title: meta.title,
    tags: meta.tags || [],
    evidence: meta.evidence,
    contested: meta.contested === 'true',
    related: meta.related || [],
    body,
    sources: meta.sources,
  };
}

/** Every card under `dir`, with the file it came from named in any parse error. */
function readCards(dir = CARDS_DIR) {
  const cards = [];
  for (const section of fs.readdirSync(dir).sort()) {
    const sectionDir = path.join(dir, section);
    if (!fs.statSync(sectionDir).isDirectory()) continue;
    for (const file of fs.readdirSync(sectionDir).filter((name) => name.endsWith('.md')).sort()) {
      const raw = fs.readFileSync(path.join(sectionDir, file), 'utf8');
      try {
        cards.push({ ...parseCard(raw), file: `${section}/${file}`, raw });
      } catch (err) {
        throw new Error(`${section}/${file}: ${err.message}`, { cause: err });
      }
    }
  }
  return cards;
}

/** What a card is embedded from: its title, tags and the sections that say what it is about. */
function embeddingText(card) {
  const kept = card.body
    .split(/^(?=## )/m)
    .filter((block) => {
      const heading = block.match(/^## (.*)$/m)?.[1].trim();
      return !SECTIONS_LEFT_OUT_OF_EMBEDDING.has(heading);
    })
    .join('')
    .trim();
  return `${card.title}\nTags: ${card.tags.join(', ')}\n\n${kept}`;
}

/** Changes whenever the file or the embedding model does — the ingest re-embeds on a new hash. */
function contentHash(raw) {
  return crypto.createHash('sha256').update(`${EMBEDDING_MODEL}\n${raw}`).digest('hex');
}

async function embedTexts(texts) {
  const { embeddings } = await llm.embed({ model: EMBEDDING_MODEL, input: texts });
  return embeddings;
}

/**
 * Cards closest in meaning to `query`, best first; empty when nothing is
 * close enough. One embeddings call (a few dozen tokens — not counted against
 * the rider's daily budget; the cards it returns are, as chat input).
 * @param {{query: string, section?: string, k?: number}} options
 */
async function search({ query, section, k = DEFAULT_RESULTS }) {
  const limit = Math.min(Math.max(Math.round(Number(k)) || DEFAULT_RESULTS, 1), MAX_RESULTS);
  const [embedding] = await embedTexts([query]);
  const rows = await knowledgeRepo.searchByEmbedding(embedding, {
    section: SECTIONS.includes(section) ? section : null,
    limit,
  });
  return rows
    .filter((row) => row.similarity >= MIN_SIMILARITY)
    .map((row) => ({
      id: row.id,
      section: row.section,
      title: row.title,
      evidence: row.evidence,
      contested: row.contested,
      similarity: Math.round(row.similarity * 100) / 100,
      body: row.body,
      sources: row.sources
        .filter(({ ref }) => !PLACEHOLDER_SOURCE.test(ref))
        .map(({ ref, doi }) => (doi ? `${ref} doi:${doi}` : ref)),
    }));
}

module.exports = {
  CARDS_DIR, EMBEDDING_MODEL, SECTIONS, MIN_SIMILARITY, MAX_RESULTS,
  parseCard, readCards, embeddingText, contentHash, embedTexts, search,
};
