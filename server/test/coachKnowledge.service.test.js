// The coach's knowledge base without a database: the card files themselves
// (every card must be readable by the ingest), what a card is embedded from,
// the ingest's plan, and `search` with the embeddings call and the repository
// stubbed (property stubs on the already-required modules, as in
// test/aiCoach.memory.test.js). The SQL is covered on real Postgres in
// test/integration/coachKnowledge.test.js.
const fs = require('fs');
const llm = require('../lib/openaiResponses');
const knowledgeRepo = require('../repositories/coachKnowledge');
const knowledge = require('../services/coachKnowledge');
const { findProblems, planIngest } = require('../scripts/ingest-knowledge');
const evalQuestions = require('../knowledge/eval-questions.json');

const CARD = `---
id: tid-04-polarized-model
title: Polarized training — definition and evidence
section: training-intensity-distribution
tags: [polarized, 80-20]
evidence: B
contested: true
populations: [recreational, trained]
related: [tid-05-pyramidal-model]
sources:
  - ref: "Stöggl T, Sperlich B. Polarized training has greater impact. Front Physiol. 2014;5:33."
    doi: 10.3389/fphys.2014.00033
    type: rct
    verified: 2026-11-13
  - ref: "A coaching handbook."
    type: practice
    verified: false
    note: a book
updated: 2026-11-13
---
## Summary
Most training easy, some very hard.

## Key numbers
- About 80% of sessions LOW.

## Limits
Small studies.

## Coach guidance
Do not oversell it.
`;

describe('parseCard', () => {
  it('reads the frontmatter and keeps the body as markdown', () => {
    const card = knowledge.parseCard(CARD);
    expect(card).toMatchObject({
      id: 'tid-04-polarized-model',
      title: 'Polarized training — definition and evidence',
      section: 'training-intensity-distribution',
      tags: ['polarized', '80-20'],
      evidence: 'B',
      contested: true,
      related: ['tid-05-pyramidal-model'],
    });
    expect(card.sources).toEqual([
      { ref: 'Stöggl T, Sperlich B. Polarized training has greater impact. Front Physiol. 2014;5:33.', doi: '10.3389/fphys.2014.00033', type: 'rct', verified: '2026-11-13' },
      { ref: 'A coaching handbook.', type: 'practice', verified: 'false', note: 'a book' },
    ]);
    expect(card.body.startsWith('## Summary')).toBe(true);
    expect(card.body).not.toContain('evidence: B');
  });

  it('is not contested unless the card says so', () => {
    expect(knowledge.parseCard(CARD.replace('contested: true\n', '')).contested).toBe(false);
  });

  it.each([
    ['no frontmatter', '## Summary\ntext', /no frontmatter/],
    ['an unknown field', CARD.replace('evidence: B', 'evidence: B\nauthor: me'), /unknown field "author"/],
    ['an unknown section', CARD.replace('section: training-intensity-distribution', 'section: cooking'), /unknown section/],
    ['a bad evidence grade', CARD.replace('evidence: B', 'evidence: D'), /evidence must be A, B or C/],
    ['a missing id', CARD.replace('id: tid-04-polarized-model\n', ''), /"id" is missing/],
    ['tags that are not an inline list', CARD.replace('tags: [polarized, 80-20]', 'tags: polarized'), /inline list/],
    ['no summary', CARD.replace('## Summary', '## Overview'), /no "## Summary"/],
  ])('rejects %s', (_name, raw, message) => {
    expect(() => knowledge.parseCard(raw)).toThrow(message);
  });
});

