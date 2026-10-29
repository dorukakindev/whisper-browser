const { app, BrowserWindow, dialog, ipcMain } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, ".uiprev", "book-reliability549-" + Date.now()),
  profile = path.join(out, "profile");
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setPath("downloads", out);
app.setAppPath(root);
app.commandLine.appendSwitch("disable-gpu");
const source = path.join(out, "Okuma denemesi.pdf");
fs.writeFileSync(
  source,
  Buffer.from(
    "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA1IDAgUiA3IDAgUl0gL0NvdW50IDMgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxNjggPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiA2MCA3MTAgVGQgKENoYXB0ZXIgMSkgVGogMCAtNTAgVGQgL0YxIDE0IFRmIChUaGlzIGlzIGEgY29udHJvbGxlZCBQREYgcmVhZGluZyBzYW1wbGUuKSBUaiAwIC0yNSBUZCAoTGlzdGVuIHRvIHRoaXMgcGFzc2FnZSBhbmQgZm9sbG93IHRoZSBoaWdobGlnaHQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjYgMCBvYmoKPDwgL0xlbmd0aCAxNjggPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiA2MCA3MTAgVGQgKENoYXB0ZXIgMikgVGogMCAtNTAgVGQgL0YxIDE0IFRmIChUaGlzIGlzIGEgY29udHJvbGxlZCBQREYgcmVhZGluZyBzYW1wbGUuKSBUaiAwIC0yNSBUZCAoTGlzdGVuIHRvIHRoaXMgcGFzc2FnZSBhbmQgZm9sbG93IHRoZSBoaWdobGlnaHQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjcgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgOCAwIFIgPj4KZW5kb2JqCjggMCBvYmoKPDwgL0xlbmd0aCAxNjggPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiA2MCA3MTAgVGQgKENoYXB0ZXIgMykgVGogMCAtNTAgVGQgL0YxIDE0IFRmIChUaGlzIGlzIGEgY29udHJvbGxlZCBQREYgcmVhZGluZyBzYW1wbGUuKSBUaiAwIC0yNSBUZCAoTGlzdGVuIHRvIHRoaXMgcGFzc2FnZSBhbmQgZm9sbG93IHRoZSBoaWdobGlnaHQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDEyNyAwMDAwMCBuIAowMDAwMDAwMjUzIDAwMDAwIG4gCjAwMDAwMDA0NzIgMDAwMDAgbiAKMDAwMDAwMDU5OCAwMDAwMCBuIAowMDAwMDAwODE3IDAwMDAwIG4gCjAwMDAwMDA5NDMgMDAwMDAgbiAKMDAwMDAwMTE2MiAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDEwIC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgoxMjMyCiUlRU9G",
    "base64",
  ),
);
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
dialog.showSaveDialog = async () => ({
  canceled: false,
  filePath: path.join(out, "selected-pages.m4b"),
});
const module546 = require("../src/media-workflows"),
  register = module546.registerMediaWorkflows;
