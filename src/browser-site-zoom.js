const MIN_BROWSER_ZOOM = 0.5;
const MAX_BROWSER_ZOOM = 3;
const MAX_BROWSER_ZOOM_SITES = 200;

function browserZoomHost(rawUrl) {
  try { return new URL(String(rawUrl || '')).hostname.toLowerCase(); } catch (_) { return ''; }
}

function normalizeBrowserSiteZooms(raw) {
  const normalized = {};
  for (const [rawHost, rawZoom] of Object.entries(raw || {}).slice(0, MAX_BROWSER_ZOOM_SITES)) {
    const host = String(rawHost || '').trim().toLowerCase();
    const zoom = Number(rawZoom);
    if (/^[a-z0-9.-]{1,253}$/.test(host) && Number.isFinite(zoom)
        && zoom >= MIN_BROWSER_ZOOM && zoom <= MAX_BROWSER_ZOOM) {
      normalized[host] = Math.round(zoom * 10) / 10;
    }
  }
  return normalized;
}

function browserSiteZoomForUrl(rawUrl, siteZooms) {
  const host = browserZoomHost(rawUrl);
  const zoom = host ? Number(siteZooms?.[host]) : NaN;
  return Number.isFinite(zoom) && zoom >= MIN_BROWSER_ZOOM && zoom <= MAX_BROWSER_ZOOM ? zoom : 1;
}

function withBrowserSiteZoom(siteZooms, rawUrl, rawZoom) {
  const host = browserZoomHost(rawUrl);
  const zoom = Number(rawZoom);
  const next = normalizeBrowserSiteZooms(siteZooms);
  if (!host || !Number.isFinite(zoom) || zoom < MIN_BROWSER_ZOOM || zoom > MAX_BROWSER_ZOOM) {
    return { ok: false, siteZooms: next };
  }
  const rounded = Math.round(zoom * 10) / 10;
  if (Math.abs(rounded - 1) < 0.001) delete next[host];
  else next[host] = rounded;
  return { ok: true, host, zoom: rounded, siteZooms: normalizeBrowserSiteZooms(next) };
}

module.exports = {
  MAX_BROWSER_ZOOM,
  MAX_BROWSER_ZOOM_SITES,
  MIN_BROWSER_ZOOM,
  browserSiteZoomForUrl,
  browserZoomHost,
  normalizeBrowserSiteZooms,
  withBrowserSiteZoom,
};
