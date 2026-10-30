// Strava CDN images are not CORS-enabled — route them through our proxy.
export const proxyStravaImage = (imageUrl) => {
  if (!imageUrl) return null;
  
  if (imageUrl.includes('cloudfront.net') || imageUrl.includes('strava.com')) {
    return `/api/proxy/strava-image?url=${encodeURIComponent(imageUrl)}`;
  }
  
  return imageUrl;
};
