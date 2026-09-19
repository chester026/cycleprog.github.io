import type {ChecklistItem} from '@bikelab/shared/types';
import {groupBySection, sortSectionItems, computeOverview, checklistStatus, linkHost} from './lib';

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

describe('computeOverview', () => {
  it('computes items/sections/percent across sections', () => {
    const rows: ChecklistItem[] = [
      row({id: 1, section: 'What to buy', item: 'Bicycle', checked: true}),
      row({id: 2, section: 'What to buy', item: 'Helmet', checked: false}),
      row({id: 3, section: 'What to do', item: 'Book hotel', checked: true}),
    ];

    expect(computeOverview(rows)).toEqual({
      totalItems: 3,
      doneItems: 2,
      openItems: 1,
      totalSections: 2,
      percent: 67,
    });
  });

  it('returns percent 0 for no rows', () => {
    expect(computeOverview([])).toEqual({
      totalItems: 0,
      doneItems: 0,
      openItems: 0,
      totalSections: 0,
      percent: 0,
    });
  });
});

describe('checklistStatus', () => {
  it('is "gettingStarted" below 50%', () => {
    expect(checklistStatus(0)).toBe('gettingStarted');
    expect(checklistStatus(49)).toBe('gettingStarted');
  });

  it('is "almostReady" from 50% up to but under 100%', () => {
    expect(checklistStatus(50)).toBe('almostReady');
    expect(checklistStatus(99)).toBe('almostReady');
  });

  it('is "allSet" at 100%', () => {
    expect(checklistStatus(100)).toBe('allSet');
  });
});

describe('linkHost', () => {
  it('returns null for no link', () => {
    expect(linkHost(undefined)).toBeNull();
    expect(linkHost(null)).toBeNull();
    expect(linkHost('')).toBeNull();
  });

  it('extracts a bare hostname, dropping a leading www.', () => {
    expect(linkHost('https://www.rei.com/product/123')).toBe('rei.com');
    expect(linkHost('https://amazon.com/dp/abc')).toBe('amazon.com');
  });

  it('falls back to the raw string for an unparsable link', () => {
    expect(linkHost('not a url')).toBe('not a url');
  });
});
