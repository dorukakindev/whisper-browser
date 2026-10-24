 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const source=require('../src/assistant-source-context');
test('Non-video pages have independent conversations; return/reload keeps the matching page history without storing credentials',()=>{
 const p={workspaceMode:'browser',mediaKey:'',browserActiveTabId:'one',browserPageUrl:'https://news.test/article/one?api_key=PRIVATE',generation:1};const key=source.conversation(p);assert(!key.includes('PRIVATE'));assert.notEqual(source.conversation({...p,browserPageUrl:'https://news.test/article/two'}),key);assert.equal(source.conversation({...p,browserActiveTabId:'two',generation:2}),key);
 assert.equal(source.pageKey('https://news.test/a?utm_source=feed#top'),source.pageKey('https://news.test/a'));assert.notEqual(source.pageKey('https://site.test/#/watch/1'),source.pageKey('https://site.test/#/watch/2'));
});
test('Page navigation, reload generation and changed title metadata invalidate in-flight context',()=>{
 const p={workspaceMode:'browser',browserActiveTabId:'one',mediaKey:'same',generation:1,browserPageUrl:'https://news.test/a'};const a=source.scope(p,null,{generation:1});assert.notEqual(source.scope(p,null,{generation:2}),a);assert.notEqual(source.scope({...p,browserPageUrl:'https://news.test/b'},null,{generation:1}),a);const selection={id:'film',workspace:'media-selection',title:'Old',synopsis:'Old plot'};assert.notEqual(source.scope(p,selection),source.scope(p,{...selection,synopsis:'New plot'}));assert.equal(source.conversation(p,selection),source.conversation(p,{...selection,synopsis:'New plot'}));
});

test('Existing media conversations retain their persisted key while non-media pages remain distinct',()=>{const p={workspaceMode:'browser',mediaKey:'youtube:fixture',browserMediaSeen:true,browserPageUrl:'https://www.youtube.com/watch?v=fixture'};assert.equal(source.conversation(p),JSON.stringify(['browser','youtube:fixture']));assert.notEqual(source.conversation({...p,browserMediaSeen:false}),source.conversation(p));});
