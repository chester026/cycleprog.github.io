import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../types/coachUi.js';
import {
  COACH_TOOL_GENERIC_LABEL_KEY,
  COACH_TOOL_LABEL_KEYS,
  COACH_TOOL_NAMES,
  getToolLabelKey,
  getToolTagKey,
  toolCallTags,
} from './toolCalls.js';

const call = (name: string, status: ToolCall['status'] = 'done'): ToolCall => ({ name, args: {}, status });

describe('toolCallTags', () => {
  it('folds a reply into one tag per tool, in the order the tools first ran', () => {
    const tags = toolCallTags([
      call('get_calendar'),
      call('get_goals_progress'),
      call('delete_calendar_event'),
      call('delete_calendar_event'),
      call('create_calendar_event'),
      call('get_calendar'),
      call('create_calendar_event'),
      call('create_calendar_event'),
    ]);
    expect(tags).toEqual([
      { name: 'get_calendar', status: 'done', key: 'get_calendar' },
      { name: 'get_goals_progress', status: 'done', key: 'get_goals_progress' },
      { name: 'delete_calendar_event', status: 'done', key: 'delete_calendar_event' },
      { name: 'create_calendar_event', status: 'done', key: 'create_calendar_event' },
    ]);
  });

  it('a tag is done only when every call of its tool is', () => {
    expect(toolCallTags([call('create_calendar_event'), call('create_calendar_event', 'running')])[0].status).toBe('running');
    // A tool that ran earlier and is running again shows as running, in its first place.
    const again = toolCallTags([call('get_calendar'), call('create_goal'), call('get_calendar', 'running')]);
    expect(again.map((tag) => `${tag.name}:${tag.status}`)).toEqual(['get_calendar:running', 'create_goal:done']);
    expect(toolCallTags([call('x', 'error'), call('x')])[0].status).toBe('error');
    expect(toolCallTags([call('x', 'running'), call('x', 'error')])[0].status).toBe('error');
  });

  it('is empty for no calls', () => {
    expect(toolCallTags([])).toEqual([]);
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
      'search_knowledge',
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

  it('the short tag key is the label key with a Tag suffix, generic for an unknown tool', () => {
    expect(getToolTagKey('get_calendar')).toBe('coach.toolCalendarTag');
    expect(getToolTagKey('brand_new_tool')).toBe(`${COACH_TOOL_GENERIC_LABEL_KEY}Tag`);
  });
});
