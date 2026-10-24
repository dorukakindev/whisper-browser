 'use strict';
// Bounded public-page text extraction only. No script, resource or embedded URL is executed.
function decode(value){const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'};return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,key)=>{if(key[0]!=='#')return names[key.toLowerCase()]??entity;const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';});}
const plain=value=>decode(String(value).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<br\b[^>]*>|<\/(?:p|div|li)\s*>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/\0/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function attr(tag,name){const found=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i').exec(tag);return found?decode(found[1]??found[2]):'';}
function parseLetterboxdReviews(input){
 let html=String(input||'');if(html.length>3000000)throw Error('Review page too large.');
 html=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 if(/<title[^>]*>\s*(?:Just a moment|Access denied|Security check)/i.test(html))throw Error('Letterboxd access verification is required. Open the page normally, or paste/import reviews.');
 // Match each review's own container; the preceding review must not mark its neighbour as a spoiler.
 let limited=false;const rows=[],seen=new Set();const pattern=/<(?:div|section)\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>/gi;let found;
 while((found=pattern.exec(html))&&rows.length<50){
  const open=found[0],tag=/^<(\w+)/.exec(open)[1],tokens=tag==='div'?/<\/?div\b[^>]*>/gi:/<\/?section\b[^>]*>/gi;tokens.lastIndex=pattern.lastIndex;let depth=1,end=pattern.lastIndex,next;
  while(depth&&(next=tokens.exec(html))){depth+=next[0][1]==='/'?-1:1;if(!depth)end=next.index;}
  if(depth)break;
  const body=html.slice(pattern.lastIndex,end);pattern.lastIndex=tokens.lastIndex;
  const fullText=plain(body);if(fullText.length>4000)limited=true;const text=fullText.slice(0,4000);if(text.length<8||seen.has(text))continue;seen.add(text);
  // Find only the current card's attributes/author, never a global spoiler substring.
  const prefix=html.slice(Math.max(0,found.index-16000),found.index);const starts=[...prefix.matchAll(/<(?:li|article)\b[^>]*>/gi)];const card=starts.length?prefix.slice(starts.at(-1).index):'';
  const authorTag=/<a\b[^>]*class=["'][^"']*\b(?:name|displayname)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(card);
  const author=authorTag?plain(authorTag[1]).slice(0,120):'';
  const spoiler=/\b(?:contains-spoilers|has-spoilers)\b/i.test(open+' '+card.match(/^<[^>]+>/)?.[0])||/class=["'][^"']*\b(?:spoiler-warning|spoiler-message|has-spoilers)\b/i.test(card+open+body)||/data-(?:contains-)?spoilers?=["']true["']/i.test(card+open);
  const row={id:String(rows.length+1),text,author,spoiler};if(JSON.stringify([...rows,row]).length>110000){limited=true;break;}rows.push(row);
 }
 const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);const title=meta.find(tag=>attr(tag,'property')==='og:title');
 return {reviews:rows,limited,pageTitle:plain(title?attr(title,'content'):(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'')).slice(0,300)};
}
module.exports={parseLetterboxdReviews,decode};
