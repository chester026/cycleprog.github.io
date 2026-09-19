import { useQuery } from '@tanstack/react-query';
import { call, calendar } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/calendar, optionally filtered by {from, to, type, goalId} — e.g.
 * GoalDetailPage's Scheduled tab passes { goalId: id }.
 */
export function useCalendar(range) {
  return useQuery({
    queryKey: queryKeys.calendar(range),
    queryFn: () =>
      call(calendar.list, {
        query: {
          from: range?.from,
          to: range?.to,
          type: range?.type,
          goal_id: range?.goalId,
        },
      }),
  });
}
