// The one OpenAI entry point (AGENTS.md rule 5): every LLM call in the server goes through the
// Responses API via `streamTurn` (coach chat, streaming + tools) or `complete` (one-shot text/JSON).
// Why Responses: Chat Completions only allows tools together with reasoning off on the new models.
//
// Contract with callers: tools stay in the Chat-Completions shape defined in aiCoach.js and are
// flattened here; usage comes back in the legacy `{prompt_tokens, completion_tokens, total_tokens,
// prompt_tokens_details:{cached_tokens}}` shape so aiBudget and coach_messages.token_usage are
// unchanged. Conversation state is stateless (`store: false`, explicit `input`) — our own
// coach_messages stay the source of truth.
const OpenAI = require('openai');
const config = require('../config');
const logger = require('./logger');

const REQUEST_TIMEOUT_MS = 60000;
const REQUEST_MAX_RETRIES = 2;

function normalizeUsage(usage) {
  if (!usage) return null;
  return {
    prompt_tokens: usage.input_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    prompt_tokens_details: { cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0 },
    // Hidden reasoning tokens are billed as output; surfaced for cost reports
    // (scripts/bench-coach.js) — the budget already counts them via output_tokens.
    completion_tokens_details: { reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0 },
  };
}

function toResponsesTools(tools) {
  return tools.map(({ function: fn }) => ({
    type: 'function',
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
    strict: false,
  }));
}

// A model that is not a reasoning model (e.g. the gpt-4.1-mini fallback) answers 400 to any
// `reasoning` parameter.
function isReasoningRejection(err) {
  if (err?.status !== 400) return false;
  return String(err.param || '').startsWith('reasoning') || /reasoning/i.test(err.message || '');
}

function extractText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('');
}

/**
 * Items to append to `input` after a model round that asked for tools: the reasoning items it
 * produced (needed so the model keeps its chain of thought across rounds with `store: false`),
 * the text it said, and one `function_call` per tool call.
 * @param {{text?: string, reasoning?: object[], calls: {id: string, itemId?: string, name: string, argumentsJson: string}[]}} round
 */
function toolRoundItems({ text, reasoning = [], calls }) {
  const items = [...reasoning];
  if (text) items.push({ role: 'assistant', content: text });
  for (const call of calls) {
    // With reasoning items in play the API wants the function_call back under its own item id.
    const withId = reasoning.length > 0 && call.itemId ? { id: call.itemId } : {};
    items.push({ type: 'function_call', ...withId, call_id: call.id, name: call.name, arguments: call.argumentsJson });
  }
  return items;
}

const toolOutputItem = (callId, result) => ({ type: 'function_call_output', call_id: callId, output: JSON.stringify(result) });

/**
 * @param {{client: {responses: {create: Function}}}} deps
 */
