"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { gzipSync, gunzipSync } = require("node:zlib"),
  { randomUUID, createHash } = require("node:crypto");
const { atomicWriteFileSync } = require("./fsync-utils");
const digest = (b) => createHash("sha256").update(b).digest("hex");
const LIMIT = 256 * 1024 * 1024;
function safeProject(d) {
  if (!d || !Array.isArray(d.chapters) || d.chapters.length > 1000
      || (Array.isArray(d.bookmarks) && d.bookmarks.length > 100)
      || (Array.isArray(d.selectedChapters) && d.selectedChapters.length > 1000))
    throw Error("Invalid project.");
  const copy = {
    version: 1,
    id: d.id,
    title: d.title,
    author: typeof d.author === "string" ? d.author : "",
    created: d.created,
    format: ["pdf", "epub", "txt"].includes(d.format) ? d.format : "txt",
    numPages: d.numPages,
    archived: d.archived === true,
    source: null,
    selectedChapters: Array.isArray(d.selectedChapters)
      ? d.selectedChapters.filter(Number.isInteger).slice(0, 1000)
      : [],
    chapters: [],
    bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks.map((mark) => ({
      id: mark.id, chapter: mark.chapter, sourceId: mark.sourceId,
      sourceSpineIndex: mark.sourceSpineIndex, pageNumber: mark.pageNumber,
      quote: mark.quote, position: mark.position, textHash: mark.textHash,
      outputId: mark.outputId, groupKey: mark.groupKey, groupText: mark.groupText,
      createdAt: mark.createdAt,
    })) : [],
  };
  for (const c of d.chapters || []) {
    if (!c || typeof c.text !== 'string' || c.text.length > 900000
        || (Array.isArray(c.groups) && (c.groups.length > 5000
          || c.groups.some((g) => typeof g.text !== 'string' || g.text.length > 900000))))
      throw Error("Invalid chapter.");
    copy.chapters.push({
      id: c.id,
      title: c.title,
      pageNumber: c.pageNumber,
      sourceId: c.sourceId,
      sourceSpineIndex: c.sourceSpineIndex,
      text: c.text,
      status: c.status,
      output: c.output || null,
      textHash: c.textHash,
      qualityMissing: c.qualityMissing === true,
      position: Number.isFinite(c.position) && c.position >= 0 ? c.position : 0,
      groups: Array.isArray(c.groups)
        ? c.groups.map((g) => ({
            text: g.text,
            start: g.start,
            end: g.end,
            key: String(g.key || ""),
            status: ["ready", "review", "failed"].includes(g.status)
              ? g.status
              : "review",
            manualApproval: g.manualApproval
              ? {
                  at: String(g.manualApproval.at || "").slice(0, 50),
                  textHash: g.manualApproval.textHash,
                  audioHash: g.manualApproval.audioHash,
                }
              : undefined,
            verification: g.verification,
            acoustic: g.acoustic,
            listening: g.listening,
          }))
        : [],
    });
  }
  return copy;
}

