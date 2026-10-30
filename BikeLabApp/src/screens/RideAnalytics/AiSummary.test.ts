import {previewOf} from './AiSummary';

describe('AiSummary previewOf', () => {
  it('keeps the first two paragraphs and flags the cut', () => {
    const text = 'Summary line.\n\nIntensity: hard.\n\nSpeed: ok.\n\nRecommendations: 1. rest';
    expect(previewOf(text)).toEqual({preview: 'Summary line.\n\nIntensity: hard.', truncated: true});
  });

  it('falls back to lines when there are no blank-line paragraphs', () => {
    const text = 'Summary line.\nIntensity: hard.\nSpeed: ok.';
    expect(previewOf(text)).toEqual({preview: 'Summary line.\n\nIntensity: hard.', truncated: true});
  });

  it('does not truncate short text', () => {
    expect(previewOf('Just one line.')).toEqual({preview: 'Just one line.', truncated: false});
  });
});
