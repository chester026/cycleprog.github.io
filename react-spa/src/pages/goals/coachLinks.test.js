import { describe, it, expect } from 'vitest';
import { coachPromptUrl, coachOpenUrl } from './coachLinks';

describe('coachLinks', () => {
  it('encodes the prompt and optional activity/event ids', () => {
    expect(coachPromptUrl('Can you help with "Climb"?')).toBe('/coach?prompt=Can+you+help+with+%22Climb%22%3F');
    expect(coachPromptUrl('Analyze', { activityId: 42 })).toBe('/coach?prompt=Analyze&activity=42');
    expect(coachPromptUrl('Change it', { eventId: 7 })).toBe('/coach?prompt=Change+it&event=7');
  });

  it('builds the open-conversation link', () => {
    expect(coachOpenUrl('abc-123')).toBe('/coach?open=abc-123');
  });
});
