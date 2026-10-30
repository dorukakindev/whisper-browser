'use strict';
const fs = require('node:fs'), path = require('node:path'), {fileURLToPath} = require('node:url');
const {createHash} = require('node:crypto');
// Persist only the digest, never a signed URL or private filesystem path.
function identity(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value)) throw new Error('Invalid dub source identity.');
  let canonical = value.normalize('NFC');
  let local = canonical;
  if (/^file:/i.test(local)) { try { local=fileURLToPath(local); } catch { return null; } }
  if (path.isAbsolute(local) || /^[a-z]:[\\/]/i.test(local)) {
    try {
      // No file bytes or path are exposed. Replacing/editing a local source
      // invalidates automatic reuse, including equal-length replacements.
      const stat=fs.statSync(local,{bigint:true});
      if(!stat.isFile())return null;
      canonical=fs.realpathSync(local).normalize('NFC');
      if(process.platform==='win32')canonical=canonical.replace(/\\/g,'/').toLowerCase();
      // Windows can preserve timestamps across a rapid equal-size overwrite.
      // A bounded edge digest supplements metadata without hashing a multi-GB video.
      let fd;const fingerprint=createHash('sha256');
      try{
        fd=fs.openSync(local,'r');const edge=Buffer.alloc(32768),size=Number(stat.size);if(!Number.isSafeInteger(size))return null;
        for(const offset of size>32768?[0,Math.max(32768,size-32768)]:[0]){const read=fs.readSync(fd,edge,0,Math.min(edge.length,size-offset),offset);fingerprint.update(edge.subarray(0,read));}
        const after=fs.fstatSync(fd,{bigint:true});if(['size','mtimeNs','ctimeNs','ino'].some(key=>after[key]!==stat[key]))return null;
      }finally{if(fd!==undefined)fs.closeSync(fd);}
      canonical=JSON.stringify(['local-v3-edges',canonical,String(stat.size),String(stat.mtimeNs),String(stat.ctimeNs),String(stat.birthtimeNs),String(stat.ino),fingerprint.digest('hex')]);
      return createHash('sha256').update(canonical).digest('hex');
    } catch { return null; }
  }
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
