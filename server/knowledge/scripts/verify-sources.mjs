#!/usr/bin/env node
// Verify card sources against Crossref (bibliographic data) and PubMed (abstracts).
// Usage:  node server/knowledge/scripts/verify-sources.mjs [--dry] [--all]
//   --dry  parse cards and list what would be checked, no network
//   --all  re-check sources that already have a verified date
// Writes server/knowledge/verification-report.json. Does not modify cards.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARDS = path.join(ROOT, 'cards');
const OUT = path.join(ROOT, 'verification-report.json');
const DRY = process.argv.includes('--dry');
const ALL = process.argv.includes('--all');
const UA = 'bikelab-knowledge-verifier/1.0 (source verification script)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseSources(file) {
  const text = fs.readFileSync(file, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return [];
  const id = (fm[1].match(/^id:\s*(.+)$/m) || [])[1];
  const block = fm[1].split(/^sources:\s*$/m)[1];
  if (!block) return [];
  const out = [];
  for (const chunk of block.split(/\n(?= {2}- ref:)/)) {
    const ref = chunk.match(/- ref:\s*"([\s\S]*?)"\s*$/m);
    if (!ref) continue;
    const get = (k) => ((chunk.match(new RegExp(`^\\s+${k}:\\s*(.+)$`, 'm')) || [])[1] || '').trim();
    out.push({ card: id, ref: ref[1], doi: get('doi') || null, type: get('type'), verified: get('verified') });
  }
  return out;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []);
}

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 3);

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      return null;
    } catch { await sleep(1500 * (i + 1)); }
  }
  return null;
}
async function getText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.text();
      await sleep(1500 * (i + 1));
    } catch { await sleep(1500 * (i + 1)); }
  }
  return null;
}

function describe(item) {
  if (!item) return null;
  const year = (item.issued?.['date-parts']?.[0]?.[0]) || (item.published?.['date-parts']?.[0]?.[0]) || null;
  const printYear = item['published-print']?.['date-parts']?.[0]?.[0] || null;
  return {
    doi: item.DOI || null,
    title: (item.title || [])[0] || '',
    authors: (item.author || []).map((a) => a.family || a.name || '').filter(Boolean),
    journal: (item['container-title'] || [])[0] || '',
    journalShort: (item['short-container-title'] || [])[0] || '',
    year, printYear,
    volume: item.volume || null, issue: item.issue || null, page: item.page || null,
    type: item.type || null,
    abstract: item.abstract ? item.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
  };
}

function compare(ref, c) {
  const refTok = new Set(tokens(ref));
  const tt = tokens(c.title);
  const titleCover = tt.length ? tt.filter((t) => refTok.has(t)).length / tt.length : 0;
  const first = norm(c.authors[0] || '').split(' ').pop();
  const authorOk = !c.authors.length || (!!first && norm(ref).includes(first));
  const ym = ref.match(/\b((?:19|20)\d{2})\s*[;.]/g) || ref.match(/\b(?:19|20)\d{2}\b/g) || [];
  const refYear = ym.length ? Number(ym[ym.length - 1].slice(0, 4)) : null;
  const cy = [c.year, c.printYear].filter(Boolean);
  const yearOk = refYear != null && cy.some((y) => Math.abs(y - refYear) <= 1);
  const vp = ref.match(/(?:19|20)\d{2};\s*([0-9A-Za-z]+)(?:\(([^)]+)\))?(?::\s*([A-Za-z]?\d+[A-Za-z]?)(?:[-–]([A-Za-z]?\d+))?)?/);
  const refVol = vp?.[1] || null, refIssue = vp?.[2] || null, refFirstPage = vp?.[3] || null, refLastPage = vp?.[4] || null;
  const cFirst = c.page ? c.page.split(/[-–]/)[0] : null;
  const cLast = c.page && /[-–]/.test(c.page) ? c.page.split(/[-–]/)[1] : null;
  const diffs = [];
  if (refYear != null && cy.length && !cy.includes(refYear)) diffs.push(`year: ref ${refYear} vs ${cy.join('/')}`);
  if (refVol && c.volume && refVol !== String(c.volume)) diffs.push(`volume: ref ${refVol} vs ${c.volume}`);
  if (refIssue && c.issue && norm(refIssue) !== norm(String(c.issue))) diffs.push(`issue: ref ${refIssue} vs ${c.issue}`);
  if (refFirstPage && cFirst && refFirstPage.toLowerCase() !== cFirst.toLowerCase()) diffs.push(`first page: ref ${refFirstPage} vs ${cFirst}`);
  if (refLastPage && cLast) {
    const full = refLastPage.length < refFirstPage.length ? refFirstPage.slice(0, refFirstPage.length - refLastPage.length) + refLastPage : refLastPage;
    if (full.toLowerCase() !== cLast.toLowerCase()) diffs.push(`last page: ref ${refLastPage} vs ${cLast}`);
  }
  const match = titleCover >= 0.8 && authorOk && yearOk;
  return { match, titleCover: +titleCover.toFixed(2), authorOk, yearOk, diffs };
}

