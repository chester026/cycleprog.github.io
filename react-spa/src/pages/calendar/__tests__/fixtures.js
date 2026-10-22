// Small builders for the calendar component tests.
export function makeEvent(overrides = {}) {
  return {
    id: 1,
    type: 'planned_ride',
    title: 'Long ride',
    start_date: '2026-06-15',
    completed: false,
    source: 'user',
    ...overrides,
  };
}

export function makeActivity(overrides = {}) {
  return {
    id: 100,
    name: 'Morning ride',
    start_date: '2026-06-15T06:00:00Z',
    start_date_local: '2026-06-15T08:00:00Z',
    distance: 42500,
    moving_time: 5400,
    ...overrides,
  };
}

export function dayGroup(date, { activities = [], events = [] } = {}) {
  return { date, activities, events };
}
