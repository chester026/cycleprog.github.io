#!/usr/bin/env node
// Checks how well search_knowledge finds the right cards, after an ingest.
//
// Runs every question in knowledge/eval-questions.json through the same
// search the coach uses, twice: as the rider would ask it (`question`, mostly
// Russian) and as the coach is told to phrase it (`query`, English). For each
// it prints the top cards with their similarity and whether a card from
// `expect` was found. The gap between the two columns shows what the
// "query in English" rule in the system prompt is worth.
//
// A question with an empty `expect` is a control: nothing in the base answers
// it, so every hit should fall below MIN_SIMILARITY. The similarities printed
// here are what that threshold (services/coachKnowledge.js) is tuned from.
//
// Read-only: one embeddings call, SELECTs only.
//
// Usage (from server/):  npm run knowledge:eval
const { pool } = require('../db');
const knowledge = require('../services/coachKnowledge');
const knowledgeRepo = require('../repositories/coachKnowledge');
const questions = require('../knowledge/eval-questions.json');

const TOP = 4;
const say = (line = '') => process.stdout.write(`${line}\n`);

function report(label, text, hits, expect) {
  say(`  ${label}: ${text}`);
  for (const hit of hits) {
    const expected = expect.includes(hit.id) ? '✓' : ' ';
    const cut = hit.similarity < knowledge.MIN_SIMILARITY ? '  (below threshold — not returned)' : '';
    say(`    ${expected} ${hit.similarity.toFixed(3)}  ${hit.id}${cut}`);
  }
}

/** For a control (empty `expect`) a pass is "nothing returned"; otherwise an expected card at rank 1 / in the top. */
function score(hits, expect) {
  const returned = hits.filter((hit) => hit.similarity >= knowledge.MIN_SIMILARITY);
  if (expect.length === 0) return { top1: returned.length === 0, top: returned.length === 0 };
  return { top1: expect.includes(returned[0]?.id), top: returned.some((hit) => expect.includes(hit.id)) };
}

async function main() {
  const embeddings = await knowledge.embedTexts(questions.flatMap(({ question, query }) => [question, query]));
  const totals = { question: { top1: 0, top: 0 }, query: { top1: 0, top: 0 } };

  for (const [i, { question, query, expect }] of questions.entries()) {
    say(`${i + 1}. expect: ${expect.join(', ') || '(nothing — control)'}`);
    for (const [kind, text, embedding] of [['question', question, embeddings[2 * i]], ['query', query, embeddings[2 * i + 1]]]) {
      const hits = await knowledgeRepo.searchByEmbedding(embedding, { limit: TOP });
      report(kind === 'question' ? 'as asked ' : 'as query ', text, hits, expect);
      const result = score(hits, expect);
      totals[kind].top1 += Number(result.top1);
      totals[kind].top += Number(result.top);
    }
    say();
  }

  const n = questions.length;
  say(`Expected card first / in the top ${TOP} (threshold ${knowledge.MIN_SIMILARITY}):`);
  say(`  as asked (rider's wording): ${totals.question.top1}/${n} / ${totals.question.top}/${n}`);
  say(`  as query (English):         ${totals.query.top1}/${n} / ${totals.query.top}/${n}`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
