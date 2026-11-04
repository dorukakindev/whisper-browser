'use strict';
const KINDS=['news','festival-selection','award','interview','criticism','unknown'];
const STANCES=['positive','negative','mixed','neutral','unknown'];
const categories=new Map([['news','news'],['festival-selection','festival-selection'],['award','award'],['interview','interview'],['criticism','criticism'],['review','criticism']]);
function validate(record){
 if(!record||!KINDS.includes(record.contentKind)||!STANCES.includes(record.stance)||typeof record.quote!=='string'||record.quote.length>500||typeof record.sourceRevision!=='string'||record.sourceRevision.length>128||!Number.isSafeInteger(record.metadataVersion)||record.metadataVersion<1||record.by!=='user'||!Number.isFinite(record.at))throw Error('Invalid editorial classification.');
 return record;
}
function proposal(entry,input){
 if(!KINDS.includes(input.contentKind)||!STANCES.includes(input.stance)||typeof input.quote!=='string'||input.quote.length>500)throw Error('Choose a supported type and opinion.');
 const quote=input.quote.trim(),source=entry.title+'\n'+entry.text;
 if(quote&&!source.includes(quote)||(input.contentKind!=='unknown'||input.stance!=='unknown')&&!quote)throw Error('Select an exact quote from the saved source.');
 return {contentKind:input.contentKind,stance:input.stance,quote,sourceRevision:entry.revision,metadataVersion:(entry.editorial?.metadataVersion||0)+1,by:'user'};
}
function view(entry){
 if(entry.editorial){const current=entry.editorial.sourceRevision===entry.revision;return {editorialState:current?'current':'stale',contentKind:current?entry.editorial.contentKind:'unknown',stance:current?entry.editorial.stance:'unknown',editorialBy:'user'};}
 const category=(entry.categories||[]).find(value=>categories.has(String(value).trim().toLowerCase()));
 return {editorialState:'unclassified',contentKind:category?categories.get(String(category).trim().toLowerCase()):'unknown',stance:'unknown',editorialBy:category?'publisher-category':'unknown'};
}
module.exports={KINDS,STANCES,validate,proposal,view};
