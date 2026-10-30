/**
 * Pure AI Coach chat logic shared by the app and the web client: attachment
 * serialisation, analysis-card gating, tool-call pills, tool-result → card
 * mappers, stream-error classification and the fixed suggestion chips.
 * Numeric work (overtraining trend, score buckets) lives in `calc`/`constants`.
 */
export * from './attachments.js';
export * from './analysisMeta.js';
export * from './analysisRows.js';
export * from './cards.js';
export * from './streamError.js';
export * from './suggestions.js';
export * from './toolCalls.js';