let service;
module546.registerMediaWorkflows = (args) => (service = register(args));
const nativeCalls=[];
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>originalHandle(channel,async(event,request,...args)=>{
 const result=await listener(event,request,...args);
 if(channel==='media-workflows:request'&&['book-mark-open','book-listen'].includes(request?.action)){
  nativeCalls.push({action:request.action,outputId:request.outputId,ok:result.ok,error:result.error,bookmark:result.bookmark,resultOutputId:result.outputId});
  fs.writeFileSync(path.join(out,'navigation-calls.json'),JSON.stringify(nativeCalls,null,2));
 }
 return result;
});
require("../src/main");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const stop = Date.now() + 30000;
  while (Date.now() < stop) {
    if (await fn()) return;
    await wait(80);
  }
  const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("index.html"));
  if(w){
    fs.writeFileSync(path.join(out,"timeout-state.json"),JSON.stringify(await w.webContents.executeJavaScript(`({label:${JSON.stringify(label)},pdfPage:document.getElementById("pdfReaderPage")?.value,pdfClass:document.getElementById("pdfReader")?.className,workflow:document.getElementById("mediaWorkflowsDialog")?.outerHTML.slice(0,1500),status:document.querySelector(".mw-status")?.textContent,context:typeof globalAssistantContext==="function"?globalAssistantContext():null})`),null,2));
    fs.writeFileSync(path.join(out,"timeout.png"),(await w.webContents.capturePage()).toPNG());
  }
  throw Error("Timed out " + label);
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
    }, "main");
    win.show();
    win.focus();
    const capture = async (name) => {
      for (let i = 0; i < 3; i++) {
        try {
          await wait(250);
          fs.writeFileSync(
            path.join(out, name),
            (await win.webContents.capturePage()).toPNG(),
          );
          return;
        } catch (e) {
          if (i === 2) throw e;
        }
      }
    };
    const run = (code) =>
      win.webContents.executeJavaScript("(async()=>{" + code + "})()", true);
    const layoutChecks = [];
    async function auditNarrow(name, selector) {
      const expectedWidth = Math.round(
        win.getContentSize()[0] / win.webContents.getZoomFactor(),
      );
      await until(
        () => run("return Math.abs(innerWidth-" + expectedWidth + ")<=1"),
        "zoom layout settled",
      );
      const measured = await run(
        'const d=document.querySelector("dialog.mw-dialog"),body=d.querySelector(".mw-body"),checks=[];for(const n of d.querySelectorAll(' +
          JSON.stringify(selector) +
          ')){if(!n.checkVisibility({visibilityProperty:true}))continue;n.scrollIntoView({block:"center",inline:"nearest"});const r=n.getBoundingClientRect();let hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);if(n.matches(".mw-spoken")){const range=document.createRange();range.selectNodeContents(n);for(const fragment of range.getClientRects()){const candidate=document.elementFromPoint((fragment.left+fragment.right)/2,(fragment.top+fragment.bottom)/2);if(candidate&&(n===candidate||n.contains(candidate))){hit=candidate;break;}}}checks.push({text:(n.textContent||n.getAttribute("aria-label")||n.tagName).slice(0,70),left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:!!hit&&(n===hit||n.contains(hit)),hitNode:hit?.outerHTML.slice(0,600),dialog:n.closest("dialog")?.className,rootScroll:d.scrollTop});}return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,dialogOverflow:d.scrollWidth-d.clientWidth,bodyOverflow:body.scrollWidth-body.clientWidth,checks,dialogs:[...document.querySelectorAll("dialog[open]")].map(n=>({cls:n.className,title:n.querySelector("h1,h2,h3")?.textContent,modal:n.matches(":modal")}))}',
      );
      layoutChecks.push({
        name,
        zoom: win.webContents.getZoomFactor(),
        contentSize: win.getContentSize(),
        ...measured,
      });
      fs.writeFileSync(
        path.join(out, "narrow-layout.json"),
        JSON.stringify(layoutChecks, null, 2),
      );
      await capture(name + ".png");
      assert(
        measured.dialogOverflow <= 1,
        name + ": dialog must not overflow horizontally",
      );
      assert(
        measured.bodyOverflow <= 1,
        name + ": body must not overflow horizontally",
      );
      assert(
        measured.checks.every(
          (c) =>
            c.left >= 0 &&
            c.right <= measured.viewport[0] + 1 &&
            c.top >= 0 &&
            c.bottom <= measured.viewport[1] + 1 &&
            c.hit,
        ),
        name + ": scrolled controls must remain visible and pointer-accessible",
      );
      return measured;
    }
    async function checkCompact(name, selector) {
      win.setContentSize(800, 900);
      win.webContents.setZoomFactor(1.25);
      await auditNarrow(name, selector);
      win.webContents.setZoomFactor(1);
      win.setContentSize(1440, 1000);
      await until(
        () => run("return innerWidth===1440"),
        "wide layout restored",
      );
    }
    await until(() => run("return !!window.MediaWorkflowsUI"), "UI");
    await run(
      'await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true',
    );
    win.setContentSize(1440, 1000);
    win.setMinimumSize(640, 400);
    const imported = await run(
      'return window.api.mediaWorkflows({action:"book-import"})',
    );
    assert(imported.ok, imported.error);
    const id = imported.project.id;
    assert.equal(imported.project.chapters.length, 3);
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () => run('return !!document.querySelector(".mw-range")'),
      "range",
    );
    const originalPdfDigest = require("node:crypto")
        .createHash("sha256")
        .update(fs.readFileSync(source))
        .digest("hex"),
      preparationText =
        "Bu cüm-\nlenin ola-\nğan sesi. Anka-\nra 10-\n20 e-posta.";
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(preparationText) +
        ';n.dispatchEvent(new Event("input"));const d=document.querySelector(".mw-text-preparation");d.open=true;d.querySelector("button").click();return true',
    );
    assert.equal(
      await run(
        'return document.querySelectorAll(".mw-text-suggestion").length',
      ),
      2,
    );
    assert(
      await run(
        'return document.querySelectorAll(".mw-text-preparation button")[1].disabled',
      ),
    );
    await run(
      'const s=document.querySelector(".mw-text-suggestion select");s.value="join";s.dispatchEvent(new Event("change"));document.querySelector(".mw-text-preparation").scrollIntoView({block:"center"});return true',
    );
    await capture("text-preparation-tr-dark.png");
    await checkCompact(
      "preparation-800-1.25",
      ".mw-text-preparation button,.mw-text-suggestion select",
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value+=" Sonraki düzenleme.";n.dispatchEvent(new Event("input"));return true',
    );
    assert(
      await run(
        'return document.querySelectorAll(".mw-text-preparation button")[1].disabled',
      ),
      "stale preview cannot overwrite a new edit",
    );
    await run(
      'const d=document.querySelector(".mw-text-preparation");d.querySelector("button").click();const s=d.querySelector("select");s.value="join";s.dispatchEvent(new Event("change"));d.querySelectorAll("button")[1].click();return true',
    );
    const preparedText =
      preparationText.replace("cüm-\nlenin", "cümlenin") +
      " Sonraki düzenleme.";
    assert.equal(
      await run(
        'return document.querySelector("textarea[data-chapter]").value',
      ),
      preparedText,
    );
    await run(
      '[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Metni kaydet").click();return true',
    );
    await until(
      async () =>
        (
          await run(
            'return window.api.mediaWorkflows({action:"book-open",id:' +
              JSON.stringify(id) +
              "})",
          )
        ).project.chapters[0].text === preparedText,
      "prepared text saved through real UI",
    );
    await run(
      'document.querySelectorAll(".mw-text-preparation button")[2].click();return true',
    );
    assert.equal(
      await run(
        'return document.querySelector("textarea[data-chapter]").value',
      ),
      preparationText + " Sonraki düzenleme.",
    );
    assert.equal(
      require("node:crypto")
        .createHash("sha256")
        .update(fs.readFileSync(source))
        .digest("hex"),
      originalPdfDigest,
      "source PDF unchanged",
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(imported.project.chapters[0].text) +
        ';n.dispatchEvent(new Event("input"));[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Metni kaydet").click();return true',
    );
    await until(
      async () =>
        (
          await run(
            'return window.api.mediaWorkflows({action:"book-open",id:' +
              JSON.stringify(id) +
              "})",
          )
        ).project.chapters[0].text === imported.project.chapters[0].text,
      "restore controlled text after preparation",
    );
    const planProjectFile = path.join(
        require("../src/voice-storage").voiceStorage(app).input,
        "Kitap projeleri",
        id,
        "project.json",
      ),
      beforePlanProject = fs.readFileSync(planProjectFile),
      planText =
        "Bu bölümün konuşma planı güncel taslak üzerinden hazırlanır. Ses üretimi henüz başlamaz. ".repeat(
          12,
        );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(planText) +
        ';n.dispatchEvent(new Event("input"));const d=document.querySelector(".mw-production-plan");d.open=true;d.querySelector("button").click();return true',
    );
    await until(
      () =>
        run(
          'return document.querySelectorAll(".mw-plan-group").length>1&&!document.querySelector(".mw-production-plan button").disabled',
        ),
      "actual model-free chapter plan through native UI",
    );
    assert.deepEqual(
      fs.readFileSync(planProjectFile),
      beforePlanProject,
      "UI planning does not save draft or create a generation job",
    );
    assert(
      await run(
        "return !!BookProductionPlanUI.getPreview(" +
          JSON.stringify(id) +
          ",0," +
          JSON.stringify(planText) +
          ")",
      ),
      "current preview snapshot stored for generation",
    );
    await run(
      'document.querySelector(".mw-production-plan").scrollIntoView({block:"center"});return true',
    );
    await capture("production-plan-tr-dark.png");
    await checkCompact(
      "plan-800-1.25",
      ".mw-production-plan button,.mw-plan-group p",
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value+=" Yeni cümle.";n.dispatchEvent(new Event("input"));return true',
    );
    assert.equal(
      await run('return document.querySelectorAll(".mw-plan-group").length'),
      0,
      "old group keys disappear after editing",
    );
    assert.equal(
      await run(
        "return BookProductionPlanUI.getPreview(" +
          JSON.stringify(id) +
          ",0," +
          JSON.stringify(planText) +
          ") || null",
      ),
      null,
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(imported.project.chapters[0].text) +
        ';n.dispatchEvent(new Event("input"));return true',
    );
    const query = imported.project.chapters[1].text.slice(0, 22).replace(/\s+/g, " ");
    await run(
      'const f=document.querySelector(".mw-search-form");f.querySelector("input").value=' +
        JSON.stringify(query) +
        ";f.requestSubmit();return true",
    );
    await until(
      () => run('return document.querySelectorAll(".mw-search-hit").length>0'),
      "book search results",
    );
    await capture("book-search-tr-dark.png");
    await run('document.querySelector(".mw-search-hit").click();return true');
    await until(
      () =>
        run(
          "return MediaExperience.context()?.id===" + JSON.stringify(id + ":1"),
        ),
      "search chapter context",
    );
    const searchSelection = await run(
      'const n=document.querySelector("textarea[data-chapter]");return n.value.slice(n.selectionStart,n.selectionEnd)',
    );
    assert.equal(searchSelection.replace(/\s+/g, " "), query);
    await run(
      'const inputs=document.querySelectorAll(".mw-range input");inputs[0].value="2";inputs[1].value="3";document.querySelector(".mw-range button").click();return true',
    );
    await wait(100);
    const selected = await run(
      'return [...document.querySelectorAll(".mw-chapter input:checked")].map(n=>Number(n.dataset.chapter))',
    );
    assert.deepEqual(selected, [1, 2]);
    const prep = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    assert(prep.ok, prep.error);
    const wav = path.join(out, "fixture.wav"),
      rate = 24000,
      n = rate * 4,
      bytes = Buffer.alloc(44 + n * 2);
    bytes.write("RIFF");
    bytes.writeUInt32LE(36 + n * 2, 4);
    bytes.write("WAVEfmt ", 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24);
    bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36);
    bytes.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++)
      bytes.writeInt16LE(
        Math.round(Math.sin((i * 2 * Math.PI * 220) / rate) * 1000),
        44 + i * 2,
      );
    fs.writeFileSync(wav, bytes);
    const coverData = await run(
      'const c=document.createElement("canvas");c.width=180;c.height=260;const x=c.getContext("2d");x.fillStyle="#b78243";x.fillRect(0,0,180,260);x.fillStyle="#211c18";x.font="bold 23px Georgia";x.fillText("Okuma",20,65);x.fillText("denemesi",20,95);x.fillRect(20,124,140,2);x.font="15px Georgia";x.fillText("Kitap örneği",20,225);return c.toDataURL("image/png")',
    );
    const metadataFile = path.join(
      require("../src/voice-storage").voiceStorage(app).input,
      "Kitap projeleri",
      id,
      "project.json",
    );
    const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
    metadata.cover = coverData;
    fs.writeFileSync(metadataFile, JSON.stringify(metadata));
    const bookReferenceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const refFolder = path.join(
      require("../src/voice-storage").voiceStorage(app).references,
      bookReferenceId,
    );
    fs.mkdirSync(refFolder, { recursive: true });
    fs.writeFileSync(path.join(refFolder, "reference.wav"), bytes);
    fs.writeFileSync(
      path.join(refFolder, "reference.txt"),
      "Controlled reference transcript.",
    );
    fs.writeFileSync(
      path.join(refFolder, "reference.json"),
      JSON.stringify({ name: "Deneme kitap sesi", createdAt: "2026-10-25" }),
    );
    service.capture({
      id: prep.request.id,
      path: wav,
      quality: {
        groups: [
          {
            status: "ready",
            displayText: imported.project.chapters[0].text,
            audioStart: 0,
            audioEnd: 4,
          },
        ],
      },
    });
    for (const chapter of [1, 2]) {
      const next = await run(
        'return window.api.mediaWorkflows({action:"book-prepare",id:' +
          JSON.stringify(id) +
          ",chapter:" +
          chapter +
          "})",
      );
      assert(next.ok, next.error);
      service.capture({
        id: next.request.id,
        path: wav,
        quality: {
          groups: [
            {
              key: "1",
              status: "ready",
              displayText: imported.project.chapters[chapter].text,
              audioStart: 0,
              audioEnd: 4,
            },
          ],
        },
      });
    }
    // Exercise the review UI with a controlled audio result, not a model-quality claim.
    const reviewPrep = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    service.capture({
      id: reviewPrep.request.id,
      path: wav,
      quality: {
        groups: [
          {
            key: "review-one",
            status: "review",
            displayText: imported.project.chapters[0].text,
            audioStart: 0,
            audioEnd: 4,
          },
        ],
      },
    });
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () => run('return !!document.querySelector(".mw-review-group")'),
      "review controls",
    );
    await until(
      () =>
        run(
          'const image=document.querySelector(".mw-book-cover");return image?.complete&&image.naturalWidth>0',
        ),
      "book cover in production summary",
    );
    const originalDefault = await run("return window.api.dubConfig()");
    const beforeLocaleText = await run(
      'return document.querySelector("textarea[data-chapter]").value',
    );
    assert.equal(
      await run(
        'return document.querySelector(".mw-review-group [data-workflow-status]").textContent',
      ),
      "Kontrol edilmeli",
    );
    await run('UiLocale.set("en",false);return true');
    assert.equal(
      await run(
        'return document.querySelector(".mw-review-group [data-workflow-status]").textContent',
      ),
      "Needs review",
    );
    assert.equal(
      await run(
        'return document.querySelector("textarea[data-chapter]").value',
      ),
      beforeLocaleText,
      "changing interface language must not translate chapter data",
    );
    await run('UiLocale.set("tr",false);return true');
    await run(
      'document.querySelector(".mw-voice-settings").open=true;const select=document.querySelector(\'select[aria-label="Kayıtlı referans sesler"]\');select.value=' +
        JSON.stringify(bookReferenceId) +
        ';select.dispatchEvent(new Event("change"));return true',
    );
    await until(
      async () =>
        (
          await run(
            'return window.api.mediaWorkflows({action:"book-open",id:' +
              JSON.stringify(id) +
              "})",
          )
        ).project.voicePreferences?.referenceId === bookReferenceId,
      "book reference persisted without global use",
    );
    assert.equal(
      (await run("return window.api.dubConfig()")).reference,
      originalDefault.reference,
    );
    assert(
      await run(
        'return document.querySelector(".mw-voice-settings").textContent.includes("Bu kitabın sesi: Deneme kitap sesi")',
      ),
    );
    await capture("book-reference-tr-dark.png");
    // Exercise the actual renderer/preload request after editing the chapter.
    // Stop at the engine boundary: no real GPU/model generation in this fixture.
    const retryRequests = [];
    let terminalOutcome = null,
      releaseTerminal = null;
    ipcMain.removeHandler("dub:start");
    ipcMain.handle("dub:start", async (_event, request) => {
      if (terminalOutcome) {
        const outcome = { ...terminalOutcome };
        _event.sender.send("dub:event", {
          id: request.id,
          type: "status",
          stage: "verification",
        });
        releaseTerminal = () =>
          _event.sender.send("dub:event", { id: request.id, ...outcome });
        return { ok: true };
      }
      retryRequests.push(request);
      return { ok: false, error: "Controlled retry request captured" };
    });
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value="New introduction. "+n.value;n.dispatchEvent(new Event("input"));[...document.querySelectorAll(".mw-review-group button")].find(n=>n.textContent.includes("Yalnız")).click();return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(".mw-status")?.textContent.includes("Controlled retry request captured")',
        ),
      "edited group retry reached engine boundary",
    );
    assert.equal(retryRequests.length, 1);
    assert.equal(retryRequests[0].referenceId, bookReferenceId);
    assert.deepEqual(
      retryRequests[0].forceGroups,
      [],
      "old group ordinals must not survive edited source",
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(imported.project.chapters[0].text) +
        ';n.dispatchEvent(new Event("input"));return true',
    );
    const restoredText = await run(
      'return window.api.mediaWorkflows({action:"book-save",id:' +
        JSON.stringify(id) +
        ",chapter:0,text:" +
        JSON.stringify(imported.project.chapters[0].text) +
        "})",
    );
    assert(restoredText.ok, restoredText.error);
    for (const outcome of [
      { type: "error" },
      { type: "error", error: "Engine timeout at 60/61" },
      { type: "cancelled" },
    ]) {
      terminalOutcome = outcome;
      releaseTerminal = null;
      await run(
        '[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Seçili bölümleri seslendir").click();return true',
      );
      await until(
        () => !!releaseTerminal,
        "controlled generation terminal gate",
      );
      await until(
        () =>
          run(
            'return document.querySelector(".mw-status").textContent.includes("Konuşma doğrulanıyor")',
          ),
        "verification stage visible in book production",
      );
      if (outcome.type === "error" && !outcome.error) {
        await run('UiLocale.set("en",false);return true');
        assert.match(
          await run('return document.querySelector(".mw-status").textContent'),
          /Checking speech/,
        );
        await run('UiLocale.set("tr",false);return true');
      }
      releaseTerminal();
      const expected =
        outcome.type === "cancelled"
          ? "Durduruldu"
          : outcome.error
            ? "zaman aşımına"
            : "başarısız";
      await until(
        () =>
          run(
            'const n=document.querySelector(".mw-status"),b=[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Seçili bölümleri seslendir");return n.textContent.includes(' +
              JSON.stringify(expected) +
              ")&&b&&!b.disabled",
          ),
        "distinct controlled terminal state",
      );
      if (outcome.type === "error" && !outcome.error)
        assert.doesNotMatch(
          await run('return document.querySelector(".mw-status").textContent'),
          /Durduruldu/,
        );
    }
    terminalOutcome = null;
    releaseTerminal = null;
    await capture("workflow-error-states-tr-dark.png");
    const resetReview = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    service.capture({
      id: resetReview.request.id,
      path: wav,
      quality: {
        groups: [
          {
            key: "review-one",
            status: "review",
            displayText: imported.project.chapters[0].text,
            audioStart: 1,
            audioEnd: 4,
          },
        ],
      },
    });
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () => run('return !!document.querySelector(".mw-review-group")'),
      "review controls restored after retry probe",
    );
    await capture("review-before.png");
    win.setMinimumSize(640, 400);
    for (const zoom of [1, 1.25]) {
      win.setContentSize(800, 900);
      win.webContents.setZoomFactor(zoom);
      await until(() => run("return innerWidth<810"), "narrow viewport");
      await auditNarrow(
        "review-800-" + zoom,
        ".mw-review-group button,.mw-transport button",
      );
      await run(
        'document.querySelector(".mw-review-group button").focus();return true',
      );
      win.webContents.focus();
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
      await until(
        () =>
          run(
            'return document.activeElement?.textContent==="Bu metni düzenle"',
          ),
        "review keyboard focus order",
      );
      assert(
        await run(
          'const n=document.activeElement,r=n.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return (hit===n||n.contains(hit))&&getComputedStyle(n).outlineStyle!=="none"',
        ),
        "keyboard focus must not be covered",
      );
      await capture("review-focus-800-" + zoom + ".png");
    }
    win.webContents.setZoomFactor(1);
    win.setContentSize(1440, 1000);
    await run(
      '[...document.querySelectorAll(".mw-review-group button")].find(n=>n.textContent.includes("Dinledim")).click();return true',
    );
    await until(
      () => run('return !!document.querySelector("dialog.mw-confirm[open]")'),
      "native review confirmation",
    );
    await capture("review-confirm.png");
    await run(
      'document.querySelector("dialog.mw-confirm form").requestSubmit();return true',
    );
    await until(
      () => run('return !document.querySelector(".mw-review-group")'),
      "approval stored",
    ).catch(async (e) => {
      e.message +=
        " " +
        JSON.stringify(
          await run(
            'return {status:document.querySelector(".mw-status")?.textContent,text:document.querySelector(".mw-review-group")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(n=>n.className)}',
          ),
        );
      throw e;
    });
    const approved = await run(
      'return window.api.mediaWorkflows({action:"book-open",id:' +
        JSON.stringify(id) +
        "})",
    );
    assert.equal(approved.project.chapters[0].status, "ready");
    assert(approved.project.chapters[0].groups[0].manualApproval.audioHash);
    await run('document.querySelector(".mw-management").open=true;return true');
    await capture("management.png");
    await run(
      'document.querySelector(".mw-management").open=false;[...document.querySelectorAll("button")].find(n=>n.textContent==="M4B çıktı bilgisi").click();return true',
    );
    await until(
      () =>
        run(
          'return !!document.querySelector(".mw-export-preview:not([hidden]) dl")',
        ),
      "M4B summary",
    );
    const summary = await run(
      'return document.querySelector(".mw-export-preview").textContent',
    );
    assert.match(summary, /Tahmini AAC boyutu/);
    await capture("m4b-preview-tr-dark.png");
    await run('UiLocale.set("en",false);applyUiTheme("light");return true');
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () =>
        run(
          'return [...document.querySelectorAll("button")].some(n=>n.textContent==="Preview M4B export")',
        ),
      "English preview button",
    );
    await run(
      '[...document.querySelectorAll("button")].find(n=>n.textContent==="Preview M4B export").click();return true',
    );
    await until(
      () =>
        run(
          'return !!document.querySelector(".mw-export-preview:not([hidden]) dl")',
        ),
      "English M4B summary",
    );
    await capture("m4b-preview-en-light.png");
    await run('UiLocale.set("tr",false);applyUiTheme("dark");return true');
    const exported = await run(
      'return window.api.mediaWorkflows({action:"book-export",id:' +
        JSON.stringify(id) +
        ",chapters:[1,2]})",
    );
    assert(exported.ok, exported.error);
    const ffprobe = require("./media-runtime").findMediaTool("ffprobe");
    assert(ffprobe);
    const probe = require("node:child_process").spawnSync(
      ffprobe,
      ["-v", "error", "-show_chapters", "-of", "json", exported.path],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(JSON.parse(probe.stdout).chapters.length, 2);
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () => run('return !!document.querySelector(".mw-editor")'),
      "editor",
    );
    await run(
      'document.querySelector(".mw-voice-settings").open=true;return true',
    );
    await capture("editor-tr-dark.png");
    await run(
      '[...document.querySelectorAll(".mw-editor button")].find(n=>n.textContent.includes("Dinle ve takip")).click();return true',
    );
    await until(
      () => run('return !!document.querySelector(".mw-pdf canvas")'),
      "PDF canvas",
    );
    await run(
      'const a=document.querySelector(".mw-body audio");a.currentTime=1;a.dispatchEvent(new Event("timeupdate"));return true',
    );
    assert(
      await run(
        'return !!document.querySelector(".mw-spoken[aria-current=true]")',
      ),
    );
    await until(
      () => run('return !!document.querySelector(".pdf-speech-box")'),
      "original PDF speech mapping",
    );
    await run(
      'const a=document.querySelector(".mw-body audio");a.currentTime=1;a.dispatchEvent(new Event("timeupdate"));return true',
    );
    assert(await run('return !!document.querySelector(".pdf-active-box")'));
    const followCheck=await run(`
      const audio=document.querySelector(".mw-body audio"),prose=document.querySelector(".mw-reading-text"),follow=[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.hasAttribute("aria-pressed"));
      const oldScroll=Element.prototype.scrollIntoView,oldMatch=window.matchMedia,calls=[];
      Element.prototype.scrollIntoView=function(options){if(this.matches(".mw-spoken"))calls.push(options);};
      window.matchMedia=query=>query==="(prefers-reduced-motion: reduce)"?{matches:true}:oldMatch.call(window,query);
      try{
        follow.click();await Promise.resolve();const off=follow.getAttribute("aria-pressed");follow.click();await Promise.resolve();audio.currentTime=1;audio.dispatchEvent(new Event("timeupdate"));
        const reduced=calls.splice(0);
        audio.currentTime=audio.duration;audio.dispatchEvent(new Event("timeupdate"));calls.length=0;
        prose.dispatchEvent(new WheelEvent("wheel",{deltaY:80}));audio.currentTime=1;audio.dispatchEvent(new Event("timeupdate"));
        const manual=calls.length;
        follow.click();await Promise.resolve();follow.click();await Promise.resolve();audio.dispatchEvent(new Event("timeupdate"));
        return {off,on:follow.getAttribute("aria-pressed"),reduced,manual,resumed:calls.length};
      }finally{Element.prototype.scrollIntoView=oldScroll;window.matchMedia=oldMatch;}
    `);
    fs.writeFileSync(path.join(out,"reader-follow.json"),JSON.stringify(followCheck,null,2));
    assert.equal(followCheck.off,"false");assert.equal(followCheck.on,"true");
    assert.equal(followCheck.reduced.length,1);assert.equal(followCheck.reduced[0].behavior,"auto");
    assert.equal(followCheck.manual,0);assert.equal(followCheck.resumed,1);
    win.setContentSize(800, 900);
    win.webContents.setZoomFactor(1.25);
    await auditNarrow(
      "reader-800-1.25",
      ".mw-reading-head button,.mw-reading-head summary,.mw-spoken",
    );
    for (const popup of [".mw-reader-tools", ".book-assistant-compact"]) {
      await run(`const d=document.querySelector(${JSON.stringify(popup)});d.open=true;return true`);
      const panelBounds=await run(`const p=document.querySelector(${JSON.stringify(popup)}).querySelector("div"),r=p.getBoundingClientRect(),b=document.querySelector(".mw-body").getBoundingClientRect();return {left:r.left,right:r.right,clipLeft:b.left,clipRight:b.right}`);
      assert(panelBounds.left>=panelBounds.clipLeft-1&&panelBounds.right<=panelBounds.clipRight+1,JSON.stringify(panelBounds));
      await auditNarrow(`reader-popup-${popup.slice(1)}-800-1.25`, `${popup} button`);
      await run(`document.querySelector(${JSON.stringify(popup)}).open=false;return true`);
    }
    const wheelPoint = await run(
      'const p=document.querySelector(".mw-pdf"),s=p.querySelector("select");s.value="2";s.dispatchEvent(new Event("change"));p.scrollIntoView({block:"center"});p.scrollTop=0;const r=p.getBoundingClientRect();return {x:(r.left+r.right)/2,y:Math.max(r.top+80,Math.min(innerHeight-70,r.bottom-30))}',
    );
    await until(
      () =>
        run(
          'const p=document.querySelector(".mw-pdf");return p.scrollHeight>p.clientHeight+100',
        ),
      "zoomed PDF has scrollable content",
    );
    win.webContents.sendInputEvent({
      type: "mouseWheel",
      x: Math.round(wheelPoint.x * 1.25),
      y: Math.round(wheelPoint.y * 1.25),
      deltaX: 0,
      deltaY: -280,
    });
    await until(
      () => run('return document.querySelector(".mw-pdf").scrollTop>0'),
      "native wheel scrolls the PDF pane at 125 percent",
    );
    await run(
      'const s=document.querySelector(".mw-pdf select");s.value="fit";s.dispatchEvent(new Event("change"));return true',
    );
    win.webContents.setZoomFactor(1);
    win.setContentSize(1440, 1000);
    const pdfBox = await run(
      'const b=document.querySelector(".pdf-active-box").getBoundingClientRect(),c=document.querySelector(".mw-pdf canvas").getBoundingClientRect();return {inside:b.left>=c.left-2&&b.right<=c.right+2&&b.top>=c.top-2&&b.bottom<=c.bottom+2};',
    );
    assert(pdfBox.inside);
    await run(
      '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Editöre dön").click();return true',
    );
    await until(
      () => run('return !!document.querySelector("textarea[data-chapter]")'),
      "lifecycle baseline editor",
    );
    const lifecycle = [];
    const lifecycleStart = performance.now();
    win.webContents.debugger.attach("1.3");
    try {
      async function memorySample(iteration) {
        await win.webContents.debugger.sendCommand(
          "HeapProfiler.collectGarbage",
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        await win.webContents.debugger.sendCommand(
          "HeapProfiler.collectGarbage",
        );
        const dom = await win.webContents.debugger.sendCommand(
            "Memory.getDOMCounters",
          ),
          heap = await win.webContents.debugger.sendCommand(
            "Runtime.getHeapUsage",
          ),
          proc = app
            .getAppMetrics()
            .find((p) => p.pid === win.webContents.getOSProcessId());
        lifecycle.push({
          iteration,
          dom,
          heapUsedBytes: heap.usedSize,
          workingSetKiB: proc?.memory.workingSetSize,
        });
      }
      await memorySample(0);
      for (let iteration = 1; iteration <= 12; iteration++) {
        await run(
          '[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Dinle ve takip et").click();return true',
        );
        await until(
          () => run('return !!document.querySelector(".pdf-speech-box")'),
          "lifecycle PDF reader opened",
        );
        await run(
          '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Editöre dön").click();return true',
        );
        await until(
          () =>
            run('return !!document.querySelector("textarea[data-chapter]")'),
          "lifecycle editor restored",
        );
        assert(
          await run(
            'return !document.querySelector(".mw-pdf canvas")&&!document.querySelector(".mw-body audio[src]")',
          ),
          "closed reader leaves no canvas or loaded audio source",
        );
        if ([2, 6, 12].includes(iteration)) await memorySample(iteration);
      }
      fs.writeFileSync(
        path.join(out, "reader-lifecycle.json"),
        JSON.stringify(
          {
            cycles: 12,
            wallMs: performance.now() - lifecycleStart,
            samples: lifecycle,
          },
          null,
          2,
        ),
      );
    } finally {
      win.webContents.debugger.detach();
    }
    await run(
      '[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Dinle ve takip et").click();return true',
    );
    await until(
      () => run('return !!document.querySelector(".pdf-speech-box")'),
      "reader restored after lifecycle measurement",
    );
    await run(
      'const a=document.querySelector(".mw-body audio");a.pause();a.currentTime=2.5;document.querySelector(".pdf-speech-box").focus();return true',
    );
    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
    await until(
      () =>
        run(
          'const a=document.querySelector(".mw-body audio");return !a.paused&&a.currentTime>=1&&a.currentTime<1.5',
        ),
      "PDF highlight keyboard seeks to actual nonzero group start",
    ).catch(async (error) => {
      error.message +=
        " " +
        JSON.stringify(
          await run(
            'const a=document.querySelector(".mw-body audio");return {paused:a?.paused,time:a?.currentTime,ready:a?.readyState,status:document.querySelector(".mw-status")?.textContent,active:document.activeElement?.outerHTML.slice(0,250)}',
          ),
        );
      throw error;
    });
    await run(
      'const a=document.querySelector(".mw-body audio");a.pause();a.currentTime=1;a.dispatchEvent(new Event("timeupdate"));return true',
    );
    assert.equal(
      await run('return document.querySelector(".mw-status").textContent'),
      "",
      "a normal user pause must not show an AbortError",
    );
    const selectedPassage = await run(
      'const prose=document.querySelector(".mw-reading-text"),n=prose.querySelector(".mw-spoken").firstChild,quote="controlled PDF reading sample",start=n.textContent.indexOf(quote),range=document.createRange();range.setStart(n,start);range.setEnd(n,start+quote.length);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);prose.dispatchEvent(new Event("pointerup",{bubbles:true}));return {quote,context:aiChatContext(),scope:aiSourceScope()};',
    );
    assert.equal(selectedPassage.context.selectedText, selectedPassage.quote);
    assert(selectedPassage.context.excerpt.includes(selectedPassage.quote));
    assert.equal(selectedPassage.context.id, id + ":0");
    assert.equal(selectedPassage.context.type, "book-chapter");
    await run(
      'const a=document.querySelector(".mw-body audio");a.currentTime=1.25;[...document.querySelectorAll(".mw-bookmarks button")].find(n=>n.textContent==="Pasaj yer imi ekle").click();return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(".mw-bookmarks select")?.options.length===2&&!document.querySelector(".mw-bookmarks select").disabled',
        ),
      "audio passage bookmark saved",
    );
    const savedBookmark = (
      await run(
        'return window.api.mediaWorkflows({action:"book-mark-list",id:' +
          JSON.stringify(id) +
          "})",
      )
    ).bookmarks[0];
    assert.equal(savedBookmark.quote, selectedPassage.quote);
    assert.equal(savedBookmark.position, 1.25);
    assert.equal(await run('return document.querySelector(".mw-body").textContent.includes("[object Object]")'),false,'Reader labels cannot stringify localization objects');
    await capture("reader-tr-dark.png");
    await run(
      '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Sonraki sayfa / bölüm").click();return true',
    );
    await until(
      () =>
        run(
          "return MediaExperience.context()?.id===" + JSON.stringify(id + ":1"),
        ),
      "reader second page assistant context",
    );
    assert.match(
      await run("return MediaExperience.context().excerpt"),
      /Chapter 2/,
    );
    assert.equal(
      await run("return aiChatContext().selectedText"),
      "",
      "the previous page's quote must not leak into the next chapter",
    );
    await capture("reader-page2-context.png");
    await run(
      'return window.api.mediaWorkflows({action:"book-progress",id:' +
        JSON.stringify(id) +
        ",chapter:0,position:0})",
    );
    await until(
      () =>
        run(
          'return !![...document.querySelector(".mw-bookmarks select").options].find(n=>n.value===' +
            JSON.stringify(savedBookmark.id) +
            ")",
        ),
      "bookmark visible from another chapter",
    );
    await run(
      'const s=document.querySelector(".mw-bookmarks select");s.value=' +
        JSON.stringify(savedBookmark.id) +
        ';s.dispatchEvent(new Event("change"));return true',
    );
    await until(
      () =>
        run(
          'const a=document.querySelector(".mw-body audio");return MediaExperience.context()?.id===' +
            JSON.stringify(id + ":0") +
            "&&a&&!a.paused&&a.currentTime>=1.25&&a.currentTime<1.9",
        ),
      "bookmark navigates to exact chapter and saved audio time",
    );
    await run('document.querySelector(".mw-body audio").pause();return true');
    const retake = path.join(out, "bookmark-retake.wav"),
      retakeBytes = Buffer.from(bytes);
    retakeBytes.writeInt16LE(123, 44);
    fs.writeFileSync(retake, retakeBytes);
    const retakeJob = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    service.capture({
      id: retakeJob.request.id,
      path: retake,
      quality: {
        groups: [
          {
            key: "review-one",
            status: "ready",
            displayText: imported.project.chapters[0].text,
            audioStart: 2,
            audioEnd: 4,
          },
        ],
      },
    });
    await run(
      'const s=document.querySelector(".mw-bookmarks select");s.value=' +
        JSON.stringify(savedBookmark.id) +
        ';s.dispatchEvent(new Event("change"));return true',
    );
    await until(
      () =>
        run(
          'const a=document.querySelector(".mw-body audio");return a&&!a.paused&&a.currentTime>=2&&a.currentTime<2.8',
        ),
      "new audio maps bookmark to verified group start instead of stale seconds",
    );
    await run('document.querySelector(".mw-body audio").pause();return true');
    await capture("bookmark-remapped-tr-dark.png");
    assert.match(
      await run('return document.querySelector(".mw-status").textContent'),
      /grubunun başı/,
    );
    const comparisonList = await run(
      'return window.api.mediaWorkflows({action:"book-takes",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    const newerTake = comparisonList.takes.find((t) => t.current),
      olderTake = comparisonList.takes.find((t) => !t.current && t.textMatches);
    assert(
      newerTake && olderTake,
      "two real WAV takes available for comparison",
    );
    await run(
      '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Editöre dön").click();return true',
    );
    await until(
      () => run('return !!document.querySelector(".mw-voice-takes")'),
      "comparison panel mounted",
    );
    await run(
      'document.querySelector(".mw-voice-takes").open=true;return true',
    );
    await until(
      () =>
        run(
          'const s=document.querySelector(".mw-voice-takes select");return s?.options.length>=2&&!s.disabled',
        ),
      "comparison list loaded",
    );
    await run(
      'const d=document.querySelector(".mw-voice-takes"),s=d.querySelector("select");s.value=' +
        JSON.stringify(olderTake.id) +
        ';s.dispatchEvent(new Event("change"));[...d.querySelectorAll("button")].find(n=>n.textContent==="Karşılaştırmayı aç").click();return true',
    );
    await until(
      () =>
        run(
          'return [...document.querySelectorAll(".mw-take-players audio")].every(a=>a.readyState>=1)',
        ),
      "both real WAV players loaded",
    );
    await run(
      'const d=document.querySelector(".mw-voice-takes");d.scrollIntoView({block:"center"});const a=d.querySelectorAll("audio");await a[0].play();await a[1].play();return true',
    );
    assert(
      await run(
        'const a=document.querySelectorAll(".mw-voice-takes audio");return a[0].paused&&!a[1].paused',
      ),
      "comparison prevents simultaneous playback",
    );
    await run(
      'for(const a of document.querySelectorAll(".mw-voice-takes audio"))a.pause();return true',
    );
    await capture("voice-takes-tr-dark.png");
    await checkCompact(
      "voice-takes-800-1.25",
      ".mw-voice-takes select,.mw-voice-takes button,.mw-voice-takes audio",
    );
    await run(
      '[...document.querySelectorAll(".mw-voice-takes button")].find(n=>n.textContent==="Bu denemeyi kullan").click();return true',
    );
    await until(
      async () =>
        (
          await run(
            'return window.api.mediaWorkflows({action:"book-open",id:' +
              JSON.stringify(id) +
              "})",
          )
        ).project.chapters[0].output === olderTake.id,
      "old take selected through real UI",
    );
    await until(
      () => run('return !!document.querySelector(".mw-voice-takes")'),
      "comparison editor after selection",
    );
    await run(
      'document.querySelector(".mw-voice-takes").open=true;return true',
    );
    await until(
      () =>
        run(
          'const s=document.querySelector(".mw-voice-takes select");return s?.options.length>=2&&!s.disabled',
        ),
      "comparison list after selection",
    );
    await run(
      'const d=document.querySelector(".mw-voice-takes"),s=d.querySelector("select");s.value=' +
        JSON.stringify(newerTake.id) +
        ';s.dispatchEvent(new Event("change"));[...d.querySelectorAll("button")].find(n=>n.textContent==="Bu denemeyi kullan").click();return true',
    );
    await until(
      async () =>
        (
          await run(
            'return window.api.mediaWorkflows({action:"book-open",id:' +
              JSON.stringify(id) +
              "})",
          )
        ).project.chapters[0].output === newerTake.id,
      "newer take restored through real UI",
    );
    const keptFiles = await run(
      'return window.api.mediaWorkflows({action:"book-take-listen",id:' +
        JSON.stringify(id) +
        ",chapter:0,takeId:" +
        JSON.stringify(olderTake.id) +
        "})",
    );
    assert(
      fs.existsSync(keptFiles.path),
      "previous audio retained after switching",
    );
    await until(
      () => run('return !!document.querySelector("textarea[data-chapter]")'),
      "editor ready for reader",
    );
    await run(
      '[...document.querySelectorAll(".mw-transport button")].find(n=>n.textContent==="Dinle ve takip et").click();return true',
    );
    await until(
      () => run('return !!document.querySelector(".mw-bookmarks select")'),
      "reader restored after comparing takes",
    );
    await run(
      'return window.api.mediaWorkflows({action:"book-save",id:' +
        JSON.stringify(id) +
        ',chapter:0,text:"Changed chapter text after bookmark."})',
    );
    await until(
      () =>
        run('return !document.querySelector(".mw-bookmarks select").disabled'),
      "bookmark controls ready",
    );
    await run(
      'const s=document.querySelector(".mw-bookmarks select");s.value=' +
        JSON.stringify(savedBookmark.id) +
        ';s.dispatchEvent(new Event("change"));return true',
    );
    await until(
      () =>
        run(
          'return [...document.querySelectorAll(".mw-bookmarks button")].some(n=>!n.hidden&&n.textContent==="Bölüm metnini aç")',
        ),
      "changed-text bookmark does not silently seek",
    );
    assert(await run('return document.querySelector(".mw-body audio").paused'));
    await capture("bookmark-stale-text-tr-dark.png");
    await run(
      'return window.api.mediaWorkflows({action:"book-save",id:' +
        JSON.stringify(id) +
        ",chapter:0,text:" +
        JSON.stringify(imported.project.chapters[0].text) +
        "})",
    );
    await run(
      '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Sonraki sayfa / bölüm").click();return true',
    );
    await until(
      () =>
        run(
          "return MediaExperience.context()?.id===" + JSON.stringify(id + ":1"),
        ),
      "return to second reader page after bookmark checks",
    );

    win.setContentSize(800, 800);
    await wait(200);
    await capture("reader-narrow.png");
    const bounds = await run(
      'const d=document.getElementById("mediaWorkflowsDialog");return {scroll:d.scrollWidth,client:d.clientWidth}',
    );
    assert(bounds.scroll <= bounds.client + 3, JSON.stringify(bounds));
    await run(
      '[...document.querySelectorAll(".mw-reading-head button")].find(n=>n.textContent==="Editöre dön").click();return true',
    );
    await until(
      () => run('return !!document.querySelector(".mw-editor textarea")'),
      "return to second-page editor",
    );
    await run(
      '[...document.querySelectorAll(".mw-editor button")].find(n=>n.textContent==="Kaynak bölüme dön").click();return true',
    );
    await until(
      () =>
        run(
          'return document.getElementById("pdfReaderPage").value==="2"&&!document.getElementById("pdfReader").classList.contains("hidden")&&!document.getElementById("mediaWorkflowsDialog")',
        ),
      "production chapter returns to actual original PDF page2",
    );
    assert.equal(await run("return globalAssistantContext().page"), 2);
    await capture("production-return-to-pdf-page2.png");
    await run('document.getElementById("pdfReaderClose").click();return true');
    await run(
      'UiLocale.set("en",false);applyUiTheme("light");MediaWorkflowsUI.open("resources");return true',
    );
    await wait(250);
    await capture("resources-en-light.png");
    await run(
      'document.getElementById("mediaWorkflowsDialog").close();return true',
    );
    // A completed partial audiobook must be reachable from the real shelf card.
    const projectFile = path.join(
      require("../src/voice-storage").voiceStorage(app).input,
      "Kitap projeleri",
      id,
      "project.json",
    );
    const shelfProject = JSON.parse(fs.readFileSync(projectFile, "utf8"));
    shelfProject.shelfBookId = "fixture-shelf";
    fs.writeFileSync(projectFile, JSON.stringify(shelfProject));
    fs.writeFileSync(
      path.join(app.getPath("userData"), "media-shelf.json"),
      JSON.stringify({
        version: 1,
        music: [],
        stations: [],
        podcasts: [],
        playlists: [],
        diary: [],
        books: [
          {
            id: "fixture-shelf",
            title: "Okuma denemesi",
            author: "Controlled PDF",
            format: "pdf",
            path: source,
            productionProjectId: id,
          },
        ],
      }),
    );
    win.setContentSize(1200, 900);
    await run(
      'const root=document.createElement("section");root.id="audiobookShelfTest";root.className="media-surface";Object.assign(root.style,{position:"fixed",inset:"0",zIndex:"2000",padding:"32px",overflow:"auto",background:"var(--bg-1)"});document.body.append(root);MediaShelfUI.mount(root,"books");return true',
    );
    await until(
      () =>
        run(
          'return !!document.querySelector("#audiobookShelfTest .ms-book-audiobook button")',
        ),
      "shelf audiobook action",
    );
    assert.match(
      await run(
        'return document.querySelector(".ms-book-audiobook small").textContent',
      ),
      /2 chapters/,
    );
    await capture("audiobook-shelf-en-light.png");
    await run(
      'UiLocale.set("tr",false);applyUiTheme("dark");MediaShelfUI.mount(document.getElementById("audiobookShelfTest"),"books");return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector("#audiobookShelfTest .ms-book-audiobook button")?.textContent.includes("dinle")',
        ),
      "Turkish shelf audiobook action",
    );
    await capture("audiobook-shelf-tr-dark.png");
    await run(
      'document.querySelector("#audiobookShelfTest .ms-book-audiobook button").click();return true',
    );
    await until(
      () =>
        run(
          'return document.getElementById("playerVideoPath").textContent.includes("selected-pages.m4b")',
        ),
      "M4B opened in application player",
    );
    await until(
      () => run('return document.getElementById("playerVideo").readyState>=2'),
      "real M4B decoded",
    );
    await run(
      'document.getElementById("playerVideo").pause();document.getElementById("audiobookShelfTest").remove();return true',
    );
    // Real EPUB reader -> second production chapter -> same source chapter.
    const python = require("./python-runtime").findTestPython();
    require("node:child_process").execFileSync(
      python,
      [
        "-c",
        "import sys;sys.path.insert(0,'backend');from test_media_shelf import ShelfParsingTests;ShelfParsingTests().epub(sys.argv[1])",
        out,
      ],
      { cwd: root, windowsHide: true },
    );
    const epubFile = path.join(out, "Öykü.epub"),
      shelfFile = path.join(app.getPath("userData"), "media-shelf.json"),
      shelfData = JSON.parse(fs.readFileSync(shelfFile, "utf8"));
    shelfData.books.push({
      id: "fixture-epub",
      title: "İstanbul & Öykü",
      author: "Yazar",
      format: "epub",
      path: epubFile,
      chapter: 0,
      scroll: 0,
      bookmarks: [],
    });
    fs.writeFileSync(shelfFile, JSON.stringify(shelfData));
    await run('await MediaShelfUI.openBook("fixture-epub");return true');
    await run(
      'const s=document.querySelector(\'.ms-reader select[aria-label="Bölüm"]\');s.value="1";s.dispatchEvent(new Event("change"));return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(".ms-prose")?.textContent.includes("Birinci")',
        ),
      "EPUB second chapter displayed",
    );
    await run(
      '[...document.querySelectorAll(".ms-reader button")].find(n=>n.textContent==="Bölümü seslendir").click();return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(".mw-editor textarea")?.dataset.chapter==="1"',
        ),
      "EPUB source identity opens second production chapter",
    ).catch(async (error) => {
      error.message +=
        " " +
        JSON.stringify(
          await run(
            'return {readerStatus:document.querySelector(".ms-reader .ms-status")?.textContent,status:document.querySelector(".mw-status")?.textContent,chapter:document.querySelector(".mw-editor textarea")?.dataset.chapter,open:[...document.querySelectorAll("dialog[open]")].map(n=>n.className)}',
          ),
        );
      throw error;
    });
    assert.match(
      await run('return document.querySelector(".mw-editor textarea").value'),
      /Birinci/,
    );
    assert.equal(
      await run(
        "return document.querySelector('select[aria-label=\"Kayıtlı referans sesler\"]').value",
      ),
      "",
      "the new book must not inherit the previous book's reference",
    );
    assert.deepEqual(
      await run(
        'return [...document.querySelectorAll(".mw-chapter input:checked")].map(n=>Number(n.dataset.chapter))',
      ),
      [1],
    );
    assert.equal(
      retryRequests.length,
      1,
      "opening a chapter does not generate speech automatically",
    );
    await capture("epub-source-to-production-tr-dark.png");
    await run(
      '[...document.querySelectorAll(".mw-editor button")].find(n=>n.textContent==="Kaynak bölüme dön").click();return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(\'.ms-reader[open] select[aria-label="Bölüm"]\')?.value==="1"',
        ),
      "production returns to the same EPUB chapter",
    );
    assert.match(
      await run(
        'return document.querySelector(".ms-reader[open] .ms-prose").textContent',
      ),
      /Birinci/,
    );
    await capture("epub-return-to-source-tr-dark.png");
    await run('document.querySelector(".ms-reader[open]").close();return true');
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        {
          ok: true,
          out,
          selected,
          realPdf: true,
          fixtureAudio: true,
          highlight: true,
          originalPdfHighlight: true,
          manualReviewApproved: true,
          bounds,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, out }));
    app.exit(0);
  })
  .catch((e) => {
    fs.writeFileSync(path.join(out, "error.txt"), e.stack);
    app.exit(1);
  });
setTimeout(() => app.exit(2), 120000).unref();
