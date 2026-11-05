'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require.resolve('../src/renderer/media-shelf-ui'),'utf8'),radio=source.slice(source.indexOf('  function radio(root)'),source.indexOf('  function classicRadio(root)'));
const tick=()=>new Promise(setImmediate);
test('library uses paged compact state without per-episode workspace IPC and keeps canonical data on duplicate shelf URLs',async t=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,root=w.document.querySelector('main'),calls=[];let mounted;
 const rows=[{id:'canonical',feedId:'f',kind:'podcast',title:'Current episode',enclosures:[{type:'audio/mpeg',url:'https://audio.example/episode.mp3'}],sourceVersion:'current',positionState:'needs-review',podcastWorkspace:{sourceVersion:'current',position:0,transcript:{hasText:true}}}];
 w.view={};w.snapshot={};w.legacy={podcasts:[{id:'shelf',url:'https://feed.example/rss',title:'Show',episodes:[{title:'Older title',url:rows[0].enclosures[0].url,localSource:{path:'private-kept-local'}}]}]};
 w.api=async()=>w.legacy;w.t=(en)=>en;w.el=(tag,cls,text)=>{const n=w.document.createElement(tag);n.className=cls;n.textContent=text||'';return n;};w.classicRadio=()=>{};w.openQueue=()=>{};w.openLocalMedia=()=>{};
 w.api.feedsRequest=undefined;w.window.api={feedsRequest:async input=>{calls.push(input);if(input.action==='list')return {ok:true,feeds:[{id:'f',url:'https://feed.example/rss',title:'Show'}]};if(input.action==='entries')return {ok:true,total:1,rows};throw Error('Unexpected per-episode request');}};
 // media-shelf api is a lexical function; expose it independently of window.api.
 w.shelfApi=async()=>w.legacy;
 w.PodcastLibraryUI={mount:(_root,data)=>{mounted=data;return()=>{};}};
 w.eval('(function(api){'+radio+';radio(document.querySelector("main"));})(shelfApi)');await tick();await tick();
 assert(mounted);assert.equal(calls.filter(c=>c.action==='podcast-workspace').length,0);assert.equal(calls.find(c=>c.action==='entries').podcastLibrary,true);
 const row=mounted.podcasts[0].episodes[0];assert.equal(row.canonicalFeed,true);assert.equal(row.sourceVersion,'current');assert.equal(row.positionState,'needs-review');assert.equal(row.localSource.path,'private-kept-local');assert.equal(mounted.podcasts[0].id,'shelf');
});
