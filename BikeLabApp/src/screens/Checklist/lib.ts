// Pure derivations for ChecklistScreen + Garage/ChecklistPreview — ported
// "as is" from react-spa's ChecklistPage.jsx (`sections`/`renderSection`)
// and garage/ChecklistPreview.jsx (`groupBySection`). Nothing here touches
// state, storage or the network.
import type {ChecklistItem} from '@bikelab/shared/types';

export interface ChecklistSection {
  section: string;
  items: ChecklistItem[];
  done: number;
  total: number;
  percent: number;
}

/**
 * Groups the flat `{id, section, item, checked}` rows into per-section
 * summaries, preserving each section's first-seen order — the same rule
 * ChecklistPage's own `sections` list (`Array.from(new Set(...))`) and
 * garage/ChecklistPreview's `groupBySection` both use.
 */
export function groupBySection(rows: ChecklistItem[]): ChecklistSection[] {
  const order: string[] = [];
  const bySection = new Map<string, ChecklistItem[]>();
  for (const row of rows) {
    if (!bySection.has(row.section)) {
      bySection.set(row.section, []);
      order.push(row.section);
    }
    bySection.get(row.section)!.push(row);
  }
  return order.map(section => {
    const items = bySection.get(section)!;
    const done = items.filter(i => i.checked).length;
    const total = items.length;
    return {section, items, done, total, percent: total ? Math.round((done / total) * 100) : 0};
  });
}

/**
 * Within a section, unchecked items first then checked ones — same order
 * ChecklistPage's `renderSection` shows them in (`unchecked.concat(checked)`).
 */
export function sortSectionItems(items: ChecklistItem[]): ChecklistItem[] {
  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
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
  const doneItems = rows.filter(r => r.checked).length;
  return {
    totalItems,
    doneItems,
    openItems: totalItems - doneItems,
    totalSections: groupBySection(rows).length,
    percent: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
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
 * "https://www.rei.com/product/123" -> "rei.com"), shown on a grid card
 * instead of a km readout. Returns null for no link; falls back to the raw
 * string for one with no `scheme://` prefix. A hand-rolled regex instead of
 * `new URL(link).hostname` — RN's own `URL` type (react-native/src/types/
 * globals.d.ts) only declares `href`/`searchParams`, no `hostname` getter,
 * even though the runtime polyfill has one (see deepLinks.ts's comment on
 * the same polyfill).
 */
export function linkHost(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = link.match(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/(?:[^/@]+@)?([^/:?#]+)/);
  return match ? match[1].replace(/^www\./, '') : link;
}
