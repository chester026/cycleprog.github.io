import { describe, it, expect } from 'vitest';
import { media } from './media.js';

describe('media contract', () => {
  it('garagePositions: accepts an empty object (fresh user) and a populated one', () => {
    expect(media.garagePositions.response.safeParse({}).success).toBe(true);
    const r = media.garagePositions.response.safeParse({
      right: { fileId: 'f1', url: 'https://ik.io/x.jpg', filePath: '/garage/x.jpg', name: 'x.jpg', originalName: 'orig.jpg' },
    });
    expect(r.success).toBe(true);
  });

  it('heroImages: accepts all-null (fresh user)', () => {
    const r = media.heroImages.response.safeParse({ garage: null, plan: null, trainings: null, checklist: null, nutrition: null });
    expect(r.success).toBe(true);
  });

  it('garageUpload/heroUpload: accept the ImageKit upload result', () => {
    const payload = { filename: 'x.jpg', pos: 'right', url: 'https://ik.io/x.jpg', fileId: 'abc123' };
    expect(media.garageUpload.response.safeParse(payload).success).toBe(true);
    expect(media.heroUpload.response.safeParse({ ...payload, pos: 'plan' }).success).toBe(true);
    expect(media.garageUpload.body.safeParse({ pos: 'right' }).success).toBe(true);
  });

  it('heroAssignAll: accepts the all-positions result', () => {
    const r = media.heroAssignAll.response.safeParse({
      filename: 'x.jpg',
      positions: ['garage', 'plan', 'trainings', 'checklist', 'nutrition'],
      url: 'https://ik.io/x.jpg',
      fileId: 'abc123',
      deletedFiles: 5,
    });
    expect(r.success).toBe(true);
  });

  it('removeGarageImage/removeHeroImage: accept {ok} responses', () => {
    expect(media.removeGarageImage.response.safeParse({ ok: true }).success).toBe(true);
    expect(media.removeHeroImage.response.safeParse({ ok: true, message: 'Image deleted successfully' }).success).toBe(true);
  });

  it('imagekitConfig: accepts public fields only (never the private key)', () => {
    expect(media.imagekitConfig.response.safeParse({ public_key: 'pk_test', url_endpoint: 'https://ik.io' }).success).toBe(true);
  });
});
