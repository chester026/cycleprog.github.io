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
    // pg returns TIMESTAMPTZ as a Date object (T-7.1 CONTRACT_VALIDATE_RESPONSES).
    created_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// POST /api/checklist request body.
export const ChecklistItemCreateSchema = z.object({
  section: z.string().min(1),
  item: z.string().min(1),
  checked: z.boolean().optional(),
  link: z.string().nullable().optional(),
});

export type ChecklistItemCreateBody = z.infer<typeof ChecklistItemCreateSchema>;

// PUT /api/checklist/:id request body — partial update: any subset of
// `checked` (toggle), `link`, `item` (rename), `section` (move). At least
// one field is required server-side.
export const ChecklistItemUpdateSchema = z
  .object({
    checked: z.boolean().optional(),
    link: z.string().nullable().optional(),
    item: z.string().min(1).optional(),
    section: z.string().min(1).optional(),
  })
  .passthrough();

// PUT /api/checklist/section/:section request body — rename a section (every
// item in it moves to the new name).
export const ChecklistSectionRenameSchema = z.object({
  section: z.string().min(1),
});
export type ChecklistSectionRenameBody = z.infer<typeof ChecklistSectionRenameSchema>;

export type ChecklistItemUpdateBody = z.infer<typeof ChecklistItemUpdateSchema>;
