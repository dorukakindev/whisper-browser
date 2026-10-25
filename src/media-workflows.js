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
}) {
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
    chapters: d.chapters.map((c) => ({
      ...c,
      output: c.output ? path.basename(c.output) : null,
    })),
  });
  async function parser(request) {
    return JSON.parse(
      await run(
        python(),
        [path.join(__dirname, "..", "backend", "media_shelf.py")],
        JSON.stringify(request),
        null,
        60000,
      ),
    );
  }
  async function bookImport() {
    const selected = await dialog.showOpenDialog(owner(), {
      properties: ["openFile"],
      filters: [{ name: "Books", extensions: ["epub", "pdf", "txt"] }],
    });
    if (selected.canceled) return { ok: true, canceled: true };
    const source = fs.realpathSync(selected.filePaths[0]);
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
        text: c.text,
        status: "pending",
      })),
    };
    save(project);
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
        ["book-save", "book-prepare", "book-listen", "book-progress"].includes(
          r.action,
        ) &&
        (!Number.isInteger(r.chapter) || r.chapter < 0 || r.chapter >= 1000)
      )
        throw Error("Invalid chapter index.");
      switch (r.action) {
        case "book-import":
          return await bookImport();
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
                  return [{ id, title: d.title, chapters: d.chapters.length }];
                } catch {
                  return [];
                }
              }),
          };
        }
        case "book-open":
          return { ok: true, project: clean(load(r.id)) };
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
          const srt = path.join(
            path.dirname(file(d.id)),
            `chapter-${c.id}-${hash(c.text).slice(0, 16)}.srt`,
          );
          atomicWriteFileSync(srt, chapterSrt(c.text));
          grantSubtitle(srt);
          const jobId = "book-" + randomUUID();
          pending.set(jobId, { id: d.id, chapter: c.id, hash: hash(c.text) });
          while (pending.size > 50) pending.delete(pending.keys().next().value);
          return {
            ok: true,
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
                c.status === "review" && c.textHash === hash(c.text)
                  ? (c.groups || [])
                      .filter(
                        (g) =>
                          g.status !== "ready" && typeof g.key === "string",
                      )
                      .map((g) => g.key)
                  : [],
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
          c.position = r.position;
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
          };
        }
        case "book-export": {
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
          const pick = await dialog.showSaveDialog(owner(), {
            defaultPath: path.join(
              voiceStorage(app).output,
              `${d.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100)}.m4b`,
            ),
            filters: [{ name: "Audiobook", extensions: ["m4b"] }],
          });
          if (pick.canceled) return { ok: true, canceled: true };
          if (!/\.m4b$/i.test(pick.filePath)) pick.filePath += ".m4b";
          const dir = path.dirname(file(d.id)),
            meta = path.join(dir, "export-" + randomUUID() + ".txt"),
            temp = path.join(
              path.dirname(pick.filePath),
              ".audiobook-" + randomUUID() + ".m4b",
            );
          let cursor = 0,
            metadata = ";FFMETADATA1\n";
          const escape = (s) => String(s).replace(/[\\=;#\n\r]/g, " ");
          metadata += `title=${escape(d.title)}\nartist=${escape(d.author)}\n`;
          const files = chapters.map((c) =>
            path.join(dir, path.basename(c.output)),
          );
          if (files.some((f) => fs.lstatSync(f).isSymbolicLink()))
            throw Error("Symbolic audio paths are not supported.");
          for (let i = 0; i < files.length; i++) {
            const seconds = Number(
              (
                await run(
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
                  null,
                  15000,
                )
              ).trim(),
            );
            if (!Number.isFinite(seconds) || seconds <= 0)
              throw Error("Invalid chapter audio.");
            metadata += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(cursor * 1000)}\nEND=${Math.round((cursor + seconds) * 1000)}\ntitle=${escape(chapters[i].title)}\n`;
            cursor += seconds;
          }
          atomicWriteFileSync(meta, metadata);
          try {
            await run(
              ffmpeg(),
              [
                "-nostdin",
                "-y",
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
              null,
              600000,
            );
            fs.renameSync(temp, pick.filePath);
            grantMedia(pick.filePath);
            return { ok: true, path: pick.filePath };
          } finally {
            for (const f of [temp, meta]) fs.rmSync(f, { force: true });
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
                fs.linkSync(temp, target);
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
