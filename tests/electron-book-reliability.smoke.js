const { app, BrowserWindow, dialog } = require("electron"),
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
require("../src/main");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const stop = Date.now() + 30000;
  while (Date.now() < stop) {
    if (await fn()) return;
    await wait(80);
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
    await until(() => run("return !!window.MediaWorkflowsUI"), "UI");
    await run(
      'await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true',
    );
    win.setContentSize(1440, 1000);
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
    const query = imported.project.chapters[1].text.slice(0, 22);
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
    assert.equal(searchSelection, query);
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
    await capture("review-before.png");
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
    const pdfBox = await run(
      'const b=document.querySelector(".pdf-active-box").getBoundingClientRect(),c=document.querySelector(".mw-pdf canvas").getBoundingClientRect();return {inside:b.left>=c.left-2&&b.right<=c.right+2&&b.top>=c.top-2&&b.bottom<=c.bottom+2};',
    );
    assert(pdfBox.inside);
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
    await capture("reader-page2-context.png");

    win.setContentSize(800, 800);
    await wait(200);
    await capture("reader-narrow.png");
    const bounds = await run(
      'const d=document.getElementById("mediaWorkflowsDialog");return {scroll:d.scrollWidth,client:d.clientWidth}',
    );
    assert(bounds.scroll <= bounds.client + 3, JSON.stringify(bounds));
    await run(
      'document.getElementById("mediaWorkflowsDialog").close();UiLocale.set("en",false);applyUiTheme("light");MediaWorkflowsUI.open("resources");return true',
    );
    await wait(250);
    await capture("resources-en-light.png");
    await run(
      'document.getElementById("mediaWorkflowsDialog").close();return true',
    );
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
