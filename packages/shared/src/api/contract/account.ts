/**
 * Account domain contract (T-7.1). Backs `server/routes/account.js` — the
 * single self-service account-deletion route.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

export const account = {
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/account',
    response: z.object({ success: z.boolean(), message: z.string() }),
    auth: true,
  }),
};
