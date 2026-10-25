'use strict';
const {createHash} = require('node:crypto');
// Persist only the digest, never a signed URL or private filesystem path.
function identity(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value)) throw new Error('Invalid dub source identity.');
  let canonical = value.normalize('NFC');
  if (/^[a-z]:[\\/]/i.test(canonical)) canonical = canonical.replace(/\\/g,'/').toLowerCase();
  try {
    const url = new URL(canonical);
    if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname)) {
      const id = url.hostname === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
      if (id && /^[\w-]{11}$/.test(id)) canonical = `youtube:${id}`;
    }
  } catch (_) { if (/^[a-z]:[\\/]/i.test(canonical)) canonical = canonical.replace(/\\/g,'/').toLowerCase(); }
  return createHash('sha256').update(canonical).digest('hex');
}
module.exports = {identity};
