# Activities → Calendar + Context Attachment

> Spec for Sonnet. Replaces the passive ActivitiesScreen with two active features:
> a context-attachment flow in the coach chat and an AI-managed calendar view.

---

## 0. Context & Existing Infrastructure

| Asset | Location | Notes |
|---|---|---|
| `ActivitiesScreen.tsx` | `screens/` | FlatList of Strava activities, year filter, video header. **Will be replaced.** |
| `PlannedRidesWidget.tsx` | `components/` | CRUD widget on GarageScreen. Uses `rides` table. **Will be superseded by calendar.** |
| `ChatInput.tsx` | `components/coach/` | Text input + send/cancel button. **Needs "+" button.** |
| `useCoachChat.ts` | `hooks/` | `sendMessage(text, {hiddenContext})` already supports injecting invisible context. |
| `coachSSE.ts` | `utils/` | SSE client — no changes needed. |
| `rides` table (Postgres) | `server/server.js` | Columns: `id, user_id, title, location, location_link, details, start`. Full CRUD endpoints at `/api/rides`. |
| `get_planned_rides` tool | `server/aiCoach.js` | `SELECT * FROM rides WHERE user_id = $1 ORDER BY start ASC` |
| `AppDataContext` | `contexts/` | `activities: Activity[]` — Strava activities loaded from `/api/activities`, cached in AsyncStorage. |
| Tab navigation | `App.tsx` | 5 tabs: Garage, Goals (CoachChat stack), Analysis, **Activities**, Profile. |

---

## 1. Feature A — Activity Context Attachment in Chat

### 1.1 Goal

Let the user attach one or more Strava activities as context to a coach message. The model receives structured activity data without the user having to describe the ride manually.

### 1.2 UX Flow

```
User taps "+" in ChatInput
  → Bottom-sheet modal slides up (ActivityPickerModal)
  → Shows recent activities (from useAppData().activities), newest first
  → Each row: date · type icon · name · distance · moving time
  → Multi-select with checkmarks
  → "Attach (N)" button at bottom
  → Modal closes, attached activities shown as pills above the input
  → User types a message and sends
  → hiddenContext includes serialized activity summaries
  → Model receives them and can reason about the rides
```

### 1.3 ChatInput Changes

Current layout: `[TextInput] [SendButton]`
New layout: `[+Button] [TextInput] [SendButton]`

```typescript
// ChatInput.tsx — new props
export const ChatInput: React.FC<{
  onSend: (text: string, options?: { hiddenContext?: string }) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  onAttachPress: () => void;           // NEW — opens ActivityPickerModal
  attachedActivities?: AttachedActivity[]; // NEW — currently attached activities
  onRemoveAttachment?: (id: number) => void; // NEW — remove one pill
}>;
```

**"+" button** sits to the LEFT of the TextInput. Same 48×48 circle as the send button, `backgroundColor: 'transparent'`, border `rgba(0,0,0,0.12)`, icon: `+` in `#274dd3`.

**Attachment pills** render in a horizontal `ScrollView` between the input row and the message list (inside the `wrapper`, above the `TextInput`). Each pill shows the activity name (truncated) + `×` to remove. Style: small rounded chip, `backgroundColor: '#f0f0f0'`, `color: '#1a1a1a'`, max 3 visible then `+N more`.

### 1.4 ActivityPickerModal

New file: `components/coach/ActivityPickerModal.tsx`

```typescript
interface Props {
  visible: boolean;
  onClose: () => void;
  onAttach: (activities: AttachedActivity[]) => void;
  activities: Activity[];  // from useAppData
}

export interface AttachedActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;       // meters
  moving_time: number;    // seconds
  total_elevation_gain: number;
  average_heartrate?: number;
  average_watts?: number;
}
```

