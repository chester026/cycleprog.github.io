// Chat state + stream orchestration for the AI Coach page — a port of
// BikeLabApp/src/hooks/useCoachChat.ts on top of the shared fetch-based SSE
// reader (browser EventSource can't POST or carry the Bearer header).
//
// Tool-call/tool-result pairing: the stream tags both events with a tool
// name only (no per-call id), so a result closes the most recent 'running'
// call of that name — right whenever a tool runs once per turn, which is
// the common case.
//
// Only the new turn goes over the wire (`{message, conversation_id,
// hidden_context, client:'web'}`); the server loads the history itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoachSseEventSchema } from '@bikelab/shared/types';
import { readSseJson } from '@bikelab/shared/api';
import { stream, isApiError } from '../utils/api';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/keys';
import { fetchCoachConversation } from '../data/hooks/useCoachConversation';
import { t, WEB_COPY } from '../pages/coach/copy';
import { formatLocalTime, mapPersistedMessages } from '../pages/coach/lib';

// The one endpoint outside the REST contract (it streams SSE frames, see
// packages/shared/src/api/contract/coach.ts) — hence a literal path here.
const COACH_CHAT_PATH = '/api/coach/chat';

// Tokens arrive faster than React should re-render a growing bubble; the
// buffer is flushed into state on this cadence instead of per token.
const TOKEN_FLUSH_INTERVAL_MS = 50;

const RATE_LIMITED_CODE = 'RATE_LIMITED';

// Which caches a tool's side effect makes stale. The web adds calendar and
// bikes/bikeHealth to the app's table (the app forgets those).
const TOOL_INVALIDATIONS = {
  create_goal: [queryKeys.metaGoals, queryKeys.goals],
  update_goal: [queryKeys.metaGoals, queryKeys.goals],
  complete_goal: [queryKeys.metaGoals, queryKeys.goals],
  delete_goal: [queryKeys.metaGoals, queryKeys.goals],
  create_calendar_event: [queryKeys.calendarAll],
  update_calendar_event: [queryKeys.calendarAll],
  delete_calendar_event: [queryKeys.calendarAll],
  add_checklist_items: [queryKeys.checklist],
  update_checklist_item: [queryKeys.checklist],
  remember_about_rider: [queryKeys.coachNotes],
  forget_about_rider: [queryKeys.coachNotes],
  update_rider_profile: [queryKeys.profile],
  log_bike_service: [queryKeys.bikes, queryKeys.bikeHealthAll],
  set_bike_gear_label: [queryKeys.bikes, queryKeys.bikeHealthAll],
};

