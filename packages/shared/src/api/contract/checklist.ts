// Checklist endpoints (T-7.1) — server/routes/checklist.js.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import {
  ChecklistItemSchema,
  ChecklistItemCreateSchema,
  ChecklistItemUpdateSchema,
  ChecklistSectionRenameSchema,
} from '../../types/checklist.js';

export const checklist = {
  // GET /api/checklist
  list: defineEndpoint({
    method: 'GET',
    path: '/api/checklist',
    response: z.array(ChecklistItemSchema),
    auth: true,
  }),

  // POST /api/checklist
  create: defineEndpoint({
    method: 'POST',
    path: '/api/checklist',
    body: ChecklistItemCreateSchema,
    response: ChecklistItemSchema,
    auth: true,
  }),

  // PUT /api/checklist/:id — partial update (checked / link / item / section).
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/checklist/:id',
    params: z.object({ id: z.coerce.number() }),
    body: ChecklistItemUpdateSchema,
    response: ChecklistItemSchema,
    auth: true,
  }),

  // DELETE /api/checklist/:id
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/checklist/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),

  // DELETE /api/checklist/section/:section — `section` is double
  // URI-encoded by the client, decoded twice server-side; kept as a plain
  // string param here (the route does its own decodeURIComponent x2).
  removeSection: defineEndpoint({
    method: 'DELETE',
    path: '/api/checklist/section/:section',
    params: z.object({ section: z.string() }),
    response: z.object({ success: z.boolean(), deletedCount: z.number() }).passthrough(),
    auth: true,
  }),

  // PUT /api/checklist/section/:section — rename a section. Same
  // double-encoding convention as removeSection.
  renameSection: defineEndpoint({
    method: 'PUT',
    path: '/api/checklist/section/:section',
    params: z.object({ section: z.string() }),
    body: ChecklistSectionRenameSchema,
    response: z.object({ success: z.boolean(), updatedCount: z.number() }).passthrough(),
    auth: true,
  }),
};