**Presentation**: bottom-sheet modal (same pattern as PlannedRidesWidget's add-ride modal — `Animated.View` with `translateY` spring). FlatList of activities. Tapping a row toggles selection (checkmark appears on right). Header: "Attach Activities" + close button. Footer: "Attach (N)" primary button, disabled when N=0.

**Limit**: max 5 activities at once (context window budget — each serialized activity is ~200 tokens).

### 1.5 Hidden Context Serialization

When the user sends a message with attachments, build `hiddenContext` string:

```typescript
function serializeAttachedActivities(activities: AttachedActivity[]): string {
  const lines = activities.map(a => {
    const date = new Date(a.start_date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    const dist = (a.distance / 1000).toFixed(1);
    const duration = `${Math.floor(a.moving_time / 3600)}h${Math.floor((a.moving_time % 3600) / 60)}m`;
    const elev = Math.round(a.total_elevation_gain);
    let line = `[Activity ${a.id}] ${a.name} (${a.type}) — ${date}, ${dist}km, ${duration}, ${elev}m↑`;
    if (a.average_heartrate) line += `, avg HR ${Math.round(a.average_heartrate)}`;
    if (a.average_watts) line += `, avg ${Math.round(a.average_watts)}W`;
    return line;
  });
  return `The user has attached the following activities for context:\n${lines.join('\n')}`;
}
```

This goes into `sendMessage(text, { hiddenContext: serialized })` — the existing `useCoachChat` already handles this path.

### 1.6 State Management

State lives in `CoachChatScreen`, not in `useCoachChat` (attachments are UI-only, never persisted):

```typescript
const [pickerVisible, setPickerVisible] = useState(false);
const [attachedActivities, setAttachedActivities] = useState<AttachedActivity[]>([]);

const handleSend = (text: string) => {
  const opts = attachedActivities.length > 0
    ? { hiddenContext: serializeAttachedActivities(attachedActivities) }
    : undefined;
  sendMessage(text, opts);
  setAttachedActivities([]); // clear after send
};
```

---

## 2. Feature B — Calendar View (replaces ActivitiesScreen)

### 2.1 Goal

Replace the flat activity list with a vertical calendar that merges two data sources: past Strava activities (read-only) and planned events (AI-managed, user-editable). The coach creates/updates/deletes calendar events through tool calls during conversation.

### 2.2 Data Model — Evolve `rides` → `calendar_events`

The current `rides` table is too narrow (title, location, start — no event type, no end time, no recurrence, no link to coach conversations). Migrate to a richer table.

#### Migration

```sql
-- Step 1: Create new table
CREATE TABLE calendar_events (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL DEFAULT 'planned_ride',
    -- planned_ride | rest_day | maintenance | purchase | event | note
  title         TEXT NOT NULL,
  description   TEXT,
  location      TEXT,
  location_link TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,              -- NULL = same-day event
  all_day       BOOLEAN DEFAULT true,
  start_time    TIME,              -- NULL when all_day = true
  end_time      TIME,
  completed     BOOLEAN DEFAULT false,
  source        TEXT DEFAULT 'user',
    -- user | coach | apple_calendar
  coach_conversation_id TEXT,      -- links to coach_conversations.id if created by coach
  apple_event_id TEXT,             -- EventKit identifier for sync
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Migrate existing rides data
INSERT INTO calendar_events (user_id, type, title, location, location_link, description, start_date, source)
SELECT user_id, 'planned_ride', title, location, location_link, details, start::date, 'user'
FROM rides;

-- Step 3: Drop old table (after verification)
-- DROP TABLE rides;

-- Step 4: Indexes
CREATE INDEX idx_calendar_events_user_date ON calendar_events (user_id, start_date);
CREATE INDEX idx_calendar_events_apple ON calendar_events (user_id, apple_event_id) WHERE apple_event_id IS NOT NULL;
```

### 2.3 REST API — `/api/calendar`

Replace `/api/rides` endpoints. Same auth middleware.

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | — | Returns events in date range. Default: 30 days back, 90 days forward. |
| `POST` | `/api/calendar` | `{type, title, description?, location?, start_date, end_date?, all_day?, start_time?, end_time?}` | Returns created event. |
| `PUT` | `/api/calendar/:id` | partial fields | Returns updated event. |
| `DELETE` | `/api/calendar/:id` | — | Returns `{success: true}`. |

### 2.4 Coach Tools — Calendar Management

Add three new tools to `aiCoach.js`, replace `get_planned_rides`:

```javascript
// REMOVE: get_planned_rides

// ADD:
{
  type: 'function',
  function: {
    name: 'get_calendar',
    description:
      "Get the user's calendar events (planned rides, rest days, maintenance, purchases, notes) " +
      "for a date range. Use to check what's scheduled before suggesting new plans. " +
      "Also returns completed Strava activities for past dates to show full picture.",
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Default: today.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Default: 30 days from now.' },
      },
      required: [],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'create_calendar_event',
    description:
      'Create a calendar event for the user — planned ride, rest day, bike maintenance, ' +
      'purchase reminder, race, or free-form note. Confirm details with the user before calling.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'],
          description: 'Event type.',
        },
        title: { type: 'string', description: 'Short title.' },
        description: { type: 'string', description: 'Optional details.' },
        start_date: { type: 'string', description: 'Date (YYYY-MM-DD).' },
        end_date: { type: 'string', description: 'End date if multi-day (YYYY-MM-DD). Omit for single-day.' },
        location: { type: 'string', description: 'Optional location.' },
      },
      required: ['type', 'title', 'start_date'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event. Call get_calendar first to get the event ID.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', description: 'Calendar event ID.' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        type: { type: 'string', enum: ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'] },
        completed: { type: 'boolean' },
        location: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event. Confirm with user before calling.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', description: 'Calendar event ID.' },
      },
      required: ['event_id'],
    },
  },
}
```

#### Tool Executors

```javascript
async get_calendar(args, { userId }) {
  const from = args.from || new Date().toISOString().split('T')[0];
  const to = args.to || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  // Planned events from calendar_events
  const events = await pool.query(
    `SELECT * FROM calendar_events
     WHERE user_id = $1 AND start_date >= $2 AND start_date <= $3
     ORDER BY start_date ASC`,
    [userId, from, to]
  );

  // Past Strava activities in the same range (from synced_activities)
  const activities = await pool.query(
    `SELECT id, name, type, start_date, distance, moving_time,
            total_elevation_gain, average_heartrate
     FROM synced_activities
     WHERE user_id = $1 AND start_date::date >= $2 AND start_date::date <= $3
     ORDER BY start_date ASC`,
    [userId, from, to]
  );

  return { events: events.rows, activities: activities.rows };
},

async create_calendar_event(args, { userId, conversationId }) {
  const { type, title, description, start_date, end_date, location } = args;
  const result = await pool.query(
    `INSERT INTO calendar_events
       (user_id, type, title, description, start_date, end_date, location, source, coach_conversation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'coach', $8)
     RETURNING *`,
    [userId, type, title, description || null, start_date, end_date || null, location || null, conversationId]
  );
  return { event: result.rows[0] };
},

async update_calendar_event(args, { userId }) {
  const { event_id, ...fields } = args;
  // Build dynamic SET clause from provided fields
  const allowed = ['title', 'description', 'start_date', 'end_date', 'type', 'completed', 'location'];
  const sets = [];
  const values = [event_id, userId];
  let i = 3;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i}`);
      values.push(fields[key]);
      i++;
    }
  }
  if (sets.length === 0) return { error: 'No fields to update' };
  sets.push(`updated_at = NOW()`);
  const result = await pool.query(
    `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    values
  );
  if (result.rows.length === 0) return { error: 'Event not found' };
  return { event: result.rows[0] };
},

async delete_calendar_event(args, { userId }) {
  const result = await pool.query(
    'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 RETURNING id',
    [args.event_id, userId]
  );
  if (result.rows.length === 0) return { error: 'Event not found' };
  return { deleted: true };
}
```

#### System Prompt Addition

Add to `buildSystemPrompt()`:

```
## Calendar
You can read, create, update, and delete calendar events. Event types: planned_ride, rest_day, maintenance, purchase, event, note. When the user asks to plan workouts, schedule maintenance, or set reminders — use calendar tools. Always call get_calendar first to see what's already scheduled before adding new events, to avoid conflicts. Confirm before creating or deleting.
```

### 2.5 CalendarScreen (replaces ActivitiesScreen)

New file: `screens/CalendarScreen.tsx`

#### Data Sources

The calendar merges two feeds into a single timeline:

1. **Strava activities** (past, read-only) — from `useAppData().activities`
2. **Calendar events** (past + future, editable) — from `GET /api/calendar`

#### Visual Design — Vertical Day List

```
┌─────────────────────────────────┐
│  ← Today   July 2026    → ▼    │  ← month nav + jump-to-today
├─────────────────────────────────┤
│ THU 3                           │
│   🚴 Morning Ride  42.3km 1:35 │  ← Strava activity (gray, completed)
│   🔧 Clean drivetrain          │  ← calendar event (maintenance)
├─────────────────────────────────┤
│ FRI 4                           │
│   😴 Rest Day                   │  ← rest_day event
├─────────────────────────────────┤
│ SAT 5                           │
│   🚴 Long Ride — Col du Galibier│  ← planned_ride
│   💬 "Focus on cadence >85rpm"  │  ← note from coach
├─────────────────────────────────┤
│ SUN 6                           │
│   (empty)                       │
├─────────────────────────────────┤
│ ...                             │
```

Each day row:
- **Date header**: day-of-week abbreviation + day number. Today highlighted with accent color.
- **Activity entries** (from Strava): type icon + name + key stats. Slightly muted style (already happened).
- **Event entries** (from calendar_events): type-specific icon + title + optional description. Tappable → detail sheet or navigate to coach conversation that created it.
- **Empty days**: collapsed to a thin separator (don't show "empty" text — keeps the list scannable).

#### Type Icons

```typescript
const EVENT_ICONS: Record<string, string> = {
  planned_ride: '🚴',
  rest_day: '😴',
  maintenance: '🔧',
  purchase: '🛒',
  event: '🏁',
  note: '💬',
};
```

#### Component Structure

```typescript
// CalendarScreen.tsx

interface CalendarDay {
  date: string;           // YYYY-MM-DD
  activities: Activity[]; // Strava activities for this day
  events: CalendarEvent[];// calendar_events for this day
}

// State
const [days, setDays] = useState<CalendarDay[]>([]);
const [month, setMonth] = useState(new Date()); // current view month
const [loading, setLoading] = useState(true);

// Load on mount and month change
useEffect(() => {
  loadCalendarData(month);
}, [month]);

async function loadCalendarData(m: Date) {
  const from = startOfMonth(subMonths(m, 1)); // load prev month for scroll context
  const to = endOfMonth(addMonths(m, 2));     // load 2 months ahead
  const [activities, events] = await Promise.all([
    loadActivities(),    // from AppDataContext (already cached)
    apiFetch(`/api/calendar?from=${fmt(from)}&to=${fmt(to)}`),
  ]);
  // Merge into CalendarDay[] grouped by date
  setDays(mergeToDays(activities, events, from, to));
}
```

#### Navigation Changes

In `App.tsx`, the `ActivitiesTab` changes from:
```tsx
<Tab.Screen name="ActivitiesTab" component={ActivitiesScreen} ... />
```
to a stack navigator (for future detail screens):
```tsx
const CalendarStack = createNativeStackNavigator();

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen name="Calendar" component={CalendarScreen} />
    </CalendarStack.Navigator>
  );
}

// In MainTabs:
<Tab.Screen
  name="CalendarTab"
  component={CalendarStackScreen}
  options={{
    tabBarLabel: 'Calendar',
    tabBarIcon: ({ color, size }) => <CalendarIcon size={size} color={color} />,
  }}
/>
```

Tab icon: replace `DirectionsBikeIcon` with a new `CalendarIcon` (simple calendar outline SVG).

#### Interaction: Tap → Event Detail

Tapping a calendar event opens a compact bottom sheet:
- Title, type badge, date, description, location
- If `source === 'coach'` and `coach_conversation_id` exists: "Open Conversation →" link → navigates to CoachChatScreen with `openConversationId`
- Edit button (opens inline edit form, same pattern as PlannedRidesWidget modal)
- Delete button (with confirmation alert)

Tapping a Strava activity navigates to `RideAnalyticsScreen` (same as current ActivitiesScreen behavior).

#### "Discuss in Coach" Entry Point

Add a floating action button or header button: "Plan with Coach" — opens CoachChatScreen with `initialPrompt: "Let's plan my training for the upcoming week"`. This makes the calendar ↔ coach connection obvious.

### 2.6 Rich Card in Chat — CalendarEventCreatedCard

New file: `components/coach/CalendarEventCreatedCard.tsx`

Rendered in `ChatMessageBubble` when `create_calendar_event` tool call completes. Same pattern as `GoalCreatedCard`:

```typescript
export const CalendarEventCreatedCard: React.FC<{
  event: { id: number; type: string; title: string; start_date: string; description?: string };
  onPress: () => void; // navigate to calendar
}>;
```

Visual: type icon + colored accent bar (type-specific colors) + title + date + "View in Calendar →".

Type colors:
```typescript
const TYPE_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',   // brand blue
  rest_day: '#6B7280',       // gray
  maintenance: '#F59E0B',    // amber
  purchase: '#10B981',       // green
  event: '#FC5200',          // strava orange
  note: '#8B5CF6',           // purple
};
```

### 2.7 PlannedRidesWidget Migration

`PlannedRidesWidget.tsx` on GarageScreen currently hits `/api/rides`. Two options:

**Option A (recommended)**: Keep PlannedRidesWidget but point it at `/api/calendar?type=planned_ride`. It becomes a read-only "upcoming rides" summary on the garage screen. Remove the "Add" button — ride planning now happens through the coach or the calendar screen.

**Option B**: Remove PlannedRidesWidget from GarageScreen entirely since the calendar tab replaces it.

→ Go with **Option A** for v1. The garage showing upcoming planned rides is useful context next to bike stats.

---

## 3. Feature C — Apple Calendar Sync

### 3.1 Library

**`react-native-calendar-events`** — the standard EventKit bridge for React Native.
- ~50K weekly npm downloads
- Maintained, supports iOS 13+
- Native bridge (Old Arch compatible — matches BikeLab's current setup)
- Permissions: `NSCalendarsUsageDescription` in Info.plist

```bash
npm install react-native-calendar-events
cd ios && pod install
```

### 3.2 Architecture — One-Way Push

BikeLab → Apple Calendar (not bidirectional). Reasoning:
- Bidirectional sync is a complexity nightmare (conflict resolution, polling, deleted events)
- The user's value is seeing BikeLab events in their system calendar alongside work/life
- BikeLab remains the source of truth for training data

### 3.3 Sync Flow

```
calendar_event created/updated/deleted in BikeLab DB
  → REST response returns event to client
  → Client checks: is Apple Calendar sync enabled?
    → YES: upsert/delete in EventKit using apple_event_id
    → Save apple_event_id back to server (PUT /api/calendar/:id { apple_event_id })
```

### 3.4 calendarSync.ts

New file: `utils/calendarSync.ts`

```typescript
import RNCalendarEvents, { CalendarEventWritable } from 'react-native-calendar-events';
import { apiFetch } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_ENABLED_KEY = 'apple_calendar_sync_enabled';
const BIKELAB_CALENDAR_TITLE = 'BikeLab';

export async function isSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SYNC_ENABLED_KEY)) === 'true';
}

export async function enableSync(): Promise<boolean> {
  const status = await RNCalendarEvents.requestPermissions();
  if (status !== 'authorized') return false;

  // Find or create "BikeLab" calendar
  const calendars = await RNCalendarEvents.findCalendars();
  let bikelab = calendars.find(c => c.title === BIKELAB_CALENDAR_TITLE);
  if (!bikelab) {
    // Create dedicated calendar (iOS only)
    // react-native-calendar-events doesn't expose createCalendar directly,
    // so events go into the default calendar with a "[BikeLab]" title prefix.
    // Future: use native module to create a dedicated calendar.
  }

  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'true');
  return true;
}

export async function disableSync(): Promise<void> {
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'false');
}

export async function syncEventToApple(
  event: CalendarEvent
): Promise<string | null> {
  if (!(await isSyncEnabled())) return null;

  const payload: CalendarEventWritable = {
    title: `[BikeLab] ${event.title}`,
    startDate: event.start_date,  // will need time component
    endDate: event.end_date || event.start_date,
    allDay: event.all_day ?? true,
    notes: event.description || undefined,
    location: event.location || undefined,
  };

  let appleId: string;
  if (event.apple_event_id) {
    // Update existing
    appleId = await RNCalendarEvents.saveEvent(event.apple_event_id, payload);
  } else {
    // Create new
    appleId = await RNCalendarEvents.saveEvent(payload.title, payload);
  }

  // Persist apple_event_id back to server
  if (appleId && appleId !== event.apple_event_id) {
    await apiFetch(`/api/calendar/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apple_event_id: appleId }),
    }).catch(() => {}); // non-critical
  }

  return appleId;
}