function invalidateForTool(name) {
  for (const key of TOOL_INVALIDATIONS[name] ?? []) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Rider-safe text for a failed /api/coach/chat request. A pre-stream
 * failure is a plain JSON envelope the shared client has parsed into an
 * ApiError (`code`, `details.resetAt` for the daily budget, `message` from
 * the envelope's `error`). Server 5xx and network failures collapse into the
 * generic connection line rather than leaking an internal message.
 */
export function describeStreamError(err) {
  if (!isApiError(err)) return WEB_COPY.connectionError;
  if (err.code === 'AI_BUDGET_EXCEEDED' && typeof err.details?.resetAt === 'string') {
    return t('coach.budgetExceeded', { time: formatLocalTime(err.details.resetAt) });
  }
  if (err.code === RATE_LIMITED_CODE) return WEB_COPY.rateLimited;
  if (err.status >= 400 && err.status < 500 && err.message) return err.message;
  return WEB_COPY.connectionError;
}

export function useCoachChat() {
  const navigate = useNavigate();

  const [conversationId, setConversationId] = useState(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);

  // Mirrors `conversationId` synchronously: the home's quick-start chips
  // call startNewConversation() and sendMessage() in the same tick, and a
  // state setter's result isn't visible until the next render — without the
  // ref the first message would go onto the previous conversation.
  const conversationIdRef = useRef(null);
  const streamingTextRef = useRef('');
  const abortRef = useRef(null);
  const flushIntervalRef = useRef(null);
  const assistantMessageIdRef = useRef(null);

  const setActiveConversation = useCallback((id) => {
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);

  const stopFlushing = useCallback(() => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  }, []);

  const flushTokens = useCallback(() => {
    const assistantId = assistantMessageIdRef.current;
    if (!assistantId) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content: streamingTextRef.current } : m)),
    );
  }, []);

  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopFlushing();
  }, [stopFlushing]);

  const openConversation = useCallback(
    async (id) => {
      abortActiveStream();
      setStreaming(false);
      setError(null);
      setLoadingConversation(true);
      try {
        const detail = await fetchCoachConversation(queryClient, id);
        setActiveConversation(detail.conversation.id);
        const restored = mapPersistedMessages(detail.messages);
        setMessages(restored);
        const last = restored[restored.length - 1];
        setSuggestions(last?.suggestions?.length ? last.suggestions : []);
      } catch {
        setError(WEB_COPY.loadConversationFailed);
      } finally {
        setLoadingConversation(false);
      }
    },
    [abortActiveStream, setActiveConversation],
  );

  const startNewConversation = useCallback(() => {
    abortActiveStream();
    setActiveConversation(null);
    setMessages([]);
    setSuggestions([]);
    setStreaming(false);
    setError(null);
  }, [abortActiveStream, setActiveConversation]);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const assistantId = crypto.randomUUID();
      assistantMessageIdRef.current = assistantId;
      const now = new Date().toISOString();
      const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: now };
      // `revealDetail` never goes over the wire — it tags the reply so the
      // bubble reveals exactly the one analysis card the chip asked for.
      const assistantMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now,
        streaming: true,
        revealDetail: options.revealDetail,
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setSuggestions([]);
      setStreaming(true);
      streamingTextRef.current = '';
      flushIntervalRef.current = setInterval(flushTokens, TOKEN_FLUSH_INTERVAL_MS);

      const wasNewConversation = conversationIdRef.current === null;
      const controller = new AbortController();
      abortRef.current = controller;

      const toolCalls = [];
      const applyToolCalls = () => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m)));
      };
      const finishAssistant = (patch) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, ...patch } : m)));
      };
      const failTurn = (message) => {
        stopFlushing();
        setError(message);
        finishAssistant({ content: streamingTextRef.current || message, error: true });
        setStreaming(false);
      };

      let settled = false;
      try {
        const response = await stream(
          COACH_CHAT_PATH,
          {
            message: trimmed,
            conversation_id: conversationIdRef.current,
            ...(options.hiddenContext ? { hidden_context: options.hiddenContext } : {}),
            client: 'web',
          },
          { signal: controller.signal },
        );

        for await (const raw of readSseJson(response, controller.signal)) {
          const parsed = CoachSseEventSchema.safeParse(raw);
          // Unknown event types are ignored so the server can add new ones
          // without a lockstep release.
          if (!parsed.success) continue;
          const event = parsed.data;
          switch (event.type) {
            case 'conversation':
              setActiveConversation(event.conversation_id);
              break;
            case 'token':
              streamingTextRef.current += event.content;
              break;
            case 'tool_call':
              toolCalls.push({ name: event.name, args: event.args ?? {}, status: 'running' });
              applyToolCalls();
              break;
            case 'tool_result': {
              const call = [...toolCalls].reverse().find((tc) => tc.name === event.name && tc.status === 'running');
              if (call) {
                call.status = 'done';
                call.result = event.result;
              }
              applyToolCalls();
              invalidateForTool(event.name);
              break;
            }
            case 'suggestions':
              setSuggestions(event.items ?? []);
              break;
            case 'done':
              settled = true;
              stopFlushing();
              flushTokens();
              setActiveConversation(event.conversation_id);
              finishAssistant({});
              setStreaming(false);
              // Title/updated_at/message_count are only known server-side,
              // and the detail cache would otherwise serve the pre-turn
              // snapshot for five minutes on a back-and-reopen.
              queryClient.invalidateQueries({ queryKey: queryKeys.coachConversations });
              queryClient.invalidateQueries({ queryKey: queryKeys.coachConversation(event.conversation_id) });
              if (wasNewConversation) navigate(`/coach/c/${event.conversation_id}`, { replace: true });
              break;
            case 'redirect':
              // The server found this ride was already discussed elsewhere
              // and deleted the just-created conversation — drop the local
              // optimistic messages and open the existing one.
              settled = true;
              stopFlushing();
              setStreaming(false);
              setMessages([]);
              setActiveConversation(null);
              queryClient.invalidateQueries({ queryKey: queryKeys.coachConversations });
              navigate(`/coach/c/${event.conversation_id}`, { replace: true });
              break;
            case 'error':
              settled = true;
              failTurn(event.message || WEB_COPY.coachUnavailable);
              break;
            default:
              break;
          }
          if (settled) break;
        }

        if (!settled) {
          // Either the rider stopped it (cancelStream already settled the
          // UI, the partial text stays) or the connection dropped mid-turn.
          if (!controller.signal.aborted) failTurn(WEB_COPY.connectionError);
        }
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          stopFlushing();
          flushTokens();
          finishAssistant({});
          setStreaming(false);
        } else {
          failTurn(describeStreamError(err));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [streaming, flushTokens, stopFlushing, navigate, setActiveConversation],
  );

  // Stops the turn and keeps whatever text has arrived — not an error.
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    stopFlushing();
    flushTokens();
    setStreaming(false);
    const assistantId = assistantMessageIdRef.current;
    if (assistantId) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
    }
  }, [flushTokens, stopFlushing]);

  // Leaving the page closes the connection so the server aborts the model call.
  useEffect(() => abortActiveStream, [abortActiveStream]);

  return {
    conversationId,
    loadingConversation,
    messages,
    streaming,
    suggestions,
    error,
    sendMessage,
    cancelStream,
    startNewConversation,
    openConversation,
  };
}
