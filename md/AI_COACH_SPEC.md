# AI Coach — Technical Spec

> GoalAssistantScreen → CoachChatScreen transformation.
> Coach = conversational AI chat that replaces goal assistant and adds full cycling coaching.
> **Model: GPT-4.1 Mini** ($0.40/$1.60 per 1M tokens, 1M context window). Upgrade to GPT-4.1 full only if quality insufficient.

## What exists (don't break)

```
Navigation: GoalsTab → GoalsStackScreen → "GoalAssistant" (GoalAssistantScreen)
                                        → "GoalDetails" (GoalDetailsScreen)

GoalAssistantScreen.tsx  — single-prompt goal generator, REPLACING with CoachChatScreen
GoalDetailsScreen.tsx    — goal details with metrics + trainings, KEEP AS-IS
MetaGoalCard.tsx         — goal card in list, KEEP
AIAnalysisModal.tsx      — per-activity AI analysis (existing AI pattern), KEEP
```

### Current API (all via `apiFetch` from `utils/api.ts`, base: `https://bikelab.app`)

```
GET  /api/activities                    → Activity[]
GET  /api/user-profile                  → UserProfile
GET  /api/analytics-snapshot/latest     → AnalyticsSnapshot
GET  /api/analytics-snapshot/history    → AnalyticsSnapshot[]
GET  /api/skills-history/last           → SkillsSnapshot
GET  /api/skills-history/range?limit=N  → SkillsSnapshot[]
GET  /api/achievements/me               → Achievement[]
GET  /api/bikes                         → Bike[]
GET  /api/bikes/:id/health              → BikeHealth
GET  /api/meta-goals                    → MetaGoal[]
GET  /api/meta-goals/:id                → { metaGoal, subGoals }
POST /api/meta-goals/ai-generate        → { metaGoal }  (current goal gen, will be absorbed by coach)
PUT  /api/meta-goals/:id                → update goal status/fields
DELETE /api/meta-goals/:id              → delete goal
GET  /api/training-types                → TrainingType[]
GET  /api/rides                         → PlannedRide[]
GET  /api/activities/:id/ai-analysis    → { analysis: string }
```

### Key types (from `utils/goalsCache.ts` and `types/activity.ts`)

```typescript
interface Activity {
  id: number; name: string; distance: number; moving_time: number;
  elapsed_time: number; start_date: string; type: string;
  total_elevation_gain: number; average_speed: number; max_speed: number;
  average_heartrate?: number; max_heartrate?: number;
  average_cadence?: number; average_watts?: number; max_watts?: number;
  weighted_average_watts?: number; workout_type?: number;
}

interface MetaGoal {
  id: number; title: string; description: string;
  status: 'active' | 'completed';
  tier?: 'legendary' | 'epic' | 'grand' | 'base';
  target_date?: string; created_at: string;
  trainingTypes?: Array<{ type: string; title: string; description: string; priority: number }>;
}

interface Goal {
  id: number; meta_goal_id?: number; goal_type: string;
  target_value: number; current_value: number;
  period: '4w' | '3m' | 'year';
  metric_name?: string; description?: string;
}

interface UserProfile {
  weight?: number; age?: number; gender?: 'male' | 'female';
  experience_level?: 'beginner' | 'intermediate' | 'advanced';
  max_hr?: number; resting_hr?: number; lactate_threshold?: number;
}

interface AnalyticsSnapshot {
  avg_power: number | null; max_power: number | null;
  avg_hr: number | null; max_hr: number | null;
  avg_speed: number | null; avg_cadence: number | null;
  vo2max: number | null; activities_count: number;
}
```

### Data context (from `AppDataContext.tsx`)

```typescript
// Available via useAppData() hook:
const { activities, loadActivities, userProfile, loadUserProfile, clearAll } = useAppData();
// Activities cached 1hr, profile cached 30min
```

---

## New Backend API

### Chat endpoint (SSE streaming)

