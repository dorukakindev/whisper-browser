// Real renderer, synthetic library/source responses. No real TorBox or native playback.
import path from 'node:path';
import {launch,stageRenderer,ROOT,sleep} from './support/chromium-fixture.mjs';
const args=process.argv.slice(2),shots=args.includes('--shots')?args[args.indexOf('--shots')+1]:'';
const staged=stageRenderer(['discover-fixture-stub.js','stremio-sources-fixture-stub.js','stremio-cloud-fixture-stub.js'].map(f=>path.join(ROOT,'tests/support',f)));
const browser=await launch({width:1920,height:1080}),checks=[];
const check=(label,ok,data)=>{checks.push(!!ok);console.log((ok?'PASS ':'FAIL ')+label+(ok?'':' '+JSON.stringify(data)));};
try{
 await browser.goto(staged.url);await browser.until('window.__cloud&&window.StremioUI&&window.MediaHomeUI','cloud fixture');await sleep(1000);
 await browser.evaluate("window.__fx.setLocale('tr');applyUiTheme('dark');MediaHomeUI.navigate('stremio');true");await sleep(1000);
 await browser.evaluate("[...document.querySelectorAll('.sx-mode')].find(b=>b.textContent.includes('Bulut')).click();true");await sleep(600);
 const cloud=await browser.evaluate(`(()=>{const host=document.querySelector('.sx-cloud-host'),cards=host?.querySelectorAll('.sx-card');return{visible:host&&!host.hidden,count:cards?.length,overflow:document.documentElement.scrollWidth>innerWidth,catalogs:[...host.querySelectorAll('select')].flatMap(s=>[...s.options].map(o=>o.textContent)).filter(t=>t.includes('TorBox'))};})()`);
 check('cloud catalog is visible with all provider catalogs and no horizontal overflow',cloud.visible&&cloud.count===12&&!cloud.overflow&&cloud.catalogs.length===3,cloud);
 if(shots)await browser.screenshot(path.join(shots,'cloud-library-1920.png'));
 await browser.evaluate("document.querySelector('.sx-cloud-host .sx-card').click();true");await sleep(900);
 const files=await browser.evaluate(`(()=>{const f=document.querySelector('.sx-library-files');return{count:f?.querySelectorAll('button').length,disabled:f?[...f.querySelectorAll('button')].filter(b=>b.disabled).length:0,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
 check('library detail lists file identities and unavailable file state',files.count===2&&files.disabled===1&&!files.overflow,files);
 if(shots)await browser.screenshot(path.join(shots,'cloud-files-1920.png'));
}catch(e){check('cloud flow completed',false,{error:e.message});}
await browser.close();staged.cleanup();console.log(checks.filter(Boolean).length+'/'+checks.length+' passed');process.exit(checks.every(Boolean)?0:1);
