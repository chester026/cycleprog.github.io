import type {ChecklistItem} from '@bikelab/shared/types';
import {groupBySection, sortSectionItems} from './lib';

function row(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {id: 1, section: 'What to buy', item: 'Bicycle', checked: false, ...overrides};
}

describe('groupBySection', () => {
  it('groups rows by section, preserving first-seen order', () => {
    const rows: ChecklistItem[] = [
      row({id: 1, section: 'What to buy', item: 'Bicycle'}),
      row({id: 2, section: 'What to do', item: 'Book hotel'}),
      row({id: 3, section: 'What to buy', item: 'Helmet', checked: true}),
    ];

    const sections = groupBySection(rows);

    expect(sections.map(s => s.section)).toEqual(['What to buy', 'What to do']);
    expect(sections[0].items).toHaveLength(2);
    expect(sections[1].items).toHaveLength(1);
  });

  it('computes done/total/percent per section', () => {
    const rows: ChecklistItem[] = [
      row({id: 1, checked: true}),
      row({id: 2, checked: false}),
      row({id: 3, checked: true}),
    ];

    const [section] = groupBySection(rows);

    expect(section.done).toBe(2);
    expect(section.total).toBe(3);
    expect(section.percent).toBe(67);
  });

  it('returns percent 0 for an empty section list and an empty array for no rows', () => {
    expect(groupBySection([])).toEqual([]);
  });

  it('returns an empty array for no rows', () => {
    expect(groupBySection([])).toHaveLength(0);
  });
});

describe('sortSectionItems', () => {
  it('puts unchecked items before checked ones, preserving relative order within each group', () => {
    const items: ChecklistItem[] = [
      row({id: 1, item: 'a', checked: true}),
      row({id: 2, item: 'b', checked: false}),
      row({id: 3, item: 'c', checked: true}),
      row({id: 4, item: 'd', checked: false}),
    ];

    const sorted = sortSectionItems(items);

    expect(sorted.map(i => i.id)).toEqual([2, 4, 1, 3]);
  });
});