```
POST /api/coach/chat
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <token>

Request:
{
  "messages": [
    { "role": "user", "content": "How's my training going?" },
    { "role": "assistant", "content": "Based on your last week..." }
  ],
  "conversation_id": "uuid | null",  // null = new conversation
  "context": {
    "include_profile": true,
    "include_recent_activities": 10
  }
}

SSE Response stream:
data: {"type":"token","content":"Let"}
data: {"type":"token","content":" me"}
data: {"type":"token","content":" check"}
data: {"type":"tool_call","name":"get_user_analytics","args":{}}
data: {"type":"tool_result","name":"get_user_analytics","result":{...}}
data: {"type":"token","content":"Your FTP improved by 5%..."}
data: {"type":"suggestions","items":["Show weekly volume","Create FTP goal","Plan next week"]}
data: {"type":"done","conversation_id":"uuid","message_id":"uuid","usage":{"prompt_tokens":1200,"completion_tokens":340}}
```

### Conversation management

```
GET    /api/coach/conversations              → ConversationSummary[]
GET    /api/coach/conversations/:id          → { conversation, messages[] }
DELETE /api/coach/conversations/:id          → void
```

### New types

```typescript
interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  suggestions?: string[];
  created_at: string;
}

interface ToolCall {
  name: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface Conversation {
  id: string;
  title: string;  // auto-generated from first user message
  created_at: string;
  updated_at: string;
  message_count: number;
}
```

### Function calling tools (LLM-side)

The backend registers these tools with the LLM. The LLM decides when to call them.

| Tool | Args | Returns | When LLM uses it |
|------|------|---------|-------------------|
| `get_user_profile` | none | UserProfile | User asks about their stats, coach needs context |
| `get_recent_activities` | `{count: number}` | Activity[] | "How was my last ride?", training analysis |
| `get_analytics_snapshot` | none | AnalyticsSnapshot | FTP/power/HR trends, fitness overview |
| `get_skills_radar` | none | Skills + trends | "What are my strengths?", rider profile |
| `get_goals_progress` | none | MetaGoal[] with progress | "How's my goal going?", progress check |
| `create_goal` | `{title, description, tier?, target_date?}` | MetaGoal | User wants to set a new goal |
| `update_goal` | `{goal_id, status?, target_date?}` | MetaGoal | Modify or complete a goal |
| `get_training_recommendations` | `{goal_id?}` | Training[] | "What should I do today?" |
| `get_bike_health` | none | BikeHealth[] | Maintenance questions, gear advice |
| `get_achievements` | none | Achievement[] | Motivation, milestones |
| `get_planned_rides` | none | PlannedRide[] | Schedule coordination |

---

## Frontend Architecture

### New files to create

```
src/screens/CoachChatScreen.tsx          — main chat screen (replaces GoalAssistantScreen)
src/components/coach/ChatMessageBubble.tsx  — single message bubble (user or assistant)
src/components/coach/ChatInput.tsx          — text input with send button
src/components/coach/SuggestedActions.tsx   — horizontal chips below last message
src/components/coach/ToolCallCard.tsx       — inline "Analyzing..." card during tool calls
src/components/coach/GoalCreatedCard.tsx    — inline card when goal is created via chat
src/components/coach/StreamingDots.tsx      — typing indicator while streaming
src/hooks/useCoachChat.ts                   — chat logic hook (messages, send, stream)
src/utils/coachSSE.ts                       — SSE streaming utility
src/types/coach.ts                          — ChatMessage, Conversation, ToolCall types
```

### Files to modify

```
App.tsx — replace "GoalAssistant" route with "CoachChat" pointing to CoachChatScreen
          keep "GoalDetails" route as-is
```

### Navigation change in App.tsx

```typescript
// BEFORE:
<GoalsStack.Screen name="GoalAssistant" component={GoalAssistantScreen} />

// AFTER:
<GoalsStack.Screen name="CoachChat" component={CoachChatScreen} />

// GoalDetails stays:
<GoalsStack.Screen name="GoalDetails" component={GoalDetailsScreen} />
```

### SSE streaming utility (`utils/coachSSE.ts`)

