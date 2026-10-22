// English copy and the per-type colours of the Calendar page. The strings
// are the app's en.json `calendar.*` texts; the colours are the app's
// EVENT_COLORS tokens (accent / coach gray / warning / success / coach
// orange / chart series4) so an event looks the same on both clients.
import { CALENDAR_EVENT_TYPES } from '@bikelab/shared/constants';

export const EVENT_TYPES = CALENDAR_EVENT_TYPES;

export const EVENT_TYPE_LABELS = {
  planned_ride: 'Planned Ride',
  rest_day: 'Rest Day',
  maintenance: 'Maintenance',
  purchase: 'Purchase',
  event: 'Event',
  note: 'Note',
};

export const EVENT_COLORS = {
  planned_ride: '#274dd3',
  rest_day: '#6b7280',
  maintenance: '#f59e0b',
  purchase: '#10b981',
  event: '#fc5200',
  note: '#8b5cf6',
};

export function eventColor(type) {
  return EVENT_COLORS[type] || EVENT_COLORS.planned_ride;
}

export function eventTypeLabel(type) {
  return EVENT_TYPE_LABELS[type] || EVENT_TYPE_LABELS.planned_ride;
}

export const PLAN_WITH_COACH_PROMPT = "Let's plan my training for the upcoming week";

// "Ask Coach" starts a fresh, type-specific question about one event rather
// than one generic prompt for every type (app: ASK_PROMPT_KEYS).
const ASK_PROMPTS = {
  planned_ride: ({ title, date }) => `Tell me more about my planned ride "${title}" on ${date} — what should I focus on?`,
  rest_day: ({ date }) => `Any tips for making the most of my rest day on ${date}?`,
  maintenance: ({ title }) => `What's the best way to do "${title}"? Any tips or a checklist?`,
  purchase: ({ title }) => `Any advice on "${title}"? What should I look for or consider?`,
  event: ({ title, date }) => `Help me prepare for "${title}" on ${date}.`,
  note: ({ title }) => `Can you expand on this note: "${title}"?`,
};

/** The coach prompt for an event, by its type; `date` is the formatted day header. */
export function askCoachPrompt(type, { title, date }) {
  return (ASK_PROMPTS[type] || ASK_PROMPTS.planned_ride)({ title, date });
}
