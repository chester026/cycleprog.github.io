const { asStream, RAW_USAGE, textDelta, completed, toolCallEvents, textResponse } = require('./fakeResponses');
const { createResponsesAdapter, toolRoundItems, toolOutputItem } = require('../lib/openaiResponses');

const TOOLS = [{ type: 'function', function: { name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: {} } } }];

function adapterWith(create) {
  return createResponsesAdapter({ client: { responses: { create } } });
}

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

class ApiError extends Error {
  constructor(status, message, param) {
    super(message);
    this.status = status;
    this.param = param;
  }
}

describe('streamTurn', () => {
  it('yields text deltas, then usage in the legacy shape', async () => {
    const create = vi.fn().mockResolvedValue(asStream([textDelta('Hel'), textDelta('lo'), completed({ ...RAW_USAGE, input_tokens_details: { cached_tokens: 150 } })]));
    const events = await collect(adapterWith(create).streamTurn({ model: 'm', input: [] }));
    expect(events).toEqual([
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      { type: 'usage', usage: { prompt_tokens: 200, completion_tokens: 40, total_tokens: 240, prompt_tokens_details: { cached_tokens: 150 }, completion_tokens_details: { reasoning_tokens: 0 } } },
    ]);
  });

  it('emits one complete tool_call with the accumulated arguments', async () => {
    const create = vi.fn().mockResolvedValue(
      asStream([...toolCallEvents({ itemId: 'fc_1', callId: 'call_1', name: 'get_weather', argumentsJson: '{"city":"Riva"}' }), completed(RAW_USAGE)])
    );
    const events = await collect(adapterWith(create).streamTurn({ model: 'm', input: [] }));
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([
      { type: 'tool_call', id: 'call_1', itemId: 'fc_1', name: 'get_weather', argumentsJson: '{"city":"Riva"}' },
    ]);
  });

  it('keeps two parallel tool calls apart, in output order', async () => {
    const first = toolCallEvents({ itemId: 'fc_a', callId: 'call_a', name: 'get_weather', argumentsJson: '{"n":1}', outputIndex: 0 });
    const second = toolCallEvents({ itemId: 'fc_b', callId: 'call_b', name: 'get_analytics_snapshot', argumentsJson: '{"n":2}', outputIndex: 1 });
    // Interleave: both added before either finishes.
    const create = vi.fn().mockResolvedValue(asStream([first[0], second[0], first[1], second[1], first[2], second[2], first[3], first[4], second[3], second[4]]));
    const calls = (await collect(adapterWith(create).streamTurn({ model: 'm', input: [] }))).filter((e) => e.type === 'tool_call');
    expect(calls.map((c) => [c.id, c.name, c.argumentsJson])).toEqual([
      ['call_a', 'get_weather', '{"n":1}'],
      ['call_b', 'get_analytics_snapshot', '{"n":2}'],
    ]);
  });

  it('passes reasoning items through and throws on response.failed', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_1', encrypted_content: 'abc' };
    const create = vi
      .fn()
      .mockResolvedValueOnce(asStream([{ type: 'response.output_item.done', item: reasoning }]))
      .mockResolvedValueOnce(asStream([{ type: 'response.failed', response: { error: { message: 'boom', code: 'server_error' } } }]));
    const adapter = adapterWith(create);
    expect(await collect(adapter.streamTurn({ model: 'm', input: [] }))).toEqual([{ type: 'reasoning', item: reasoning }]);
    await expect(collect(adapter.streamTurn({ model: 'm', input: [] }))).rejects.toThrow('boom');
  });

  it('sends the flat tool shape, forced tool choice, stateless store, cache key and reasoning', async () => {
    const create = vi.fn().mockResolvedValue(asStream([]));
    await collect(
      adapterWith(create).streamTurn({
        model: 'gpt-5.4-mini',
        effort: 'medium',
        instructions: 'sys',
        input: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        toolChoice: { type: 'function', name: 'get_weather' },
        cacheKey: 'coach-7',
        maxOutputTokens: 500,
      })
    );
    expect(create.mock.calls[0][0]).toEqual({
      model: 'gpt-5.4-mini',
      input: [{ role: 'user', content: 'hi' }],
      instructions: 'sys',
      store: false,
      stream: true,
      tools: [{ type: 'function', name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: {} }, strict: false }],
      parallel_tool_calls: true,
      tool_choice: { type: 'function', name: 'get_weather' },
      prompt_cache_key: 'coach-7',
      max_output_tokens: 500,
      reasoning: { effort: 'medium' },
      include: ['reasoning.encrypted_content'],
    });
  });

  it('retries once without reasoning when the model rejects it, and remembers that for the model', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(400, "Unsupported parameter: 'reasoning.effort' is not supported with this model.", 'reasoning.effort'))
      .mockResolvedValue(asStream([textDelta('ok')]));
    const adapter = adapterWith(create);

    expect(await collect(adapter.streamTurn({ model: 'gpt-4.1-mini', effort: 'medium', input: [] }))).toEqual([{ type: 'text', delta: 'ok' }]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'medium' });
    expect(create.mock.calls[1][0].reasoning).toBeUndefined();
    expect(create.mock.calls[1][0].include).toBeUndefined();

    await collect(adapter.streamTurn({ model: 'gpt-4.1-mini', effort: 'medium', input: [] }));
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0].reasoning).toBeUndefined();
  });

  it('does not retry other API errors', async () => {
    const create = vi.fn().mockRejectedValue(new ApiError(429, 'Rate limit reached'));
    await expect(collect(adapterWith(create).streamTurn({ model: 'm', effort: 'low', input: [] }))).rejects.toMatchObject({ status: 429 });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('complete', () => {
  it('returns text and normalized usage; omits reasoning when no effort is given', async () => {
    const create = vi.fn().mockResolvedValue(textResponse('{"a":1}', RAW_USAGE));
    const result = await adapterWith(create).complete({ model: 'gpt-4.1-nano', input: 'prompt', maxOutputTokens: 600, temperature: 0.7, json: true });
    expect(result).toEqual({ text: '{"a":1}', usage: { prompt_tokens: 200, completion_tokens: 40, total_tokens: 240, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } }, truncated: false });
    expect(create.mock.calls[0][0]).toEqual({
      model: 'gpt-4.1-nano',
      input: 'prompt',
      store: false,
      stream: false,
      max_output_tokens: 600,
      temperature: 0.7,
      text: { format: { type: 'json_object' } },
    });
  });

  it('reads text from output items when output_text is absent, and flags truncation', async () => {
    const create = vi.fn().mockResolvedValue({ status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: 'cut' }] }] });
    expect(await adapterWith(create).complete({ model: 'm', input: 'x' })).toEqual({ text: 'cut', usage: null, truncated: true });
  });

  it('also falls back when reasoning none is rejected', async () => {
    const create = vi.fn().mockRejectedValueOnce(new ApiError(400, 'reasoning is not supported')).mockResolvedValue(textResponse('[]'));
    const result = await adapterWith(create).complete({ model: 'gpt-4.1-mini', effort: 'none', input: 'x' });
    expect(result.text).toBe('[]');
    expect(create.mock.calls[1][0].reasoning).toBeUndefined();
  });
});

describe('tool round items', () => {
  it('builds reasoning, assistant text and function_call items; outputs are JSON strings', () => {
    const calls = [{ id: 'call_1', itemId: 'fc_1', name: 'get_weather', argumentsJson: '{}' }];
    expect(toolRoundItems({ text: 'Checking', reasoning: [{ type: 'reasoning', id: 'rs_1' }], calls })).toEqual([
      { type: 'reasoning', id: 'rs_1' },
      { role: 'assistant', content: 'Checking' },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '{}' },
    ]);
    expect(toolRoundItems({ text: '', calls })).toEqual([{ type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{}' }]);
    expect(toolOutputItem('call_1', { ok: true })).toEqual({ type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' });
  });
});
