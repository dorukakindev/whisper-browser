'use strict';
const {createHash}=require('node:crypto');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bounded=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';

// This accepts evidence from the main-process resolver only. In particular,
// neither a renderer nor DUB_REWRITE may supply original language text here.
function sourceContextSnapshot(evidence, bytes) {
  const groups=new Map();
  if (!Buffer.isBuffer(bytes) || !evidence || evidence.subtitleHash!==digest(bytes)
      || !Array.isArray(evidence.groups) || evidence.groups.length>5000) return groups;
  const duplicate=new Set();
  for (const row of evidence.groups) {
    if (!row || typeof row.key!=='string' || !/^\d+(?:,\d+)*$/.test(row.key)
        || row.key.length>2000 || duplicate.has(row.key)) { if(row?.key)groups.delete(row.key);continue; }
    duplicate.add(row.key);
    if (typeof row.original!=='string' || !row.original.trim() || row.original.length>8000
        || typeof row.text!=='string' || !row.text.trim() || row.text.length>8000) continue;
    groups.set(row.key,Object.freeze({
      sourceHash:evidence.subtitleHash, key:row.key, original:row.original.trim(),
      baseline:row.text.trim(), originalBefore:bounded(row.originalBefore,1500),
      originalAfter:bounded(row.originalAfter,1500), before:bounded(row.before,1500),
      after:bounded(row.after,1500), speaker:bounded(row.speaker,240),
      terminology:bounded(evidence.terminology,3000), roles:bounded(evidence.roles,1500)
    }));
  }
  return groups;
}
function boundSourceContext(snapshot, request, subtitleHash) {
  if (request?.sourceHash!==subtitleHash || typeof request?.key!=='string') return null;
  const row=snapshot.get(request.key);
  return row?.sourceHash===subtitleHash ? row : null;
}
module.exports={sourceContextSnapshot,boundSourceContext};
