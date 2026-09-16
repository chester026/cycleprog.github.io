// Allowlist for GET /api/proxy/strava-image, which stays unauthenticated
// (it's used as a plain <img src>) but must not become an open SSRF proxy.
const ALLOWED_HOSTNAME_SUFFIXES = ['.cloudfront.net', '.strava.com', '.imagekit.io'];

function isAllowedImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTNAME_SUFFIXES.some((suffix) => hostname === suffix.replace(/^\./, '') || hostname.endsWith(suffix));
}

module.exports = { isAllowedImageUrl, ALLOWED_HOSTNAME_SUFFIXES };
