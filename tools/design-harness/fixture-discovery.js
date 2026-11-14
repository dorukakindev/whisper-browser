'use strict';
// Synthetic catalog, only for the isolated offline design harness.
const names=['Night Harbour','The Lighthouse Keepers','After the Last Train','A Map of Quiet Places','The Sound Between Rooms','Winter Letters','Beyond the Blue Horizon','The Long Way Home'];
const metas=names.map((name,i)=>({id:'tt'+(i===0?7000002:i===1?7000001:7000009+i),type:i===1?'series':'movie',name,releaseInfo:String(2020+i%7),imdbRating:String(7+(i%10)/10),genres:i%2?['Drama','Mystery']:['Adventure','Drama'],runtime:'106 min',description:'A story of distant places, unfinished conversations and the people who return to them.',poster:`https://images.metahub.space/poster/medium/tt${i===0?7000002:i===1?7000001:7000009+i}/img`,background:`https://images.metahub.space/background/medium/tt${7000001+i}/img`}));
module.exports=function(url){
 if(!['v3-cinemeta.strem.io','cinemeta-catalogs.strem.io'].includes(url.hostname))return null;
 const value=url.pathname.includes('/meta/')?{meta:metas.find(x=>url.pathname.includes(x.id))||metas[0]}:{metas:metas.filter(x=>!url.pathname.includes('/movie/')||x.type==='movie')};
 return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
};
