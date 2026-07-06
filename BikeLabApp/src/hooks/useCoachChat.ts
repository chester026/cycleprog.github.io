// Chat state + orchestration for the AI Coach screen.
//
// Note on tool-call/tool-result matching: the backend SSE stream doesn't tag
// tool_call/tool_result events with a per-call id (see server/server.js),
// only a tool name. We match the most recent "running" call with that name,
// which is correct for the common case (each tool called once per turn) but
// could misattribute results if the model calls the same tool twice in one
// turn. Fine for v1 — flag as a follow-up if that ever shows up in practice.

import {useCallback, useEffect, useRef, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import {apiFetch} from '../utils/api';
import {streamChat} from '../utils/coachSSE';
import {
  AnalysisDetailType,
  ChatMessage,
  CoachConversationDetail,
  ConversationSummary,
  OutgoingChatMessage,
  SuggestionItem,
  ToolCall,
} from '../types/coach';

const TOKEN_FLUSH_INTERVAL_MS = 50;

export function useCoachChat() {
  // Conversation list (shown on the coach's "home" screen)
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  // Active conversation
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Mirrors `conversationId` for the same reason `messagesRef` mirrors
  // `messages`: callers that fire `startNewConversation()`/`openConversation()`
  // immediately followed by `sendMessage()` in the same tick (the home hero's
  // quick-start chips do exactly this) would otherwise have `sendMessage`
  // close over the PREVIOUS render's `conversationId`, since the state
  // setter's effect isn't visible until the next render — sending the new
  // conversation's first message onto the old conversation instead. Every
  // place that changes the active conversation writes through this ref
  // synchronously, so `sendMessage` always sees the current value.
  const conversationIdRef = useRef<string | null>(null);

  const streamingTextRef = useRef('');
  const cancelRef = useRef<null | (() => void)>(null);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);

  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const list = await apiFetch('/api/coach/conversations');
      setConversations(Array.isArray(list) ? list : []);
    } catch (e) {
      // Offline or no history yet — leave whatever list we already have.
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const stopFlushing = useCallback(() => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  }, []);

  const flushTokens = useCallback(() => {
    const assistantId = assistantMessageIdRef.current;
    if (!assistantId) return;
    setMessages(prev =>
      prev.map(m => (m.id === assistantId ? {...m, content: streamingTextRef.current} : m)),
    );
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      cancelRef.current?.();
      stopFlushing();
      setStreaming(false);
      setError(null);
      setLoadingConversation(true);
      try {
        const detail: CoachConversationDetail = await apiFetch(`/api/coach/conversations/${id}`);
        conversationIdRef.current = detail.conversation.id;
        setConversationId(detail.conversation.id);
        setMessages(
          detail.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls || undefined,
            suggestions: m.suggestions || undefined,
            createdAt: m.created_at,
          })),
        );
        const last = detail.messages[detail.messages.length - 1];
        setSuggestions(last?.suggestions?.length ? last.suggestions : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load conversation');
      } finally {
        setLoadingConversation(false);
      }
    },
    [stopFlushing],
  );

  const startNewConversation = useCallback(() => {
    cancelRef.current?.();
    stopFlushing();
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    setSuggestions([]);
    setStreaming(false);
    setError(null);
  }, [stopFlushing]);

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) {
        startNewConversation();
      }
      try {
        await apiFetch(`/api/coach/conversations/${id}`, {method: 'DELETE'});
      } catch (e) {
        // Non-critical — worst case it reappears on next refresh, which is
        // fine since the user already saw it disappear from the list.
        refreshConversations();
      }
    },
    [conversationId, startNewConversation, refreshConversations],
  );

  const sendMessage = useCallback(
    async (text: string, options?: {hiddenContext?: string; revealDetail?: AnalysisDetailType}) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const assistantId = uuidv4();
      assistantMessageIdRef.current = assistantId;
      // `revealDetail` is set only when this turn came from tapping a
      // specific detail chip (see SuggestedActions/CoachChatScreen) — it
      // never goes over the wire, just tags the reply we're about to stream
      // in so ChatMessageBubble knows to reveal exactly that one card
      // instead of every angle at once.
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        streaming: true,
        revealDetail: options?.revealDetail,
      };

      // `hiddenContext` (e.g. a Strava activity id from "Discuss with
      // Coach") is attached only to this outgoing request's new user turn —
      // never to the displayed `userMessage` above or to history rebuilt
      // from `messagesRef` on the next turn, so it's strictly one-shot and
      // never leaks into anything the user sees or that gets persisted.
      const historyForRequest: OutgoingChatMessage[] = [
        ...messagesRef.current.map(m => ({role: m.role, content: m.content})),
        {role: 'user', content: trimmed, ...(options?.hiddenContext ? {hiddenContext: options.hiddenContext} : {})},
      ];

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setSuggestions([]);
      setStreaming(true);
      streamingTextRef.current = '';

      flushIntervalRef.current = setInterval(flushTokens, TOKEN_FLUSH_INTERVAL_MS);

      const toolCalls: ToolCall[] = [];
      const applyToolCalls = () => {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? {...m, toolCalls: [...toolCalls]} : m)),
        );
      };

      try {
        cancelRef.current = await streamChat(historyForRequest, conversationIdRef.current, {
          onToken: token => {
            streamingTextRef.current += token;
          },
          onToolCall: (name, args) => {
            toolCalls.push({name, args, status: 'running'});
            applyToolCalls();
          },
          onToolResult: (name, result) => {
            const call = [...toolCalls].reverse().find(tc => tc.name === name && tc.status === 'running');
            if (call) {
              call.status = 'done';
              call.result = result;
            }
            applyToolCalls();
          },
          onSuggestions: items => setSuggestions(items),
          onDone: newConversationId => {
            stopFlushing();
            flushTokens();
            conversationIdRef.current = newConversationId;
            setConversationId(newConversationId);
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? {...m, streaming: false} : m)),
            );
            setStreaming(false);
            refreshConversations();
          },
          onRedirect: existingConversationId => {
            // The server discovered this brand-new conversation's first
            // analysis was for a ride already discussed elsewhere and
            // deleted it server-side — drop our local optimistic
            // user/assistant messages for it (they belong to a conversation
            // that no longer exists) and load the real one instead.
            stopFlushing();
            setStreaming(false);
            setMessages([]);
            conversationIdRef.current = null;
            setConversationId(null);
            openConversation(existingConversationId);
            refreshConversations();
          },
          onError: message => {
            stopFlushing();
            setError(message);
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? {...m, content: streamingTextRef.current || message, streaming: false, error: true}
                  : m,
              ),
            );
            setStreaming(false);
          },
        });
      } catch (e: any) {
        stopFlushing();
        setStreaming(false);
        setError(e?.message || 'Failed to reach the coach.');
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? {...m, streaming: false, error: true} : m)),
        );
      }
    },
    [conversationId, streaming, flushTokens, stopFlushing, refreshConversations, openConversation],
  );

  const cancelStream = useCallback(() => {
    cancelRef.current?.();
    stopFlushing();
    flushTokens();
    setStreaming(false);
    const assistantId = assistantMessageIdRef.current;
    if (assistantId) {
      setMessages(prev => prev.map(m => (m.id === assistantId ? {...m, streaming: false} : m)));
    }
  }, [flushTokens, stopFlushing]);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
      stopFlushing();
    };
  }, [stopFlushing]);

  return {
    conversations,
    loadingConversations,
    refreshConversations,
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
    deleteConversation,
  };
}
