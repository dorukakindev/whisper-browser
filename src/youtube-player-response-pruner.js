const YOUTUBE_PLAYER_AD_FIELDS = Object.freeze([
  'adPlacements',
  'playerAds',
  'adSlots',
]);

function pruneYoutubePlayerResponseBody(body) {
  const originalBody = typeof body === 'string' ? body : String(body ?? '');
  let payload;
  try {
    payload = JSON.parse(originalBody);
  } catch (_) {
    return { changed: false, body: originalBody, removedFields: [], reason: 'invalid-json' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { changed: false, body: originalBody, removedFields: [], reason: 'invalid-shape' };
  }
  const removedFields = [];
  for (const field of YOUTUBE_PLAYER_AD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    delete payload[field];
    removedFields.push(field);
  }
  if (!removedFields.length) {
    return { changed: false, body: originalBody, removedFields, reason: 'no-ad-fields' };
  }
  return {
    changed: true,
    body: JSON.stringify(payload),
    removedFields,
    reason: 'pruned',
  };
}

function isYoutubePlayerResponseUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const host = parsed.hostname.toLowerCase();
    return ['http:', 'https:'].includes(parsed.protocol)
      && (host === 'youtube.com' || host.endsWith('.youtube.com'))
      && parsed.pathname === '/youtubei/v1/player';
  } catch (_) {
    return false;
  }
}

function responseHeadersWithoutEntityEncoding(headers) {
  const staleEntityHeaders = new Set(['content-encoding', 'content-length', 'transfer-encoding']);
  return (Array.isArray(headers) ? headers : [])
    .filter((header) => header && !staleEntityHeaders.has(String(header.name || '').toLowerCase()))
    .map((header) => ({ name: String(header.name || ''), value: String(header.value || '') }))
    .filter((header) => header.name);
}

module.exports = {
  YOUTUBE_PLAYER_AD_FIELDS,
  isYoutubePlayerResponseUrl,
  pruneYoutubePlayerResponseBody,
  responseHeadersWithoutEntityEncoding,
};
