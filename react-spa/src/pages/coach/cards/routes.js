import { dateParam } from './calendarLib';

// Where each card deep-links. The calendar page takes the first event's day.
export const CARD_ROUTES = Object.freeze({
  goal: (id) => `/goals/${id}`,
  checklist: '/checklist',
  coachMemory: '/profile?tab=coach',
  profile: '/profile?tab=personal',
  calendar: (startDate) => `/calendar?date=${dateParam(startDate)}`,
});
