#!/usr/bin/env node
// Loads the coach's knowledge cards (server/knowledge/cards/**/*.md) into the
// coach_knowledge table, which the coach's search_knowledge tool queries.
//
// The files are the source of truth and the table follows them, so a run is
// safe to repeat:
//   - a new card is embedded and inserted;
//   - a card whose file changed (or whose embedding model changed) is
//     re-embedded and updated in place, by id;
//   - an unchanged card is skipped — no OpenAI call, no write;
//   - a row whose file is gone is deleted.
// Every card is read and checked before anything is sent or written: one bad
// card stops the run with its file name.
//
// Writes to whatever database server/.env points at — locally that is the
// production one. Needs migration 1758000000023 applied first.
//
// Usage (from server/):
//   npm run knowledge:ingest               # sync the table with the files
//   npm run knowledge:ingest -- --dry-run  # show what would change; no OpenAI call, no write
const { pool } = require('../db');
const knowledge = require('../services/coachKnowledge');
const knowledgeRepo = require('../repositories/coachKnowledge');

// Cards are about 600 tokens each; 50 keeps one request far below the
// embeddings endpoint's per-request token limit.
const EMBED_BATCH = 50;

/** Ids must be unique and every `related` must point at a card that exists. */
function findProblems(cards) {
  const problems = [];
  const fileById = new Map();
  for (const card of cards) {
    if (fileById.has(card.id)) problems.push(`id "${card.id}" is used by ${fileById.get(card.id)} and ${card.file}`);
    fileById.set(card.id, card.file);
  }
  for (const card of cards) {
    for (const related of card.related) {
      if (!fileById.has(related)) problems.push(`${card.file}: related card "${related}" does not exist`);
    }
  }
  return problems;
}

/**
 * What a run has to do, given the cards on disk and the hashes in the table.
 * @param {object[]} cards - from readCards()
 * @param {Map<string, string>} storedHashes - card id → content_hash in the table
 */
function planIngest(cards, storedHashes) {
  const withHash = cards.map((card) => ({ card, contentHash: knowledge.contentHash(card.raw) }));
  const ids = new Set(cards.map((card) => card.id));
  return {
    added: withHash.filter(({ card }) => !storedHashes.has(card.id)),
    changed: withHash.filter(({ card, contentHash }) => storedHashes.has(card.id) && storedHashes.get(card.id) !== contentHash),
    unchanged: withHash.filter(({ card, contentHash }) => storedHashes.get(card.id) === contentHash).length,
    removed: [...storedHashes.keys()].filter((id) => !ids.has(id)),
  };
}

const say = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const cards = knowledge.readCards();
  const problems = findProblems(cards);
  if (problems.length > 0) throw new Error(`Cards need fixing before ingest:\n- ${problems.join('\n- ')}`);

  const plan = planIngest(cards, await knowledgeRepo.listHashes());
  const toWrite = [...plan.added, ...plan.changed];
  say(`${cards.length} cards on disk: ${plan.added.length} new, ${plan.changed.length} changed, ${plan.unchanged} unchanged, ${plan.removed.length} to remove`);
  for (const { card } of plan.added) say(`  + ${card.id}`);
  for (const { card } of plan.changed) say(`  ~ ${card.id}`);
  for (const id of plan.removed) say(`  - ${id}`);
  if (dryRun) {
    say('Dry run: nothing embedded, nothing written.');
    return;
  }

  for (let start = 0; start < toWrite.length; start += EMBED_BATCH) {
    const batch = toWrite.slice(start, start + EMBED_BATCH);
    const embeddings = await knowledge.embedTexts(batch.map(({ card }) => knowledge.embeddingText(card)));
    for (const [i, { card, contentHash }] of batch.entries()) {
      await knowledgeRepo.upsertCard(card, { contentHash, embedding: embeddings[i] });
    }
    say(`  embedded and saved ${Math.min(start + EMBED_BATCH, toWrite.length)}/${toWrite.length}`);
  }
  const removed = await knowledgeRepo.deleteCards(plan.removed);
  say(`Done: ${toWrite.length} written, ${removed} removed (model ${knowledge.EMBEDDING_MODEL}).`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { findProblems, planIngest };
