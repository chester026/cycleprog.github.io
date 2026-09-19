import {useQuery} from '@tanstack/react-query';
import {api, calendar} from '../api';
import {queryKeys, type CalendarRange} from '../keys';

/**
 * GET /api/calendar, optionally filtered by `{from, to, type, goalId}`
 * (mirrors CalendarScreen's `from/to`, PlannedRidesWidget's `type`, and
 * GoalDetailsScreen's `goal_id` query params).
 */
export function useCalendar(range?: CalendarRange) {
  return useQuery({
    queryKey: queryKeys.calendar(range),
    queryFn: () =>
      api.call(calendar.list, {
        query: {
          from: range?.from,
          to: range?.to,
          type: range?.type,
          goal_id: range?.goalId,
        },
      }),
  });
}
