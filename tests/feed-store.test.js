'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFeedStore}=require('../src/feed-store');
test('GUID collisions, canonical provenance, state and offline content survive atomic reload',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-store-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const one=s.subscribe({url:'https://a.example/rss',title:'A'},[{externalId:'same',url:'https://article.example/a',title:'A',text:'Summary',contentScope:'summary',kind:'article'},{externalId:'same',url:'https://article.example/b',title:'B',text:'Another',contentScope:'summary',kind:'article'}],'all');assert.equal(s.entries({}).total,2);
 const row=s.entries({}).rows[0];s.setState([row.id],{read:true,saved:true});s.commit(one.feed.id,{entries:[{externalId:'same',url:row.url,title:'Updated',text:'Changed summary',contentScope:'summary',kind:'article'}],etag:'v2'});assert.equal(s.entry(row.id).read,true);assert.equal(s.entry(row.id).saved,true);
 s.subscribe({url:'https://b.example/rss',title:'B'},[{externalId:'different',url:row.url,title:'Shared',text:'Summary',contentScope:'summary',kind:'article'}],'all');assert.equal(s.entry(row.id).provenance.length,2);s.failure(one.feed.id,{error:'Offline',errorKind:'network'});assert.equal(createFeedStore(path.join(dir,'feeds.json')).entry(row.id).saved,true);
 s.unsubscribe(one.feed.id);assert(s.entry(row.id));assert.equal(s.list().feeds.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('mark-read applies only explicit snapshot IDs and undo does not swallow newly arrived entries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-read-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const f=s.subscribe({url:'https://a.example/rss',title:'A'},[{externalId:'1',url:'https://a.example/1',title:'One',text:'One',kind:'article',contentScope:'summary'}],'all');const ids=s.entries({}).rows.map(r=>r.id),changed=s.setState(ids,{read:true});s.commit(f.feed.id,{entries:[{externalId:'2',url:'https://a.example/2',title:'Two',text:'Two',kind:'article',contentScope:'summary'}]});assert.equal(s.entries({unread:true}).total,1);s.undo(changed.token);assert.equal(s.entries({unread:true}).total,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('initial cursors also apply to pending OPML feeds and empty valid snapshots count as successful checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-initial-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const pending=s.subscribe({url:'https://a.example/rss',title:'A'},[],'now');s.commit(pending.feed.id,{entries:[{externalId:'1',url:'https://a.example/1',title:'One',text:'One',kind:'article',contentScope:'summary'}],format:'rss'});assert.equal(s.entries({unread:true}).total,0);const empty=s.subscribe({url:'https://b.example/rss',title:'B',format:'rss'},[],'all');assert.equal(empty.feed.state,'unchanged');assert(empty.feed.lastSuccess>0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
