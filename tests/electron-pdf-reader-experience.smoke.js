const { app, BrowserWindow, dialog } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, ".uiprev", "pdf-reader678-" + Date.now()),
  profile = path.join(out, "profile");
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setPath("downloads", out);
app.setAppPath(root);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
const source = path.join(out, "Okuma denemesi.pdf");
const longDocument=process.argv.includes("--long"),pageCount=longDocument?80:3;
function makePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({length:pageCount},(_,i)=>(3+i*2)+" 0 R").join(" ")}] /Count ${pageCount} >>`,
  ];
  for (let page = 1; page <= pageCount; page++) {
    const lines = [
      `Chapter ${page}`,
      "This is a controlled PDF reading sample.",
      "Listen to this passage and follow the highlight.",
    ];
    for (let i = 0; i < 24; i++)
      lines.push(
        "This paragraph preserves the source text and gives the reader room to breathe.",
      );
    const content =
      "BT /F1 12 Tf 48 740 Td " +
      lines
        .map((line, i) => (i ? "0 -22 Td " : "") + "(" + line + ") Tj")
        .join("\n") +
      " ET";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${pageCount*2+3} 0 R >> >> /Contents ` +
        (4 + (page - 1) * 2) +
        " 0 R >>",
    );
    objects.push(
      "<< /Length " +
        Buffer.byteLength(content) +
        " >>\nstream\n" +
        content +
        "\nendstream",
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += i + 1 + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 " +
    (objects.length + 1) +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xref +
    "\n%%EOF";
  return pdf;
}
fs.writeFileSync(source, makePdf());
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
dialog.showSaveDialog = async () => ({
  canceled: false,
  filePath: path.join(out, "selected-pages.m4b"),
});

const workflowModule = require("../src/media-workflows"),
  register = workflowModule.registerMediaWorkflows;
