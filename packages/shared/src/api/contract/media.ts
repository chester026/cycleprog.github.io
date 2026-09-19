/**
 * Media domain contract (T-7.1). Backs `server/routes/media.js` — garage/
 * hero image upload+listing+delete (ImageKit-backed), the ImageKit public
 * config, and the Strava image proxy. Response shapes read off
 * `server/services/media.js` (`getUserImages`, `uploadToImageKit`).
 *
 * The three multipart uploads (garage/upload, hero/upload, hero/assign-all)
 * declare `contract()` AFTER `upload.single('image')` rather than right
 * after auth — their body (the `pos` text field) only exists once multer
 * has parsed the multipart request; auth still runs first.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

// getUserImages()'s per-position shape (repositories/media.js rows mapped
// in services/media.js#getUserImages).
const ImageRecordSchema = z
  .object({
    fileId: z.string().nullable(),
    url: z.string().nullable(),
    filePath: z.string().nullable(),
    name: z.string().nullable(),
    originalName: z.string().nullable(),
  })
  .passthrough();

const UploadResultResponseSchema = z.object({
  filename: z.string(),
  pos: z.string(),
  url: z.string(),
  fileId: z.union([z.string(), z.number()]).nullable(),
});

const HERO_POSITIONS = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'] as const;
const GARAGE_POSITIONS = ['right', 'left-top', 'left-bottom'] as const;

export const media = {
  garagePositions: defineEndpoint({
    method: 'GET',
    path: '/api/garage/positions',
    response: z.record(z.string(), ImageRecordSchema),
    auth: true,
  }),

  garageUpload: defineEndpoint({
    method: 'POST',
    path: '/api/garage/upload',
    // `pos`'s enum is still checked route-side (400 VALIDATION_ERROR) —
    // kept as a plain string here rather than duplicating/narrowing that
    // check (contract rule: reject garbage TYPES, not narrow shapes).
    body: z.object({ pos: z.string() }),
    response: UploadResultResponseSchema,
    auth: true,
    multipart: true,
  }),

  heroImages: defineEndpoint({
    method: 'GET',
    path: '/api/hero/images',
    response: z.record(z.enum(HERO_POSITIONS), ImageRecordSchema.nullable()),
    auth: true,
  }),

  heroUpload: defineEndpoint({
    method: 'POST',
    path: '/api/hero/upload',
    body: z.object({ pos: z.string() }),
    response: UploadResultResponseSchema,
    auth: true,
    admin: true,
    multipart: true,
  }),

  heroAssignAll: defineEndpoint({
    method: 'POST',
    path: '/api/hero/assign-all',
    response: z.object({
      filename: z.string(),
      positions: z.array(z.string()),
      url: z.string(),
      fileId: z.union([z.string(), z.number()]).nullable(),
      deletedFiles: z.number(),
    }),
    auth: true,
    admin: true,
    multipart: true,
  }),

  removeGarageImage: defineEndpoint({
    method: 'DELETE',
    path: '/api/garage/images/:name',
    params: z.object({ name: z.string() }),
    response: z.object({ ok: z.boolean() }),
    auth: true,
  }),

  removeHeroImage: defineEndpoint({
    method: 'DELETE',
    path: '/api/hero/positions/:position',
    params: z.object({ position: z.string() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    auth: true,
    admin: true,
  }),

  imagekitConfig: defineEndpoint({
    method: 'GET',
    path: '/api/imagekit/config',
    response: z.object({ public_key: z.string(), url_endpoint: z.string() }),
    auth: true,
  }),
};

// Exported for the client/test fixtures — not part of any endpoint schema.
export { HERO_POSITIONS, GARAGE_POSITIONS };
