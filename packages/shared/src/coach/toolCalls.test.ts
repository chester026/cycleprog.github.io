import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../types/coachUi.js';
import {
  COACH_TOOL_GENERIC_LABEL_KEY,
  COACH_TOOL_LABEL_KEYS,
  COACH_TOOL_NAMES,
  getToolLabelKey,
  groupToolCalls,
} from './toolCalls.js';

const call = (name: string, status: ToolCall['status'] = 'done'): ToolCall => ({ name, args: {}, status });

describe('groupToolCalls', () => {
  it('collapses adjacent same-name calls into one group with a count', () => {
    const groups = groupToolCalls([
      call('get_calendar'),
      call('delete_calendar_event'),
      call('delete_calendar_event'),
      call('create_calendar_event'),
      call('create_calendar_event'),
      call('create_calendar_event'),
    ]);
    expect(groups).toEqual([
      { name: 'get_calendar', status: 'done', count: 1, key: 'get_calendar-0' },
      { name: 'delete_calendar_event', status: 'done', count: 2, key: 'delete_calendar_event-1' },
      { name: 'create_calendar_event', status: 'done', count: 3, key: 'create_calendar_event-3' },
    ]);
  });

  it('keeps same-name calls separate when another tool ran between them', () => {
    const groups = groupToolCalls([call('create_goal'), call('get_calendar'), call('create_goal')]);
    expect(groups.map((g) => g.key)).toEqual(['create_goal-0', 'get_calendar-1', 'create_goal-2']);
  });

  it('a group is done only when every call in it is', () => {
    const groups = groupToolCalls([call('create_calendar_event'), call('create_calendar_event', 'running')]);
    expect(groups[0].status).toBe('running');
    expect(groupToolCalls([call('x', 'error'), call('x')])[0].status).toBe('error');
  });

  it('is empty for no calls', () => {
    expect(groupToolCalls([])).toEqual([]);
  });
});

describe('tool labels', () => {
  it('names every server tool, including the checklist/memory/profile/bike ones', () => {
    for (const name of [
      'add_checklist_items',
      'update_checklist_item',
      'get_checklist',
      'remember_about_rider',
      'forget_about_rider',
      'get_rider_notes',
      'update_rider_profile',
      'get_power_profile',
      'log_bike_service',
      'set_bike_gear_label',
    ]) {
      expect(COACH_TOOL_NAMES).toContain(name);
      expect(getToolLabelKey(name)).toMatch(/^coach\.tool[A-Z]/);
    }
    expect(COACH_TOOL_NAMES).toHaveLength(Object.keys(COACH_TOOL_LABEL_KEYS).length);
    expect(new Set(Object.values(COACH_TOOL_LABEL_KEYS)).size).toBe(COACH_TOOL_NAMES.length);
  });

  it('falls back to the generic key for an unknown tool or an Object.prototype member', () => {
    expect(getToolLabelKey('brand_new_tool')).toBe(COACH_TOOL_GENERIC_LABEL_KEY);
    expect(getToolLabelKey('constructor')).toBe(COACH_TOOL_GENERIC_LABEL_KEY);
    expect(getToolLabelKey('get_activity_analysis')).toBe('coach.toolActivityAnalysis');
  });
});
