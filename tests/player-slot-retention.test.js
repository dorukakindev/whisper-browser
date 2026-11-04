'use strict';
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>',{pretendToBeVisual:true});
global.document=dom.window.document;global.Node=dom.window.Node;
const WUI=require('../src/renderer/player-workspace-ui');
const root=()=>{const r=document.createElement('div');document.body.append(r);return r;};
// The actual media surface and its ancestors stay connected during transcript/tab redraws.
{
 const r=root();const vm={locale:'tr',media:{title:'Real media',kind:'video'},snapshot:{time:0,duration:60,paused:true,rate:1},rows:[],tab:'transcript',stageMode:'slot',hasSecondary:false};
 const first=WUI.renderPlayerWorkspace(r,vm,{});const video=document.createElement('video');video.src='fixture.mp4';first.stageSlot.append(video);const parent=video.parentNode,ancestor=parent.parentNode;
 WUI.renderPlayerWorkspace(r,{...vm,tab:'assistant'},{});
 assert.strictEqual(video.parentNode,parent);assert.strictEqual(parent.parentNode,ancestor);assert.ok(video.isConnected);assert.strictEqual(r.querySelectorAll('video').length,1);
 WUI.renderPlayerWorkspace(r,{...vm,query:'unmatched'},{});assert.strictEqual(video.parentNode,parent);assert.strictEqual(video.getAttribute('src'),'fixture.mp4');
}

dom.window.close();
console.log('player-slot-retention: media node and connected ancestors preserved');
