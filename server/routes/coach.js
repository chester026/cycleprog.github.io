// ========================================
// AI COACH — conversational chat (SSE + function calling)
// ========================================
// Tool schemas, the system prompt, and tool execution all live in aiCoach.js
// (see `coach` instantiated in services/coach.js). This module only owns:
// HTTP/SSE plumbing, conversation persistence, and the tool-calling loop.
// Extracted from server.js (T-4.1).
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract, uncontracted } = require('../middleware/contract');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { aiLimiter } = require('../middleware/rateLimits');
const { coach, sseSend } = require('../services/coach');
const coachRepo = require('../repositories/coach');
const config = require('../config');
const aiBudget = require('../services/aiBudget');
patchAsyncRoutes(router);

// T-4.4 (audit S-31): conversation history for the OpenAI call now comes
// from the server's own coach_messages (via coachRepo.getMessages), never
// from whatever a client claims its history was — a client can no longer
// inflate/forge/replay context. `priorMessages` is this conversation's
// messages BEFORE this turn's new one, in chronological (oldest-first)
// order (see coachRepo.getMessages). Truncated to the most recent
// `maxMessages`, then further trimmed from the front (oldest first) until
// the total character count is under `maxChars` — a rough stand-in for a
// token budget (~4 chars/token). The system prompt is built and prepended
// separately by the caller and is never subject to this truncation.
// Pure/side-effect-free so it's unit-testable without a database — see
// test/coachHistory.test.js.
function truncateHistoryForPrompt(priorMessages, { maxMessages, maxChars }) {
  let history = (priorMessages || []).slice(-maxMessages);
  let totalChars = history.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
  while (totalChars > maxChars && history.length > 0) {
    const dropped = history[0];
    history = history.slice(1);
    totalChars -= dropped.content ? dropped.content.length : 0;
  }
  return history;
}

// Sums an OpenAI `usage` object (prompt_tokens/completion_tokens/
// total_tokens) into a running accumulator across the tool-calling loop's
// possibly-several OpenAI calls (main turn(s) + the separate suggestions
// call) — coach_messages.token_usage records the TOTAL cost of producing
// one assistant reply, not just its last round trip.
function addUsage(accumulator, usage) {
  if (!usage) return accumulator;
  accumulator.prompt_tokens += Number(usage.prompt_tokens) || 0;
  accumulator.completion_tokens += Number(usage.completion_tokens) || 0;
  accumulator.total_tokens += Number(usage.total_tokens) || 0;
  return accumulator;
}

// Best-effort extraction of a usable "new message" from the legacy
// `messages`/`history` array shape a not-yet-updated client may still send
// (see the S-31 write-up on POST /api/coach/chat below) — same
// role/content-type filtering the old code applied, just no longer used to
// build the OpenAI history, only to find the latest real user turn.
function extractLegacyMessage(body) {
  const legacy = Array.isArray(body?.messages) ? body.messages : Array.isArray(body?.history) ? body.history : null;
  if (!legacy) return null;
  const filtered = legacy.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
  const lastUser = [...filtered].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  return { content: lastUser.content, hiddenContext: lastUser.hiddenContext };
}

// List conversations for the current user
router.get('/conversations', authMiddleware, contract(c.coach.conversations), async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await coachRepo.listConversations(userId);
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, 'Error listing coach conversations:');
    res.status(500).json({ error: 'Failed to list conversations', code: 'INTERNAL' });
  }
});

// Find an existing conversation that already analyzed this Strava activity,
// if any — lets "Discuss with Coach" (RideAnalyticsScreen) re-open the same
// thread instead of spawning a new duplicate every time it's tapped for a
// ride the rider already discussed. Returns `null` (not 404) when there's
// no match — that's the expected/common case, not an error.
router.get('/conversations/by-activity/:activityId', authMiddleware, contract(c.coach.conversationByActivity), async (req, res) => {
  try {
    const userId = req.user.userId;
    const activityId = req.params.activityId;
    const row = await coachRepo.findConversationByActivity(userId, activityId);
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, 'Error checking for existing analysis conversation:');
    res.status(500).json({ error: 'Failed to check for existing conversation', code: 'INTERNAL' });
  }
});

