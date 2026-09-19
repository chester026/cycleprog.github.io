import { describe, it, expect } from 'vitest';
import { account } from './account.js';

describe('account contract', () => {
  it('remove: accepts the success payload', () => {
    expect(account.remove.response.safeParse({ success: true, message: 'Account deleted successfully' }).success).toBe(true);
  });

  it('remove: rejects a payload missing success', () => {
    expect(account.remove.response.safeParse({ message: 'ok' }).success).toBe(false);
  });
});
