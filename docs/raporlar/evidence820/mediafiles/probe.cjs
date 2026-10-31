const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
const out=path.resolve(process.env.AUDIT820_OUT||path.join(root,'.uiprev','audit820-mediafiles-'+Date.now()));fs.mkdirSync(out,{recursive:true});
const dir=path.join(out,'profile');fs.mkdirSync(dir,{recursive:true});
const {createMediaCatalogStore}=require(path.join(root,'src/media-catalog-store'));
const {createMetadataSync}=require(path.join(root,'src/catalog-metadata-sync'));
const {createCatalogExtensions}=require(path.join(root,'src/catalog-extensions'));
const poster=path.join(dir,'poster.png');fs.writeFileSync(poster,'fixture-owned-poster');
const store=createMediaCatalogStore({filePath:path.join(dir,'media-catalog.json')});
store.upsert({id:'one',kind:'film',title:'Fixture Movie',year:2000,tmdbId:'movie:42',posterPath:poster,synopsis:'Complete story',directors:['Director'],runtime:90,genres:[]});
const requests=[];global.fetch=async(url)=>{requests.push(new URL(url).pathname);return new Response(JSON.stringify({id:42,title:'Fixture Movie',release_date:'2000-01-01',overview:'Complete story',genres:[{name:'Drama'}],runtime:90,credits:{crew:[{job:'Director',name:'Director'}]}}));};
const settings=()=>({apiKey:'synthetic-fixture-credential-820',language:'en-US'});
const complete=createCatalogExtensions({store:()=>store,userData:()=>dir,pythonPath:()=>'',dialog:{},owner:()=>null,visible:item=>item,nativeImage:{},restart(){},metadataSettings:settings});
const job=createMetadataSync({store:()=>store,settings,userData:()=>dir,complete:id=>complete({sender:{id:1}},{action:'metadata-complete-missing',id},{automatic:true})});
async function idle(){while(job.snapshot().running)await new Promise(r=>setTimeout(r,5));}
(async()=>{
 const initial=store.get('one');
 const ordinary=job.start();await idle();
 const retried=job.start({retry:true});await idle();
 assert.equal(requests.length,0);assert.deepEqual(store.get('one').genres,[]);
 const beforeManual={ordinary,retried,requests:requests.slice(),genres:store.get('one').genres};
 await complete({sender:{id:1}},{action:'metadata-complete-missing',id:'one'},{automatic:true});
 assert.deepEqual(store.get('one').genres,['Drama']);assert.equal(requests.length,1);const directCompletion={genres:store.get('one').genres,requests:requests.slice()};
 // A genuinely complete record is skipped by the same completion consumer.
 const full=await complete({sender:{id:1}},{action:'metadata-complete-missing',id:'one'},{automatic:true});assert(full.skipped);assert.equal(requests.length,1);
 // A missing synopsis *is* admitted by the scheduler and completed by the actual consumer.
 store.upsert({id:'one',synopsis:''});job.start({retry:true});await idle();assert.equal(requests.length,2);assert.equal(store.get('one').synopsis,'Complete story');
 const output={initial:{genres:initial.genres,synopsis:initial.synopsis,runtime:initial.runtime,directors:initial.directors,posterExists:fs.existsSync(initial.posterPath)},beforeManual,manual:directCompletion,completeControl:{skipped:full.skipped},missingSynopsisControl:job.snapshot()};
 fs.writeFileSync(path.join(out,'metadata-results.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
