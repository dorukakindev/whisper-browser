(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WhisperTextFold=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const search=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ı/g,'i');
 // Command grammars contain Turkish accents: retain them, but do not turn English I into ı.
 const command=value=>String(value||'').normalize('NFKC').replace(/İ/g,'I').toLowerCase();
 return Object.freeze({search,command});
});
