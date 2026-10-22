import { describe, expect, it } from 'vitest';
import { classifyStreamError } from './streamError.js';

describe('classifyStreamError', () => {
  it('recognises the AI_BUDGET_EXCEEDED envelope and hands back resetAt untouched', () => {
    const resetAt = '2026-09-25T00:00:00.000Z';
    expect(
      classifyStreamError(JSON.stringify({ error: 'Daily AI budget exceeded', code: 'AI_BUDGET_EXCEEDED', resetAt }))
    ).toEqual({ kind: 'budget', resetAt });
  });

  it("uses another JSON envelope's `error` text verbatim", () => {
    expect(classifyStreamError(JSON.stringify({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }))).toEqual({
      kind: 'message',
      text: 'Conversation not found',
    });
  });

  it('is generic for JSON with neither a known code nor `error`, including a budget code without resetAt', () => {
    expect(classifyStreamError(JSON.stringify({ foo: 'bar' }))).toEqual({ kind: 'generic' });
    expect(classifyStreamError(JSON.stringify({ code: 'AI_BUDGET_EXCEEDED' }))).toEqual({ kind: 'generic' });
  });

  it('passes a non-JSON body (or a JSON primitive) through as-is', () => {
    expect(classifyStreamError('unauthorized')).toEqual({ kind: 'message', text: 'unauthorized' });
    expect(classifyStreamError('42')).toEqual({ kind: 'message', text: '42' });
    expect(classifyStreamError('null')).toEqual({ kind: 'message', text: 'null' });
  });

  it('is generic for an empty or missing body', () => {
    expect(classifyStreamError(undefined)).toEqual({ kind: 'generic' });
    expect(classifyStreamError(null)).toEqual({ kind: 'generic' });
    expect(classifyStreamError('')).toEqual({ kind: 'generic' });
  });
});
