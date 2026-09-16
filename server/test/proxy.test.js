const { isAllowedImageUrl } = require('../lib/imageProxy');

describe('isAllowedImageUrl', () => {
  it('allows an https Strava CDN image URL', () => {
    expect(isAllowedImageUrl('https://dgtzuqphqg23d.cloudfront.net/photo.jpg')).toBe(true);
  });

  it('allows an https strava.com URL', () => {
    expect(isAllowedImageUrl('https://d3nn82uaxijpm6.cloudfront.net/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://images.strava.com/x.jpg')).toBe(true);
  });

  it('allows ImageKit URLs', () => {
    expect(isAllowedImageUrl('https://ik.imagekit.io/demo/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://sub.imagekit.io/demo/x.jpg')).toBe(true);
  });

  it('rejects http (non-https) URLs', () => {
    expect(isAllowedImageUrl('http://images.strava.com/x.jpg')).toBe(false);
  });

  it('rejects a non-allowlisted host', () => {
    expect(isAllowedImageUrl('https://evil.example.com/x.jpg')).toBe(false);
  });

  it('rejects a lookalike host that merely contains an allowed suffix as a substring', () => {
    expect(isAllowedImageUrl('https://notstrava.com.evil.com/x.jpg')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedImageUrl('not a url')).toBe(false);
    expect(isAllowedImageUrl('')).toBe(false);
    expect(isAllowedImageUrl(undefined)).toBe(false);
  });
});