async function pubmedAbstract(doi) {
  const s = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(doi)}%5Bdoi%5D`);
  const pmid = s?.esearchresult?.idlist?.[0];
  if (!pmid) return { pmid: null, abstract: null };
  await sleep(350);
  const t = await getText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`);
  return { pmid, abstract: t ? t.replace(/\s+/g, ' ').trim().slice(0, 4000) : null };
}

async function main() {
  const all = walk(CARDS).flatMap(parseSources);
  const todo = new Map();
  for (const s of all) {
    if (s.type === 'practice') continue;
    if (!ALL && s.verified !== 'false') continue;
    if (!todo.has(s.ref)) todo.set(s.ref, { ref: s.ref, doi: s.doi, type: s.type, cards: [] });
    todo.get(s.ref).cards.push(s.card);
    if (s.doi && !todo.get(s.ref).doi) todo.get(s.ref).doi = s.doi;
  }
  const list = [...todo.values()];
  console.log(`Sources in cards: ${all.length}; unique to check: ${list.length}`);
  if (DRY) { list.slice(0, 5).forEach((x) => console.log(' -', x.ref.slice(0, 110), x.doi || '')); return; }

  const report = [];
  let n = 0;
  for (const item of list) {
    n++;
    const entry = { ...item, status: 'not_found', crossref: null, check: null, candidates: [], pubmed: null };
    let cands = [];
    if (item.doi) {
      const j = await getJson(`https://api.crossref.org/works/${encodeURIComponent(item.doi)}`);
      if (j?.message) cands.push(describe(j.message)); else entry.doiNotResolved = true;
      await sleep(120);
    }
    if (!cands.length || !compare(item.ref, cands[0]).match) {
      const q = encodeURIComponent(item.ref.slice(0, 400));
      const j = await getJson(`https://api.crossref.org/works?rows=4&query.bibliographic=${q}`);
      cands = cands.concat((j?.message?.items || []).map(describe));
      await sleep(120);
    }
    let best = null, bestCheck = null;
    for (const c of cands) {
      const ch = compare(item.ref, c);
      if (!best || (ch.match && !bestCheck.match) || (ch.match === bestCheck.match && ch.titleCover > bestCheck.titleCover)) { best = c; bestCheck = ch; }
    }
    if (best) {
      entry.crossref = best; entry.check = bestCheck;
      entry.status = bestCheck.match ? (bestCheck.diffs.length ? 'match_with_diffs' : 'match') : 'mismatch';
      if (item.doi && best.doi && item.doi.toLowerCase() !== best.doi.toLowerCase()) entry.doiDiffers = `card ${item.doi} vs crossref ${best.doi}`;
      if (!bestCheck.match) entry.candidates = cands.slice(0, 3).map((c) => ({ doi: c.doi, title: c.title, first: c.authors[0], journal: c.journal, year: c.year }));
      if (bestCheck.match && best.doi) { entry.pubmed = await pubmedAbstract(best.doi); await sleep(350); }
    }
    report.push(entry);
    process.stdout.write(`\r${n}/${list.length} ${entry.status.padEnd(16)}`);
    if (n % 20 === 0) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  const count = (s) => report.filter((r) => r.status === s).length;
  console.log(`\nDone. match: ${count('match')}, match_with_diffs: ${count('match_with_diffs')}, mismatch: ${count('mismatch')}, not_found: ${count('not_found')}`);
  console.log(`With PubMed abstract: ${report.filter((r) => r.pubmed?.abstract).length}`);
  console.log(`Report: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
