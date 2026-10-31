'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('discovery review decisions are verified, namespaced and never create a library item',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review810-')),close=[];let title='Verified film';
 try{
  const svc=require('../src/media-tools-service').registerMediaTools({app:{getPath:()=>root,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get(){throw Error('Must not consult library');}}),resolveDiscovery:async(_e,d)=>({ok:true,item:{kind:d.kind,providerId:d.id,title,year:2026}}),readOpenReviews:async()=>({reviews:[{id:'R1',text:'Strong acting throughout.'}],identity:{title:'Verified film',year:2026}})});
  const request={itemId:'discovery:film:tt14173636',discovery:{kind:'film',id:'tt14173636'}};
  const call=(action,extra={})=>svc.handle({}, {action,...request,...extra});
  assert.deepEqual((await call('decision-get')).value,{});
  assert.equal((await call('reviews-browser')).match.state,'matched');
  const analysis={points:[{id:'R1',quote:'Strong acting',reason:'Supported'}]},reviews=[{id:'R1',text:'Strong acting throughout.'}];
  assert.equal((await call('decision-save',{analysis,reviews,itemIdentity:{kind:'film',title,year:2026}})).ok,false,'Missing IMDb provenance cannot save an unbound analysis');
  assert((await call('decision-save',{analysis,reviews,itemIdentity:{kind:'film',title,year:2026,imdbId:request.discovery.id}})).ok);
  assert.equal((await call('decision-get')).value.history.length,1);
  assert((await call('feedback-save',{reaction:'like',note:'My note'})).ok);
  assert.equal((await call('decision-get')).value.feedback.note,'My note');
  assert.equal((await call('decision-get',{itemId:'other'})).ok,false);
  title='Different title';assert.equal((await call('decision-save',{analysis,reviews,itemIdentity:{kind:'film',title:'Verified film',year:2026,imdbId:request.discovery.id}})).ok,false);
  assert(!fs.existsSync(path.join(root,'media-catalog.json')));assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'media-enrichment.json'),'utf8')).titles)[0],request.itemId);
 }finally{close.forEach(fn=>fn());fs.rmSync(root,{recursive:true,force:true});}
});