export async function deleteAppleEvent(appleEventId: string): Promise<void> {
  if (!(await isSyncEnabled())) return;
  try {
    await RNCalendarEvents.removeEvent(appleEventId);
  } catch (e) {
    console.warn('[calendarSync] Failed to delete Apple event:', e);
  }
}
```

### 3.5 Settings Toggle

Add to `ProfileScreen` (or a new CalendarSettingsScreen):

```
Apple Calendar Sync     [toggle]
─────────────────────────────
Sync planned rides, rest days, and
other events to your Apple Calendar.
```

First toggle-on triggers permission request. If denied → show alert explaining how to enable in Settings.

### 3.6 When Sync Fires

Sync calls happen at the **client level**, immediately after successful API responses:

```typescript
// In CalendarScreen or wherever events are created/updated/deleted:
const event = await apiFetch('/api/calendar', { method: 'POST', body: ... });
syncEventToApple(event); // fire-and-forget

// For coach-created events — in ChatMessageBubble or useCoachChat:
// When a create_calendar_event tool_result arrives, extract the event and sync:
if (toolCall.name === 'create_calendar_event' && toolCall.result?.event) {
  syncEventToApple(toolCall.result.event);
}
```

### 3.7 Bulk Initial Sync

When the user first enables sync, do a one-time bulk push:

```typescript
async function bulkSyncToApple(): Promise<void> {
  const events = await apiFetch('/api/calendar?from=today&to=+365d');
  for (const event of events) {
    await syncEventToApple(event);
    await new Promise(r => setTimeout(r, 100)); // throttle
  }
}
```

---

## 4. Implementation Phases

### Phase 1 — Activity Context Attachment (frontend-only, ~2 days)

Files to create:
- `components/coach/ActivityPickerModal.tsx`

Files to modify:
- `components/coach/ChatInput.tsx` — add "+" button, attachment pills
- `screens/CoachChatScreen.tsx` — state for picker + attachments, wire handleSend

No backend changes. Uses existing `hiddenContext` mechanism.

### Phase 2 — Calendar Backend + Screen (~3 days)

Files to create:
- `screens/CalendarScreen.tsx`
- `components/coach/CalendarEventCreatedCard.tsx`
- `assets/img/icons/CalendarIcon.tsx`

Files to modify:
- `server/server.js` — new `/api/calendar` CRUD endpoints + migration SQL
- `server/aiCoach.js` — remove `get_planned_rides`, add `get_calendar`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event` tools + executors + system prompt
- `App.tsx` — replace ActivitiesTab with CalendarTab (stack navigator)
- `components/coach/ChatMessageBubble.tsx` — render CalendarEventCreatedCard for `create_calendar_event` results
- `components/coach/ToolCallCard.tsx` — add i18n labels for new tool names
- `components/PlannedRidesWidget.tsx` — point to `/api/calendar?type=planned_ride`, remove Add button