function exportBooks(root, target, includeAudio = false) {
  const books = [];
  let bytes = 0;
  for (const entry of fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
    : []) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !/^[a-f0-9-]{36}$/.test(entry.name)
    )
      continue;
    const folder = path.join(root, entry.name),
      manifest = path.join(folder, "project.json");
    if (
      fs.lstatSync(manifest).isSymbolicLink() ||
      fs.statSync(manifest).size > 6000000
    )
      throw Error("Invalid project manifest.");
    const d = safeProject(JSON.parse(fs.readFileSync(manifest, "utf8")));
    if (!Array.isArray(d.chapters) || d.chapters.length > 1000)
      throw Error("Invalid chapters.");
    const audio = {};
    d.source = null;
    delete d.shelfBookId;
    for (const c of d.chapters) {
      c.activeJob = null;
      c.voiceSettings = {};
      if (includeAudio && c.output) {
        if (c.textHash !== digest(Buffer.from(c.text))) {
          throw Error("Chapter text changed; regenerate current audio or export without audio / Bölüm metni değişti; güncel sesi yeniden üretin veya sessiz dışa aktarın.");
        }
        const name = path.basename(c.output),
          file = path.join(folder, name);
        if (
          !/^[a-zA-Z0-9.-]+\.wav$/.test(name) ||
          fs.lstatSync(file).isSymbolicLink()
        )
          throw Error("Unsafe project audio.");
        const size = fs.statSync(file).size;
        bytes += size;
        if (bytes > LIMIT)
          throw Error(
            "Backup exceeds 256 MiB; exclude audio or split projects.",
          );
        const b = fs.readFileSync(file);
        audio[name] = { sha256: digest(b), data: b.toString("base64") };
        c.output = name;
      } else {
        c.output = null;
        c.status = "pending";
        c.groups = [];
        delete c.textHash;
      }
    }
    bytes += Buffer.byteLength(JSON.stringify(d));
    if (bytes > LIMIT) throw Error("Backup exceeds 256 MiB.");
    books.push({ project: d, audio });
  }
  const bundle = Buffer.from(
    JSON.stringify({
      format: "whisper-books",
      version: 1,
      created: new Date().toISOString(),
      includeAudio,
      books,
    }),
  );
  if (bundle.length > LIMIT * 1.5) throw Error("Backup too large.");
  atomicWriteFileSync(target, gzipSync(bundle));
  return { count: books.length, bytes: fs.statSync(target).size, includeAudio };
}
function importBooks(root, source) {
  if (fs.statSync(source).size > LIMIT) throw Error("Backup too large.");
  const data = JSON.parse(
    gunzipSync(fs.readFileSync(source), {
      maxOutputLength: LIMIT * 1.5,
    }).toString("utf8"),
  );
  if (
    data.format !== "whisper-books" ||
    data.version !== 1 ||
    !Array.isArray(data.books) ||
    !data.books.length
  )
    throw Error("Invalid book backup.");
  fs.mkdirSync(root, { recursive: true });
  if (
    fs.readdirSync(root).filter((n) => /^[a-f0-9-]{36}$/.test(n)).filter((id) => {
      try {
        const manifest = path.join(root, id, 'project.json');
        if (fs.lstatSync(manifest).isSymbolicLink() || fs.statSync(manifest).size > 6000000) return true;
        return JSON.parse(fs.readFileSync(manifest, 'utf8')).archived !== true;
      } catch { return true; }
    }).length + data.books.filter((item) => item.project?.archived !== true).length >
    100
  )
    throw Error("Book project limit exceeded.");
  const staged = [];
  let bytes = 0;
  try {
    for (const item of data.books) {
      const p = item.project && safeProject(item.project);
      if (
        !p ||
        typeof p.title !== "string" ||
        p.title.length > 1000 ||
        !Array.isArray(p.chapters) ||
        p.chapters.length > 1000
      )
        throw Error("Invalid project.");
      const id = randomUUID(),
        folder = path.join(root, id),
        temp = path.join(root, ".restore-" + id);
      fs.mkdirSync(temp);
      staged.push({ temp, folder });
      p.id = id;
      p.source = null;
      delete p.shelfBookId;
      for (const [i, c] of p.chapters.entries()) {
        if (
          c.id !== i ||
          typeof c.text !== "string" ||
          c.text.length > 900000 ||
          typeof c.title !== "string"
        )
          throw Error("Invalid chapter.");
        c.activeJob = null;
        c.voiceSettings = {};
        if (c.output) {
          const name = c.output,
            a = item.audio?.[name];
          if (
            typeof name !== "string" ||
            name !== path.basename(name) ||
            !/^[-a-zA-Z0-9.]+\.wav$/.test(name) ||
            !a ||
            typeof a.data !== "string"
          )
            throw Error("Invalid backup audio.");
          const b = Buffer.from(a.data, "base64");
          bytes += b.length;
          if (
            bytes > LIMIT ||
            b.toString("ascii", 0, 4) !== "RIFF" ||
            b.toString("ascii", 8, 12) !== "WAVE" ||
            digest(b) !== a.sha256 ||
            c.textHash !== digest(Buffer.from(c.text))
          )
            throw Error("Corrupt backup audio.");
          fs.writeFileSync(path.join(temp, name), b, { flag: "wx" });
          c.output = path.join(folder, name);
          if (
            !c.groups.length ||
            c.groups.some(
              (g) =>
                g.status !== "ready" ||
                !Number.isFinite(g.start) ||
                !Number.isFinite(g.end) ||
                g.start < 0 ||
                g.end <= g.start,
            )
          )
            c.status = "review";
        } else {
          c.status = "pending";
          c.groups = [];
          delete c.textHash;
        }
      }
      if (Buffer.byteLength(JSON.stringify(p)) > 6000000)
        throw Error("Project manifest too large.");
      atomicWriteFileSync(path.join(temp, "project.json"), JSON.stringify(p));
    }
    for (const s of staged) fs.renameSync(s.temp, s.folder);
    return { count: staged.length };
  } catch (e) {
    for (const s of staged) {
      for (const target of [s.temp, s.folder]) {
        const resolved = path.resolve(target);
        if (path.dirname(resolved) !== path.resolve(root))
          throw Error("Unsafe restore cleanup.");
        fs.rmSync(resolved, { recursive: true, force: true });
      }
    }
    throw e;
  }
}
module.exports = { exportBooks, importBooks };