function createResponsesAdapter({ client }) {
  // Models that rejected `reasoning` once — skipped from then on instead of paying a failed
  // request on every turn.
  const modelsWithoutReasoning = new Set();

  function buildParams({ model, effort, instructions, input, tools, toolChoice, cacheKey, maxOutputTokens, temperature, json, stream }) {
    const useReasoning = effort && !modelsWithoutReasoning.has(model);
    const params = { model, input, store: false, stream };
    if (instructions) params.instructions = instructions;
    if (tools?.length) {
      params.tools = toResponsesTools(tools);
      params.parallel_tool_calls = true;
      if (toolChoice) params.tool_choice = toolChoice;
    }
    if (cacheKey) params.prompt_cache_key = cacheKey;
    if (maxOutputTokens) params.max_output_tokens = maxOutputTokens;
    if (temperature !== undefined) params.temperature = temperature;
    if (json) params.text = { format: { type: 'json_object' } };
    if (useReasoning) {
      params.reasoning = { effort };
      // Stateless + tools: reasoning items must be handed back on the next round (toolRoundItems).
      if (effort !== 'none') params.include = ['reasoning.encrypted_content'];
    }
    return params;
  }

  // Sends the request; if the model refuses `reasoning`, retries once without it.
  async function send(options, signal) {
    try {
      return await client.responses.create(buildParams(options), { signal });
    } catch (err) {
      if (!options.effort || modelsWithoutReasoning.has(options.model) || !isReasoningRejection(err)) throw err;
      logger.warn({ model: options.model, effort: options.effort, err: err.message }, '[openai] model rejected `reasoning`, retrying without it');
      modelsWithoutReasoning.add(options.model);
      return client.responses.create(buildParams(options), { signal });
    }
  }

  /**
   * Streams one model round. Yields:
   *  - `{type:'text', delta}`
   *  - `{type:'reasoning', item}`            reasoning item to hand back via toolRoundItems
   *  - `{type:'tool_call', id, itemId, name, argumentsJson}`   once the call is COMPLETE
   *  - `{type:'usage', usage}`               legacy shape, once, at the end
   * Throws on API errors, `response.failed` and `error` events.
   * @param {{model: string, effort?: string, instructions?: string, input: object[], tools?: object[],
   *   toolChoice?: 'auto' | {type: 'function', name: string}, cacheKey?: string, maxOutputTokens?: number,
   *   signal?: AbortSignal}} options
   */
  async function* streamTurn(options) {
    const stream = await send({ ...options, stream: true }, options.signal);
    const callsByItemId = new Map();
    const emitted = new Set();

    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          if (event.delta) yield { type: 'text', delta: event.delta };
          break;
        case 'response.output_item.added':
          if (event.item.type === 'function_call') {
            callsByItemId.set(event.item.id, { id: event.item.call_id, name: event.item.name, argumentsJson: event.item.arguments || '' });
          }
          break;
        case 'response.function_call_arguments.delta':
          if (callsByItemId.has(event.item_id)) callsByItemId.get(event.item_id).argumentsJson += event.delta;
          break;
        case 'response.function_call_arguments.done':
          if (callsByItemId.has(event.item_id)) callsByItemId.get(event.item_id).argumentsJson = event.arguments;
          break;
        case 'response.output_item.done': {
          const { item } = event;
          if (item.type === 'reasoning') {
            yield { type: 'reasoning', item };
          } else if (item.type === 'function_call' && !emitted.has(item.id)) {
            emitted.add(item.id);
            const accumulated = callsByItemId.get(item.id);
            yield {
              type: 'tool_call',
              id: item.call_id ?? accumulated?.id,
              itemId: item.id,
              name: item.name ?? accumulated?.name,
              argumentsJson: item.arguments ?? accumulated?.argumentsJson ?? '',
            };
          }
          break;
        }
        case 'response.completed':
        case 'response.incomplete': {
          if (event.type === 'response.incomplete') {
            logger.warn({ model: options.model, reason: event.response.incomplete_details?.reason }, '[openai] response incomplete');
          }
          const usage = normalizeUsage(event.response.usage);
          if (usage) yield { type: 'usage', usage };
          break;
        }
        case 'response.failed':
          throw Object.assign(new Error(event.response.error?.message || 'OpenAI response failed'), { code: event.response.error?.code });
        case 'error':
          throw Object.assign(new Error(event.message || 'OpenAI stream error'), { code: event.code });
        default:
      }
    }
  }

  /**
   * One non-streaming call. `effort` omitted = no `reasoning` parameter (non-reasoning models).
   * @param {{model: string, effort?: string, instructions?: string, input: string | object[], cacheKey?: string,
   *   maxOutputTokens?: number, temperature?: number, json?: boolean}} options
   * @returns {Promise<{text: string, usage: object | null, truncated: boolean}>}
   */
  async function complete(options) {
    const response = await send({ ...options, stream: false });
    return {
      text: extractText(response),
      usage: normalizeUsage(response.usage),
      truncated: response.status === 'incomplete',
    };
  }

  return { streamTurn, complete };
}

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: REQUEST_MAX_RETRIES });

module.exports = { openai, ...createResponsesAdapter({ client: openai }), createResponsesAdapter, toolRoundItems, toolOutputItem };
