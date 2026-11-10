'use strict';
const DOMAINS=['film','series','documentary','anime','manga','podcast','book'];
function domainOf(row={}) {
 if(DOMAINS.includes(row.tasteDomain))return row.tasteDomain;
 if(DOMAINS.includes(row.domain))return row.domain;
 if(row.kind==='anime')return 'anime';
 if(['manga','manhwa','manhua'].includes(row.kind))return 'manga';
 if(['book','books'].includes(row.kind))return 'book';
 if(['podcast','podcasts','audio'].includes(row.kind))return 'podcast';
 if((row.genres||[]).some(g=>/^(documentary|belgesel)$/i.test(g)))return 'documentary';
 return row.kind==='series'?'series':'film';
}
module.exports={DOMAINS,domainOf};
