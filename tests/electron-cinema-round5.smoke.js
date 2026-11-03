'use strict';
const fs=require('fs'),Module=require('module');let code=fs.readFileSync(require.resolve('./electron-cinema-round3.smoke.js'),'utf8');
code=code.replace("'tmp/cinema-round3-'","'tmp/cinema-round4-'");
const marker='const seam=" assert(checks.every';
const insertion=String.raw`
source=source.replace('items.slice(0,7).map','Array.from({length:78},(_,i)=>items[i%items.length]).map').replace('title:r.title,position:600','title:i===0?"Is suffering necessary for a meaningful life? A conversation about what makes us human":r.title,position:600');
source=source.replace("await shot('home-'+width);","await shot('home-'+width);assert(await run('return document.querySelectorAll(\".cn-home-hero .cn-carousel-dots button\").length<=7'), '78-entry carousel bounded');assert(await run('const n=document.querySelector(\".cn-hero-switch>span\");return /78/.test(n.textContent)&&getComputedStyle(n).whiteSpace===\"nowrap\"'), '78 counter is not wrapped');");
source=source.replace("await shot('film-tools-'+width);","await shot('film-tools-'+width);await until(()=>run('return !!document.querySelector(\".cf4-taste .cf4-aspect\")'),'taste editor');await run('const p=document.querySelector(\".film-decision-profile\");p.open=true;p.scrollIntoView({block:\"start\",behavior:\"instant\"});return true');await shot('taste-film-'+width);await run('document.querySelector(\".cf4-tabs [data-scope=global]\").click();return true');await shot('taste-global-'+width);await run('document.querySelector(\".cf4-preparation\").scrollIntoView({block:\"start\",behavior:\"instant\"});return true');await shot('preparation-'+width);");
source=source.replace("await shot('film-tools-'+width);","await shot('film-tools-'+width);if(width===1440){const sources=await require('electron').desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1440,height:1080}});const source=sources.find(s=>s.id===win.getMediaSourceId());if(!source||source.thumbnail.isEmpty())throw Error('Alternative native window capture unavailable');fs.writeFileSync(path.join(out,'film-tools-desktop-window-1440.png'),source.thumbnail.toPNG());}");
source=source.replace('d.open=true;d.scrollIntoView','d.open=true;await new Promise(resolve=>setTimeout(resolve,400));d.scrollIntoView');
source=source.replace('async function shot(name,selector){if(selector)','async function shot(name,selector){await pause(450);if(selector)');
source=source.replaceAll("scrollIntoView({block:'start'})","scrollIntoView({block:'start',behavior:'instant'})");
source=source.replace("'no-file title ready');","'no-file title ready');await run('document.querySelector(\".cn-film-tools\").closest(\"details\").open=true;return true');await until(()=>run('return !!document.querySelector(\".cf4-preparation .fw-source-controls button:not(:disabled)\")'),'link action available without source');await shot('film-no-source-1920','.cf4-preparation');");
`;
if(!code.includes(marker))throw Error('Round3 bootstrap seam changed');code=code.replace(marker,insertion+'\n'+marker);
code=code.replaceAll('[0,200,600,900]','[0,100,200,400,900]').replace("'tmp/cinema-round4-'","'tmp/cinema-round5-'");
const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;m._compile(code,__filename);
