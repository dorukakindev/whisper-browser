'use strict';
const {createHash}=require('node:crypto');
const MAX_SCRIPT_BYTES=512*1024;
const API_NAMES=['info','addStyle','getValue','setValue','deleteValue','listValues','addValueChangeListener','removeValueChangeListener','registerMenuCommand','unregisterMenuCommand'];
const SUPPORTED_GRANTS=new Set(['none',...API_NAMES.flatMap(n=>['GM_'+n,'GM.'+n]),'GM_xmlhttpRequest','GM.xmlHttpRequest']);
const digest=code=>createHash('sha256').update(code,'utf8').digest('hex');
const unique=values=>[...new Set(values)];
function hostname(raw){
 if(!raw||/[\s/@?#:%]/u.test(raw))throw Error('Invalid host');
 const value=new URL('https://'+raw).hostname.toLowerCase();
 if(!value||value.endsWith('.')||value.includes('*'))throw Error('Invalid host');return value;
}
function patternParts(raw){
 if(typeof raw!=='string'||raw.length>2048)throw Error('Invalid URL pattern.');
 if(raw==='<all_urls>')return {scheme:'*',host:'*',path:'/*'};
 // Components are parsed before wildcard matching. Hostnames inside queries
 // can never widen a script's site permission. Regex includes are unsupported.
 const m=/^(https?|\*):\/\/([^/]+)(\/[^\r\n]*)$/.exec(raw);
 if(!m||m[3].includes('#'))throw Error('Use an HTTP(S) component URL match pattern.');
 const host=m[2]==='*'?'*':m[2].startsWith('*.')?'*.'+hostname(m[2].slice(2)):hostname(m[2]);
 return {scheme:m[1],host,path:m[3]};
}
function glob(pattern,value){
 // Literal glob pieces only, anchored at both ends. URL components have already
 // been separated; this never searches a hostname inside another component.
 const pieces=pattern.split('*');if(pieces.length===1)return pattern===value;
 if(!value.startsWith(pieces[0]))return false;let at=pieces[0].length;
 for(const piece of pieces.slice(1,-1)){const next=value.indexOf(piece,at);if(next<0)return false;at=next+piece.length;}
 const tail=pieces.at(-1);return value.endsWith(tail)&&value.length-tail.length>=at;
}
function patternMatches(pattern,url){
 try{if(String(url).length>8000)return false;const rule=patternParts(pattern),u=url instanceof URL?url:new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;
  if(rule.scheme!=='*'&&u.protocol!==rule.scheme+':')return false;
  const host=u.hostname.toLowerCase();if(rule.host!=='*'&&(rule.host.startsWith('*.')?host!==rule.host.slice(2)&&!host.endsWith('.'+rule.host.slice(2)):host!==rule.host))return false;
  return glob(rule.path,u.pathname+u.search);
 }catch{return false;}
}
function parseMetadata(code){
 if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code,'utf8')>MAX_SCRIPT_BYTES||code.includes('\0'))throw Error('Userscript must be valid text up to512KiB.');
 const lines=code.replace(/^\uFEFF/,'').split(/\r?\n/),start=lines.findIndex(line=>/^\s*\/\/\s*==UserScript==\s*$/.test(line));
 if(start<0)throw Error('Missing userscript metadata header.');
 const fields=Object.create(null),warnings=[],blocked=[];let ended=false,count=0;
 for(let i=start+1;i<lines.length;i++){
  if(/^\s*\/\/\s*==\/UserScript==\s*$/.test(lines[i])){ended=true;break;}
  const match=/^\s*\/\/\s*@([\w:-]+)(?:\s+(.*))?$/.exec(lines[i]);if(!match)continue;
  if(++count>256)throw Error('Too many userscript metadata fields.');const key=match[1].toLowerCase(),value=(match[2]||'').trim();if(value.length>2048)throw Error('Userscript metadata field is too long.');(fields[key]||=[]).push(value);
 }
 if(!ended)throw Error('Unclosed userscript metadata header.');
 const first=(key,max)=>String(fields[key]?.[0]||'').slice(0,max),array=key=>unique(fields[key]||[]);
 const meta={name:first('name',300),namespace:first('namespace',500),version:first('version',100),description:first('description',2000),matches:array('match'),includes:array('include'),excludes:array('exclude'),excludeMatches:array('exclude-match'),runAt:first('run-at',100)||'document-end',noframes:!!fields.noframes,grants:array('grant'),connect:array('connect'),requires:array('require'),resources:(fields.resource||[]).map(value=>{const m=/^(\S+)\s+(.+)$/.exec(value);return m?{name:m[1],url:m[2]}:{name:value,url:''};}),injectInto:first('inject-into',100)||'auto',hash:digest(code),warnings,blocked};
 if(!meta.name)throw Error('Userscript @name is required.');
 for(const key of ['name','namespace','version','run-at','inject-into'])if((fields[key]||[]).length>1)blocked.push('Multiple @'+key+' fields are ambiguous.');
 if(!['document-start','document-end','document-idle'].includes(meta.runAt))blocked.push('Unsupported @run-at: '+meta.runAt);
 for(const key of ['matches','includes','excludes','excludeMatches'])for(const value of meta[key])try{patternParts(value);}catch{blocked.push('Unsupported '+key+' URL pattern: '+value);}
 if(!meta.matches.length&&!meta.includes.length)blocked.push('No explicit @match/@include site scope.');
 if(meta.grants.includes('none')&&meta.grants.length>1)blocked.push('@grant none cannot be combined with privileged grants.');
 for(const grant of meta.grants)if(!SUPPORTED_GRANTS.has(grant))blocked.push('Unsupported mandatory @grant: '+grant);
 if(meta.requires.length)blocked.push('@require dependencies are not supported by this engine.');
 if(meta.resources.length)blocked.push('@resource dependencies are not supported by this engine.');
 if(!['auto','page','content'].includes(meta.injectInto))blocked.push('Unsupported @inject-into: '+meta.injectInto);
 const grantNone=meta.grants.length===1&&meta.grants[0]==='none';
 if(meta.injectInto==='page'&&!grantNone)blocked.push('Page-world execution requires explicit @grant none.');
 meta.world=grantNone&&meta.injectInto!=='content'?'page':'isolated';
 meta.connect=meta.connect.map(value=>{if(['*','self'].includes(value))return value;try{return value.startsWith('*.')?'*.'+hostname(value.slice(2)):hostname(value);}catch{blocked.push('Invalid @connect host: '+value);return value;}});
 if(meta.grants.some(g=>['GM_xmlhttpRequest','GM.xmlHttpRequest'].includes(g))&&!meta.connect.length)blocked.push('Network API requires an explicit @connect scope.');
 const known=new Set(['name','namespace','version','description','match','include','exclude','exclude-match','run-at','noframes','grant','connect','require','resource','inject-into']);
 for(const key of Object.keys(fields))if(!known.has(key)&&!key.startsWith('name:')&&!key.startsWith('description:'))warnings.push('Metadata @'+key+' is retained in the script but is not implemented.');
 if(meta.matches.includes('<all_urls>')||meta.matches.some(p=>/^\*:\/\/\*\//.test(p))||meta.connect.includes('*'))warnings.push('This script requests a broad site or network scope.');
 return meta;
}
function matches(meta,url,options={}){const m=typeof meta==='string'?parseMetadata(meta):meta;if(!m||m.blocked?.length||options.isFrame&&m.noframes)return false;
 return [...(m.matches||[]),...(m.includes||[])].some(p=>patternMatches(p,url))&&![...(m.excludes||[]),...(m.excludeMatches||[])].some(p=>patternMatches(p,url));}
function canConnect(meta,url,sourceUrl){try{if(meta.blocked?.length)return false;const target=new URL(url);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)return false;return (meta.connect||[]).some(p=>p==='*'||p==='self'&&target.origin===new URL(sourceUrl).origin||p.startsWith('*.')&&(target.hostname===p.slice(2)||target.hostname.endsWith('.'+p.slice(2)))||target.hostname===p);}catch{return false;}}
function expansion(before,after){const added=key=>(after[key]||[]).filter(value=>!(before?.[key]||[]).includes(value));return {sites:[...added('matches'),...added('includes')],grants:added('grants'),connect:added('connect'),removedExclusions:[...(before?.excludes||[]).filter(v=>!after.excludes.includes(v)),...(before?.excludeMatches||[]).filter(v=>!after.excludeMatches.includes(v))],frames:before?.noframes===true&&!after.noframes,worldChanged:!!before&&before.world!==after.world};}
module.exports={parseMetadata,parse:parseMetadata,matches,patternMatches,patternParts,canConnect,expansion,MAX_SCRIPT_BYTES,SUPPORTED_GRANTS};
