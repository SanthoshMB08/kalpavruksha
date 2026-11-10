// Exported to the upload form and renderer: one source for frame dimensions.
const AD_PLACEMENTS = Object.freeze({
  top_banner: { label: 'Top banner', desktop: [1440, 180], mobile: [720, 240] },
  sidebar: { label: 'Home ads corner', desktop: [600, 500], mobile: [720, 600] },
  home_middle: { label: 'Home middle', desktop: [1200, 300], mobile: [720, 360] },
  home_bottom: { label: 'Home bottom', desktop: [1200, 300], mobile: [720, 360] },
  after_search: { label: 'After search results', desktop: [1200, 300], mobile: [720, 360] }
});
function parseAdExpiry(value) {
  // The labelled form uses Asia/Kolkata, independent of browser/server timezone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null;
  const date = new Date(value + ':00+05:30');
  if (!Number.isFinite(+date) || date <= new Date()) return null;
  const local = new Date(+date + 330 * 60000).toISOString().slice(0,16);
  return local === value ? date : null;
}
function validateAd(req, res, next) {
  const title = String(req.body.ad_title || '').trim();
  const url = String(req.body.target_url || '').trim();
  let error;
  if (!title || title.length > 100) error = 'Ad title must contain 1 to 100 characters.';
  else if (!Object.hasOwn(AD_PLACEMENTS, req.body.placement)) error = 'Choose a valid placement.';
  else if (!parseAdExpiry(req.body.expires_at)) error = 'Expiry must be a valid date/time in the future.';
  else if (!req.files?.ad_image?.[0]) error = 'Please choose a desktop image for the advertisement.';
  if (!error && url) {
    try {
      const parsed = new URL(url);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 255) throw new Error();
    } catch { error = 'Enter a valid http or https destination URL.'; }
  }
  if (error) {
    req.flash('error', error);
    return res.redirect(303, '/portal/super-secure-dashboard/ads');
  }
  req.body.ad_title = title;
  req.body.target_url = url;
  req.adExpiresAt = parseAdExpiry(req.body.expires_at);
  next();
}
module.exports = { AD_PLACEMENTS, parseAdExpiry, validateAd };
