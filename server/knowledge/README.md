# BikeLab Coach Knowledge Base

Evidence-based reference cards the AI Coach retrieves by meaning (pgvector) and reasons from.
Status: **content complete** (2026-11-13) — 208 cards in 16 sections, about 69,000 words.
Sources: 454 references. 372 are verified (`verified: <date>`): the bibliographic record was confirmed
against Crossref (`scripts/verify-sources.mjs`) or by web search, and DOIs were added. 77 are books,
coaching practice or product principles (`type: practice`, nothing to verify). 5 remain unverified
(4 distinct papers in journals that Crossref does not index; each carries a `note`).
Key figures quoted from single studies were checked against PubMed abstracts on 2026-11-13; lines still
marked "from memory" could not be checked that way.

Retrieval is built (see Retrieval): the `coach_knowledge` table, the ingest script and the coach's
`search_knowledge` tool. After editing, adding or deleting a card, run `npm run knowledge:ingest` in `server/`.

## Principles

- **One card = one question a rider or coach would ask.** 250–450 words, self-contained, retrievable on its own.
- **Own synthesis, never copied text.** Cards summarise findings in our words and point to the source by DOI.
  No abstracts, no paragraphs from papers.
- **Every claim carries its evidence grade** (see below). The coach must be able to say how sure it is.
- **Numbers with units and ranges.** Population stated (untrained / recreational / trained / elite).
- **The card informs, the coach decides.** Cards give the evidence and decision rules; the coach combines
  them with the rider's own data (tools) and its own reasoning.

## Zone vocabulary (important)

"Zone 2" means different things in different models, so cards never use a bare zone number.

| Card term | Physiology | 3-zone model | Coggan power zones (approx.) |
|---|---|---|---|
| **LOW** | below first threshold (LT1/VT1) | Z1 | Z1–Z2 (recovery, endurance) |
| **MID** | between LT1 and LT2/CP | Z2 | Z3–Z4 (tempo, sweet spot, threshold) |
| **HIGH** | above second threshold (LT2/VT2/CP) | Z3 | Z5+ (VO2max, anaerobic, sprint) |

Popular "Zone 2 training" = upper part of LOW (Coggan Z2).

## Card format

```yaml
---
id: tid-04-polarized-model            # stable, unique, used in `related`
title: Polarized training — definition and evidence
section: training-intensity-distribution
tags: [polarized, 80-20, polarization-index]
evidence: B                           # A | B | C, add `contested: true` when experts disagree
populations: [recreational, trained, elite]
related: [tid-05-pyramidal-model]
sources:
  - ref: "Author A, Author B. Title. Journal. Year;Vol(Issue):pages."
    doi: 10.xxxx/xxxx
    type: rct                         # meta-analysis | systematic-review | rct | observational | review | commentary | practice
    verified: 2026-11-13              # date the reference was checked online; `false` = cited from memory, check before relying on details
updated: 2026-11-13
---
## Summary            (3–5 sentences: the answer)
## Key numbers        (bullets with units)
## Why it works       (mechanism; omit if not applicable)
## In practice        (what to prescribe / how to read rider data)
## Limits             (who it does not apply to, weak spots in the evidence)
## Coach guidance     (how the coach should use this with a rider)
```

### Evidence grades

- **A** — meta-analyses or several consistent controlled trials in trained athletes.
- **B** — a few controlled trials, or consistent observational data from well-trained/elite athletes.
- **C** — mechanistic reasoning, small or untrained-only studies, or established coaching practice.
- `contested: true` — credible experts disagree; the card presents both sides.

## Retrieval

The files in `cards/` are the source of truth; the `coach_knowledge` table (migration
`1758000000023_coach-knowledge.sql`, pgvector) is the copy that is searched.

- **Table**: one row per card — `id`, `section`, `title`, `tags`, `evidence`, `contested`, `body` (markdown
  without frontmatter), `sources`, `content_hash`, `embedding vector(1536)`. A few hundred rows are scanned
  exactly (cosine), so there is no ANN index.
- **Embedding**: one per card (cards are short on purpose, no sub-chunking), OpenAI `text-embedding-3-small`,
  computed from the title, the tags and the body without `Limits` and `Coach guidance` — those two are on every
  card and say how to hedge, not what the card is about (`services/coachKnowledge.js`).
- **Ingest**: `npm run knowledge:ingest` in `server/` (`scripts/ingest-knowledge.js`). Reads `cards/**/*.md`,
  checks every card (format, unique ids, `related` targets), upserts by `id`, skips cards whose hash is unchanged,
  deletes rows whose file is gone. `-- --dry-run` shows what would change without calling OpenAI or writing.
  Local and prod share one database, so a local run updates production.
- **Coach tool**: `search_knowledge({ query, section?, k = 4 })` in `server/aiCoach.js` → title, evidence grade,
  body and sources of the closest cards; cards under the similarity threshold are left out. The system prompt
  ("Knowledge base") says when to search, that the query is written in English, and that the answer is in the
  rider's language with the evidence grade in plain words.
- **Quality check**: `npm run knowledge:eval` runs `eval-questions.json` (real rider questions with the cards
  that should come back, each as the rider asks it and as an English query) and prints the hits with their
  similarity. Use it after an ingest and before changing the threshold or the embedding model.
