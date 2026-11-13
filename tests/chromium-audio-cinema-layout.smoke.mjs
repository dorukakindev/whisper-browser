// Isolated renderer geometry regression: a narrow audio theater inside a wide window.
// Fixture acceptance only; this does not exercise native audio or a live provider.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const staged = stageRenderer([path.join(ROOT,'tests/support/discover-fixture-stub.js'),path.join(ROOT,'tests/support/dub-panel-fixture-stub.js')]);
const browser = await launch({width:1920,height:1080});
try {
  await browser.goto(staged.url); await sleep(1500);
  await browser.until('window.__dub&&window.CinemaSahne','Sahne');
  await browser.evaluate(`window.__fx.setLocale('tr');applyUiTheme('dark');window.__dub.sahne('cinema','single')`);
  await browser.until(`CinemaSahne.current&&!CinemaSahne.current.q('.sh-bars')`,'Sahne intro finished');
  await browser.evaluate(`(()=>{const stage=CinemaSahne.current,info=stage.a.info;stage.a.info=()=>({...info(),audio:true});stage.tick();})()`);
  await sleep(200);
  const geometry=await browser.evaluate(`(()=>{
    const stage=CinemaSahne.current,dock=stage.q('.sh-dock'),box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const groups=['.sh-cinema-transport','.sh-cinema-sentences','.sh-local-extra','.sh-dock-tools'].map(s=>box(stage.q(s))),bounds=box(dock);
    const overlaps=groups.flatMap((a,i)=>groups.slice(i+1).filter(b=>Math.min(a.right,b.right)>Math.max(a.x,b.x)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+1));
    const escaped=[...dock.querySelectorAll('button,input')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none').filter(e=>{const r=box(e);return r.x<bounds.x-1||r.right>bounds.right+1;});
    return {audio:stage.root.classList.contains('sh-audio'),theater:box(stage.q('.sh-theater')),bounds,groups,overlaps:overlaps.length,escaped:escaped.length};
  })()`);
  assert.equal(geometry.audio,true);
  assert.ok(geometry.theater.width<1150,'fixture must exercise a narrow theater inside a wide viewport');
  assert.equal(geometry.overlaps,0,JSON.stringify(geometry));
  assert.equal(geometry.escaped,0,JSON.stringify(geometry));
  const shots=process.argv.indexOf('--shots');
  if(shots>=0) await browser.screenshot(path.join(process.argv[shots+1],'audio-cinema-layout.png'));
  // The controlled playback adapter bypasses the normal workspace mount; adopt the
  // original side panel into the same production dialog before checking its CSS.
  await browser.evaluate(`document.querySelector('.pw-existing-tools').append(document.getElementById('playerSide'));setSettingsDrawer(true)`);
  await sleep(100);
  const settings=await browser.evaluate(`(()=>{const dialog=document.querySelector('.pw-existing-tools'),side=dialog.querySelector('#playerSide'),drawer=side.querySelector('#settingsDrawer');return {open:dialog.open,outerScroll:getComputedStyle(dialog).overflowY,sideScroll:getComputedStyle(side).overflowY,drawerScroll:getComputedStyle(drawer).overflowY,outerHeight:dialog.clientHeight,outerContent:dialog.scrollHeight,drawerHeight:drawer.clientHeight,drawerContent:drawer.scrollHeight};})()`);
  assert.equal(settings.open,true);
  assert.equal(settings.outerScroll,'hidden',JSON.stringify(settings));
  assert.equal(settings.sideScroll,'hidden',JSON.stringify(settings));
  assert.equal(settings.drawerScroll,'auto',JSON.stringify(settings));
  assert.ok(settings.outerContent<=settings.outerHeight+1,JSON.stringify(settings));
  assert.ok(settings.drawerContent>settings.drawerHeight,JSON.stringify(settings));
  if(shots>=0) await browser.screenshot(path.join(process.argv[shots+1],'advanced-settings-layout.png'));
  console.log('Audio cinema: all four control groups stay separate inside the theater',JSON.stringify(geometry));
  console.log('Advanced settings: one bounded scrolling drawer',JSON.stringify(settings));
} finally { await browser.close(); staged.cleanup(); }
