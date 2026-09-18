import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

function buildQueryString(range) {
  if (!range) return '';
  const parts = [];
  if (range.from) parts.push(`from=${encodeURIComponent(range.from)}`);
  if (range.to) parts.push(`to=${encodeURIComponent(range.to)}`);
  if (range.type) parts.push(`type=${encodeURIComponent(range.type)}`);
  if (range.goalId !== undefined) parts.push(`goal_id=${encodeURIComponent(String(range.goalId))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * GET /api/calendar, optionally filtered by {from, to, type, goalId} — e.g.
 * GoalDetailPage's Scheduled tab passes { goalId: id }.
 */
export function useCalendar(range) {
  return useQuery({
    queryKey: queryKeys.calendar(range),
    queryFn: () => apiFetch(`/api/calendar${buildQueryString(range)}`),
  });
}
