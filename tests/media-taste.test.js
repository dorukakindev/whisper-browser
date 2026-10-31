'use strict';const {test}=require('node:test'),assert=require('node:assert/strict');const {profile,reviewId,validateAnalysis,preferences}=require('../src/media-taste');
test('taste uses preserved personal ratings, real metadata and separate repeat-review evidence',()=>{
 const row={title:'İstanbul',year:'2026',rating:2,review:'Hikaye çok güçlü, oyunculuk etkileyici.',watchedDate:'2026-10-22'};
 const repeat={...row,review:'Bu kez müzik ve görsel anlatım dikkatimi çekti.',watchedDate:'2026-10-23'};
 const p=profile([row],[{title:'İstanbul',year:'2026',ratings:{personal:'9'},genres:['Drama'],directors:['Example']}],{},[repeat]);
 assert.equal(p.average,4.5);assert.equal(p.reviewCount,2);assert.equal(p.genres[0].average,4.5);assert.equal(p.directors[0].count,1);assert.equal(p.mentions.find(r=>r.aspect==='story').count,1);assert.equal(p.preferences.weights.story,3);assert.equal(p.preferencesConfigured,false);assert.equal(profile([],[],{weights:{story:5}}).preferencesConfigured,true);
 const ai={version:1,summary:'Story matters.',insights:[{aspect:'story',direction:'likes',reason:'Exact review evidence',evidence:[{id:reviewId(row),quote:'Hikaye çok güçlü'}]}]};
 assert.equal(validateAnalysis(ai,[row]).insights.length,1);assert.throws(()=>validateAnalysis({...ai,insights:[{...ai.insights[0],evidence:[{id:reviewId(row),quote:'invented statement'}]}]},[row]),/verified/);
 assert.deepEqual(preferences({weights:{story:999},avoid:['story','invented']}).avoid,['story']);
});
