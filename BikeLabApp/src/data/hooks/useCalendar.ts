import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {CalendarEvent} from '@bikelab/shared/types';
import {queryKeys, type CalendarRange} from '../keys';

function buildQueryString(range: CalendarRange | undefined): string {
  if (!range) return '';
  const parts: string[] = [];
  if (range.from) parts.push(`from=${encodeURIComponent(range.from)}`);
  if (range.to) parts.push(`to=${encodeURIComponent(range.to)}`);
  if (range.type) parts.push(`type=${encodeURIComponent(range.type)}`);
  if (range.goalId !== undefined) parts.push(`goal_id=${encodeURIComponent(String(range.goalId))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * GET /api/calendar, optionally filtered by `{from, to, type, goalId}`
 * (mirrors CalendarScreen's `from/to`, PlannedRidesWidget's `type`, and
 * GoalDetailsScreen's `goal_id` query params).
 */
export function useCalendar(range?: CalendarRange) {
  return useQuery({
    queryKey: queryKeys.calendar(range),
    queryFn: () => apiFetch(`/api/calendar${buildQueryString(range)}`) as Promise<CalendarEvent[]>,
  });
}
