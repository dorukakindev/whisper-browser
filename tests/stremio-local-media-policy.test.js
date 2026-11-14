'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('local addon media policy allows loopback playback without opening HTTP fetch or remote HTTP media',()=>{
 const html=fs.readFileSync('src/renderer/index.html','utf8'),content=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const directives=Object.fromEntries(content.split(';').map(s=>s.trim().split(/\s+/)).filter(a=>a[0]).map(([name,...values])=>[name,values]));
 for(const host of ['http://127.0.0.1:*','http://localhost:*','http://[::1]:*'])assert(directives['media-src'].includes(host));
 assert(!directives['media-src'].includes('http:'));assert(!directives['media-src'].includes('*'));
 assert(!directives['connect-src'].some(x=>x.startsWith('http:')));assert.deepEqual(directives['script-src'],["'self'"]);assert.deepEqual(directives['object-src'],["'none'"]);
});
