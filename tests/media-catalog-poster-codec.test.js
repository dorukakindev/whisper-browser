const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {registerMediaCatalogService}=require('../src/media-catalog-service');
test('bounded WebP bytes survive missing native codec and never disclose a file path',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-codec-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const valid=path.join(dir,'download.jpg'),bad=path.join(dir,'not-image.jpg');
 fs.writeFileSync(valid,Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64'));fs.writeFileSync(bad,'<svg onload="alert(1)"></svg>');
 const store=require('../src/media-catalog-store').createMediaCatalogStore({filePath:path.join(dir,'media-catalog.json')});
 store.upsert({id:'valid',kind:'film',title:'Afiş',posterPath:valid});store.upsert({id:'bad',kind:'film',title:'Bozuk',posterPath:bad});
 let invoke;registerMediaCatalogService({ipcMain:{handle:(channel,fn)=>{if(channel==='media-catalog:request')invoke=fn;}},dialog:{},owner:()=>null,authorized:event=>event.sender.id===1,userData:()=>dir,nativeImage:{createFromPath:()=>({isEmpty:()=>true})},watchItems:()=>[]});
 const owner={sender:{id:1}},raster=await invoke(owner,{action:'poster',id:'valid'});
 assert.equal(raster.ok,true);assert.match(raster.image,/^data:image\/webp;base64,/);assert.ok(!raster.image.includes(dir));
 assert.equal((await invoke(owner,{action:'poster',id:'bad'})).image,'');assert.equal((await invoke({sender:{id:2}},{action:'poster',id:'valid'})).ok,false);
});
