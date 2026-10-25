"use strict";
// Actual book UI, source scope, conversation IPC and native assistant view.
// The provider boundary and replies are controlled; no network/model call.
const { app, BrowserWindow, dialog } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { createHash } = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, ".uiprev", "book-assistant-" + Date.now());
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, "profile");
app.setPath("downloads", out);
app.setAppPath(root);
app.commandLine.appendSwitch("disable-gpu");
const pdf = path.join(out, "source.pdf");
fs.writeFileSync(pdf, require("./helpers/pdf-fixture")());
let selectedFile = pdf;
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [selectedFile],
});
const workflows = require("../src/media-workflows"),
  register = workflows.registerMediaWorkflows;
let service;
workflows.registerMediaWorkflows = (options) => (service = register(options));
require("../src/main");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(60);
  }
  throw Error("Timed out: " + label);
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
    }, "parent");
    win.setContentSize(1440, 1000);
    win.show();
    const run = (code) =>
      win.webContents.executeJavaScript("(async()=>{" + code + "})()", true);
    await until(
      () => run("return !!window.BookAssistantUI&&!!window.MediaExperience"),
      "book assistant scripts",
    );
    await run(
      'await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");window.bookRequests=[];translationEndpointReady=()=>true;startTranscribeSafe=async options=>{bookRequests.push(JSON.parse(JSON.stringify(options.chat)));return {ok:true};};return true',
    );
    const imported = await run(
      'return window.api.mediaWorkflows({action:"book-import"})',
    );
    assert(imported.ok, imported.error);
    const id = imported.project.id;
    const text =
      "A careful account of the old city. " +
      "The witness does not claim certainty about the number 1.5. ".repeat(
        180,
      ) +
      "Ending marker: preserve the final qualification.";
    assert(text.length > 8000);
    assert(
      (
        await run(
          'return window.api.mediaWorkflows({action:"book-save",id:' +
            JSON.stringify(id) +
            ",chapter:0,text:" +
            JSON.stringify(text) +
            "})",
        )
      ).ok,
    );
    await run(
      "await MediaWorkflowsUI.openProject(" +
        JSON.stringify(id) +
        ");return true",
    );
    await until(
      () =>
        run(
          'return !!document.querySelector(".mw-body .book-assistant-actions")',
        ),
      "chapter actions",
    );
    async function capture(contents, name) {
      await contents.executeJavaScript("document.fonts.ready.then(()=>true)");
      for (let attempt = 0; attempt < 5; attempt++) {
        await wait(200);
        try {
          fs.writeFileSync(
            path.join(out, name),
            (await contents.capturePage()).toPNG(),
          );
          return;
        } catch (error) {
          if (attempt === 4) throw Error(name + ": " + error.message);
        }
      }
    }
    async function finish() {
      await run(
        'playerJobEvent({type:"chat",text:"Controlled reply based only on supplied book evidence."});playerJobEvent({type:"exit",code:0});return true',
      );
      await until(
        () => run("return !state.running&&!player.job"),
        "controlled reply complete",
      );
    }
    async function requestFrom(selector, kind, count) {
      await run(
        "const root=document.querySelector(" +
          JSON.stringify(selector) +
          ');if(root.tagName==="DETAILS"&&!root.open)root.querySelector("summary").click();[...root.querySelectorAll("button")].find(b=>b.textContent.includes(' +
          JSON.stringify(kind) +
          ")).click();return true",
      );
      await until(
        () => run("return bookRequests.length===" + count),
        "request " + count,
      );
      return run("return bookRequests[" + (count - 1) + "]");
    }
    const draft = text + " Unsaved final note.";
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value=' +
        JSON.stringify(draft) +
        ';n.dispatchEvent(new Event("input"));return true',
    );
    const summary = await requestFrom(
      ".mw-body .book-assistant-actions",
      "Bölümü özetle",
      1,
    );
    assert.equal(summary.context.id, id + ":0");
    assert.equal(summary.context.chapterText, draft);
    assert.equal(summary.context.chapterTextComplete, true);
    assert.equal(
      summary.context.chapterRevision,
      createHash("sha256").update(draft).digest("hex"),
    );
    assert(summary.context.excerpt.length <= 8000);
    assert(summary.context.chapterText.endsWith("Unsaved final note."));
    assert.equal(
      (
        await run(
          'return window.api.mediaWorkflows({action:"book-open",id:' +
            JSON.stringify(id) +
            "})",
        )
      ).project.chapters[0].text,
      text,
      "asking the assistant does not save or rewrite chapter text",
    );
    const assistant = win.contentView.children.find((v) =>
      v.webContents?.getURL().includes("assistant-overlay.html"),
    );
    assert(assistant);
    const arun = (code) =>
      assistant.webContents.executeJavaScript(
        "(async()=>{" + code + "})()",
        true,
      );
    await until(
      () =>
        arun(
          'return document.getElementById("sourceDescription").textContent.includes("Tam bölüm/sayfa metni")',
        ),
      "native source description shows full chapter",
    );
    await arun('document.getElementById("sourceBox").open=true;return true');
    await capture(assistant.webContents, "assistant-complete-chapter-tr.png");
    await run(
      'document.querySelector(".mw-body .book-assistant-actions").scrollIntoView({block:"center"});return true',
    );
    await capture(win.webContents, "book-actions-tr.png");
    await finish();
    const quote = "A careful account of the old city.";
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.focus();n.setSelectionRange(0,' +
        quote.length +
        ');n.dispatchEvent(new Event("select"));return true',
    );
    const explanation = await requestFrom(
      ".mw-body .book-assistant-actions",
      "Seçili pasajı açıkla",
      2,
    );
    assert.equal(explanation.context.selectedText, quote);
    assert.equal(explanation.context.chapterText, "");
    assert.equal(explanation.context.chapterTextComplete, false);
    const oldScope = await run("return aiSourceScope()");
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value+=" Changed after the first 8k.";n.dispatchEvent(new Event("input"));return true',
    );
    assert.notEqual(await run("return aiSourceScope()"), oldScope);
    await run(
      'playerJobEvent({type:"chat",text:"MUST_NOT_ATTACH_TO_CHANGED_BOOK"});playerJobEvent({type:"exit",code:0});return true',
    );
    await until(
      () => run("return !state.running&&!player.job"),
      "stale reply retired",
    );
    assert(
      !(await run(
        'return document.getElementById("aiChatLog").textContent.includes("MUST_NOT_ATTACH_TO_CHANGED_BOOK")',
      )),
    );
    await run(
      'window.originalBookActions=BookAssistantActions;window.BookAssistantActions={...originalBookActions,prepare:async(...args)=>{const result=await originalBookActions.prepare(...args);await new Promise(resolve=>window.releaseBookAction=resolve);return result;}};[...document.querySelectorAll(".mw-body .book-assistant-actions button")].find(b=>b.textContent==="Bölümü özetle").click();return true',
    );
    await until(
      () => run('return typeof releaseBookAction==="function"'),
      "async book preparation held",
    );
    await run(
      'const n=document.querySelector("textarea[data-chapter]");n.value+=" Another edit while preparing.";n.dispatchEvent(new Event("input"));releaseBookAction();window.BookAssistantActions=originalBookActions;return true',
    );
    await until(
      () =>
        run(
          'return document.querySelector(".mw-body .book-assistant-note").textContent.includes("Kaynak değişti")',
        ),
      "prepared action rejects changed draft",
    );
    assert.equal(await run("return bookRequests.length"), 2);
    await run(
      'await aiChatSend("STALE_EXPLICIT_SCOPE",null,"stale-token");return true',
    );
    assert.equal(await run("return bookRequests.length"), 2);
    // Narrated reader uses the same reviewed text, without rewriting or requiring a provider.
    const saved = await run(
      'const n=document.querySelector("textarea[data-chapter]");return window.api.mediaWorkflows({action:"book-save",id:' +
        JSON.stringify(id) +
        ",chapter:0,text:n.value})",
    );
    assert(saved.ok, saved.error);
    const prep = await run(
      'return window.api.mediaWorkflows({action:"book-prepare",id:' +
        JSON.stringify(id) +
        ",chapter:0})",
    );
    assert(prep.ok, prep.error);
    const wav = path.join(out, "fixture.wav");
    fs.writeFileSync(wav, require("./helpers/wav-fixture")(24000));
    service.capture({
      id: prep.request.id,
      path: wav,
      quality: {
        groups: [
          {
            key: "1",
            status: "ready",
            displayText: saved.project.chapters[0].text,
            audioStart: 0,
            audioEnd: 1,
          },
        ],
      },
    });
    await run(
      '[...document.querySelectorAll(".mw-transport button")].find(b=>b.textContent==="Dinle ve takip et").click();return true',
    );
    await until(
      () =>
        run('return !!document.querySelector(".mw-reading-text .mw-spoken")'),
      "narrated reader",
    );
    const narrated = await requestFrom(
      ".mw-body .book-assistant-actions",
      "Bölümü özetle",
      3,
    );
    assert.equal(narrated.context.chapterText, saved.project.chapters[0].text);
    await finish();
    await run(
      'document.querySelector("dialog.mw-dialog").close();await MediaShelfUI.openPdfPage(' +
        JSON.stringify(pdf) +
        ",2);return true",
    );
    await until(
      () =>
        run(
          'return PdfReaderExperience.context()?.page===2&&PdfReaderExperience.context().excerpt.includes("Second page")',
        ),
      "PDF page two context",
    );
    const page = await requestFrom(
      "#pdfBookAssistant .book-assistant-actions",
      "Sayfayı özetle",
      4,
    );
    assert.equal(page.context.page, 2);
    assert.equal(page.context.type, "book-page");
    assert(page.context.chapterText.includes("Second page evidence."));
    assert(!page.context.chapterText.includes("First page reference."));
    await finish();
    await capture(win.webContents, "pdf-page-actions-tr.png");
    // Real EPUB source reader shares the same action component and its chapter identity.
    require("node:child_process").execFileSync(
      require("./python-runtime").findTestPython(),
      [
        "-c",
        "import sys;sys.path.insert(0,'backend');from test_media_shelf import ShelfParsingTests;ShelfParsingTests().epub(sys.argv[1])",
        out,
      ],
      { cwd: root, windowsHide: true },
    );
    selectedFile = path.join(out, "Öykü.epub");
    const library = await run(
      'return window.api.mediaShelf({action:"book-import"})',
    );
    assert(library.ok, library.error);
    const shelf = await run('return window.api.mediaShelf({action:"list"})');
    assert(shelf.ok, shelf.error);
    const book = shelf.books.find((b) => b.format === "epub");
    assert(book);
    await run(
      'document.getElementById("pdfReaderClose").click();await MediaShelfUI.openBook(' +
        JSON.stringify(book.id) +
        ');const s=document.querySelector(".ms-reader select");s.value="1";s.dispatchEvent(new Event("change"));return true',
    );
    const epub = await requestFrom(
      ".ms-reader .book-assistant-actions",
      "Bölümü özetle",
      5,
    );
    assert.equal(epub.context.id, book.id + ":1");
    assert(epub.context.chapterText.trim());
    await finish();

    assert(await run('return !document.querySelector(".ms-reader>.book-assistant-actions") && !document.querySelector(".ms-reader .book-assistant-compact").open'));
    await run('document.querySelector(".ms-reader .book-assistant-compact>summary").click();return true');
    assert(await run('return document.querySelector(".ms-reader .book-assistant-compact").open'));
    await capture(win.webContents, "epub-assistant-menu-tr.png");
    win.setMinimumSize(640,600);win.setContentSize(800,800);
    await capture(win.webContents,"epub-assistant-narrow-tr.png");
    assert(await run('const b=document.querySelector(".ms-reader .book-assistant-panel").getBoundingClientRect();return b.left>=0 && b.right<=innerWidth && b.bottom<=innerHeight'));
    win.setContentSize(1440,1000);

    await run('document.querySelector(".ms-reader .book-assistant-compact").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));return true');
    assert(await run('return !!document.querySelector(".ms-reader[open]") && !document.querySelector(".ms-reader .book-assistant-compact").open'));
    await capture(win.webContents, "epub-chapter-actions-tr.png");
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          ok: true,
          requests: 5,
          sourceKinds: [
            summary.context.type,
            narrated.context.type,
            page.context.type,
            epub.context.type,
          ],
          chapterCharacters: text.length,
          ai: "controlled start boundary/replies; no provider call",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, out }));
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