// Get one conversation with its message history. S-34: capped to the last
// `?limit` messages (default 200, max 500) rather than the whole table —
// see repositories/coach.js getMessages. X-Total-Count carries the true
// message count even when the body only has the tail of it.
router.get('/conversations/:id', authMiddleware, contract(c.coach.conversationDetail), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const conversation = await coachRepo.getConversation(id, userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    }
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined;
    const { messages, total } = await coachRepo.getMessages(id, limit !== undefined ? { limit } : {});
    res.set('X-Total-Count', String(total));
    res.json({ conversation, messages });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching coach conversation:');
    res.status(500).json({ error: 'Failed to fetch conversation', code: 'INTERNAL' });
  }
});

// Delete a conversation (cascades to messages)
router.delete('/conversations/:id', authMiddleware, contract(c.coach.deleteConversation), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const deleted = await coachRepo.deleteConversation(id, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting coach conversation:');
    res.status(500).json({ error: 'Failed to delete conversation', code: 'INTERNAL' });
  }
});

// Fixed labels per get_activity_analysis detail angle — deterministic and
// always offered when the data exists, rather than left up to the
// suggestion-generation LLM call (see below). Module-level so both the
// "has the rider already asked for this one?" check and the suggestion
// builder use the exact same strings.
const DETAIL_LABELS = {
  vs_baseline: { en: 'Compare to average', ru: 'Сравнить со средним' },
  similar_ride: { en: 'Similar ride comparison', ru: 'Сравнить с похожим райдом' },
  skills_delta: { en: 'Skills change', ru: 'Изменение навыков' },
};
const DETAIL_LABEL_TO_TYPE = {};
for (const [type, langs] of Object.entries(DETAIL_LABELS)) {
  DETAIL_LABEL_TO_TYPE[langs.en] = type;
  DETAIL_LABEL_TO_TYPE[langs.ru] = type;
}

// Fixed bilingual label for the "Connect Apple Health" suggestion chip —
// see suggestedConnectHealth below. Deliberately NOT added to
// DETAIL_LABEL_TO_TYPE: that map exists to recognize app-generated `detail`
// chips the rider already tapped (to avoid re-offering them), but this chip
// has an `action`, not a `detail`, and re-tapping it just re-opens
// AppleHealthScreen — nothing to dedupe against.
const CONNECT_HEALTH_LABEL = { en: 'Connect Apple Health', ru: 'Подключить Apple Health' };

