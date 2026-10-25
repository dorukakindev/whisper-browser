const { app, BrowserWindow, dialog } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, ".uiprev", "pdf-reader547-" + Date.now()),
  profile = path.join(out, "profile");
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setPath("downloads", out);
app.setAppPath(root);
app.commandLine.appendSwitch("disable-gpu");
const source = path.join(out, "Okuma denemesi.pdf");
function makePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
  ];
  for (let page = 1; page <= 3; page++) {
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
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents " +
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
    const capture = async (name) => {
      await wait(350);
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
    await capture("reading-tr-dark.png");
    await run('setPdfReaderView("both");return true');
    await capture("parallel-tr-dark.png");
    await run(
      'setPdfReaderView("reading");const p=document.querySelector(".pdf-page-prose p");const range=document.createRange();range.selectNodeContents(p);const s=window.getSelection();s.removeAllRanges();s.addRange(range);return true',
    );
    await wait(120);
    const context = await run("return aiChatContext()");
    assert.equal(context.workspace, "pdf-reader");
    assert(context.excerpt.includes("controlled PDF"));
    assert(context.selectedText);
    await run('document.getElementById("pdfNext").click();return true');
    await wait(350);
    const next = await run("return aiChatContext()");
    assert.equal(next.page, 2);
    assert.equal(next.selectedText, "");
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
      'document.getElementById("pdfVoiceOpen").click();document.getElementById("pdfVoiceFrom").value="2";document.getElementById("pdfVoiceTo").value="3";return true',
    );
    await capture("voice-range.png");
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
    await capture("voice-studio.png");
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
    assert(await run('return !document.querySelector("dialog[open]")'));
    win.setContentSize(1441, 1000);
    await wait(100);
    win.setContentSize(1440, 1000);
    await capture("inline-listening.png");
    await run('document.getElementById("pdfVoiceAudio").pause();return true');
    await run(
      'document.getElementById("mediaWorkflowsDialog")?.close();setPdfReaderView("reading");return true',
    );
    win.setContentSize(820, 900);
    await capture("reading-narrow.png");
    const bounds = await run(
      'const r=document.getElementById("pdfReader");return {client:r.clientWidth,scroll:r.scrollWidth};',
    );
    assert(bounds.scroll <= bounds.client + 2);
    win.setContentSize(1440, 1000);
    await run('UiLocale.set("en",false);applyUiTheme("light");return true');
    await capture("reading-en-light.png");
    await run(
      'document.querySelector(".pdf-reader-tools").open=true;return true',
    );
    await capture("translation-menu-en.png");
    await run('document.getElementById("pdfReaderClose").click();return true');
    assert.equal(await run("return PdfReaderExperience.context()"), null);
    await capture("player-after-close.png");
    await run("closePlayer();return true");
    await capture("home.png");
    await run("AppSettingsUI.open();return true");
    await wait(200);
    await capture("settings.png");
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
    console.log(JSON.stringify({ ok: true, out }));
    app.exit(0);
  })
  .catch((e) => {
    fs.writeFileSync(path.join(out, "error.txt"), e.stack);
    app.exit(1);
  });
setTimeout(() => app.exit(2), 120000).unref();
