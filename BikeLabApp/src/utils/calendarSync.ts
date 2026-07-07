import RNCalendarEvents from 'react-native-calendar-events';
import {apiFetch} from './api';

// One-way push: BikeLab -> Apple Calendar (never the other direction). A
// dedicated "BikeLab" calendar isn't exposed by this library's API, so
// synced events land in the device's default calendar with a "[BikeLab]"
// title prefix instead — see CALENDAR_SPEC.md §3.2/3.4 for the reasoning
// (bidirectional sync is a conflict-resolution nightmare; BikeLab stays the
// source of truth, this just mirrors it into the system calendar for
// visibility alongside the rest of the user's schedule).

export interface SyncableEvent {
  id: number;
  title: string;
  description?: string;
  location?: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string;
  all_day?: boolean;
  apple_event_id?: string | null;
}

export type CalendarPermissionStatus = 'authorized' | 'denied' | 'restricted' | 'undetermined';

// Builds a Date for a given "YYYY-MM-DD" calendar date + local wall-clock
// time, with an optional day offset — using the local Date constructor
// (not UTC parsing), so .toISOString() bakes in the DEVICE's actual UTC
// offset for that instant rather than treating the date as if it were
// already UTC.
function localDateTime(dateStr: string, hour: number, minute: number, dayOffset = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, (d || 1) + dayOffset, hour, minute, 0, 0);
}

export async function checkCalendarPermission(): Promise<boolean> {
  try {
    const status = await RNCalendarEvents.checkPermissions();
    return status === 'authorized';
  } catch (err) {
    console.error('[calendarSync] checkPermissions failed:', err);
    return false;
  }
}

export async function requestCalendarPermission(): Promise<boolean> {
  try {
    const status = await RNCalendarEvents.requestPermissions();
    return status === 'authorized';
  } catch (err) {
    console.error('[calendarSync] requestPermissions failed:', err);
    return false;
  }
}

// Creates or updates the matching EventKit entry and persists the returned
// apple_event_id back to /api/calendar so a later edit updates the same OS
// event instead of creating a duplicate. Returns null on permission denial
// or any EventKit failure — callers should treat null as "didn't sync" and
// surface that to the user rather than silently pretending it worked.
export async function syncEventToApple(event: SyncableEvent): Promise<string | null> {
  const hasPermission = (await checkCalendarPermission()) || (await requestCalendarPermission());
  if (!hasPermission) return null;

  const allDay = event.all_day !== false;

  // All-day events: EventKit expects startDate/endDate as LOCAL midnight
  // instants (it uses the device's default timezone since we don't set
  // calendarEvent.timeZone), with endDate being the EXCLUSIVE start of the
  // day AFTER the event ends — i.e. a single-day event runs from that day's
  // local midnight to the NEXT day's local midnight, not "23:59:59 the same
  // day". The old code built these with a "Z" (UTC) suffix, so for anyone
  // east of UTC, "23:59:59Z" landed a couple hours into the next LOCAL day —
  // which EventKit then rendered as a two-day event. Using the local Date
  // constructor + .toISOString() bakes in the device's real offset instead
  // of assuming UTC.
  const startDate = allDay
    ? localDateTime(event.start_date, 0, 0).toISOString()
    : localDateTime(event.start_date, 9, 0).toISOString();
  const endDate = allDay
    ? localDateTime(event.end_date || event.start_date, 0, 0, 1).toISOString()
    : localDateTime(event.end_date || event.start_date, 10, 0).toISOString();

  let appleId: string;
  try {
    appleId = await RNCalendarEvents.saveEvent(`[BikeLab] ${event.title}`, {
      id: event.apple_event_id || undefined,
      startDate,
      endDate,
      allDay,
      notes: event.description || undefined,
      location: event.location || undefined,
    });
  } catch (err) {
    console.error('[calendarSync] Failed to save event to Apple Calendar:', err);
    return null;
  }

  if (appleId && appleId !== event.apple_event_id) {
    try {
      await apiFetch(`/api/calendar/${event.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({apple_event_id: appleId}),
      });
    } catch (err) {
      // Non-critical — the EventKit write already succeeded, this just
      // means a later edit might create a second Apple event instead of
      // updating this one. Log and move on rather than reporting failure
      // for a sync that, from the user's perspective, did work.
      console.error('[calendarSync] Synced to Apple but failed to persist apple_event_id:', err);
    }
  }

  return appleId;
}

// Best-effort cleanup when a synced event is deleted in-app — avoids
// leaving an orphaned "[BikeLab] ..." entry sitting in the user's system
// calendar forever. Silently no-ops if there's nothing to remove or
// permission was never granted.
export async function deleteAppleEvent(appleEventId?: string | null): Promise<void> {
  if (!appleEventId) return;
  try {
    const hasPermission = await checkCalendarPermission();
    if (!hasPermission) return;
    await RNCalendarEvents.removeEvent(appleEventId);
  } catch (err) {
    console.warn('[calendarSync] Failed to delete Apple event:', err);
  }
}
