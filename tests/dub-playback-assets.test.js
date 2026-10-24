'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { registerDubPlaybackAssets } = require('../src/dub-playback-assets');
test('only picker-selected audio receives a persistent opaque restore token; missing files fail closed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-playback-'));
  try {
    const audio = path.join(dir, 'Türkçe ses.wav'); fs.writeFileSync(audio, Buffer.from('fixture'));
    let picked = audio, cancelled = false, called = 0; const grants = [];
    function boot() {
      const handlers = new Map();
      registerDubPlaybackAssets({ app:{getPath:()=>dir}, ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},
        dialog:{showOpenDialog:async()=>{called++;return {canceled:cancelled,filePaths:[picked]};}}, owner:()=>null,
        authorized:e=>e.allowed, grantMedia:file=>grants.push(file) });
      return (channel, value, allowed=true)=>handlers.get('dub:'+channel)({allowed},value);
    }
    const api = boot(); assert.equal((await api('choosePlaybackAudio',null,false)).ok,false); assert.equal(called,0);
    const chosen = await api('choosePlaybackAudio'); assert(chosen.ok); const id = chosen.output.playbackAsset.id;
    const reloaded = boot(); assert.equal((await reloaded('restorePlaybackAudio',id)).output.url,chosen.output.url);
    assert.equal((await api('restorePlaybackAudio',audio)).ok,false);
    assert.equal((await api('restorePlaybackAudio','../../secret')).ok,false);
    cancelled=true; const before=fs.readFileSync(path.join(dir,'dub-playback-assets.json'),'utf8');
    assert((await api('choosePlaybackAudio')).canceled); assert.equal(fs.readFileSync(path.join(dir,'dub-playback-assets.json'),'utf8'),before);
    fs.unlinkSync(audio); const grantCount=grants.length;
    assert.equal((await reloaded('restorePlaybackAudio',id)).ok,false); assert.equal(grants.length,grantCount);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