describe('the card files', () => {
  const cards = knowledge.readCards();

  it('all parse, each in the folder of its section, with no ingest problems', () => {
    expect(cards.length).toBeGreaterThan(200);
    for (const card of cards) expect(card.file.startsWith(`${card.section}/`)).toBe(true);
    expect(findProblems(cards)).toEqual([]);
  });

  it('SECTIONS (the tool\'s section filter) is exactly the folders on disk', () => {
    const folders = fs.readdirSync(knowledge.CARDS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect([...knowledge.SECTIONS].sort()).toEqual(folders.sort());
  });

  it('the eval questions only expect cards that exist', () => {
    const ids = new Set(cards.map((card) => card.id));
    for (const { expect: expected } of evalQuestions) {
      for (const id of expected) expect(ids.has(id), id).toBe(true);
    }
  });
});

describe('findProblems', () => {
  it('reports a duplicate id and a related card that does not exist', () => {
    const problems = findProblems([
      { id: 'a', file: 'x/a.md', related: ['ghost'] },
      { id: 'a', file: 'x/a2.md', related: [] },
    ]);
    expect(problems).toEqual(['id "a" is used by x/a.md and x/a2.md', 'x/a.md: related card "ghost" does not exist']);
  });
});

describe('embeddingText', () => {
  it('is the title, the tags and the body without Limits and Coach guidance', () => {
    const text = knowledge.embeddingText(knowledge.parseCard(CARD));
    expect(text.startsWith('Polarized training — definition and evidence\nTags: polarized, 80-20\n\n## Summary')).toBe(true);
    expect(text).toContain('About 80% of sessions LOW.');
    expect(text).not.toContain('Small studies.');
    expect(text).not.toContain('Do not oversell it.');
  });
});

describe('planIngest', () => {
  const cards = [
    { id: 'same', raw: 'same text' },
    { id: 'edited', raw: 'new text' },
    { id: 'fresh', raw: 'fresh text' },
  ];
  const stored = new Map([
    ['same', knowledge.contentHash('same text')],
    ['edited', knowledge.contentHash('old text')],
    ['gone', knowledge.contentHash('gone text')],
  ]);

  it('embeds only new and changed cards, skips unchanged ones and removes rows without a file', () => {
    const plan = planIngest(cards, stored);
    expect(plan.added.map(({ card }) => card.id)).toEqual(['fresh']);
    expect(plan.changed.map(({ card }) => card.id)).toEqual(['edited']);
    expect(plan.changed[0].contentHash).toBe(knowledge.contentHash('new text'));
    expect(plan.unchanged).toBe(1);
    expect(plan.removed).toEqual(['gone']);
  });

  it('a second run over the same files has nothing to do', () => {
    const afterFirstRun = new Map(cards.map((card) => [card.id, knowledge.contentHash(card.raw)]));
    const plan = planIngest(cards, afterFirstRun);
    expect([plan.added.length, plan.changed.length, plan.removed.length, plan.unchanged]).toEqual([0, 0, 0, 3]);
  });
});

describe('search', () => {
  const embedMock = vi.fn();
  const searchByEmbeddingMock = vi.fn();
  llm.embed = embedMock;
  knowledgeRepo.searchByEmbedding = searchByEmbeddingMock;

  const row = (id, similarity) => ({
    id,
    section: 'nutrition',
    title: `Title ${id}`,
    evidence: 'A',
    contested: false,
    body: '## Summary\ntext',
    sources: [{ ref: 'Ref one.', doi: '10.1/x', type: 'rct' }, { ref: 'A book.', type: 'practice' }],
    similarity,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    embedMock.mockResolvedValue({ embeddings: [[0.1, 0.2]], tokens: 5 });
    searchByEmbeddingMock.mockResolvedValue([row('near', 0.612), row('far', knowledge.MIN_SIMILARITY - 0.01)]);
  });

  it('embeds the query and returns the cards that are close enough, without the embedding internals', async () => {
    const cards = await knowledge.search({ query: 'carbs per hour' });
    expect(embedMock).toHaveBeenCalledWith({ model: knowledge.EMBEDDING_MODEL, input: ['carbs per hour'] });
    expect(searchByEmbeddingMock).toHaveBeenCalledWith([0.1, 0.2], { section: null, limit: 4 });
    expect(cards).toEqual([
      {
        id: 'near',
        section: 'nutrition',
        title: 'Title near',
        evidence: 'A',
        contested: false,
        similarity: 0.61,
        body: '## Summary\ntext',
        sources: ['Ref one. doi:10.1/x', 'A book.'],
      },
    ]);
  });

  it('leaves out the placeholder sources (coaching practice, product principles) — nothing the coach could cite', async () => {
    searchByEmbeddingMock.mockResolvedValue([{
      ...row('near', 0.5),
      sources: [
        { ref: 'Coaching practice synthesis (no single source).', type: 'practice' },
        { ref: 'BikeLab product principles (owner decisions, 2026).', type: 'practice' },
        { ref: 'Ref one.', doi: '10.1/x', type: 'rct' },
      ],
    }]);
    const [card] = await knowledge.search({ query: 'q' });
    expect(card.sources).toEqual(['Ref one. doi:10.1/x']);
  });

  it('passes a known section through and ignores an unknown one', async () => {
    await knowledge.search({ query: 'q', section: 'nutrition' });
    await knowledge.search({ query: 'q', section: 'cooking' });
    expect(searchByEmbeddingMock.mock.calls.map(([, options]) => options.section)).toEqual(['nutrition', null]);
  });

  it.each([[1, 1], [99, knowledge.MAX_RESULTS], [0, 4], ['x', 4], [2.6, 3]])('k %s asks for %s cards', async (k, limit) => {
    await knowledge.search({ query: 'q', k });
    expect(searchByEmbeddingMock.mock.calls[0][1].limit).toBe(limit);
  });
});
