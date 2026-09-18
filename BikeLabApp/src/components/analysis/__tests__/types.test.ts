import {groupActivitiesByIsoWeek} from '../types';

describe('groupActivitiesByIsoWeek', () => {
  const activities = [
    {date: '2025-01-06', value: 100}, // ISO week 2, 2025
    {date: '2025-01-07', value: 200}, // same week
    {date: '2025-01-13', value: 150}, // next week
    {date: '2025-01-14', value: null}, // no value -> excluded
    {date: undefined, value: 50}, // no date -> excluded
  ];

  it('groups by ISO week, averaging and taking the max per week', () => {
    const buckets = groupActivitiesByIsoWeek(
      activities,
      a => a.date,
      a => a.value,
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0].avg).toBe(150); // (100+200)/2
    expect(buckets[0].max).toBe(200);
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].avg).toBe(150);
    expect(buckets[1].count).toBe(1);
    // sorted ascending by week
    expect(buckets[0].week.localeCompare(buckets[1].week)).toBeLessThan(0);
  });

  it('returns an empty array when nothing has both a date and a value', () => {
    expect(groupActivitiesByIsoWeek([{date: undefined, value: 1}], a => a.date, a => a.value)).toEqual([]);
  });
});