// Main chat endpoint — SSE stream of tokens / tool calls / suggestions / done
//
// T-4.4 (audit S-31): conversation history is loaded server-side from
// coach_messages instead of trusting whatever the client claims its own
// history was — a client could otherwise inflate the prompt arbitrarily (cost)
// or forge/replay turns it never actually had (a correctness/trust issue on
// top of that). The request body now carries only `message` (the new user
// turn) plus `conversation_id`/`health_context` as before. A `messages` or
// `history` array is still accepted for one release (older app builds) but
// is IGNORED as a history source — see extractLegacyMessage above, used only
// as a fallback to find the new message text when `message` itself is
// missing. Clients move to the new `message` field in phases 5/6.
router.post('/chat', authMiddleware, aiLimiter, aiBudget.requireAiBudget, uncontracted('SSE stream'), async (req, res) => {
  const userId = req.user.userId;
  const { conversation_id: incomingConversationId, health_context: healthContext, hidden_context: hiddenContextField } = req.body || {};

  const hasLegacyHistory = Array.isArray(req.body?.messages) || Array.isArray(req.body?.history);
  if (hasLegacyHistory) {
    logger.debug('[coach] client sent a legacy messages/history array — ignored as a history source (server loads history from the DB)');
  }

  let newMessageContent = typeof req.body?.message === 'string' ? req.body.message : null;
  let newMessageHiddenContext = typeof hiddenContextField === 'string' ? hiddenContextField : undefined;
  if (!newMessageContent) {
    // Older client that hasn't moved to `message` yet — pull the latest real
    // user turn out of its (otherwise-ignored) messages/history array so it
    // still works, just without trusting the rest of that array as context.
    const legacy = extractLegacyMessage(req.body);
    if (legacy) {
      newMessageContent = legacy.content;
      if (legacy.hiddenContext) newMessageHiddenContext = legacy.hiddenContext;
    }
  }

  logger.debug(`[coach] ▶ request from user ${userId}, conv=${incomingConversationId || 'new'}`);
  // NEVER log `healthContext` itself here or anywhere else in this route —
  // it's on-device Apple Health data that must never touch server logs or
  // Postgres (see src/utils/healthService.ts + APPLE_HEALTH_SPEC.md §9).
  // It's used exactly once below, to build this turn's system prompt, and
  // then discarded along with the rest of the request.

  if (typeof newMessageContent !== 'string' || newMessageContent.trim().length === 0) {
    logger.debug('[coach] ✖ rejected: no usable message');
    return res.status(400).json({ error: 'message is required', code: 'VALIDATION_ERROR' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  logger.debug('[coach] headers flushed, stream open');

  // NOTE: `req.on('close')` is NOT what we want here — Node fires it as soon
  // as the request body has been fully read, which for a small JSON POST
  // body happens almost instantly (confirmed empirically: ~1ms), long before
  // the response is done. That caused every coach request to immediately
  // look "closed" and bail out before ever calling OpenAI. `res.on('close')`
  // fires when the underlying connection actually goes away — combined with
  // the `res.writableEnded` check, it only counts as a real client abort if
  // we hadn't already finished writing the response ourselves.
  let clientClosed = false;
  let activeStream = null;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      logger.debug('[coach] client aborted the connection');
      activeStream?.controller?.abort?.();
    }
  });

  try {
    // Resolve or create the conversation
    let conversationId = incomingConversationId;
    // Only a freshly-created conversation (no id from the client yet) is
    // eligible for the duplicate-analysis redirect below — an ongoing
    // conversation the user is already in shouldn't get yanked out from
    // under them just because a later tool call happens to touch a ride
    // discussed elsewhere.
    const isNewConversation = !conversationId;
    if (!conversationId) {
      conversationId = uuidv4();
      const title = newMessageContent.slice(0, 80);
      await coachRepo.createConversation(conversationId, userId, title);
    } else {
      const exists = await coachRepo.conversationExists(conversationId, userId);
      if (!exists) {
        sseSend(res, { type: 'error', message: 'Conversation not found' });
        return res.end();
      }
    }

    // Load this conversation's history from the DB — BEFORE persisting this
    // turn's new message, so `priorMessages` is exactly "everything before
    // now" and the new message can be appended explicitly below without
    // double-counting it. Reuses getMessages' own cap (S-34, default 200) —
    // comfortably more than COACH_HISTORY_MESSAGES, so the further
    // truncation below is the one that actually governs what reaches OpenAI.
    const { messages: priorMessages } = await coachRepo.getMessages(conversationId);

    // Persist the new user message now that priorMessages has been read.
    await coachRepo.insertUserMessage(uuidv4(), conversationId, newMessageContent);

    // Which detail chips has the rider already tapped in THIS conversation?
    // Scans the DB history (not a client-supplied array — see the route's
    // header comment) plus this turn's own message, which is exactly right:
    // if this turn's content IS one of these fixed labels, it's being
    // answered right now and shouldn't be re-offered in this same reply's
    // suggestions either. Exact-string match is safe here because these are
    // app-generated fixed labels, not free-form text — the fragility
    // concerns that rule out string-matching elsewhere in this feature
    // don't apply.
    const alreadyAskedDetails = new Set();
    for (const m of priorMessages) {
      if (m.role === 'user') {
        const type = DETAIL_LABEL_TO_TYPE[m.content];
        if (type) alreadyAskedDetails.add(type);
      }
    }
    const currentTurnDetailType = DETAIL_LABEL_TO_TYPE[newMessageContent];
    if (currentTurnDetailType) alreadyAskedDetails.add(currentTurnDetailType);

    // Server-loaded history, capped to COACH_HISTORY_MESSAGES and further
    // trimmed (oldest first) to fit COACH_HISTORY_MAX_CHARS — see
    // truncateHistoryForPrompt above. The system prompt is never subject to
    // this and is always included.
    const historyForPrompt = truncateHistoryForPrompt(priorMessages, {
      maxMessages: config.COACH_HISTORY_MESSAGES,
      maxChars: config.COACH_HISTORY_MAX_CHARS,
    });

    // hiddenContext (e.g. an activity id from the "Discuss with Coach"
    // button) is folded into what the MODEL sees here only — the persisted
    // row above and the client's own displayed bubble both use the raw
    // message content, so it never surfaces to the user, just to the LLM.
    const conversation = [
      { role: 'system', content: coach.buildSystemPrompt(healthContext) },
      ...historyForPrompt.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: newMessageHiddenContext
          ? `${newMessageContent}\n\n[App context — do not mention this note to the user: ${newMessageHiddenContext}]`
          : newMessageContent,
      },
    ];

    let assistantText = '';
    const toolCallLog = [];
    // Total OpenAI usage across every call this turn makes (the main
    // tool-calling loop can be several round trips, plus the separate
    // suggestions call below) — persisted as coach_messages.token_usage.
    const cumulativeUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Which of vs_baseline/similar_ride/skills_delta did the MOST RECENT
    // get_activity_analysis call actually have available, before any
    // stripping below removes them from what the model/client see? Captured
    // separately from toolCallLog (which may hold the stripped, headline-only
    // version) so the deterministic suggestion chips built after the main
    // loop always know what's available — including on the very first
    // occurrence, which is exactly when we most want to bait the user with
    // them (see fixedSuggestions below).
    let lastAnalysisAngles = null;

    // Set when the model calls suggest_connect_apple_health this turn (see
    // aiCoach.js) — turned into a deterministic "Connect Apple Health" chip
    // below, same pattern as lastAnalysisAngles/fixedSuggestions.
    let suggestedConnectHealth = false;

    // How many times has get_activity_analysis already returned full
    // comparison data earlier in THIS conversation? Relying on the system
    // prompt alone to keep the coach from narrating vs_baseline/similar_ride/
    // skills_delta on the first reply wasn't reliable — models sometimes
    // read out every field they're handed regardless of instructions. So on
    // the first occurrence we strip those fields from the tool result before
    // the model (or the client) ever sees them — it physically can't narrate
    // data it was never given. Mirrors the client-side occurrence counting
    // that gates showAnalysisDetails (ChatMessageBubble/CoachChatScreen).
    let priorAnalysisCount = 0;
    try {
      const priorRows = await coachRepo.getToolCallsForConversation(conversationId);
      for (const row of priorRows) {
        const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
        for (const c of calls) {
          if (c?.name === 'get_activity_analysis' && c?.result?.activity) priorAnalysisCount++;
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, '[coach] Failed to count prior analyses:');
    }

    // Tool-calling loop: keep going while the model asks for tool calls,
    // capped to avoid a runaway chain of calls in one turn.
    for (let iteration = 0; iteration < 6; iteration++) {
      if (clientClosed) break;

      logger.debug(`[coach] iteration ${iteration}: calling OpenAI (model=${coach.COACH_MODEL})...`);
      let stream;
      try {
        stream = await coach.openai.chat.completions.create({
          model: coach.COACH_MODEL,
          messages: conversation,
          tools: coach.TOOLS,
          stream: true,
          // T-4.4 (audit S-31): bounds this call's output cost, and requests
          // the final usage-only chunk streaming otherwise omits — see the
          // chunk.usage handling below and coach_messages.token_usage.
          max_tokens: config.COACH_CHAT_MAX_TOKENS,
          stream_options: { include_usage: true },
        });
        activeStream = stream;
      } catch (createError) {
        logger.error({ err: createError, status: createError.status }, '[coach] ✖ OpenAI chat.completions.create() threw:');
        throw createError;
      }
      logger.debug('[coach] stream object received, awaiting chunks...');

      let turnText = '';
      let chunkCount = 0;
      let turnUsage = null;
      const pendingToolCalls = []; // { id, name, argsString }

      for await (const chunk of stream) {
        if (clientClosed) break;
        chunkCount++;
        if (chunkCount === 1) logger.debug('[coach] first chunk arrived');
        // The final chunk with `stream_options: { include_usage: true }` set
        // carries `usage` and an EMPTY `choices` array (no delta at all) —
        // capture it before the `if (!delta) continue` below would otherwise
        // just skip past it.
        if (chunk.usage) turnUsage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          turnText += delta.content;
          sseSend(res, { type: 'token', content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingToolCalls[idx]) {
              pendingToolCalls[idx] = { id: tc.id, name: '', argsString: '' };
            }
            if (tc.id) pendingToolCalls[idx].id = tc.id;
            if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].argsString += tc.function.arguments;
          }
        }
      }
      logger.debug(`[coach] iteration ${iteration} done: ${chunkCount} chunks, ${turnText.length} chars, ${pendingToolCalls.length} tool call(s)`);

      assistantText += turnText;

      if (turnUsage) {
        addUsage(cumulativeUsage, turnUsage);
        await aiBudget.recordUsage(userId, turnUsage);
      }

      if (pendingToolCalls.length === 0) {
        // No tool calls this turn — the model is done responding
        break;
      }

      // Record the assistant's tool-call turn, then execute each tool and
      // feed results back in, per the OpenAI function-calling protocol.
      conversation.push({
        role: 'assistant',
        content: turnText || null,
        tool_calls: pendingToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argsString },
        })),
      });

      for (const tc of pendingToolCalls) {
        let args = {};
        try {
          args = tc.argsString ? JSON.parse(tc.argsString) : {};
        } catch (_) {
          args = {};
        }

        // Only the tool name is logged — `args` can carry free-text drawn
        // from the user's own coach messages (S-42, docs/audit/layers/01-server.md).
        logger.debug(`[coach] executing tool "${tc.name}"`);
        sseSend(res, { type: 'tool_call', name: tc.name, args });

        let result;
        try {
          // healthContext passed through ctx (not logged, not persisted — see
          // the NEVER-log comment above) purely so analyze_readiness's
          // executor can hand it back to the client as a tool result without
          // a second round trip; it's the exact same object already used to
          // build this turn's system prompt.
          result = await coach.executeTool(tc.name, args, { userId, conversationId, healthContext });
          logger.debug(`[coach] tool "${tc.name}" done`);
        } catch (toolError) {
          logger.error({ err: toolError }, `[coach] ✖ tool "${tc.name}" failed:`);
          result = { error: toolError.message, code: 'TOOL_ERROR' };
        }

        if (tc.name === 'suggest_connect_apple_health') {
          suggestedConnectHealth = true;
        }

        if (tc.name === 'get_activity_analysis' && result?.activity) {
          // This is a BRAND NEW conversation (e.g. the "Analyse my last
          // ride" welcome suggestion, not RideAnalyticsScreen's "Discuss
          // with Coach" — that flow already dedupes before ever starting a
          // conversation, see GET /api/coach/conversations/by-activity/:id)
          // and the very first analysis in it just resolved to a ride
          // that's already the subject of a DIFFERENT existing conversation.
          // Rather than let two threads about the same ride pile up, abort
          // this one now — delete the conversation/message we just created
          // and tell the client to jump to the existing thread instead.
          if (isNewConversation && priorAnalysisCount === 0) {
            try {
              const dup = await coachRepo.findDuplicateByActivity(userId, result.activity.id, conversationId);
              if (dup) {
                const existingId = dup.id;
                logger.debug(`[coach] duplicate analysis of activity ${result.activity.id}, redirecting to conversation ${existingId}`);
                sseSend(res, { type: 'redirect', conversation_id: existingId });
                await coachRepo.deleteConversationById(conversationId).catch(() => {});
                return res.end();
              }
            } catch (dupErr) {
              logger.error({ err: dupErr }, '[coach] duplicate analysis check failed:');
            }
          }

          lastAnalysisAngles = {
            vs_baseline: !!result.vs_baseline,
            similar_ride: !!result.similar_ride,
            skills_delta: !!result.skills_delta,
          };
          // Tag this conversation with the activity it ended up analyzing —
          // only the first time (ON CONFLICT-style guard via the WHERE
          // clause), so a later follow-up that happens to reference a
          // different activity id doesn't relabel the whole thread. Fire and
          // forget: this is bookkeeping for future dedup lookups (see
          // GET /api/coach/conversations/by-activity/:id), not on the
          // critical path for this response.
          coachRepo
            .tagConversationActivity(conversationId, result.activity.id)
            .catch((e) => logger.error({ err: e.message }, '[coach] Failed to tag conversation with activity_id:'));
          if (priorAnalysisCount === 0) {
            // First occurrence in this conversation — hold back the detail
            // fields at the source. RideScoreCard only needs
            // result.activity.effort_score, which stays.
            const { vs_baseline, similar_ride, skills_delta, ...headline } = result;
            result = headline;
          }
          priorAnalysisCount++;
        }

        sseSend(res, { type: 'tool_result', name: tc.name, result });
        toolCallLog.push({ name: tc.name, args, result, status: 'done' });

        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      // loop continues so the model can respond using the tool results
    }

    if (clientClosed) {
      logger.debug('[coach] client closed before suggestions/persist step');
      return res.end();
    }

    logger.debug(`[coach] main loop finished, assistantText=${assistantText.length} chars, generating suggestions...`);

    // "In the same language as the conversation" left the model free to
    // guess and it has been known to just pick a random language (seen
    // returning German suggestions for an all-English conversation) — name
    // the language explicitly instead of trusting that instruction alone.
    // The app only ships en/ru copy, so a simple Cyrillic sniff on the
    // user's own latest message is enough; anything else defaults to English.
    const suggestionLanguage = /[а-яё]/i.test(newMessageContent || '') ? 'Russian' : 'English';
    const langKey = suggestionLanguage === 'Russian' ? 'ru' : 'en';

    // Deterministic and always shown when the data exists AND the rider
    // hasn't already asked for it in this conversation — rather than left up
    // to the suggestion-generation LLM call (which used to skip them
    // unpredictably and phrase each one differently every time) or kept
    // dangling forever after being answered (see alreadyAskedDetails above).
    // See types/coach.ts AnalysisDetailType and ChatMessageBubble's
    // revealDetail handling for how the tap on one of these maps to exactly
    // one revealed card.
    const fixedSuggestions = [];
    if (lastAnalysisAngles) {
      for (const key of ['vs_baseline', 'similar_ride', 'skills_delta']) {
        if (lastAnalysisAngles[key] && !alreadyAskedDetails.has(key)) {
          fixedSuggestions.push({ label: DETAIL_LABELS[key][langKey], detail: key });
        }
      }
    }
    // `action: 'connect_health'` (rather than `detail`) tells the client to
    // navigate to AppleHealthScreen instead of sending this label as a chat
    // message — see CoachChatScreen.tsx's handleSuggestionPress. Guarded on
    // `!healthContext` defensively: if Health is somehow already connected
    // this turn, don't show a redundant connect button even if the model
    // called the tool.
    if (suggestedConnectHealth && !healthContext) {
      fixedSuggestions.push({ label: CONNECT_HEALTH_LABEL[langKey], action: 'connect_health' });
    }

    // Fill any remaining slots (up to 3 total) with free-form suggestions —
    // this is the ONLY thing left to the LLM's judgment now, and it's
    // explicitly told not to duplicate the comparison angles above.
    let suggestions = [...fixedSuggestions];
    const remaining = 3 - fixedSuggestions.length;
    if (remaining > 0) {
      try {
        const suggestionResp = await coach.openai.chat.completions.create({
          model: coach.COACH_MODEL,
          max_tokens: config.COACH_SUGGESTIONS_MAX_TOKENS,
          messages: [
            ...conversation,
            { role: 'assistant', content: assistantText },
            {
              role: 'user',
              content:
                `Suggest ${remaining} follow-up action${remaining > 1 ? 's' : ''} the rider might want next, ` +
                `written in ${suggestionLanguage}, as a JSON array of strings only, no other text. Each one is ` +
                'a tappable button label, NOT a full question or sentence — 2-4 words max, roughly 20-25 ' +
                'characters, title-style (e.g. "Training tips", "Next workout plan", "Nutrition advice"). ' +
                'Never write a complete question like "How can I improve my average speed?" — shorten it to ' +
                'the topic, e.g. "Improve avg speed".' +
                (fixedSuggestions.length > 0
                  ? ' Do NOT suggest comparing to their average, a similar ride, or how skills changed — that is already handled separately.'
                  : ''),
            },
          ],
          response_format: { type: 'json_object' },
        });
        if (suggestionResp.usage) {
          addUsage(cumulativeUsage, suggestionResp.usage);
          await aiBudget.recordUsage(userId, suggestionResp.usage);
        }
        const raw = suggestionResp.choices?.[0]?.message?.content;
        const parsed = raw ? JSON.parse(raw) : null;
        // response_format: json_object guarantees valid JSON but NOT that the
        // model wraps the array under a key literally called "suggestions" —
        // it sometimes picks "questions"/"follow_ups"/etc instead, which used
        // to silently fall through to []. Take whichever top-level value is
        // actually an array instead of assuming the key name.
        let llmSuggestions = [];
        if (Array.isArray(parsed)) {
          llmSuggestions = parsed;
        } else if (parsed && typeof parsed === 'object') {
          const arrayValue = Object.values(parsed).find((v) => Array.isArray(v));
          llmSuggestions = arrayValue || [];
        }
        llmSuggestions = llmSuggestions
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .slice(0, remaining)
          .map((label) => ({ label }));
        if (llmSuggestions.length === 0) {
          logger.warn('[coach] suggestions call returned no usable array, raw:', raw);
        }
        suggestions = suggestions.concat(llmSuggestions);
      } catch (suggestionError) {
        logger.warn('Coach suggestions generation failed:', suggestionError.message);
      }
    }

    if (suggestions.length > 0) {
      sseSend(res, { type: 'suggestions', items: suggestions });
    }

    // T-4.4 (audit S-31): total usage across every OpenAI call this turn
    // made (main loop iterations + the suggestions call), so
    // coach_messages.token_usage reflects this reply's real cost, not just
    // its last round trip. Omitted (null) when nothing was ever billed —
    // e.g. every call in this turn was mocked/errored before returning
    // usage, which existing tests do.
    const tokenUsage =
      cumulativeUsage.prompt_tokens || cumulativeUsage.completion_tokens || cumulativeUsage.total_tokens
        ? { ...cumulativeUsage, model: coach.COACH_MODEL }
        : null;

    const assistantMessageId = uuidv4();
    await coachRepo.insertAssistantMessage(
      assistantMessageId,
      conversationId,
      assistantText,
      toolCallLog.length > 0 ? JSON.stringify(toolCallLog) : null,
      suggestions.length > 0 ? JSON.stringify(suggestions) : null,
      tokenUsage
    );
    await coachRepo.touchConversation(conversationId);

    sseSend(res, { type: 'done', conversation_id: conversationId, message_id: assistantMessageId });
    logger.debug(`[coach] ✔ done, conversation=${conversationId}, message=${assistantMessageId}`);
    res.end();
  } catch (error) {
    logger.error({ err: error, status: error.status }, '[coach] ✖ FATAL error in /api/coach/chat:');
    try {
      sseSend(res, { type: 'error', message: 'Coach is temporarily unavailable, please try again.' });
    } catch (_) { /* stream may already be closed */ }
    res.end();
  }
});

module.exports = router;
// Exposed for unit testing only (test/coachHistory.test.js) — pure helper,
// does not change this module's own export shape (still the router).
module.exports.truncateHistoryForPrompt = truncateHistoryForPrompt;
