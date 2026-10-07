// Builders for fake OpenAI Responses API streams/responses, shared by the adapter unit tests and
// the coach integration tests (which spy on `coach.openai.responses.create`).
const asStream = (events) => ({
  [Symbol.asyncIterator]: async function* () {
    yield* events;
  },
});

const RAW_USAGE = { input_tokens: 200, output_tokens: 40, total_tokens: 240, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };

const textDelta = (delta) => ({ type: 'response.output_text.delta', delta });
const completed = (usage) => ({ type: 'response.completed', response: { status: 'completed', usage } });

/** Events of one function call, as the API streams it: added, argument deltas, done. */
function toolCallEvents({ itemId, callId, name, argumentsJson = '{}', outputIndex = 0 }) {
  const half = Math.ceil(argumentsJson.length / 2);
  return [
    { type: 'response.output_item.added', output_index: outputIndex, item: { type: 'function_call', id: itemId, call_id: callId, name, arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: itemId, delta: argumentsJson.slice(0, half) },
    { type: 'response.function_call_arguments.delta', item_id: itemId, delta: argumentsJson.slice(half) },
    { type: 'response.function_call_arguments.done', item_id: itemId, arguments: argumentsJson },
    { type: 'response.output_item.done', output_index: outputIndex, item: { type: 'function_call', id: itemId, call_id: callId, name, arguments: argumentsJson } },
  ];
}

const textStream = (text, usage) => asStream([textDelta(text), ...(usage ? [completed(usage)] : [])]);

/** A non-streaming Responses reply carrying `text` (suggestions / one-shot generators). */
const textResponse = (text, usage) => ({ status: 'completed', output_text: text, ...(usage ? { usage } : {}) });

module.exports = { asStream, RAW_USAGE, textDelta, completed, toolCallEvents, textStream, textResponse };