```typescript
// Use react-native-sse (install: npm install react-native-sse)
import EventSource from 'react-native-sse';
import { TokenStorage } from './api';
import { API_BASE_URL } from './api';

interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, args: any) => void;
  onToolResult: (name: string, result: any) => void;
  onSuggestions: (items: string[]) => void;
  onDone: (conversationId: string, messageId: string) => void;
  onError: (error: string) => void;
}

export function streamChat(
  messages: { role: string; content: string }[],
  conversationId: string | null,
  callbacks: StreamCallbacks
): () => void {  // returns cancel function
  const token = await TokenStorage.getToken();

  const es = new EventSource(`${API_BASE_URL}/api/coach/chat`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({ messages, conversation_id: conversationId }),
  });

  es.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'token': callbacks.onToken(data.content); break;
      case 'tool_call': callbacks.onToolCall(data.name, data.args); break;
      case 'tool_result': callbacks.onToolResult(data.name, data.result); break;
      case 'suggestions': callbacks.onSuggestions(data.items); break;
      case 'done': callbacks.onDone(data.conversation_id, data.message_id); break;
    }
  });

  es.addEventListener('error', (event) => {
    callbacks.onError(event.message || 'Connection error');
  });

  return () => es.close();
}
```

### Chat hook pattern (`hooks/useCoachChat.ts`)

```typescript
export function useCoachChat(conversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId);
  const streamingTextRef = useRef('');  // accumulate tokens without re-render per token
  const cancelRef = useRef<(() => void) | null>(null);

  // Batch token updates (~50ms) to avoid excessive re-renders
  const flushTokens = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: streamingTextRef.current }];
      }
      return prev;
    });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: text, created_at: new Date().toISOString() };
    const assistantMsg: ChatMessage = { id: uuid(), role: 'assistant', content: '', created_at: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setSuggestions([]);
    streamingTextRef.current = '';

    const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
    let flushInterval = setInterval(flushTokens, 50);

    cancelRef.current = streamChat(allMessages, currentConversationId, {
      onToken: (token) => { streamingTextRef.current += token; },
      onToolCall: (name) => { /* show tool call indicator */ },
      onToolResult: (name, result) => { /* hide indicator, optionally show result card */ },
      onSuggestions: (items) => setSuggestions(items),
      onDone: (convId, msgId) => {
        clearInterval(flushInterval);
        flushTokens();
        setStreaming(false);
        setCurrentConversationId(convId);
      },
      onError: (err) => {
        clearInterval(flushInterval);
        setStreaming(false);
        // show error in UI
      }
    });
  }, [messages, currentConversationId]);

  const cancelStream = useCallback(() => {
    cancelRef.current?.();
    setStreaming(false);
  }, []);

  return { messages, streaming, suggestions, sendMessage, cancelStream };
}
```

### CoachChatScreen structure

```typescript
// High-level structure of CoachChatScreen.tsx
export const CoachChatScreen: React.FC<{navigation: any}> = ({ navigation }) => {
  const { messages, streaming, suggestions, sendMessage, cancelStream } = useCoachChat();
  const { t } = useTranslation();

  // Welcome suggestions (shown when no messages)
  const welcomeSuggestions = [
    t('coach.suggestProgress'),      // "How's my training going?"
    t('coach.suggestGoal'),          // "Help me set a new goal"
    t('coach.suggestLastRide'),      // "Analyze my last ride"
    t('coach.suggestWeekPlan'),      // "Plan my training week"
  ];

  return (
    <KeyboardAvoidingView style={styles.container}>
      {/* Message list (inverted FlatList) */}
      <FlatList
        inverted
        data={[...messages].reverse()}
        renderItem={({ item }) => (
          <ChatMessageBubble
            message={item}
            onGoalPress={(goalId) => navigation.navigate('GoalDetails', { goalId })}
          />
        )}
        ListFooterComponent={/* Welcome header when empty */}
      />

      {/* Suggested actions */}
      <SuggestedActions
        items={messages.length === 0 ? welcomeSuggestions : suggestions}
        onPress={(text) => sendMessage(text)}
        disabled={streaming}
      />

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={streaming}
        onCancel={cancelStream}
        streaming={streaming}
      />
    </KeyboardAvoidingView>
  );
};
```