let service;
workflowModule.registerMediaWorkflows = (args) => (service = register(args));
const {ipcMain}=require('electron');
let prepareTextHandler, holdListen=false, pendingListen=null;
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>{if(channel==='pdf:prepareText')prepareTextHandler=handler;return originalHandle(channel,channel==='media-workflows:request'?async(event,request)=>{if(holdListen&&request?.action==='book-listen'){holdListen=false;return new Promise((resolve,reject)=>{pendingListen={resolve,reject};});}return handler(event,request);}:handler)};
require("../src/main");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 250; i++) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error("Timeout " + label);
}
app
  .whenReady()
  .then(async () => {
    let win;
    await until(() => {
      win = BrowserWindow.getAllWindows().find(
        (w) =>
          w.webContents.getURL().includes("index.html") &&
          !w.webContents.isLoading(),
      );
      return win;
    }, "window");
    const run = (code) =>
      win.webContents.executeJavaScript("(async()=>{" + code + "})()", true);
    win.webContents.setBackgroundThrottling(false);
    const capture = async (name) => {
      win.show(); win.moveTop(); win.focus();
      await run('await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
      await wait(350);
      const state=await run('return {theme:document.documentElement.dataset.theme,locale:UiLocale.get(),mode:player.pdfReader?.viewMode,width:innerWidth}');
      fs.writeFileSync(path.join(out,name+'.state.json'),JSON.stringify(state));
      for (let i = 0; i < 3; i++) {
        try {
          fs.writeFileSync(
            path.join(out, name),
            (await win.webContents.capturePage()).toPNG(),
          );
          return;
        } catch (e) {
          if (i === 2) throw e;
          await wait(200);
        }
      }
    };
    win.show();
    win.focus();
    win.setContentSize(1440, 1000);
    await run(
      'await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");await openPlayer();await openPdfReader();return true',
    );
    await until(
      () =>
        run(
          'return player.pdfReader?.pages.get(1)?.article?.dataset.state==="ready"',
        ),
      "PDF",
    );
    assert(
      await run(
        'return document.querySelector("#pdfReader.mode-reading .pdf-page-prose")?.textContent.includes("controlled PDF")',
      ),
    );
    if((process.argv.includes('--citations800')||process.argv.includes('--experience801'))){
      const found=await run(`return BookAssistantUI.assistant.search({query:'Chapter 3'},()=>false)`);
      const citation=found.matches.find(c=>c.page===3);assert(citation?.navigable,'PDF search should return navigable registered citations');
      await run(`await AssistantWorkspace.prepare();const job={chatQuestion:'Find chapter three.',chatContext:{},sourceScope:aiSourceScope(),bubble:aiChatAdd('ai','See [B3-0].')};AssistantWorkspace.begin(job);AssistantWorkspace.citations(job,[${JSON.stringify(citation)}]);AssistantWorkspace.finish(job,'See [B3-0].','complete');return true`);
      const overlay=win.contentView.children.find(row=>row.webContents?.getURL().includes('assistant-overlay.html'));assert(overlay);
      overlay.webContents.setBackgroundThrottling(false);
      const overlayRun=code=>overlay.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
      await overlayRun(`document.getElementById('bubble').click();return true`);
      await until(()=>overlayRun(`return [...document.querySelectorAll('.source-card button')].some(b=>b.textContent.includes('B3-0'))`),'actual citation button');
      await overlayRun(`[...document.querySelectorAll('.source-card button')].find(b=>b.textContent.includes('B3-0')).click();return true`);
      await until(()=>run('return player.pdfReader.currentPage===3'),'citation click page');
      await overlayRun(`document.getElementById('bubble').click();return true`);

      assert.equal(await run('return player.pdfReader.currentPage'),3);
      if(process.argv.includes('--experience801')){await until(()=>run(`return CSS.highlights.has('pdf-citation')`),'prose citation highlight');await capture('citation-highlight-reading.png');await run(`document.querySelector('[data-pdf-view="source"]').click();return true`);await until(()=>run(`return [...document.querySelectorAll('.pdf-citation-overlay i')].some(n=>n.getBoundingClientRect().width>0)`),'original page quote boxes');await capture('citation-highlight-source.png');}
      await capture('citation-page3.png');
      await run(`document.getElementById('pdfReadingReturn').click();return true`);
      await until(()=>run('return player.pdfReader.currentPage===1'),'citation return');
      await assert.rejects(run(`await BookAssistantUI.assistant.navigate({...${JSON.stringify(citation)},sourceId:'other-document'})`),/original document|özgün belge/);
      await run(`player.cues=[{start:1.1,end:1.9,text:'First sentence.'},{start:3,end:4,text:'Manually adjusted.'}];player.timeline.selected=1;timelineNudge(.1);return true`);
      assert(await run('return player.cues[1].timingLocked===true'));
      await run(`player.timeline.waveform=Array.from({length:100},(_,i)=>i>=10&&i<20||i>=40&&i<50?.001:.5);player.timeline.waveformDuration=5;player.timeline.waveformStart=0;document.getElementById('timelineAnalysisFrom').value='0';document.getElementById('timelineAnalysisTo').value='5';previewTimingChanges(true);return true`);
      assert(await run(`return !!document.querySelector('.timing-review[open]')`));await capture('silence-preview.png');
      await run(`document.querySelector('.timing-review footer button:last-child').click();return true`);
      assert(await run('return player.cues[0].start===1&&player.cues[0].end===2&&player.cues[1].start===3.1&&player.cues[1].timingLocked'));
      await run(`document.getElementById('timelineUndo').click();return true`);assert.equal(await run('return player.cues[0].start'),1.1);assert(await run('return !player.cues[0].timingLocked&&player.cues[1].timingLocked'));
      await run(`player.timeline.selected=1;drawTimeline();document.getElementById('timelineTimingUnlock').click();return true`);assert(await run('return !player.cues[1].timingLocked'));await run(`document.getElementById('timelineUndo').click();return true`);assert(await run('return player.cues[1].timingLocked'));
      fs.writeFileSync(path.join(out,'acceptance800.json'),JSON.stringify({ok:true,pageJump:3,returned:1,wrongDocumentRejected:true,manualTimingPreserved:true,undo:true}));
      console.log(JSON.stringify({ok:true,out}));app.exit(0);return;
    }
    if(process.argv.includes('--toolbar-only')){
      await run(`window.reader716Keys=[];document.addEventListener('keydown',e=>window.reader716Keys.push({key:e.key,target:e.target.dataset?.pdfView||e.target.id,ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey,phase:e.eventPhase}),true);return true`);
      const snapshot=()=>run(`return {mode:player.pdfReader.viewMode,page:player.pdfReader.currentPage,focus:document.activeElement?.dataset?.pdfView||document.activeElement?.id,keys:window.reader716Keys,radios:[...document.querySelectorAll('#pdfViewModes button')].map(b=>({mode:b.dataset.pdfView,checked:b.getAttribute('aria-checked'),tab:b.tabIndex,height:b.getBoundingClientRect().height})),width:innerWidth,overflow:document.getElementById('pdfReader').scrollWidth>document.getElementById('pdfReader').clientWidth+1}`);
      await capture('toolbar-wide.png');
      await run(`document.querySelector('[data-pdf-view="reading"]').focus();return true`);
      const key=async(keyCode,modifiers=[])=>{win.focus();win.webContents.focus();await wait(40);win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Return')win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(100)};
      await key('Right');let state=await snapshot();fs.writeFileSync(path.join(out,'toolbar-arrow.json'),JSON.stringify(state,null,2));
      if(state.mode!=='source'){
        win.webContents.debugger.attach('1.3');const object=await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:'document.querySelector("[data-pdf-view=reading]")'});
        const listeners=await win.webContents.debugger.sendCommand('DOMDebugger.getEventListeners',{objectId:object.result.objectId});win.webContents.debugger.detach();
        const clickMode=await run(`document.querySelector('[data-pdf-view="source"]').click();return player.pdfReader.viewMode`);
        fs.writeFileSync(path.join(out,'listener-diagnostic.json'),JSON.stringify({listeners,clickMode},null,2));
      }
      assert.equal(state.mode,'source','Right arrow must select the next reading mode');
      assert.equal(state.focus,'source');assert.equal(state.radios.filter(b=>b.tab===0).length,1);
      await key('End');assert.equal((await snapshot()).mode,'translation');
      await key('Home');assert.equal((await snapshot()).mode,'reading');
      await key('Left');assert.equal((await snapshot()).mode,'translation');
      await key('Down');assert.equal((await snapshot()).mode,'reading');
      await key('Tab');assert(!['reading','source','both','translation'].includes((await snapshot()).focus),'Tab must leave the radio group');
      await key('Tab',['shift']);assert.equal((await snapshot()).focus,'reading');
      await capture('toolbar-focus-wide.png');
      const sourcePoint=await run(`const b=document.querySelector('[data-pdf-view="source"]').getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}`);
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...sourcePoint});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...sourcePoint});await wait(100);
      assert.equal((await snapshot()).mode,'source','Native click must activate the original PDF view');await key('Home');
      win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      win.webContents.sendInputEvent({type:'mouseMove',x:10,y:400});await wait(200);
      const hoverPoint=await run(`const b=document.getElementById('pdfVoiceOpen').getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}`);
      win.webContents.sendInputEvent({type:'mouseMove',...hoverPoint});
      const motion=await run(`await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=document.getElementById('pdfVoiceOpen');getComputedStyle(b).backgroundColor;const a=b.getAnimations();for(const animation of a)animation.updatePlaybackRate(.1);await Promise.all(a.map(x=>x.ready));return {transitions:a.map(x=>({property:x.transitionProperty,duration:x.effect.getTiming().duration,rate:x.playbackRate})),staticLabel:b.textContent,normalDuration:getComputedStyle(b).transitionDuration};`);
      assert(motion.transitions.some(a=>a.property==='background-color'&&a.rate===.1),'Inspect the real hover transition at 10 percent speed');
      await wait(180);await capture('toolbar-hover-slow.png');
      await run(`document.getElementById('pdfVoiceOpen').getAnimations().forEach(a=>a.finish());return true`);
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      motion.reduced=await run(`return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,duration:getComputedStyle(document.getElementById('pdfVoiceOpen')).transitionDuration}`);
      assert(motion.reduced.matches&&motion.reduced.duration==='0s');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();
      fs.writeFileSync(path.join(out,'toolbar-motion.json'),JSON.stringify(motion,null,2));
      await run(`document.querySelector('#pdfTranslateTools summary').focus();return true`);await key('Return');
      assert(await run(`return document.getElementById('pdfTranslateTools').open`));await capture('toolbar-menu-wide.png');
      await key('Escape');assert(await run(`return !document.getElementById('pdfTranslateTools').open&&document.activeElement===document.querySelector('#pdfTranslateTools summary')`));
      const states=[state];
      win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);await wait(250);
      for(const [locale,theme] of [['tr','dark'],['en','light']]){
        await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');return true`);await wait(150);
        assert.equal(await run(`return document.getElementById('pdfZoomValue').textContent`),locale==='tr'?'%100':'100%');
        const narrow=await snapshot();states.push(narrow);assert(!narrow.overflow);assert(narrow.radios.every(b=>b.height>=40),'Reader controls need a usable desktop hit area');
        await capture('toolbar-'+locale+'-'+theme+'-125.png');
        await run(`document.getElementById('pdfTranslateTools').open=true;return true`);await wait(100);
        const bounds=await run(`const b=document.querySelector('#pdfTranslateTools .pdf-reader-tools-content').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight}`);
        assert(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));
        await capture('toolbar-menu-'+locale+'-'+theme+'-125.png');await key('Escape');
      }
      const compact=[];
      win.setContentSize(800,950);win.webContents.setZoomFactor(1.25);await wait(150);
      for(const [locale,theme] of [['tr','dark'],['en','light']]){
        await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');return true`);await wait(150);
        const measured=await run(`return {height:document.querySelector('.pdf-reader-controls').getBoundingClientRect().height,tools:[...document.querySelectorAll('.pdf-reader-more-tools summary')].map(node=>{const r=node.getBoundingClientRect();return {name:node.textContent.trim(),title:node.title,width:r.width,height:r.height,icon:getComputedStyle(node.querySelector('svg')).display}})}`);
        assert(measured.height<=130,JSON.stringify(measured));assert.equal(measured.tools.length,3);
        assert(measured.tools.every(n=>n.width>=40&&n.height>=40&&n.icon!=='none'&&n.name&&n.name===n.title));
        win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Accessibility.enable');
        const tree=await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');win.webContents.debugger.detach();
        const names=tree.nodes.filter(n=>n.role?.value==='DisclosureTriangle').map(n=>n.name?.value);
        for(const tool of measured.tools)assert(names.includes(tool.name),'Disclosure accessible name: '+tool.name);
        for(const id of ['pdfReadingTools','pdfAssistantTools','pdfTranslateTools']){
          await run(`document.querySelector('#${id} summary').focus();return true`);await key('Return');
          assert(await run(`return document.getElementById('${id}').open`));
          const bounds=await run(`const r=document.querySelector('#${id} .pdf-reader-tools-content').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}`);
          assert(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,JSON.stringify({id,...bounds}));await key('Escape');
          assert(await run(`return !document.getElementById('${id}').open&&document.activeElement===document.querySelector('#${id} summary')`));
        }
        compact.push({locale,theme,...measured,accessibleNames:names});await capture('compact767-'+locale+'-'+theme+'.png');
      }
      const shortMenus=[];
      for(const minimum of [752,400]){win.setMinimumSize(minimum,400);win.setContentSize(500,620);await wait(150);
      for(const id of ['pdfReadingTools','pdfAssistantTools','pdfTranslateTools']){
        await run(`document.querySelector('#${id} summary').focus();return true`);await key('Return');
        const bounds=await run(`const node=document.querySelector('#${id} .pdf-reader-tools-content'),r=node.getBoundingClientRect();return {id:'${id}',left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollable:node.scrollHeight>node.clientHeight}`);
        assert(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height-15,JSON.stringify(bounds));shortMenus.push(bounds);await key('Escape');
      }}
      await run(`document.querySelector('#pdfTranslateTools summary').focus();return true`);await key('Return');
      win.setContentSize(500,500);await wait(150);
      const resized=await run(`const r=document.querySelector('#pdfTranslateTools .pdf-reader-tools-content').getBoundingClientRect();return {resizedWhileOpen:true,bottom:r.bottom,height:innerHeight}`);
      assert(resized.bottom<=resized.height-15,JSON.stringify(resized));shortMenus.push(resized);await capture('compact767-short-menu.png');await key('Escape');
      await capture('compact767-short.png');fs.writeFileSync(path.join(out,'short767.json'),JSON.stringify(shortMenus,null,2));
      fs.writeFileSync(path.join(out,'compact767.json'),JSON.stringify(compact,null,2));
      fs.writeFileSync(path.join(out,'toolbar-results.json'),JSON.stringify({ok:true,states,nativeKeyboard:true,realPdf:true},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);return;
    }
    if(longDocument){
      await run(`document.getElementById('pdfReaderPage').value='75';document.getElementById('pdfReaderPage').dispatchEvent(new Event('change'));return true`);
      await until(()=>run(`return player.pdfReader.currentPage===75&&player.pdfReader.pages.get(75)?.article?.dataset.state==='ready'&&!player.pdfReader.navigatingPage`),'late original PDF page');
      await wait(600);
      const late=await run(`const r=player.pdfReader,c=PdfReaderExperience.context(),p=r.pages.get(75).article.getBoundingClientRect(),v=document.getElementById('pdfReaderPages').getBoundingClientRect();return {page:c.page,total:c.totalPages,excerpt:c.excerpt,visible:p.bottom>v.top&&p.top<v.bottom,rendered:r.rendered.size};`);
      assert.equal(late.page,75);assert.equal(late.total,80);assert(late.excerpt.includes('Chapter 75')&&!late.excerpt.includes('Chapter 74'));assert(late.visible);assert(late.rendered<30,'jump must not eagerly raster all preceding pages');
      fs.writeFileSync(path.join(out,'long-document.json'),JSON.stringify(late,null,2));await capture('late-page75.png');
      await run(`document.getElementById('pdfReaderPage').value='1';document.getElementById('pdfReaderPage').dispatchEvent(new Event('change'));return true`);await until(()=>run(`return player.pdfReader.currentPage===1&&!player.pdfReader.navigatingPage`),'return to beginning');
    }
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}));document.getElementById('pdfFindText').value='Chapter 2';document.getElementById('pdfFindForm').requestSubmit();return true`);
    await until(()=>run(`return document.getElementById('pdfFindStatus').textContent.includes('sayfa 2') && player.pdfReader.currentPage===2`),'PDF find original page identity');
    assert(await run(`return document.getElementById('pdfFindExcerpt').textContent.includes('Chapter 2')`));
    await capture('pdf-find-tr.png');
    if(process.argv.includes('--search-owner')){
      await run(`window.originalSearchRender=renderPdfReaderPage;window.oldSearchRejects=[];renderPdfReaderPage=()=>new Promise((_,reject)=>oldSearchRejects.push(reject));document.getElementById('pdfFindNext').click();return true`);
      assert(await run('return oldSearchRejects.length>=1'));
      await run(`PdfReaderSearchUI.reset();for(const reject of oldSearchRejects)reject(Error('Old page failed'));renderPdfReaderPage=originalSearchRender;return true`);await wait(120);
      assert.equal(await run("return document.getElementById('pdfFindStatus').textContent"),'');
      await run(`PdfReaderSearchUI.open();document.getElementById('pdfFindText').value='Chapter 2';document.getElementById('pdfFindForm').requestSubmit();return true`);
      await until(()=>run("return !document.getElementById('pdfFindNext').disabled"),'fresh search');
      await run(`renderPdfReaderPage=async()=>{throw Error('Controlled rendering failure')};document.getElementById('pdfFindNext').click();return true`);await wait(120);
      assert(await run("return document.getElementById('pdfFindStatus').textContent.startsWith('Bu eşleşme açılamadı.')"));
      await capture('pdf-search-error-tr.png');
      await run(`renderPdfReaderPage=originalSearchRender;document.getElementById('pdfFindNext').click();return true`);
      await until(()=>run("return document.getElementById('pdfFindExcerpt').textContent.includes('Chapter 2')"),'search retry after failure');
      fs.writeFileSync(path.join(out,'search-owner.json'),JSON.stringify({ok:true,realPdf:true,controlledRenderFailure:true,staleRejected:true,currentLocalized:true,retry:true},null,2));
      console.log(JSON.stringify({ok:true,out,searchOwner:true}));app.exit(0);return;
    }

    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true`);
    assert(await run(`return !!player.pdfReader && document.getElementById('pdfFindPanel').classList.contains('hidden')`),'Escape closes search without closing PDF');
    await run(`setPdfReaderZoom(1.3);return true`);await until(()=>run(`return player.pdfReader && !player.pdfReader.zooming && player.pdfReader.pages.get(2)?.article?.dataset.state==='ready'`),'zoom raster and anchor');
    const zoomProbe=await run(`const n=document.getElementById('pdfReaderPages'),root=n.getBoundingClientRect(),p=player.pdfReader.pages.get(2).article.getBoundingClientRect();return {page:player.pdfReader.currentPage,rootTop:root.top,rootBottom:root.bottom,top:p.top,bottom:p.bottom,scroll:n.scrollTop,zooming:player.pdfReader.zooming}`);assert(zoomProbe.page===2&&zoomProbe.bottom>zoomProbe.rootTop&&zoomProbe.top<zoomProbe.rootBottom,'Zoom preserves visible original page: '+JSON.stringify(zoomProbe));
    await capture('pdf-zoom-anchor.png');
    await run(`setPdfReaderZoom(1);return true`);await until(()=>run(`return !player.pdfReader.zooming`),'restore scale');
    await run(`document.getElementById('pdfReaderPage').value='1';document.getElementById('pdfReaderPage').dispatchEvent(new Event('change'));return true`);await wait(350);
    const layoutProbe = await run(`
      const hash=player.pdfReader.pdfHash;
      const invalid=await window.api.preparePdfText({pdfHash:'missing',pages:[]});
      const items=[];
      for(let row=0;row<2;row++)for(let col=0;col<3;col++)items.push({str:['First','Second','Third'][col]+' column '+(row?'ends here.':'starts here'),width:125+row*5,height:10,transform:[1,0,0,10,40+col*180,680-row*15]});
      const result=await window.api.preparePdfText({pdfHash:hash,pages:[{pageNumber:1,pageHeight:800,pageWidth:600,items}]});
      const oversized=await window.api.preparePdfText({pdfHash:hash,pages:[{pageNumber:1,items:Array(8001).fill({str:'x'})}]});
      return {invalid:invalid.ok,oversized:oversized.ok,result};
    `);
    assert.equal(layoutProbe.invalid,false);assert.equal(layoutProbe.oversized,false);
    assert(layoutProbe.result.ok,layoutProbe.result.error);
    const ordered=layoutProbe.result.pages[0].blocks.map(b=>b.source).join(' ');
    assert(ordered.indexOf('First column ends')<ordered.indexOf('Second column starts'));
    assert(ordered.indexOf('Second column ends')<ordered.indexOf('Third column starts'));
    ipcMain.removeHandler('pdf:prepareText');
    originalHandle('pdf:prepareText',async()=>({ok:false,error:'controlled layout failure'}));
    try {
      const fallback=await run('player.pdfReader.pages.delete(2);const blocks=await extractPdfReaderPage(2);return {text:blocks.map(b=>b.source).join(" "),warning:player.pdfReader.pages.get(2).layoutWarning,status:document.getElementById("pdfReaderStatus").textContent}');
      assert(fallback.text.includes('controlled PDF'));assert.equal(fallback.warning,'controlled layout failure');assert(fallback.status.includes('kontrol et'));
      await capture('layout-fallback-warning.png');
    } finally {
      ipcMain.removeHandler('pdf:prepareText');originalHandle('pdf:prepareText',prepareTextHandler);
      await run('player.pdfReader.pages.delete(2);pdfReaderSetStatus(interfaceChoice("Hazır","Ready"));return true');
    }
    await capture("reading-tr-dark.png");
    await run(`document.getElementById('pdfReadingTools').open=true;for(const [id,value] of [['pdfReadingfont','24'],['pdfReadingwidth','680'],['pdfReadingspacing','2.1']]){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('change'));}return true`);
    assert(await run(`const n=document.querySelector('.pdf-page-prose'),s=getComputedStyle(n),prefs=JSON.parse(localStorage.getItem('pdf-reading-preferences-v1'));return s.fontSize==='24px'&&Math.abs(parseFloat(s.lineHeight)-50.4)<1&&prefs.width===680`),'reading preferences apply and persist without changing source');
    await capture('reading-preferences.png');
    await run(`document.getElementById('pdfReadingTools').open=false;return true`);
    const layout=await run('const pages=document.getElementById("pdfReaderPages").getBoundingClientRect(),reader=document.getElementById("pdfReader").getBoundingClientRect();return {top:pages.top-reader.top,available:pages.height,total:reader.height,duplicateHead:getComputedStyle(document.querySelector(".player-head")).display};');
    assert(layout.available>layout.total*.7,JSON.stringify(layout));
    assert.equal(layout.duplicateHead,'none');
    await run('document.querySelector("#pdfAssistantTools summary").click();return true');
    assert(await run('return document.getElementById("pdfAssistantTools").open'));
    await capture("passage-tools-tr.png");
    await run('document.getElementById("pdfAssistantTools").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));return true');
    assert(await run('return !document.getElementById("pdfAssistantTools").open && !!player.pdfReader'));
    await run('document.querySelector("#pdfTranslateTools summary").click();return true');
    assert(await run(`const a=document.querySelector('[data-tool-group=translation]'),b=document.querySelector('[data-tool-group=export]');return a.querySelector('label').textContent==='Çeviri dili'&&a.querySelector('#pdfTargetLanguage')&&b.querySelector('label').textContent==='Dışa aktarma biçimi'&&b.querySelector('#pdfExportFormat')&&getComputedStyle(document.querySelector('#pdfTranslateTools .pdf-reader-tools-content')).animationName==='none'`),'Grouped translation/export labels and immediate programmatic/keyboard opening');
    await capture("translation-tools-tr.png");
    await run('document.getElementById("pdfTranslateTools").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));return true');

    await run('setPdfReaderView("both");return true');
    await capture("parallel-tr-dark.png");
    win.setMinimumSize(800,600);win.setContentSize(1024,768);
    await capture("reader-laptop-tr.png");
    assert(await run('return document.getElementById("pdfReaderPages").clientHeight>innerHeight*.65'));
    await run('UiLocale.set("en",false);applyUiTheme("light");setPdfReaderView("source");return true');
    assert(await run('return UiLocale.get()==="en" && document.documentElement.dataset.theme==="light" && player.pdfReader.viewMode==="source"'));
    await capture("reader-laptop-en-light.png");
    assert(await run(`return document.querySelector('[data-tool-group=translation]>label').textContent==='Translation language'&&document.querySelector('[data-tool-group=export]>label').textContent==='Export format'`),'Tool labels follow interface language');
    assert(await run('return document.getElementById("pdfReader").scrollWidth<=innerWidth+1'));
    win.setContentSize(1440,1000);await run('UiLocale.set("tr",false);applyUiTheme("dark");return true');

    await run(
      'setPdfReaderView("reading");const p=document.querySelector(".pdf-page-prose p");const range=document.createRange();range.selectNodeContents(p);const s=window.getSelection();s.removeAllRanges();s.addRange(range);return true',
    );
    await wait(120);
    const context = await run("return aiChatContext()");
    assert.equal(context.workspace, "pdf-reader");
    assert(context.excerpt.includes("controlled PDF"));
    assert(context.selectedText);
    const scopedSelection = await run(`const original=PdfReaderExperience.context().selectedText;
      const foreign=document.createElement('article');foreign.className='pdf-page';foreign.dataset.page=String(player.pdfReader.currentPage);foreign.textContent='Foreign fixture passage';document.body.append(foreign);
      const range=document.createRange();range.selectNodeContents(foreign);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);document.dispatchEvent(new Event('selectionchange'));
      const retained=PdfReaderExperience.context().selectedText;foreign.remove();
      const prose=player.pdfReader.pages.get(player.pdfReader.currentPage).article.querySelector('.pdf-page-prose p');range.selectNodeContents(prose);selected.removeAllRanges();selected.addRange(range);document.dispatchEvent(new Event('selectionchange'));selected.collapse(prose,0);document.dispatchEvent(new Event('selectionchange'));
      return {original,retained,cleared:PdfReaderExperience.context().selectedText,truncated:PdfReaderExperience.context().selectedTextTruncated};`);
    assert.equal(scopedSelection.retained,scopedSelection.original,'Foreign article cannot replace PDF evidence');
    assert.equal(scopedSelection.cleared,'','Collapsed reader selection clears the passage');assert.equal(scopedSelection.truncated,false);

    await run('document.getElementById("pdfNext").click();return true');
    await until(()=>run('return PdfReaderExperience.context()?.page===2'),'next page rendered');
    const next = await run("return aiChatContext()");
    assert.equal(next.page, 2);
    assert.equal(next.selectedText, "");
    const assistantAnchor806=process.argv.includes('--reader806')?await run("const p=player.pdfReader.pages.get(player.pdfReader.currentPage).article.querySelector('.pdf-page-prose p');const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));return {page:player.pdfReader.currentPage,selected:PdfReaderExperience.context().selectedText,scroll:document.getElementById('pdfReaderPages').scrollTop}"):null;
    await run('document.getElementById("pdfAskAssistant").click();return true');
    await wait(400);
    const assistant = win.contentView.children.find((v) =>
      v.webContents?.getURL().includes("assistant-overlay.html"),
    );
    assert(assistant);
    assert(assistant.getBounds().width > 64);
    await until(
      () =>
        assistant.webContents.executeJavaScript(
          '!document.getElementById("panel").hidden',
        ),
      "assistant visible",
    );
    if(assistantAnchor806)assert.deepEqual(await run("return {page:player.pdfReader.currentPage,selected:PdfReaderExperience.context().selectedText,scroll:document.getElementById('pdfReaderPages').scrollTop}"),assistantAnchor806,'Assistant opening retains the exact PDF passage and reading position');
    let assistantCapture = false;
    for (let i = 0; i < 3; i++) {
      try {
        await wait(300);
        fs.writeFileSync(
          path.join(out, "assistant.png"),
          (await assistant.webContents.capturePage()).toPNG(),
        );
        assistantCapture = true;
        break;
      } catch {}
    }
    fs.writeFileSync(
      path.join(out, "assistant-capture.json"),
      JSON.stringify({
        captured: assistantCapture,
        bounds: assistant.getBounds(),
      }),
    );
    await run(
      'await aiChatSend("Bu sayfayı seslendir");if(document.getElementById("pdfVoiceFrom").value!=="2"||document.getElementById("pdfVoiceTo").value!=="2")throw Error("Wrong assistant page range");document.getElementById("pdfVoiceFrom").value="2";document.getElementById("pdfVoiceTo").value="3";document.getElementById("pdfVoiceFrom").dispatchEvent(new Event("input"));return true',
    );
    if(process.argv.includes('--reader806')){
      await run("document.getElementById('pdfVoiceFrom').dispatchEvent(new Event('input'));document.getElementById('pdfVoiceOpen').click();document.getElementById('pdfVoiceOpen').click();return true");
      assert(await run("return document.getElementById('pdfVoiceFrom').value==='2'&&document.getElementById('pdfVoiceTo').value==='3'&&document.getElementById('pdfVoiceRangeSummary').textContent.includes('iki sınır da dahil')"),'Reopening retains manually selected inclusive range');
      await run("window.originalExtract806=extractPdfReaderPage;extractPdfReaderPage=async page=>page===2?[]:originalExtract806(page);document.getElementById('pdfVoiceText').value='source';document.getElementById('pdfVoicePreviewOpen').click();return true");
      await until(()=>run("return !document.getElementById('pdfVoicePreviewOpen').disabled&&document.getElementById('pdfVoiceStatus').textContent.includes('okunabilir metin yok')"),'blank source diagnosis');
      assert(await run("return !document.getElementById('pdfVoiceStatus').textContent.includes('çeviriyi tamamla')&&document.getElementById('pdfVoicePreview').hidden"));
      await run("window.originalBlocks806=player.pdfReader.pages.get(2).blocks;player.pdfReader.pages.get(2).blocks=[{source:'Chapter title only'}];extractPdfReaderPage=async page=>page===2?player.pdfReader.pages.get(2).blocks:originalExtract806(page);document.getElementById('pdfVoicePreviewOpen').click();return true");
      await until(()=>run("return !document.getElementById('pdfVoicePreviewOpen').disabled&&!document.getElementById('pdfVoicePreview').hidden"),'heading page retained');
      assert(await run("return document.getElementById('pdfVoicePreviewText').value==='Chapter title only'&&document.getElementById('pdfVoicePreviewHint').textContent.includes('sayfalar korundu: 2')"));
      await capture('reader806-short-page-kept.png');
      const beforeStale=await run("return (await window.api.mediaWorkflows({action:'book-list'})).projects.length");
      await run("extractPdfReaderPage=page=>page===2?new Promise(resolve=>window.releasePage806=()=>resolve([{source:'Actual passage retained'}])):originalExtract806(page);document.getElementById('pdfVoicePrepare').click();return true");
      await until(()=>run('return typeof window.releasePage806==="function"'),'pending page extraction');
      await run("document.getElementById('pdfVoiceTo').value='2';document.getElementById('pdfVoiceTo').dispatchEvent(new Event('input'));releasePage806();return true");
      await until(()=>run("return !document.getElementById('pdfVoicePrepare').disabled&&document.getElementById('pdfVoiceStatus').textContent.includes('yeniden hazırla')"),'range change rejects stale preparation');
      assert.equal(await run("return (await window.api.mediaWorkflows({action:'book-list'})).projects.length"),beforeStale,'Changed range cannot silently create the captured old project');
      await run("player.pdfReader.pages.get(2).blocks=originalBlocks806;delete window.originalBlocks806;extractPdfReaderPage=originalExtract806;delete window.originalExtract806;delete window.releasePage806;document.getElementById('pdfVoiceTo').value='3';document.getElementById('pdfVoiceTo').dispatchEvent(new Event('input'));document.getElementById('pdfVoicePreviewOpen').click();return true");

      await until(()=>run("return !document.getElementById('pdfVoicePreviewOpen').disabled&&!document.getElementById('pdfVoicePreview').hidden"),'restore actual PDF preview');
    }
    await capture("voice-range.png");
    const projectsBeforePreview=await run('return (await window.api.mediaWorkflows({action:"book-list"})).projects.length');
    await run('document.getElementById("pdfVoiceText").value="source";document.getElementById("pdfVoicePreviewOpen").click();return true');
    await until(()=>run('return !document.getElementById("pdfVoicePreview").hidden&&!document.getElementById("pdfVoicePreviewOpen").disabled'),'selected text preview');
    const previewTexts=await run(`const s=document.getElementById('pdfVoicePreviewPage'),rows=[];for(const o of s.options){s.value=o.value;s.dispatchEvent(new Event('change'));rows.push({page:Number(o.value),text:document.getElementById('pdfVoicePreviewText').value});}return rows;`);
    assert.deepEqual(previewTexts.map(p=>p.page),[2,3]);assert.match(previewTexts[0].text,/Chapter 2/);assert.match(previewTexts[1].text,/Chapter 3/);
    assert.equal(await run('return (await window.api.mediaWorkflows({action:"book-list"})).projects.length'),projectsBeforePreview,'Preview must not create a project');
    assert.equal(await run('return player.pdfReader.currentPage'),2,'Preview page selection must not navigate the PDF');
    for(const [locale,theme,width,zoom]of [['tr','dark',800,1.25],['en','light',1100,1]]){
      win.setMinimumSize(640,600);win.setContentSize(width,900);win.webContents.setZoomFactor(zoom);
      await run(`window.UiLocale.set('${locale}',false);applyUiTheme('${theme}');document.getElementById('pdfVoicePreviewPage').value='2';document.getElementById('pdfVoicePreviewPage').dispatchEvent(new Event('change'));return true`);await wait(120);
      await run('document.getElementById("pdfVoicePreviewOpen").click();return true');await until(()=>run('return !document.getElementById("pdfVoicePreviewOpen").disabled&&!document.getElementById("pdfVoicePreview").hidden'),'responsive preview');
      assert.match(await run('return document.getElementById("pdfVoicePreviewOpen").textContent'),locale==='en'?/Preview text/:/Metni önizle/);
      const bounds=await run('const n=document.getElementById("pdfVoicePreviewText"),r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:n.parentElement.scrollWidth>n.parentElement.clientWidth+1,visible:r.bottom<=document.getElementById("pdfVoicePanel").getBoundingClientRect().bottom+1&&r.top>=0};');assert(bounds.left>=0&&bounds.right<=bounds.width&&!bounds.overflow&&bounds.visible,JSON.stringify(bounds));
      await capture('text-preview-'+locale+'.png');
    }
    win.webContents.setZoomFactor(1);win.setContentSize(1440,1000);await run('window.UiLocale.set("tr",false);applyUiTheme("dark");document.getElementById("pdfVoiceFrom").dispatchEvent(new Event("input"));return true');
    assert(await run('return document.getElementById("pdfVoicePreview").hidden&&document.getElementById("pdfVoicePreviewText").value===""'),'Range changes clear obsolete preview');
    await run('document.getElementById("pdfVoiceText").value="translation";document.getElementById("pdfVoicePreviewOpen").click();return true');
    await until(()=>run('return !document.getElementById("pdfVoicePreviewOpen").disabled&&document.getElementById("pdfVoiceStatus").textContent.includes("hazır değil")'),'missing preview translation gate');
    assert(await run('return document.getElementById("pdfVoicePreview").hidden'),'Incomplete translation must not show a false preview');
    assert.equal(await run('return (await window.api.mediaWorkflows({action:"book-list"})).projects.length'),projectsBeforePreview);


    await run(
      'document.getElementById("pdfVoiceText").value="translation";document.getElementById("pdfVoicePrepare").click();return true',
    );
    await until(
      () =>
        run(
          'return document.getElementById("pdfVoiceStatus").textContent.includes("hazır değil")',
        ),
      "missing translation gate",
    );
    await run(
      'document.getElementById("pdfVoiceText").value="source";document.getElementById("pdfVoicePrepare").click();return true',
    );
    await until(
      () =>
        run(
          'return !!document.querySelector("#mediaWorkflowsDialog[open] .mw-book-split") || !!document.querySelector("#mediaWorkflowsDialog[open] textarea")',
        ),
      "voice studio",
    );
    const project = await run(
      'const r=await window.api.mediaWorkflows({action:"book-list"});return (await window.api.mediaWorkflows({action:"book-open",id:r.projects[0].id})).project',
    );
    assert.deepEqual(
      project.chapters.map((c) => c.pageNumber),
      [2, 3],
    );
    assert.deepEqual(project.selectedChapters, [0, 1]);
    assert.deepEqual(project.chapters.map(c=>c.text),previewTexts.map(p=>p.text),'Preview and project must use identical prepared text');
    await capture("voice-studio.png");
    if(process.argv.includes('--reader806')){await run("document.querySelector('#mediaWorkflowsDialog .mw-transport-secondary').open=true;[...document.querySelectorAll('#mediaWorkflowsDialog button')].find(b=>b.textContent.includes('Seçili bölümleri denetle')).click();return true");await until(()=>run("return !!document.querySelector('.mw-readiness-summary')"),'actual readiness summary');assert(await run("return document.querySelector('.mw-readiness-summary').textContent.includes('kontrol bekliyor')"));assert(await run("return !document.querySelector('.mw-readiness').textContent.includes('Page / Sayfa')&&document.querySelector('.mw-readiness').textContent.includes('Sayfa 2')"));await capture('reader806-book-readiness.png');}
    const prep = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(project.id) +
        ",chapter:0})",
    );
    assert(prep.ok, prep.error);
    const wave = Buffer.alloc(44 + 24000 * 4 * 2);
    wave.write("RIFF");
    wave.writeUInt32LE(wave.length - 8, 4);
    wave.write("WAVEfmt ", 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(24000, 24);
    wave.writeUInt32LE(48000, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write("data", 36);
    wave.writeUInt32LE(wave.length - 44, 40);
    for (let i = 44; i < wave.length; i += 2)
      wave.writeInt16LE(
        Math.round(Math.sin((i / 2 / 24000) * 220 * Math.PI * 2) * 1000),
        i,
      );
    const wav = path.join(out, "controlled-listening.wav");
    fs.writeFileSync(wav, wave);
    const chunks = project.chapters[0].text.split(/\n\s*\n/).filter(Boolean);
    service.capture({
      id: prep.request.id,
      path: wav,
      quality: {
        groups: chunks.map((text, i) => ({
          key: "fixture-" + i,
          displayText: text,
          audioStart: (i * 4) / chunks.length,
          audioEnd: ((i + 1) * 4) / chunks.length,
          status: "ready",
        })),
      },
    });
    await run(
      'document.getElementById("mediaWorkflowsDialog").close();setPdfReaderView("reading");document.getElementById("pdfVoiceListen").click();return true',
    );
    await until(
      () =>
        run(
          'return !!document.getElementById("pdfVoiceAudio").src && !document.getElementById("pdfVoiceAudio").classList.contains("hidden")',
        ),
      "inline audio",
    );
    await until(
      () =>
        run('return document.getElementById("pdfVoiceAudio").readyState>=2'),
      "decoded audio",
    );
    await run(
      'await document.getElementById("pdfVoiceAudio").play();return true',
    );
    assert(
      await run('return !document.getElementById("pdfVoiceAudio").paused'),
    );
    await run(
      'const a=document.getElementById("pdfVoiceAudio");a.currentTime=.1;a.dispatchEvent(new Event("timeupdate"));return true',
    );
    assert(await run('return !!document.querySelector(".pdf-active-speech")'),JSON.stringify(await run('return {status:document.getElementById("pdfVoiceStatus").textContent,time:document.getElementById("pdfVoiceAudio").currentTime,page:player.pdfReader.currentPage,groups:document.querySelectorAll(".pdf-spoken-group").length};')));
    const zoomBefore=await run(`const a=document.getElementById('pdfVoiceAudio');a.pause();a.currentTime=.1;a.dispatchEvent(new Event('timeupdate'));return {source:a.src,time:a.currentTime,page:player.pdfReader.currentPage,groups:document.querySelectorAll('.pdf-spoken-group').length,boxes:document.querySelectorAll('.pdf-speech-box').length};`);
    assert(zoomBefore.groups>0&&zoomBefore.boxes>0,JSON.stringify(zoomBefore));
    for(const scale of [1.45,.85]){
      await run('setPdfReaderZoom('+scale+');return true');
      await until(()=>run('const r=player.pdfReader;return !r.zooming&&r.rendered.has(r.currentPage)'),'voice zoom render');
      const result=await run(`const a=document.getElementById('pdfVoiceAudio');a.dispatchEvent(new Event('timeupdate'));return {source:a.src,time:a.currentTime,page:player.pdfReader.currentPage,groups:document.querySelectorAll('.pdf-spoken-group').length,boxes:document.querySelectorAll('.pdf-speech-box').length,highlight:!!document.querySelector('.pdf-active-speech'),sourceHighlight:!!document.querySelector('.pdf-active-box')};`);
      assert.equal(result.groups,zoomBefore.groups,'Zoom preserves narrated text spans');assert.equal(result.boxes,zoomBefore.boxes,'Zoom remounts original PDF speech boxes');assert.equal(result.source,zoomBefore.source);assert.equal(result.time,zoomBefore.time);assert.equal(result.page,zoomBefore.page);assert(result.highlight&&result.sourceHighlight);
    }
    await run('setPdfReaderView("parallel");return true');
    await capture('voice-zoom-source.png');
    const mapped=await run(`const page=player.pdfReader.pages.get(player.pdfReader.currentPage),canvas=page.article.querySelector('.pdf-page-source canvas').getBoundingClientRect();const boxes=[...page.article.querySelectorAll('.pdf-speech-box')].map(n=>n.getBoundingClientRect());return {count:boxes.length,contained:boxes.every(r=>r.width>0&&r.left>=canvas.left-1&&r.top>=canvas.top-1&&r.right<=canvas.right+1&&r.bottom<=canvas.bottom+1),active:!!page.article.querySelector('.pdf-active-box')};`);
    assert(mapped.count>0&&mapped.contained&&mapped.active,JSON.stringify(mapped));
    await run('const n=document.querySelector(".pdf-speech-box");n.click();return true');
    await until(()=>run('return !document.getElementById("pdfVoiceAudio").paused'),'new zoom box plays audio');
    await run('const a=document.getElementById("pdfVoiceAudio");a.pause();setPdfReaderView("reading");return true');
    fs.writeFileSync(path.join(out,'zoom-speech.json'),JSON.stringify({before:zoomBefore,mapped,scales:[1.45,.85],sourceAndPositionPreserved:true,newBoxPlayback:true},null,2));
    await capture('voice-zoom-preserved.png');
    await until(()=>run('const a=document.getElementById("pdfVoiceAudio");return a.readyState>=1&&Number.isFinite(a.duration)'), 'metadata after box playback');const afterMode=await run('const a=document.getElementById("pdfVoiceAudio");return {page:player.pdfReader.currentPage,source:a.src,duration:a.duration,hidden:a.classList.contains("hidden")};');fs.writeFileSync(path.join(out,'after-mode.json'),JSON.stringify(afterMode));assert.equal(afterMode.page,zoomBefore.page,'View change must preserve the narrated page');assert.equal(afterMode.source,zoomBefore.source,'View change must preserve narration');
    const manualFollow=await run(`
      const audio=document.getElementById('pdfVoiceAudio');audio.pause();document.getElementById('pdfVoiceFollow').checked=true;
      const original=HTMLElement.prototype.scrollIntoView,clock=Date.now;let calls=0,behavior;
      HTMLElement.prototype.scrollIntoView=function(options){if(this.classList.contains('pdf-active-speech')){calls++;behavior=options.behavior;}};
      const media=window.matchMedia;window.matchMedia=()=>({matches:true});
      try{audio.currentTime=audio.duration;audio.dispatchEvent(new Event('timeupdate'));document.getElementById('pdfReaderPages').dispatchEvent(new WheelEvent('wheel'));audio.currentTime=.1;audio.dispatchEvent(new Event('timeupdate'));const during=calls;
      Date.now=()=>clock()+6000;audio.currentTime=audio.duration;audio.dispatchEvent(new Event('timeupdate'));audio.currentTime=.1;audio.dispatchEvent(new Event('timeupdate'));return {during,after:calls,behavior};}
      finally{Date.now=clock;HTMLElement.prototype.scrollIntoView=original;window.matchMedia=media;}
    `);
    assert.equal(manualFollow.during,0,'manual navigation has priority over follow');assert.equal(manualFollow.after,1);assert.equal(manualFollow.behavior,'auto','reduced motion avoids animated following');
    assert(await run('return !document.querySelector("dialog[open]")'));
    win.setContentSize(1441, 1000);
    await wait(100);
    win.setContentSize(1440, 1000);
    assert(await run('return !document.getElementById("pdfNarrationSetup").open'),"Valid ready narration collapses preparation, keeping playback outside");
    await capture("inline-listening.png");
    await run('const a=document.getElementById("pdfVoiceAudio");a.currentTime=1.25;document.getElementById("pdfNext").click();return true');
    await until(async()=>{const r=await run('return window.api.mediaWorkflows({action:"book-open",id:'+JSON.stringify(project.id)+'})');return r.project?.chapters[0].position>=1.2;},'position saved during page navigation');
    assert.equal(await run('return document.getElementById("pdfVoiceAudio").paused'),true);

    await run(
      'document.getElementById("mediaWorkflowsDialog")?.close();setPdfReaderView("reading");return true',
    );
    if(process.argv.includes('--quality813')){
      holdListen=true;await run('document.getElementById("pdfVoiceListen").click();return true');
      await until(()=>!!pendingListen,'held old-page narration');
      await run('document.getElementById("pdfPrevious").click();return true');
      await until(()=>run('return player.pdfReader.currentPage===2'),'new page during narration load');
      await run('document.getElementById("pdfVoiceStatus").textContent="Güncel sayfa hazır";return true');
      pendingListen.reject(Error('Controlled old-page failure'));pendingListen=null;await wait(150);
      assert.equal(await run('return document.getElementById("pdfVoiceStatus").textContent'),'Güncel sayfa hazır','Late old-page failure must not overwrite the current page');
      holdListen=true;await run('document.getElementById("pdfVoiceListen").click();return true');await until(()=>!!pendingListen,'held current narration');
      pendingListen.reject(Error('Controlled current narration failure'));pendingListen=null;
      await until(()=>run('return document.getElementById("pdfVoiceStatus").textContent.includes("Controlled current narration failure")'),'current failure remains visible');
      await run('document.getElementById("pdfVoiceListen").click();return true');
      await until(()=>run('return !document.getElementById("pdfVoiceAudio").classList.contains("hidden")'),'retry restores narration');
      await run('document.getElementById("pdfVoiceAudio").pause();return true');
      fs.writeFileSync(path.join(out,'ownership813.json'),JSON.stringify({oldFailureDropped:true,currentFailureVisible:true,retry:true,realPdf:true,realRendererAndIPC:true,syntheticAudio:true}));
    }
    win.setContentSize(820, 900);
    if(process.argv.includes('--quality813')){
      await run('document.getElementById("pdfReaderTitle").textContent="A very long controlled book title without useful spaces "+"LongTitle".repeat(50);document.getElementById("pdfVoiceStatus").textContent="ControlledNarrationDiagnosis".repeat(50);return true');
      const measured=await run('const bar=document.querySelector(".pdf-reader-toolbar"),title=document.getElementById("pdfReaderTitle"),panel=document.getElementById("pdfVoicePanel");return {barClient:bar.clientWidth,barScroll:bar.scrollWidth,titleWidth:title.getBoundingClientRect().width,panelClient:panel.clientWidth,panelScroll:panel.scrollWidth,statusRight:document.getElementById("pdfVoiceStatus").getBoundingClientRect().right,width:innerWidth};');
      assert(measured.barScroll<=measured.barClient+1&&measured.panelScroll<=measured.panelClient+1&&measured.statusRight<=measured.width+1,JSON.stringify(measured));
      fs.writeFileSync(path.join(out,'layout813.json'),JSON.stringify(measured));
    }
    await capture("reading-narrow.png");
    const bounds = await run(
      'const r=document.getElementById("pdfReader");return {client:r.clientWidth,scroll:r.scrollWidth};',
    );
    assert(bounds.scroll <= bounds.client + 2);
    win.setContentSize(1440, 1000);
    await run('UiLocale.set("en",false);applyUiTheme("light");return true');
    await capture("reading-en-light.png");
    await run('document.getElementById("pdfVoiceClose").click();return true');
    assert(await run('return document.activeElement===document.getElementById("pdfVoiceOpen")&&document.getElementById("pdfVoicePanel").classList.contains("hidden")'),"Close narration returns focus to Read aloud");
    await capture('reading-en-light-calm.png');
    await run('document.getElementById("pdfVoiceOpen").click();return true');
    assert(await run('return document.getElementById("pdfNarrationSetup").open&&document.activeElement===document.getElementById("pdfVoiceFrom")&&document.getElementById("pdfVoiceFrom").value==="2"&&document.getElementById("pdfVoiceTo").value==="3"'),"Reopening exposes retained inclusive range");
    await run('document.getElementById("pdfNarrationSetup").open=false;return true');
    await run(
      'document.getElementById("pdfTranslateTools").open=true;return true',
    );
    await capture("translation-menu-en.png");
    await run('await MediaHomeUI.returnHome();return true');
    assert.equal(await run('return PdfReaderExperience.context()'),null,'hidden reader cannot remain assistant context on home');
    assert(await run('return document.getElementById("pdfVoiceAudio").paused'));
    await run('await MediaHomeUI.resumeWorkspace();return true');
    assert(await run('return !!PdfReaderExperience.context()'));
    await run('document.getElementById("pdfReaderClose").click();return true');
    assert.equal(await run("return PdfReaderExperience.context()"), null);
    await capture("player-after-close.png");
    const txt=path.join(out,'Chapter source.txt');fs.writeFileSync(txt,'An actual local chapter for the narration settings command.');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[txt]});
    const imported=await run('return window.api.mediaShelf({action:"book-import"})');assert(imported.ok,imported.error);
    await run('await MediaShelfUI.openBook('+JSON.stringify(imported.id)+');return true');assert(await run('return document.activeElement===document.querySelector(".ms-reader-controls>select")'),"Book opens on chapter navigation with Close last in tab order");await capture('text-reader-command.png');win.setMinimumSize(640,600);win.setContentSize(800,900);await capture('text-reader-narrow.png');assert(await run('return document.querySelector(".ms-reader-title").hidden&&!!document.querySelector(".ms-reader-controls>select")'),"Duplicate book/chapter title is shown once, preserving native chapter select");const textBounds=await run('const n=document.querySelector(".ms-prose"),p=n.querySelector("p");return {client:n.clientWidth,scroll:n.scrollWidth,width:n.getBoundingClientRect().width,paragraph:p.getBoundingClientRect().width,whiteSpace:getComputedStyle(p).whiteSpace}');fs.writeFileSync(path.join(out,'text-bounds.json'),JSON.stringify(textBounds));assert(textBounds.scroll<=textBounds.client+1,JSON.stringify(textBounds));assert(await run('const r=document.querySelector(".ms-reader");return r.scrollWidth<=r.clientWidth+1'));await run('document.querySelector(".ms-reader-tools").open=true;return true');await capture('text-reader-tools.png');await run('document.querySelector(".ms-reader-tools").open=false;return true');win.setMinimumSize(0,0);win.setContentSize(520,640);await capture('text-reader-520.png');assert(await run('const r=document.querySelector(".ms-reader"),c=r.querySelector(".ms-reader-controls");return r.scrollWidth<=r.clientWidth+1&&c.scrollWidth<=c.clientWidth+1'),"Compact book controls stay within dialog");win.setContentSize(1440,1000);
    await run('await aiChatSend("Bu bölümü seslendir");return true');await until(()=>run('return !!document.querySelector("#mediaWorkflowsDialog[open]")'),'chapter command opens production');assert(!await run('return !!document.querySelector(".ms-reader[open]")'));await run('document.getElementById("mediaWorkflowsDialog").close();return true');

    await run("closePlayer();return true");
    await capture("home.png");
    await run("AppSettingsUI.open();return true");
    await wait(200);
    await capture("settings.png");
    await run(`document.getElementById('appSettingsDialog')?.close();UiLocale.set('tr',false);state.lastQualityReport={blocks:10,translation_blocks:10,translation_failed:2,translation_issues:2,translation_number_mismatch_indices:[0],translation_negation_mismatch_indices:[4]};state.speechCoverageIndices=[6];showResultModal({files:[],segments:10,language:'en'});return true`);
    assert(await run(`return document.getElementById('qualityVerdict').classList.contains('needs-review') && document.getElementById('modalTranslationReview').textContent.includes('8/10') && document.getElementById('modalTranslationReview').textContent.includes('Olumlu/olumsuz')`),'Meaning issues cannot receive a layout-only clean verdict');
    await capture('translation-review-tr.png');await run('closeResultModal();return true');
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        {
          ok: true,
          out,
          context,
          selectedPages: [2, 3],
          bounds,
          realPdf: true,
          noModelGeneration: true,
          fixtureInlineAudio: true,
        },
        null,
        2,
      ),
    );
    await run(`document.getElementById('resultModal').classList.add('hidden');document.getElementById('playerLayer').classList.add('hidden');MediaHomeUI.openStudio();logLine('\x1b[31mTerminal-style diagnostic\x1b[0m '+ 'https://fixture.test/'.repeat(80),'warn');return true`);
    assert(await run(`const log=document.getElementById('log');return log.clientWidth>0&&log.scrollWidth<=log.clientWidth+1&&!document.body.classList.contains('media-home-active')&&!log.textContent.includes('[31m')`),'Long diagnostics must wrap inside the log surface');
    await run(`const log=document.getElementById('log');log.scrollTop=log.scrollHeight;return true`);
    await capture('wrapped-log-light.png');
    console.log(JSON.stringify({ ok: true, out }));
    app.exit(0);
  })
  .catch((e) => {
    fs.writeFileSync(path.join(out, "error.txt"), e.stack);
    app.exit(1);
  });
setTimeout(() => app.exit(2), 120000).unref();
