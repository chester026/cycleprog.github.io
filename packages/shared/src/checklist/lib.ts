// Pure derivations over GET /api/checklist rows, shared by the app's
// ChecklistScreen / Garage ChecklistPreview and the web's ChecklistPage /
// garage ChecklistPreview: grouping into sections, in-section ordering, the
// overview-card totals and the status label. Nothing here touches state,
// storage or the network.
import type { ChecklistItem } from '../types/checklist.js';

export interface ChecklistSection {
  section: string;
  items: ChecklistItem[];
  done: number;
  total: number;
  /** 0-100, done/total (0 for an empty section). */
  percent: number;
}

function percentOf(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

/**
 * Groups the flat `{id, section, item, checked}` rows into per-section
 * summaries, preserving each section's first-seen order (the server returns
 * rows by creation time, so this keeps the oldest section first).
 */
export function groupBySection(rows: ChecklistItem[]): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  const bySection = new Map<string, ChecklistSection>();
  for (const row of rows) {
    let section = bySection.get(row.section);
    if (!section) {
      section = { section: row.section, items: [], done: 0, total: 0, percent: 0 };
      bySection.set(row.section, section);
      sections.push(section);
    }
    section.items.push(row);
    section.total += 1;
    if (row.checked) section.done += 1;
  }
  for (const section of sections) section.percent = percentOf(section.done, section.total);
  return sections;
}

/** Within a section, unchecked items first then checked ones, each group in its original order. */
export function sortSectionItems(items: ChecklistItem[]): ChecklistItem[] {
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  return unchecked.concat(checked);
}

export interface ChecklistOverview {
  totalItems: number;
  doneItems: number;
  openItems: number;
  totalSections: number;
  /** 0-100, done/total (0 when there are no items). */
  percent: number;
}

/** Overview-card stats: ring percent + the Open/Done/Sections rows. */
export function computeOverview(rows: ChecklistItem[]): ChecklistOverview {
  const totalItems = rows.length;
  const doneItems = rows.filter((r) => r.checked).length;
  return {
    totalItems,
    doneItems,
    openItems: totalItems - doneItems,
    totalSections: groupBySection(rows).length,
    percent: percentOf(doneItems, totalItems),
  };
}

export type ChecklistStatus = 'allSet' | 'almostReady' | 'gettingStarted';

/** Short status label shown next to the overview ring, by % done. */
export function checklistStatus(percent: number): ChecklistStatus {
  if (percent >= 100) return 'allSet';
  if (percent >= 50) return 'almostReady';
  return 'gettingStarted';
}

/**
 * Bare hostname for a checklist item's optional link (e.g.
 * "https://www.rei.com/product/123" -> "rei.com"), shown on an item card.
 * Returns null for no link; falls back to the raw string for one with no
 * `scheme://` prefix. A hand-rolled regex instead of `new URL(link).hostname`
 * because RN's own `URL` type (react-native/src/types/globals.d.ts) only
 * declares `href`/`searchParams`, no `hostname` getter, even though the
 * runtime polyfill has one.
 */
export function linkHost(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = link.match(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/(?:[^/@]+@)?([^/:?#]+)/);
  return match ? match[1].replace(/^www\./, '') : link;
}
