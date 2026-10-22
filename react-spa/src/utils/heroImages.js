// T-6.2 (audit W-18/W-22): the fetch + its own module-level
// `heroImagesCache`/`heroImagesCacheTime` (a second, independent 5-min TTL
// cache duplicating the TanStack Query one) moved to
// `src/data/hooks/useHeroImages.js`. Only the pure "resolve a filename/
// ImageKit object to a displayable URL" helper stays here — pages call it
// on the data `useHeroImages()` already gives them.

export function getHeroImageUrl(imageData) {
  if (!imageData) return null;

  if (typeof imageData === 'object' && imageData.url) {
    // ImageKit object: request a WebP rendition.
    const baseUrl = imageData.url.split('?')[0];
    return `${baseUrl}?tr=q-100,f-webp`;
  }

  // Legacy value: a bare filename under /img/hero.
  if (typeof imageData === 'string') {
    return `/img/hero/${imageData}`;
  }

  return null;
}
