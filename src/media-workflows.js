"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { atomicWriteFileSync } = require("./fsync-utils");
const { voiceStorage } = require("./voice-storage");
const { run } = require("./browser-media-tools");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const idOK = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
const stamp = (seconds) => {
  const n = Math.round(seconds * 1000);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
};
function chapterSrt(text) {
  const parts = [];
  let current = "";
  for (const sentence of text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n\s*\n/)
    .filter(Boolean)) {
    for (const word of sentence.split(/\s+/)) {
      if (current.length + word.length > 280 && current) {
        parts.push(current);
        current = "";
      }
      current += (current ? " " : "") + word;
    }
    if (current.length >= 160) {
      parts.push(current);
      current = "";
    }
  }
  if (current) parts.push(current);
  if (!parts.length || parts.length > 1000)
    throw Error("Chapter is empty or too large / Bölüm boş veya çok büyük.");
  let cursor = 0;
  return (
    "\ufeff" +
    parts
      .map((text, i) => {
        const start = cursor;
        cursor += Math.max(1, text.split(/\s+/).length / 2.5);
        return `${i + 1}\n${stamp(start)} --> ${stamp(cursor)}\n${text}\n`;
      })
      .join("\n")
  );
}
function fileDigest(file) {
  const digest = createHash("sha256"),
    fd = fs.openSync(file, "r"),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null)))
      digest.update(buffer.subarray(0, size));
    return digest.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
