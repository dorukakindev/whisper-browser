// SPDX-License-Identifier: MIT
'use strict';
const {safeUrl}=require('./feed-parser');
const {assessEpisodeMatch}=require('./podcast-episode-match');
const clean=(value,max=500)=>typeof value==='string'?value.replace(/\0/g,'').trim().slice(0,max):'';
function spotifySource(url,metadata){
 const title=clean(metadata?.title);
 if(!title)throw Error('Spotify metadata unavailable. Add a publisher RSS feed manually.');
 // oEmbed supplies a title, not a verified RSS identity, publisher or time axis.
 return {provider:'spotify',url,title,publisher:'',metadataSource:'oembed',identity:'title-only'};
}
function directorySearchUrl(source){
 // Apple public Search API: https://performance-partners.apple.com/search-api
 // A single, small catalog query; no account, auth headers, artwork or audio.
 const url=new URL('https://itunes.apple.com/search');
 for(const [key,value] of Object.entries({term:source.title.slice(0,160),media:'podcast',entity:'podcast',limit:'5',country:'US'}))url.searchParams.set(key,value);
 return url.href;
}
function directorySuggestions(metadata){
 if(!metadata||!Array.isArray(metadata.results))throw Error('Invalid public podcast directory response.');
 const seen=new Set(),suggestions=[];
 for(const row of metadata.results.slice(0,5)){
  if(!row||row.kind!=='podcast')continue;
  const url=safeUrl(row.feedUrl);if(!url||seen.has(url))continue;seen.add(url);
  suggestions.push({url,title:clean(row.collectionName||row.trackName)||new URL(url).hostname,publisher:clean(row.artistName),source:'apple-directory',identityVerified:false,requiresConfirmation:true,matchEvidence:['directory-search'],timelineCompatibility:'unverified'});
 }
 return suggestions;
}
function candidateMetadata(entry){
 const publishedAt=Number.isFinite(entry.publishedAt)&&entry.publishedAt>0&&entry.publishedAt<=8640000000000000?entry.publishedAt:0;
 return {externalId:entry.externalId||'',publishedAt,durationSeconds:Number.isFinite(entry.durationSeconds)&&entry.durationSeconds>0?entry.durationSeconds:null,audioAvailable:Array.isArray(entry.enclosures)&&entry.enclosures.some(e=>/^audio\//.test(e.type)),...(publishedAt?{publicationDay:new Date(publishedAt).toISOString().slice(0,10)}:{}),...Object.fromEntries(['episodeNumber','seasonNumber'].filter(k=>Number.isSafeInteger(entry[k])&&entry[k]>=0).map(k=>[k,entry[k]]))};
}
function episodeSuggestions(source,entries,feed){
 return entries.filter(e=>e.kind==='podcast').map(e=>({...candidateMetadata(e),url:e.url,title:e.title,publisher:e.author||feed.title,feedUrl:feed.url,source:'feed-preview',identityVerified:false,assessment:assessEpisodeMatch(source,{...candidateMetadata(e),title:e.title,publisher:e.author||feed.title})})).filter(e=>e.assessment.evidence.length).slice(0,30);
}
module.exports={spotifySource,directorySearchUrl,directorySuggestions,candidateMetadata,episodeSuggestions};
