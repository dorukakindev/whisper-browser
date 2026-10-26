'use strict';
function requestHeaders(input={}) {
 const headers={...input};
 // Keep the browser's first-party YouTube origin/referrer. Application-origin
 // requests still use the existing CDN compatibility identity.
 const find=name=>Object.keys(headers).find(key=>key.toLowerCase()===name);
 const origin=find('origin'),ref=find('referer');
 const youtube=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='youtube.com'||u.hostname.endsWith('.youtube.com'));}catch{return false;}};
 if(origin&&youtube(headers[origin]))return headers;
 if(origin)delete headers[origin];if(ref)delete headers[ref];
 headers.Origin='https://www.youtube.com';headers.Referer='https://www.youtube.com/';return headers;
}
function responseHeaders(input={}) {
 const headers={...input};
 // Never replace a valid server CORS origin with '*'. YouTube's credentialed
 // media requests reject wildcard origins, including duplicate case variants.
 if(!Object.keys(headers).some(key=>key.toLowerCase()==='access-control-allow-origin'))headers['Access-Control-Allow-Origin']=['*'];
 if(!Object.keys(headers).some(key=>key.toLowerCase()==='access-control-allow-headers'))headers['Access-Control-Allow-Headers']=['*'];
 for(const key of Object.keys(headers))if(key.toLowerCase()==='cross-origin-resource-policy')delete headers[key];
 return headers;
}
module.exports={requestHeaders,responseHeaders};
