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