i18n keys to add:
- `calendar.title`, `calendar.today`, `calendar.empty`, `calendar.planWithCoach`
- `calendar.types.planned_ride`, `calendar.types.rest_day`, etc.
- `coach.tools.get_calendar`, `coach.tools.create_calendar_event`, etc.
- `coach.calendarEventCreatedLabel`, `coach.viewInCalendar`

### Phase 3 — Apple Calendar Sync (~1 day)

Files to create:
- `utils/calendarSync.ts`

Files to modify:
- `ios/BikeLabApp/Info.plist` — add `NSCalendarsUsageDescription`
- `screens/ProfileScreen.tsx` (or new settings screen) — sync toggle
- `screens/CalendarScreen.tsx` — call `syncEventToApple` after create/update/delete
- Wire sync into coach tool_result handling

```bash
npm install react-native-calendar-events
cd ios && pod install
```

### Phase 4 — Polish & Edge Cases (~1 day)

- Empty state for calendar (no events, no activities — show "Plan with Coach" CTA)
- Pull-to-refresh on calendar
- Scroll-to-today on mount
- Auto-expand current week
- Keyboard avoidance in event detail sheet
- Handle `get_planned_rides` gracefully if old conversations reference it (alias to `get_calendar`)
- Remove `ActivitiesScreen.tsx` and `VideoHeaderWithStats` (if not used elsewhere)

