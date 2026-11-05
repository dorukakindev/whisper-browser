// Canonical public Spotify references only; never an audio URL or access credential.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PodcastLinkSource=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  function spotify(value){try{const u=new URL(String(value).trim()),m=/^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(episode|show)\/([A-Za-z0-9]{22})\/?$/.exec(u.pathname);if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.port||u.username||u.password||!m)return null;return {kind:m[1],id:m[2],url:`https://open.spotify.com/${m[1]}/${m[2]}`};}catch{return null;}}
  return Object.freeze({spotify});
});
