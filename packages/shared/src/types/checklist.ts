import { z } from 'zod';

// GET /api/checklist item — the `checklist` table (server/server.js).
export const ChecklistItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    section: z.string(),
    item: z.string(),
    checked: z.boolean().optional(),
    link: z.string().nullable().optional(),
  })
  .passthrough();

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// POST /api/checklist request body.
export const ChecklistItemCreateSchema = z.object({
  section: z.string().min(1),
  item: z.string().min(1),
  checked: z.boolean().optional(),
});

export type ChecklistItemCreateBody = z.infer<typeof ChecklistItemCreateSchema>;

// PUT /api/checklist/:id request body — the route branches on whether
// `link` is present (rename the link) vs falls back to `checked` (toggle),
// so both stay optional here; the server keeps its own branching logic.
export const ChecklistItemUpdateSchema = z
  .object({
    checked: z.boolean().optional(),
    link: z.string().nullable().optional(),
  })
  .passthrough();

export type ChecklistItemUpdateBody = z.infer<typeof ChecklistItemUpdateSchema>;