---

## 5. Token Budget Impact

| Source | Tokens per call (est.) |
|---|---|
| `get_calendar` (30 days, ~10 events) | ~400 |
| `create_calendar_event` args | ~80 |
| Activity context (5 activities) | ~1,000 |
| System prompt addition (calendar section) | ~120 |

Total impact: minimal. Calendar tools are lightweight compared to `get_activity_analysis` (~2K tokens).

---

## 6. Files Summary

### New Files
| File | Purpose |
|---|---|
| `components/coach/ActivityPickerModal.tsx` | Multi-select activity picker modal |
| `screens/CalendarScreen.tsx` | Calendar view replacing ActivitiesScreen |
| `components/coach/CalendarEventCreatedCard.tsx` | Rich card for coach-created events |
| `utils/calendarSync.ts` | Apple Calendar EventKit sync logic |
| `assets/img/icons/CalendarIcon.tsx` | Tab bar icon |

### Modified Files
| File | Change |
|---|---|
| `components/coach/ChatInput.tsx` | Add "+" button, attachment pills |
| `screens/CoachChatScreen.tsx` | Activity picker state, handleSend with context |
| `server/server.js` | `/api/calendar` CRUD endpoints, migration SQL |
| `server/aiCoach.js` | Calendar tools (4 new), remove get_planned_rides, system prompt |
| `App.tsx` | ActivitiesTab → CalendarTab |
| `components/coach/ChatMessageBubble.tsx` | CalendarEventCreatedCard rendering |
| `components/coach/ToolCallCard.tsx` | i18n labels for calendar tools |
| `components/PlannedRidesWidget.tsx` | Read-only mode, point to new API |
| `ios/BikeLabApp/Info.plist` | Calendar permissions |

### Deleted Files
| File | Reason |
|---|---|
| `screens/ActivitiesScreen.tsx` | Replaced by CalendarScreen |