function workflowMessage(message, locale) {
  if (locale !== "tr") return String(message).split(" / ")[0];
  const parts = String(message).split(" / ");
  if (parts.length > 1) return parts.slice(1).join(" / ");
  const tr = {
    "Invalid project.": "Proje kaydı geçersiz.",
    "Project too large.": "Proje kaydı çok büyük.",
    "PDF exceeds 100 MB.": "PDF 100 MB sınırını aşıyor.",
    "PDF exceeds 1000 pages.": "PDF 1000 sayfa sınırını aşıyor.",
    "PDF text too large.": "PDF metni çok büyük.",
    "The project library is limited to 100 books.":
      "En fazla 100 kitap projesi saklanabilir.",
    "Chapter output collision.": "Bölüm ses dosyasında çakışma var.",
    "Choose a season folder with 1–40 videos.":
      "1–40 video içeren bir sezon klasörü seç.",
    "At least two episodes are required.": "En az iki bölüm gerekli.",
    "Cancelled.": "İptal edildi.",
    "Episode files changed during analysis; scan again.":
      "Bölüm dosyaları analiz sırasında değişti; yeniden tara.",
    "Subtitle too large.": "Altyazı çok büyük.",
    "Video changed during alignment.": "Video senkron sırasında değişti.",
    "Invalid chapter index.": "Bölüm numarası geçersiz.",
    "Invalid chapter text.": "Bölüm metni geçersiz.",
    "Choose a chapter.": "Bir bölüm seç.",
    "Invalid page selection.": "Sayfa seçimi geçersiz.",
    "Invalid reading position.": "Okuma konumu geçersiz.",
    "Not a PDF project.": "Bu bir PDF projesi değil.",
    "PDF changed; import it again.": "PDF değişti; yeniden içe aktar.",
    "Invalid chapter audio.": "Bölüm sesi geçersiz.",
    "Choose 1–100 chapters.": "1–100 bölüm seç.",
    "Invalid chapter selection.": "Bölüm seçimi geçersiz.",
    "Symbolic audio paths are not supported.":
      "Sembolik bağlantılı ses yolları desteklenmiyor.",
    "A workflow is running.": "Bir işlem çalışıyor.",
    "Preview expired.": "Önizlemenin süresi doldu.",
    "Select preview rows.": "Önizlemeden satır seç.",
    "Invalid selection.": "Seçim geçersiz.",
    "Source changed; preview again.": "Kaynak değişti; yeniden önizle.",
    "An aligned copy exists; preview again.":
      "Senkron kopyası zaten var; yeniden önizle.",
    "Unknown workflow.": "Bilinmeyen işlem.",
  };
  return tr[message] || "İşlem tamamlanamadı: " + message;
}
function registerMediaWorkflows({
  app,
  ipcMain,
  authorized,
  dialog,
  owner,
  python,
  ffmpeg,
  ffprobe,
  grantSubtitle,
  grantMedia,
  inspectMedia,
  resources,
  grantPdf,
  resolvePdf,
  runTool = run,
  voiceRunning = () => false,
  statfs = fs.statfsSync,
  resolveShelfBook,
  linkShelfBook,
}) {
  const exportLocks = new Set();
  const pending = new Map(),
    plans = new Map(),
    controllers = new Map();
  const root = () => path.join(voiceStorage(app).input, "Kitap projeleri");
  const file = (id) => {
    if (!idOK(id)) throw Error("Invalid project.");
    return path.join(root(), id, "project.json");
  };
  function load(id) {
    const p = file(id);
    if (fs.statSync(p).size > 6000000) throw Error("Project too large.");
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    if (
      d.version !== 1 ||
      d.id !== id ||
      !Array.isArray(d.chapters) ||
      d.chapters.length > 1000 ||
      typeof d.title !== "string" ||
      d.chapters.some(
        (c, i) =>
          !c ||
          c.id !== i ||
          typeof c.text !== "string" ||
          typeof c.title !== "string",
      )
    )
      throw Error("Invalid project.");
    return d;
  }
  const save = (d) => {
    fs.mkdirSync(path.dirname(file(d.id)), { recursive: true });
    atomicWriteFileSync(file(d.id), JSON.stringify(d));
  };
  const clean = (d) => ({
    ...d,
    source: undefined,
    audiobook: d.audiobook ? { ...d.audiobook, path: undefined } : undefined,
    chapters: d.chapters.map((c) => ({
      ...c,
      output: c.output ? path.basename(c.output) : null,
    })),
  });
  function audiobookInfo(d) {
    const a = d.audiobook;
    if (
      !a ||
      !idOK(a.id) ||
      typeof a.path !== "string" ||
      !path.isAbsolute(a.path) ||
      !/\.m4b$/i.test(a.path) ||
      !Array.isArray(a.chapters) ||
      !a.chapters.length ||
      a.chapters.length > 1000
    )
      return null;
    let available = false;
    try {
      const stat = fs.lstatSync(a.path);
      available =
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.size === a.size &&
        stat.mtimeMs === a.mtimeMs;
    } catch {}
    return {
      id: a.id,
      projectId: d.id,
      shelfId: d.shelfBookId || null,
      name: path.basename(a.path),
      chapters: a.chapters.length,
      seconds: a.seconds,
      available,
      current: a.chapters.every(
        (c) =>
          d.chapters[c.chapter]?.textHash === c.textHash &&
          hash(d.chapters[c.chapter]?.text || "") === c.textHash,
      ),
    };
  }
  async function parser(request) {
    return JSON.parse(
      await runTool(
        python(),
        [path.join(__dirname, "..", "backend", "media_shelf.py")],
        JSON.stringify(request),
        null,
        60000,
      ),
    );
  }
  async function bookImport(shelfId) {
    const shelf = shelfId ? resolveShelfBook?.(shelfId) : null;
    if (shelfId && !shelf) throw Error("Book not found in library.");
    const selected = shelf
      ? { filePaths: [shelf.path] }
      : await dialog.showOpenDialog(owner(), {
          properties: ["openFile"],
          filters: [{ name: "Books", extensions: ["epub", "pdf", "txt"] }],
        });
    if (selected.canceled) return { ok: true, canceled: true };
    if (
      shelf &&
      (!path.isAbsolute(shelf.path) ||
        /^[\\/]{2}/.test(shelf.path) ||
        ![".pdf", ".epub", ".txt"].includes(
          path.extname(shelf.path).toLowerCase(),
        ))
    )
      throw Error("Select a local book file again before starting production.");
    const source = fs.realpathSync(selected.filePaths[0]);
    if (shelf) {
      for (const id of fs.existsSync(root())
        ? fs.readdirSync(root()).filter(idOK)
        : []) {
        const d = load(id);
        if (d.shelfBookId === shelf.id && !d.archived) {
          const info = fs.statSync(source);
          if (info.size !== d.sourceSize || info.mtimeMs !== d.sourceMtime)
            throw Error(
              "Source book changed; archive the older production project before importing the changed book.",
            );
          if (shelf.productionProjectId !== d.id)
            linkShelfBook?.(shelf.id, d.id);
          return { ok: true, project: clean(d) };
        }
      }
    }
    let book;
    if (path.extname(source).toLowerCase() === ".pdf") {
      if (fs.statSync(source).size > 100 * 1024 * 1024)
        throw Error("PDF exceeds 100 MB.");
      const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = pdf.getDocument({
        data: new Uint8Array(fs.readFileSync(source)),
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
      });
      try {
        const doc = await task.promise;
        if (doc.numPages > 1000) throw Error("PDF exceeds 1000 pages.");
        const chapters = [];
        let length = 0;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i),
            content = await page.getTextContent();
          let text = "";
          for (const item of content.items)
            if (typeof item.str === "string")
              text += item.str + (item.hasEOL ? "\n" : " ");
          length += text.length;
          if (length > 900000) throw Error("PDF text too large.");
          if (text.trim())
            chapters.push({
              title: `Page / Sayfa ${i}`,
              pageNumber: i,
              text: text.trim(),
            });
          page.cleanup();
        }
        book = {
          title: path.basename(source, ".pdf"),
          author: "",
          format: "pdf",
          numPages: doc.numPages,
          chapters,
        };
      } finally {
        await task.destroy();
      }
    } else book = await parser({ action: "book", path: source });
    if (!book.chapters?.length)
      throw Error(
        "No readable text. Scanned PDFs require OCR / Okunabilir metin yok; taranmış PDF için OCR gerekir.",
      );
    fs.mkdirSync(root(), { recursive: true });
    if (fs.readdirSync(root()).filter(idOK).length >= 100)
      throw Error("The project library is limited to 100 books.");
    const project = {
      version: 1,
      id: randomUUID(),
      title: book.title,
      author: book.author || "",
      cover:
        typeof (shelf?.cover || book.cover) === "string" &&
        (shelf?.cover || book.cover).length <= 350000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(
          shelf?.cover || book.cover,
        )
          ? shelf?.cover || book.cover
          : "",
      shelfBookId: shelf?.id || null,
      created: new Date().toISOString(),
      format: book.format,
      numPages: book.numPages || null,
      source,
      sourceSize: fs.statSync(source).size,
      sourceMtime: fs.statSync(source).mtimeMs,
      chapters: book.chapters.map((c, i) => ({
        id: i,
        title: c.title || String(i + 1),
        pageNumber: c.pageNumber || null,
        sourceId:
          typeof c.sourceId === "string" && /^[a-f0-9]{64}$/.test(c.sourceId)
            ? c.sourceId
            : null,
        sourceSpineIndex:
          Number.isInteger(c.sourceSpineIndex) &&
          c.sourceSpineIndex >= 0 &&
          c.sourceSpineIndex < 5000
            ? c.sourceSpineIndex
            : null,
        text: c.text,
        status: "pending",
      })),
    };
    save(project);
    if (shelf) linkShelfBook?.(shelf.id, project.id);
    return { ok: true, project: clean(project) };
  }
  function capture(output) {
    const p = pending.get(output.id);
    if (!p) return;
    pending.delete(output.id);
    try {
      const d = load(p.id),
        c = d.chapters[p.chapter];
      if (hash(c.text) !== p.hash) return;
      const folder = path.dirname(file(d.id)),
        target = path.join(
          folder,
          `${p.chapter}-${p.hash.slice(0, 16)}-${fileDigest(output.path).slice(0, 16)}.wav`,
        );
      if (!fs.existsSync(target))
        fs.copyFileSync(output.path, target, fs.constants.COPYFILE_EXCL);
      else if (fileDigest(target) !== fileDigest(output.path))
        throw Error("Chapter output collision.");
      if (c.output !== target) c.position = 0;
      c.output = target;
      c.textHash = p.hash;
      c.groups =
        output.quality?.groups?.map((g) => ({
          text: g.displayText || g.text || "",
          start: g.audioStart,
          end: g.audioEnd,
          key: g.key,
          status: g.status,
        })) || [];
      c.status =
        output.quality?.groups?.length &&
        output.quality.groups.every((g) => g.status === "ready")
          ? "ready"
          : "review";
      c.voiceSettings = output.settings || {};
      c.activeJob = null;
      c.lastOutputId = output.id;
      save(d);
    } catch (error) {
      app.emit?.("media-workflow-error", error.message);
    }
  }
  const emit = (sender, event) => {
    if (!sender.isDestroyed()) sender.send("media-workflows:event", event);
  };
  async function scanSeason(e, request, controller) {
    const selection = await dialog.showOpenDialog(owner(), {
      properties: ["openDirectory"],
    });
    if (selection.canceled) return { ok: true, canceled: true };
    const dir = fs.realpathSync(selection.filePaths[0]),
      names = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((v) => v.isFile());
    const videos = names
      .filter((v) => /\.(mkv|mp4|webm|avi|mov)$/i.test(v.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!videos.length || videos.length > 40)
      throw Error("Choose a season folder with 1–40 videos.");
    const plan = {
      id: randomUUID(),
      owner: e.sender.id,
      kind: request.action,
      created: Date.now(),
      rows: [],
    };
    const analysis =
      require("./browser-video-analysis").createBrowserVideoAnalysis({
        pythonPath: python(),
        ffmpegPath: ffmpeg(),
        ffprobePath: ffprobe(),
      });
    if (request.action === "season-intro") {
      if (videos.length < 2) throw Error("At least two episodes are required.");
      const fingerprint = () =>
        hash(
          JSON.stringify([
            "season-spectral-v2",
            dir,
            ...videos.map((v) => {
              const s = fs.statSync(path.join(dir, v.name));
              return [v.name, s.size, s.mtimeMs];
            }),
          ]),
        );
      const signature = fingerprint(),
        cache = path.join(
          app.getPath("userData"),
          "season-analysis",
          signature + ".json",
        );
      if (fs.existsSync(cache) && fs.statSync(cache).size < 4000000) {
        const cached = JSON.parse(fs.readFileSync(cache, "utf8"));
        return { ok: true, ...cached, cached: true };
      }
      for (let i = 0; i < videos.length; i++) {
        if (controller.signal.aborted) throw Error("Cancelled.");
        emit(e.sender, {
          id: request.id,
          stage: "intro",
          done: i,
          total: videos.length,
        });
        const current = path.join(dir, videos[i].name),
          refs = videos
            .filter((_, j) => j !== i)
            .slice(0, 2)
            .map((v) => path.join(dir, v.name));
        const opening = await analysis.detectIntro(
          { videoPaths: [current, ...refs], maxScanSeconds: 120 },
          { signal: controller.signal },
        );
        const ending = await analysis.detectIntro(
          {
            videoPaths: [current, ...refs],
            maxScanSeconds: 120,
            fromEnd: true,
          },
          { signal: controller.signal },
        );
        plan.rows.push({
          name: videos[i].name,
          intro: opening.candidates,
          credits: ending.candidates,
          diagnostics: ending.diagnostics,
        });
      }
      if (fingerprint() !== signature)
        throw Error("Episode files changed during analysis; scan again.");
      const result = { rows: plan.rows, suggestOnly: true };
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      atomicWriteFileSync(cache, JSON.stringify(result));
      return { ok: true, ...result, cached: false };
    }
    const align = require("./browser-alignment").createBrowserAlignment({
      pythonPath: python(),
      ffmpegPath: ffmpeg(),
    });
    for (let i = 0; i < videos.length; i++) {
      if (controller.signal.aborted) throw Error("Cancelled.");
      emit(e.sender, {
        id: request.id,
        stage: "sync",
        done: i,
        total: videos.length,
      });
      const v = videos[i].name,
        stem = path.basename(v, path.extname(v));
      const sameStem = videos.filter(
        (n) =>
          path.basename(n.name, path.extname(n.name)).toLowerCase() ===
          stem.toLowerCase(),
      );
      const subs = names.filter(
        (n) => n.name.toLowerCase() === `${stem}.srt`.toLowerCase(),
      );
      if (sameStem.length !== 1) {
        plan.rows.push({ name: v, status: "ambiguous" });
        continue;
      }
      if (subs.length !== 1) {
        plan.rows.push({ name: v, status: "unmatched" });
        continue;
      }
      const sub = path.join(dir, subs[0].name),
        video = path.join(dir, v),
        bytes = fs.readFileSync(sub);
      if (bytes.length > 2000000) throw Error("Subtitle too large.");
      try {
        const decoded =
            require("./browser-textutil").decodeSubtitleBuffer(bytes).text,
          cues = require("./browser-subtitles").parseSubtitlePayload(
            decoded,
            "",
            sub,
          ).cues;
        const beforeStat = fs.statSync(video);
        const result = await align.align(
          { audioPath: video, targetCues: cues },
          { signal: controller.signal, timeoutMs: 480000 },
        );
        const s = fs.statSync(video);
        if (s.size !== beforeStat.size || s.mtimeMs !== beforeStat.mtimeMs)
          throw Error("Video changed during alignment.");
        plan.rows.push({
          name: v,
          status: "preview",
          sub,
          hash: hash(bytes),
          video,
          size: s.size,
          mtime: s.mtimeMs,
          cues,
          times: result.cues.map((c) => [c.start, c.end]),
          diagnostics: result.diagnostics,
          examples: cues.slice(0, 5).map((c, j) => ({
            text: c.text,
            before: [c.start, c.end],
            after: [result.cues[j].start, result.cues[j].end],
          })),
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        plan.rows.push({
          name: v,
          status: "error",
          error: workflowMessage(error.message, request.locale),
        });
      }
    }
    plans.set(plan.id, plan);
    while (plans.size > 10) plans.delete(plans.keys().next().value);
    return {
      ok: true,
      token: plan.id,
      rows: plan.rows.map(
        ({ sub, hash, video, size, mtime, cues, times, ...r }) => r,
      ),
    };
  }
  ipcMain.handle("media-workflows:request", async (e, r = {}) => {
    if (!authorized(e)) return { ok: false, error: "Unauthorized." };
    try {
      if (
        voiceRunning() &&
        [
          "book-save",
          "book-prepare",
          "book-approve",
          "book-archive",
          "book-restore",
          "book-recover",
        ].includes(r.action)
      )
        throw Error("Voice production is running / Ses üretimi sürüyor.");
      if (
        r.id &&
        exportLocks.has(r.id) &&
        [
          "book-save",
          "book-prepare",
          "book-approve",
          "book-rename",
          "book-archive",
          "book-preferences",
          "book-recover",
        ].includes(r.action)
      )
        throw Error("Export in progress / Dışa aktarma sürüyor.");
      if (
        [
          "book-save",
          "book-prepare",
          "book-listen",
          "book-progress",
          "book-source",
          "book-mark-add",
        ].includes(r.action) &&
        (!Number.isInteger(r.chapter) || r.chapter < 0 || r.chapter >= 1000)
      )
        throw Error("Invalid chapter index.");
      switch (r.action) {
        case "book-from-reader": {
          const document = resolvePdf?.(r.pdfHash);
          if (!document)
            throw Error(
              "Reopen the authorized PDF / Onaylı PDF'yi yeniden açın.",
            );
          if (
            !Number.isSafeInteger(r.numPages) ||
            r.numPages < 1 ||
            r.numPages > 1000
          )
            throw Error("Invalid page count.");
          if (
            !Array.isArray(r.pages) ||
            !r.pages.length ||
            r.pages.length > 100
          )
            throw Error("Choose 1–100 pages / 1–100 sayfa seçin.");
          const seen = new Set();
          let length = 0;
          const chapters = r.pages.map((row, i) => {
            if (
              !Number.isSafeInteger(row.pageNumber) ||
              row.pageNumber < 1 ||
              row.pageNumber > r.numPages ||
              seen.has(row.pageNumber) ||
              typeof row.text !== "string" ||
              !row.text.trim() ||
              row.text.length > 100000
            )
              throw Error("Invalid reading page.");
            seen.add(row.pageNumber);
            length += row.text.length;
            if (length > 900000) throw Error("PDF text too large.");
            return {
              id: i,
              title: `Page / Sayfa ${row.pageNumber}`,
              pageNumber: row.pageNumber,
              text: row.text,
              status: "pending",
            };
          });
          fs.mkdirSync(root(), { recursive: true });
          if (fs.readdirSync(root()).filter(idOK).length >= 100)
            throw Error("The project library is limited to 100 books.");
          const stat = fs.statSync(document.filePath);
          const d = {
            version: 1,
            id: randomUUID(),
            title: document.title,
            author: "",
            created: new Date().toISOString(),
            format: "pdf",
            numPages: r.numPages,
            source: document.filePath,
            sourceSize: stat.size,
            sourceMtime: stat.mtimeMs,
            selectedChapters: chapters.map((c) => c.id),
            chapters,
          };
          save(d);
          return { ok: true, project: clean(d) };
        }
        case "book-backup": {
          if (controllers.has(e.sender.id))
            throw Error("Finish the running workflow first.");
          const pick = await dialog.showSaveDialog(owner(), {
            defaultPath: path.join(
              voiceStorage(app).output,
              "book-projects.wbb",
            ),
            filters: [{ name: "Book projects", extensions: ["wbb"] }],
          });
          if (pick.canceled) return { ok: true, canceled: true };
          return {
            ok: true,
            ...require("./book-project-backup").exportBooks(
              root(),
              pick.filePath,
              r.includeAudio === true,
            ),
          };
        }
        case "book-restore": {
          const pick = await dialog.showOpenDialog(owner(), {
            properties: ["openFile"],
            filters: [{ name: "Book projects", extensions: ["wbb"] }],
          });
          if (pick.canceled) return { ok: true, canceled: true };
          return {
            ok: true,
            ...require("./book-project-backup").importBooks(
              root(),
              pick.filePaths[0],
            ),
          };
        }
        case "book-import":
          return await bookImport();
        case "book-from-shelf": {
          if (r.sourceChapter) {
            const shelf = resolveShelfBook?.(r.shelfId);
            if (!shelf) throw Error("Book not found in library.");
            const info = fs.statSync(shelf.path);
            if (
              info.size !== r.sourceChapter.sourceSize ||
              info.mtimeMs !== r.sourceChapter.sourceMtime
            )
              throw Error(
                "Source book changed; reopen it / Kaynak kitap değişti; yeniden açın.",
              );
          }
          const result = await bookImport(r.shelfId);
          if (r.sourceChapter && result.project)
            result.focusChapter = require("./book-chapter-link").focusChapter(
              result.project,
              r.sourceChapter,
            );
          return result;
        }
        case "book-source": {
          const d = load(r.id),
            c = d.chapters[r.chapter],
            shelf = resolveShelfBook?.(d.shelfBookId);
          if (
            !c ||
            !shelf ||
            !d.source ||
            fs.realpathSync(shelf.path) !== fs.realpathSync(d.source)
          )
            throw Error(
              "Source book is unavailable / Kaynak kitap kullanılamıyor.",
            );
          const info = fs.statSync(d.source);
          if (info.size !== d.sourceSize || info.mtimeMs !== d.sourceMtime)
            throw Error(
              "Source book changed; reopen it / Kaynak kitap değişti; yeniden açın.",
            );
          return {
            ok: true,
            shelfId: d.shelfBookId,
            sourceChapter: {
              index: c.id,
              sourceId: c.sourceId,
              sourceSpineIndex: c.sourceSpineIndex,
              pageNumber: c.pageNumber,
              sourceSize: info.size,
              sourceMtime: info.mtimeMs,
            },
          };
        }
        case "book-rename": {
          const d = load(r.id);
          if (
            typeof r.title !== "string" ||
            !r.title.trim() ||
            r.title.length > 300
          )
            throw Error("Invalid title.");
          d.title = r.title.trim();
          save(d);
          return { ok: true, project: clean(d) };
        }
        case "book-archive": {
          const d = load(r.id);

          d.archived = r.archived !== false;
          save(d);
          return { ok: true };
        }
        case "book-preferences": {
          const d = load(r.id),
            v = r.preferences;
          if (
            !v ||
            !["fast", "quality"].includes(v.profile) ||
            ![1, 2, 4, 8].includes(v.concurrency) ||
            !["fast", "balanced", "detailed"].includes(v.verification)
          )
            throw Error("Invalid voice preferences.");
          d.voicePreferences = {
            profile: v.profile,
            concurrency: v.concurrency,
            verification: v.verification,
            referenceId:
              typeof v.referenceId === "string"
                ? v.referenceId.slice(0, 100)
                : "",
          };
          save(d);
          return { ok: true };
        }
        case "book-approve": {
          const d = load(r.id),
            c = d.chapters[r.chapter];
          if (
            !c ||
            c.textHash !== hash(c.text) ||
            !c.output ||
            typeof r.key !== "string"
          )
            throw Error("Current audio required.");
          const g = c.groups?.find((g) => g.key === r.key);
          if (
            !g ||
            g.status !== "review" ||
            !Number.isFinite(g.start) ||
            !Number.isFinite(g.end) ||
            g.start < 0 ||
            g.end <= g.start
          )
            throw Error("Only playable review groups can be acknowledged.");
          const audio = path.join(
            path.dirname(file(d.id)),
            path.basename(c.output),
          );
          const audioStat = fs.lstatSync(audio);
          if (!audioStat.isFile() || audioStat.isSymbolicLink())
            throw Error("Audio missing.");
          g.status = "ready";
          g.manualApproval = {
            at: new Date().toISOString(),
            textHash: c.textHash,
            audioHash: fileDigest(audio),
          };
          c.status = c.groups.every((g) => g.status === "ready")
            ? "ready"
            : "review";
          save(d);
          return { ok: true, project: clean(d) };
        }
        case "book-recover": {
          const d = load(r.id);
          let recovered = 0;
          const notices = [];
          for (const initial of d.chapters) {
            const current = load(d.id),
              c = current.chapters[initial.id];
            const a = c.activeJob;
            if (!a) continue;
            if (a.textHash !== hash(c.text)) {
              notices.push(c.title + ": text changed");
              continue;
            }
            const dir = path.join(app.getPath("userData"), "dub-logs");
            const logs = fs.existsSync(dir)
              ? fs
                  .readdirSync(dir)
                  .filter(
                    (n) => n.startsWith(a.id + "-") && n.endsWith(".json"),
                  )
                  .sort()
                  .reverse()
              : [];
            const log = logs[0] && path.join(dir, logs[0]);
            if (!log || fs.statSync(log).size > 6000000) {
              notices.push(c.title + ": no completion log; resume using cache");
              continue;
            }
            const result = JSON.parse(fs.readFileSync(log, "utf8"));
            if (
              result.id === a.id &&
              ["error", "cancelled"].includes(result.result)
            ) {
              c.activeJob = null;
              save(current);
              notices.push(c.title + ": stopped; cached speech kept");
              continue;
            }
            const expected = path.join(voiceStorage(app).output, a.id + ".wav");
            if (
              result.id !== a.id ||
              result.result !== "done" ||
              result.path !== expected ||
              !result.quality?.groups?.length ||
              !fs.existsSync(expected) ||
              fs.lstatSync(expected).isSymbolicLink() ||
              !fs.statSync(expected).isFile()
            ) {
              notices.push(c.title + ": incomplete; resume using cache");
              continue;
            }
            const fd = fs.openSync(expected, "r"),
              header = Buffer.alloc(12);
            try {
              fs.readSync(fd, header, 0, 12, 0);
            } finally {
              fs.closeSync(fd);
            }
            if (
              header.toString("ascii", 0, 4) !== "RIFF" ||
              header.toString("ascii", 8, 12) !== "WAVE"
            )
              throw Error("Invalid recovered WAV.");
            pending.set(a.id, { id: d.id, chapter: c.id, hash: a.textHash });
            capture({ ...result, id: a.id });
            if (!load(d.id).chapters[c.id].activeJob) recovered++;
          }
          return { ok: true, recovered, notices, project: clean(load(r.id)) };
        }
        case "book-list": {
          fs.mkdirSync(root(), { recursive: true });
          return {
            ok: true,
            projects: fs
              .readdirSync(root())
              .filter(idOK)
              .slice(0, 100)
              .flatMap((id) => {
                try {
                  const d = load(id);
                  return d.archived && !r.archived
                    ? []
                    : [
                        {
                          id,
                          title: d.title,
                          chapters: d.chapters.length,
                          archived: !!d.archived,
                        },
                      ];
                } catch {
                  return [];
                }
              }),
          };
        }
        case "book-open":
          return { ok: true, project: clean(load(r.id)) };
        case "book-audiobooks": {
          if (
            !Array.isArray(r.shelfIds) ||
            r.shelfIds.length > 300 ||
            r.shelfIds.some((id) => typeof id !== "string" || id.length > 120)
          )
            throw Error("Invalid book selection.");
          const audiobooks = [];
          for (const shelfId of new Set(r.shelfIds)) {
            try {
              const shelf = resolveShelfBook?.(shelfId);
              if (!shelf?.productionProjectId) continue;
              const d = load(shelf.productionProjectId);
              if (d.shelfBookId !== shelfId || d.archived) continue;
              const info = audiobookInfo(d);
              if (info) audiobooks.push(info);
            } catch {}
          }
          return { ok: true, audiobooks };
        }
        case "book-audiobook": {
          const d = load(r.id),
            info = audiobookInfo(d);
          if (!info?.available || (r.exportId && r.exportId !== info.id))
            throw Error(
              "Audiobook moved or changed; export it again / Sesli kitap taşınmış veya değişmiş; yeniden dışa aktarın.",
            );
          grantMedia(d.audiobook.path);
          return { ok: true, path: d.audiobook.path, ...info };
        }
        case "book-save": {
          const d = load(r.id),
            c = d.chapters[r.chapter];
          if (
            !c ||
            typeof r.text !== "string" ||
            !r.text.trim() ||
            r.text.length > 100000
          )
            throw Error("Invalid chapter text.");
          if (c.text !== r.text) {
            c.text = r.text;
            c.status = "pending";
          }
          save(d);
          return { ok: true, project: clean(d) };
        }
        case "book-prepare": {
          const d = load(r.id),
            c = d.chapters[r.chapter];
          if (!c) throw Error("Choose a chapter.");
          const audioMatchesText = c.textHash === hash(c.text);
          let retryGroups;
          if (r.retryGroup !== undefined) {
            const retry = r.retryGroup;
            if (
              !retry ||
              typeof retry.key !== "string" ||
              typeof retry.output !== "string" ||
              !c.output ||
              path.basename(c.output) !== retry.output ||
              !c.groups?.some((g) => g.key === retry.key)
            )
              throw Error(
                "The reviewed audio changed; reopen this chapter / İncelenen ses değişti; bölümü yeniden açın.",
              );
            // An edited chapter is rechunked. Its old ordinal can now name an
            // unrelated passage. Let the fresh text/cache identities determine
            // the changed audio, rather than forcing an obsolete group number.
            retryGroups = audioMatchesText ? [retry.key] : [];
          }
          const srt = path.join(
            path.dirname(file(d.id)),
            `chapter-${c.id}-${hash(c.text).slice(0, 16)}.srt`,
          );
          atomicWriteFileSync(srt, chapterSrt(c.text));
          grantSubtitle(srt);
          const jobId = "book-" + randomUUID();
          pending.set(jobId, { id: d.id, chapter: c.id, hash: hash(c.text) });
          c.activeJob = {
            id: jobId,
            textHash: hash(c.text),
            startedAt: new Date().toISOString(),
          };
          save(d);
          while (pending.size > 50) pending.delete(pending.keys().next().value);
          return {
            ok: true,
            replanned: r.retryGroup !== undefined && !audioMatchesText,
            request: {
              id: jobId,
              srt,
              narration: true,
              grouping: "akici",
              timingMode: "video",
              naturalSpeech: false,
              autoFit: false,
              verification: "detailed",
              keepEngine: true,
              forceGroups:
                retryGroups ??
                (c.status === "review" && audioMatchesText
                  ? (c.groups || [])
                      .filter(
                        (g) =>
                          g.status !== "ready" && typeof g.key === "string",
                      )
                      .map((g) => g.key)
                  : []),
            },
          };
        }
        case "book-selection": {
          const d = load(r.id);
          if (
            !Array.isArray(r.chapters) ||
            r.chapters.length > d.chapters.length ||
            r.chapters.some(
              (i) => !Number.isInteger(i) || i < 0 || i >= d.chapters.length,
            )
          )
            throw Error("Invalid page selection.");
          d.selectedChapters = [...new Set(r.chapters)];
          save(d);
          return { ok: true };
        }
        case "book-progress": {
          const d = load(r.id),
            c = d.chapters[r.chapter];
          if (
            !c ||
            !Number.isFinite(r.position) ||
            r.position < 0 ||
            r.position > 172800
          )
            throw Error("Invalid reading position.");
          if (
            (r.outputId !== undefined &&
              path.basename(c.output || "") !== r.outputId) ||
            (r.textHash !== undefined &&
              (c.textHash !== r.textHash || hash(c.text) !== r.textHash))
          )
            throw Error(
              "Audio changed; reopen this chapter / Ses değişti; bölümü yeniden açın.",
            );
          c.position = r.position;
          save(d);
          return { ok: true };
        }
        case "book-mark-list":
          return {
            ok: true,
            bookmarks: require("./book-bookmarks").list(load(r.id)),
          };
        case "book-mark-open":
          return {
            ok: true,
            bookmark: require("./book-bookmarks").open(load(r.id), r.markId),
          };
        case "book-mark-add": {
          const d = load(r.id),
            bookmark = require("./book-bookmarks").add(d, r);
          if (Buffer.byteLength(JSON.stringify(d), "utf8") > 6000000)
            throw Error(
              "Project is too large for another bookmark / Proje yeni yer imi için fazla büyük.",
            );
          save(d);
          return { ok: true, bookmark };
        }
        case "book-mark-remove": {
          const d = load(r.id);
          require("./book-bookmarks").remove(d, r.markId);
          save(d);
          return { ok: true };
        }
        case "book-pdf": {
          const d = load(r.id);
          if (d.format !== "pdf" || !d.source)
            throw Error("Not a PDF project.");
          const stat = fs.statSync(d.source);
          if (stat.size !== d.sourceSize || stat.mtimeMs !== d.sourceMtime)
            throw Error("PDF changed; import it again.");
          grantPdf(d.source);
          return { ok: true, path: d.source };
        }
        case "book-listen": {
          const c = load(r.id).chapters[r.chapter];
          if (!c?.output || c.textHash !== hash(c.text))
            throw Error(
              "Generate the current chapter text first / Önce güncel bölüm metnini seslendir.",
            );
          const target = path.join(
            path.dirname(file(r.id)),
            path.basename(c.output),
          );
          const info = fs.lstatSync(target);
          if (!info.isFile() || info.isSymbolicLink())
            throw Error("Invalid chapter audio.");
          grantMedia(target);
          return {
            ok: true,
            path: target,
            groups: c.groups || [],
            chapter: c.title,
            pageNumber: c.pageNumber || null,
            position: c.position || 0,
            outputId: path.basename(c.output),
            textHash: c.textHash,
          };
        }
        case "book-export-preview":
        case "book-export": {
          if (exportLocks.has(r.id) || controllers.has(e.sender.id))
            throw Error("A workflow is running.");
          const exportController = new AbortController();
          const abortExport = () => exportController.abort();
          e.sender.once?.("destroyed", abortExport);
          controllers.set(e.sender.id, exportController);
          exportLocks.add(r.id);
          const diskFree = (directory) => {
            try {
              const info = statfs(directory, { bigint: true });
              const bytes = BigInt(info.bavail) * BigInt(info.bsize);
              return bytes >= 0n
                ? Number(
                    bytes > BigInt(Number.MAX_SAFE_INTEGER)
                      ? BigInt(Number.MAX_SAFE_INTEGER)
                      : bytes,
                  )
                : null;
            } catch {
              return null;
            }
          };
          let meta, temp;
          try {
            const d = load(r.id);
            if (
              !Array.isArray(r.chapters) ||
              !r.chapters.length ||
              r.chapters.length > 100
            )
              throw Error("Choose 1–100 chapters.");
            if (
              r.chapters.some((i) => !Number.isInteger(i) || i < 0 || i >= 1000)
            )
              throw Error("Invalid chapter selection.");
            const indices = [...new Set(r.chapters)].sort((a, b) => a - b),
              chapters = indices.map((i) => d.chapters[i]);
            if (
              chapters.some(
                (c) =>
                  !c?.output ||
                  c.status !== "ready" ||
                  c.textHash !== hash(c.text),
              )
            )
              throw Error(
                "Selected chapters need ready, current speech / Seçili bölümlerin güncel ve onaylı sesi gerekli.",
              );
            const dir = path.dirname(file(d.id)),
              files = chapters.map((c) =>
                path.join(dir, path.basename(c.output)),
              );
            for (const f of files) {
              const st = fs.lstatSync(f);
              if (st.isSymbolicLink() || !st.isFile())
                throw Error("Invalid chapter audio.");
            }
            const escape = (value) =>
              String(value || "").replace(/[\\=;#\n\r]/g, " ");
            let cursor = 0,
              metadata = `;FFMETADATA1\ntitle=${escape(d.title)}\nartist=${escape(d.author)}\n`;
            const rows = [];
            emit(e.sender, {
              type: "progress",
              projectId: d.id,
              stage: "probe",
              text: "M4B: checking audio / Ses denetleniyor",
            });
            for (let i = 0; i < files.length; i++) {
              if (exportController.signal.aborted)
                throw Error("Export cancelled.");
              const seconds = Number(
                (
                  await runTool(
                    ffprobe(),
                    [
                      "-v",
                      "error",
                      "-show_entries",
                      "format=duration",
                      "-of",
                      "csv=p=0",
                      files[i],
                    ],
                    "",
                    exportController.signal,
                    15000,
                    null,
                    { waitForCloseOnCancel: true },
                  )
                ).trim(),
              );
              if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 172800)
                throw Error("Invalid chapter audio.");
              metadata += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(cursor * 1000)}\nEND=${Math.round((cursor + seconds) * 1000)}\ntitle=${escape(chapters[i].title)}\n`;
              rows.push({
                chapter: indices[i],
                title: chapters[i].title,
                seconds,
              });
              cursor += seconds;
            }
            // AAC target bitrate plus a small container allowance; never an exact size promise.
            const estimatedBytes =
              Math.ceil(((cursor * 160000) / 8) * 1.03) + 1024 * 1024;
            if (exportController.signal.aborted)
              throw Error("Export cancelled.");
            if (r.action === "book-export-preview")
              return {
                ok: true,
                chapters: rows,
                seconds: cursor,
                estimatedBytes,
                bitrate: 160000,
                freeBytes: diskFree(voiceStorage(app).output),
              };
            const pick = await dialog.showSaveDialog(owner(), {
              defaultPath: path.join(
                voiceStorage(app).output,
                `${d.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100)}.m4b`,
              ),
              filters: [{ name: "Audiobook", extensions: ["m4b"] }],
            });
            if (pick.canceled) return { ok: true, canceled: true };
            if (exportController.signal.aborted)
              throw Error("Export cancelled.");
            if (!/\.m4b$/i.test(pick.filePath)) pick.filePath += ".m4b";
            const freeBytes = diskFree(path.dirname(pick.filePath));
            if (freeBytes !== null && freeBytes < estimatedBytes)
              throw Error(
                "Not enough free space for the estimated audiobook / Tahmini sesli kitap için yeterli boş alan yok.",
              );
            meta = path.join(dir, "export-" + randomUUID() + ".txt");
            temp = path.join(
              path.dirname(pick.filePath),
              ".audiobook-" + randomUUID() + ".m4b",
            );
            atomicWriteFileSync(meta, metadata);
            let lastUpdate = 0,
              lastPercent = 0;
            const reportProgress = (line) => {
              const match = /^out_time_us=(\d+)\s*$/.exec(line);
              if (!match) return;
              const rawSeconds = Number(match[1]) / 1000000;
              if (!Number.isFinite(rawSeconds)) return;
              const seconds = Math.min(cursor, rawSeconds);
              const percent = Math.max(
                  lastPercent,
                  Math.min(99, Math.floor((seconds / cursor) * 100)),
                ),
                now = Date.now();
              if (now - lastUpdate < 250) return;
              lastUpdate = now;
              lastPercent = percent;
              emit(e.sender, {
                type: "progress",
                projectId: d.id,
                stage: "encoding",
                percent,
                processedSeconds: seconds,
                totalSeconds: cursor,
                text: `M4B: ${percent}%`,
              });
            };
            emit(e.sender, {
              type: "progress",
              projectId: d.id,
              stage: "encoding",
              percent: 0,
              totalSeconds: cursor,
              text: "M4B: 0%",
            });
            await runTool(
              ffmpeg(),
              [
                "-nostdin",
                "-y",
                "-loglevel",
                "error",
                "-nostats",
                "-stats_period",
                "0.5",
                "-progress",
                "pipe:2",
                ...files.flatMap((f) => ["-i", f]),
                "-i",
                meta,
                "-filter_complex",
                files.map((_, i) => `[${i}:a]`).join("") +
                  `concat=n=${files.length}:v=0:a=1[a]`,
                "-map",
                "[a]",
                "-map_metadata",
                String(files.length),
                "-map_chapters",
                String(files.length),
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                temp,
              ],
              "",
              exportController.signal,
              600000,
              reportProgress,
              { waitForCloseOnCancel: true },
            );
            if (exportController.signal.aborted)
              throw Error("Export cancelled.");
            fs.renameSync(temp, pick.filePath);
            const stat = fs.statSync(pick.filePath),
              latest = load(d.id);
            latest.audiobook = {
              id: randomUUID(),
              path: path.resolve(pick.filePath),
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              seconds: cursor,
              createdAt: new Date().toISOString(),
              chapters: indices.map((chapter) => ({
                chapter,
                textHash: d.chapters[chapter].textHash,
              })),
            };
            save(latest);
            grantMedia(pick.filePath);
            emit(e.sender, {
              type: "progress",
              projectId: d.id,
              stage: "complete",
              percent: 100,
              processedSeconds: cursor,
              totalSeconds: cursor,
              text: "M4B: 100%",
            });
            return { ok: true, path: pick.filePath };
          } catch (error) {
            if (exportController.signal.aborted)
              throw Error("Export cancelled / Dışa aktarma iptal edildi.");
            throw error;
          } finally {
            try {
              for (const f of [temp, meta])
                if (f) fs.rmSync(f, { force: true });
            } finally {
              e.sender.removeListener?.("destroyed", abortExport);
              exportLocks.delete(r.id);
              if (controllers.get(e.sender.id) === exportController)
                controllers.delete(e.sender.id);
            }
          }
        }
        case "batch-sync":
        case "season-intro": {
          if (controllers.has(e.sender.id))
            throw Error("A workflow is running.");
          const controller = new AbortController();
          controllers.set(e.sender.id, controller);
          const stop = () => controller.abort();
          e.sender.once("destroyed", stop);
          try {
            return await scanSeason(e, r, controller);
          } finally {
            controllers.delete(e.sender.id);
            e.sender.removeListener("destroyed", stop);
          }
        }
        case "cancel":
          controllers.get(e.sender.id)?.abort();
          return { ok: true };
        case "sync-apply": {
          const p = plans.get(r.token);
          if (!p || p.owner !== e.sender.id || Date.now() - p.created > 1800000)
            throw Error("Preview expired.");
          if (!Array.isArray(r.names) || !r.names.length)
            throw Error("Select preview rows.");
          const rows = p.rows.filter(
            (row) => r.names.includes(row.name) && row.status === "preview",
          );
          if (rows.length !== new Set(r.names).size)
            throw Error("Invalid selection.");
          for (const row of rows) {
            const stat = fs.statSync(row.video);
            if (
              hash(fs.readFileSync(row.sub)) !== row.hash ||
              stat.size !== row.size ||
              stat.mtimeMs !== row.mtime
            )
              throw Error("Source changed; preview again.");
          }
          const written = [],
            targets = rows.map((row) =>
              row.sub.replace(/\.srt$/i, `.aligned-${p.id.slice(0, 8)}.srt`),
            );
          if (targets.some((f) => fs.existsSync(f)))
            throw Error("An aligned copy exists; preview again.");
          try {
            for (const [i, row] of rows.entries()) {
              const target = targets[i],
                temp = target + "." + randomUUID() + ".tmp";
              try {
                fs.writeFileSync(
                  temp,
                  "\ufeff" +
                    row.cues
                      .map(
                        (c, j) =>
                          `${j + 1}\n${stamp(row.times[j][0])} --> ${stamp(row.times[j][1])}\n${c.text}\n`,
                      )
                      .join("\n"),
                  { encoding: "utf8", flag: "wx" },
                );
                try {
                  fs.linkSync(temp, target);
                } catch (error) {
                  if (
                    !["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(
                      error.code,
                    )
                  )
                    throw error;
                  let fd = null,
                    owned = false;
                  try {
                    fd = fs.openSync(target, "wx");
                    owned = true;
                    fs.writeFileSync(fd, fs.readFileSync(temp));
                    fs.fsyncSync(fd);
                  } catch (e) {
                    if (fd !== null) {
                      fs.closeSync(fd);
                      fd = null;
                    }
                    if (owned) fs.rmSync(target, { force: true });
                    throw e;
                  } finally {
                    if (fd !== null) fs.closeSync(fd);
                  }
                }
                written.push(target);
              } finally {
                fs.rmSync(temp, { force: true });
              }
            }
          } catch (error) {
            for (const f of written) fs.rmSync(f, { force: true });
            throw error;
          }
          plans.delete(r.token);
          return { ok: true, written };
        }
        case "resources":
          return { ok: true, ...resources() };
        default:
          throw Error("Unknown workflow.");
      }
    } catch (error) {
      return { ok: false, error: workflowMessage(error.message, r?.locale) };
    }
  });
  return { capture };
}
module.exports = { registerMediaWorkflows, chapterSrt };
