'use strict';
const {safePlaceUrl}=require('./browser-place-url');
const LIMIT=40,MAX_BYTES=100000;
const authPath=/(?:^|\/)(?:oauth\d*|authorize|authorization|login|signin|sign-in|saml|callback|checkout|payment)(?:\/|$)/i;
function historyUrl(raw){try{const url=new URL(String(raw||''));if(!['http:','https:'].includes(url.protocol)||url.username||url.password||authPath.test(url.pathname))return '';if([...url.searchParams.keys()].some(key=>/^(?:code|state|client_id|redirect_uri|response_type|SAMLRequest|SAMLResponse|RelayState|access_token|id_token)$/i.test(key)))return '';const safe=safePlaceUrl(url.href);return safe===url.href?safe:'';}catch(_){return '';}}
function normalizeNavigationHistory(raw){if(!raw||!Array.isArray(raw.entries)||!Number.isInteger(raw.index)||raw.index<0||raw.index>=raw.entries.length)return null;const active=raw.entries[raw.index],activeUrl=historyUrl(active?.url);if(!activeUrl)return null;const start=Math.max(0,raw.index-25),end=Math.min(raw.entries.length,start+LIMIT),entries=[];let index=-1,bytes=0;
 for(let i=start;i<end;i++){const row=raw.entries[i],url=historyUrl(row?.url);if(!url)continue;const entry={url,title:String(row.title||'').slice(0,300)},cost=Buffer.byteLength(JSON.stringify(entry));if(bytes+cost>MAX_BYTES){if(i<=raw.index)return null;break;}bytes+=cost;if(i===raw.index)index=entries.length;entries.push(entry);}
 return index<0?null:{entries,index};
}
function captureNavigationHistory(wc,fallback=null){try{if(wc&&!wc.isDestroyed?.()&&typeof wc.navigationHistory?.getAllEntries==='function'){const entries=wc.navigationHistory.getAllEntries();if(entries.length&&wc.getURL?.()!=='about:blank')return normalizeNavigationHistory({entries,index:wc.navigationHistory.getActiveIndex()});}}catch(_){}return normalizeNavigationHistory(fallback);}
function recoverableHistoryRestoreError(error){
 const code=String(error?.code||''),message=String(error?.message||'');
 if(Number(error?.errno??error?.code)===-3||/ABORT|SUPERSEDE|CANCEL/i.test(code)||/\b(?:aborted|superseded|cancelled|canceled)\b/i.test(message))return false;
 // Native restore also rejects page-load failures. Only API/argument/history
 // compatibility failures permit URL fallback; do not replay failed navigation.
 if(Number(error?.errno??error?.code)<0||/^(?:net::)?ERR_(?!INVALID_ARG|OUT_OF_RANGE|NOT_SUPPORTED|METHOD_NOT_IMPLEMENTED)/.test(code))return false;
 return ['TypeError','RangeError','NotSupportedError'].includes(error?.name)
  ||['ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_OUT_OF_RANGE','ERR_NOT_SUPPORTED','ERR_METHOD_NOT_IMPLEMENTED'].includes(code)
  ||/\b(?:invalid|incompatible|unsupported|not supported)\b.*\bhistory\b|\bhistory\b.*\b(?:invalid|incompatible|unsupported|not supported)\b/i.test(message);
}
async function restoreNavigationHistory(wc,snapshot){const normalized=normalizeNavigationHistory(snapshot);if(!normalized||typeof wc.navigationHistory?.restore!=='function')return false;try{await wc.navigationHistory.restore(normalized);return true;}catch(error){if(recoverableHistoryRestoreError(error))return false;throw error;}}
function classifyWindowOpen(details={},nested=false){let url;try{url=new URL(details.url);}catch(_){return 'popup';}if(nested||url.href==='about:blank'||details.postBody||(details.frameName&&details.frameName!=='_blank')||/^(?:accounts?|login|auth|identity|checkout|payments?)\./i.test(url.hostname)||/(?:^|\.)paypal\.com$/i.test(url.hostname)||String(details.features||'').trim()||authPath.test(url.pathname)||[...url.searchParams.keys()].some(key=>/^(?:client_id|redirect_uri|response_type|state|SAMLRequest|SAMLResponse)$/i.test(key)))return 'popup';if(!['http:','https:'].includes(url.protocol))return 'popup';return ['foreground-tab','background-tab'].includes(details.disposition)?'tab':'popup';}
module.exports={normalizeNavigationHistory,captureNavigationHistory,restoreNavigationHistory,recoverableHistoryRestoreError,classifyWindowOpen,historyUrl,LIMIT};