---

## Design Decisions

### Styling
- Match existing app style: `#274dd3` primary, `#1a1a1a` text, `#fafafa` background
- User bubbles: `#274dd3` background, white text, right-aligned
- Coach bubbles: `#f1f1f1` background, dark text, left-aligned
- Suggested action chips: same as current `templateBtn` style (white bg, subtle border)
- Keep the blob.gif as chat background (subtle, blurred) for visual continuity with current GoalAssistant

### Topic validation
- Remove `isRelevantToCycling()` client-side function entirely
- System prompt handles this: coach politely redirects off-topic queries
- No hardcoded keyword arrays — LLM understands context natively

### Goal creation via chat
- When LLM calls `create_goal` tool, backend creates MetaGoal (same as current ai-generate)
- Frontend shows GoalCreatedCard inline in chat with "View Details" button
- Button navigates to GoalDetailsScreen (existing screen, no changes needed)

### Conversation persistence
- Full history stored server-side (coach_conversations + coach_messages tables)
- Load last conversation on screen open, or start new one
- Conversation list accessible via header button (future: separate screen)

---

## DB Schema (backend)

```sql
CREATE TABLE coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  suggestions JSONB,
  token_usage JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coach_messages_conv ON coach_messages(conversation_id, created_at);
CREATE INDEX idx_coach_conversations_user ON coach_conversations(user_id, updated_at DESC);
```

---

## Implementation Order

1. **Types & utilities** — `types/coach.ts`, `utils/coachSSE.ts`
2. **Chat hook** — `hooks/useCoachChat.ts`
3. **UI components** — ChatMessageBubble, ChatInput, SuggestedActions, StreamingDots
4. **Main screen** — CoachChatScreen.tsx
5. **Navigation swap** — App.tsx: GoalAssistant → CoachChat
6. **Backend** — chat endpoint, DB tables, system prompt, tools
7. **Rich cards** — ToolCallCard, GoalCreatedCard
8. **Conversation management** — list, history, new conversation button

---

## Dependencies to install

```bash
npm install react-native-sse uuid
npm install -D @types/uuid
```

## Model Configuration

**Primary model: `gpt-4.1-mini`**
- $0.40 input / $1.60 output per 1M tokens
- 1M token context window (vs 128K on GPT-4o)
- ~$0.04 per conversation (30 messages)
- Prompt caching: 75% off on repeated system prompt (automatic)
- Supports function calling, streaming, JSON mode

**Fallback/upgrade path:** if Mini quality is insufficient for complex tasks (multi-week training plans, deep multi-ride analysis), route those to `gpt-4.1` ($2/$8 per 1M) — still cheaper than current GPT-4o.

**Migration from GPT-4o:** replace model name in API calls. Request/response format is identical. Function calling schema is the same.

---

## System prompt (high-level structure for backend)

```
You are BikeLab Coach — a knowledgeable, motivating cycling coach.

## Personality
- Concise and direct, not overly verbose
- Data-driven — always reference the user's actual metrics when available
- Encouraging but realistic — celebrate progress, honest about gaps
- Speaks user's language (detect from messages)

## Scope
- ONLY cycling-related topics: training, goals, nutrition for cycling, gear, racing, recovery
- If asked about non-cycling topics: politely redirect with humor
  Example: "I'm better with watts than recipes! What cycling question can I help with?"
- Bike selection/recommendation: YES — use rider profile (climber/sprinter/allrounder), experience level, and goals to advise

## User Context
{injected at runtime: profile, goals summary, recent activity summary}

## Tools
{injected: tool definitions with schemas}

## Response Format
- Keep responses concise (2-4 paragraphs max for analysis, shorter for quick answers)
- Always end with 2-3 suggested follow-up questions/actions as JSON in suggestions field
- When creating goals, confirm details before calling create_goal
- When analyzing data, cite specific numbers from the user's activities
- Use markdown for formatting (bold, lists) — frontend renders it
```
