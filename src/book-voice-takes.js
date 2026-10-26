"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto"),
  { atomicWriteFileSync } = require("./fsync-utils");
const hash = (text) => createHash("sha256").update(text).digest("hex");
function validId(chapter, id) {
  return (
    typeof id === "string" &&
    new RegExp(`^${chapter}-[a-f0-9]{16}-[a-f0-9]{16}\\.wav$`).test(id)
  );
}
function audio(folder, chapter, id) {
  if (!validId(chapter, id))
    throw Error("Invalid voice take / Ses denemesi geçersiz.");
  const target = path.join(folder, id);
  let info;
  try {
    info = fs.lstatSync(target);
  } catch {
    throw Error("Voice take unavailable / Ses denemesi kullanılamıyor.");
  }
  if (!info.isFile() || info.isSymbolicLink())
    throw Error("Voice take unavailable / Ses denemesi kullanılamıyor.");
  return target;
}
const ready = (groups) =>
  groups?.length && groups.every((g) => g.status === "ready")
    ? "ready"
    : "review";
function current(c) {
  if (!c.output || !validId(c.id, path.basename(c.output))) return null;
  return {
    version: 1,
    id: path.basename(c.output),
    textHash: c.textHash,
    createdAt: c.capturedAt || null,
    groups: c.groups || [],
    status: ready(c.groups),
    voiceSettings: c.voiceSettings || {},
    qualityMissing: c.qualityMissing === true,
    lastOutputId: c.lastOutputId || null,
  };
}
function remember(folder, c, digest) {
  const take = current(c);
  if (!take) return;
  const target = audio(folder, c.id, take.id);
  take.audioHash = digest(target);
  if (!take.id.endsWith(`-${take.audioHash.slice(0, 16)}.wav`))
    throw Error("Voice take changed on disk / Ses denemesi diskte değişti.");
  const data = JSON.stringify(take);
  if (Buffer.byteLength(data) > 1000000)
    throw Error(
      "Voice take metadata too large / Ses denemesi bilgisi fazla büyük.",
    );
  atomicWriteFileSync(target + ".take.json", data);
}
function preservePrevious(folder, c, digest) {
  c.takeHistoryIncomplete = false;
  if (!c.output) return;
  try {
    remember(folder, c, digest);
  } catch {
    c.takeHistoryIncomplete = true;
  }
}
function read(folder, c, id) {
  const live = current(c);
  if (live?.id === id) return live;
  if (!validId(c.id, id))
    throw Error("Invalid voice take / Ses denemesi geçersiz.");
  const target = path.join(folder, id),
    sidecar = target + ".take.json",
    info = fs.lstatSync(sidecar);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1000000)
    throw Error(
      "Voice take metadata unavailable / Ses denemesi bilgisi kullanılamıyor.",
    );
  const take = JSON.parse(fs.readFileSync(sidecar, "utf8"));
  if (
    take.version !== 1 ||
    take.id !== id ||
    !/^[a-f0-9]{64}$/.test(take.textHash) ||
    !/^[a-f0-9]{64}$/.test(take.audioHash) ||
    !id.startsWith(`${c.id}-${take.textHash.slice(0, 16)}-`) ||
    !id.endsWith(`-${take.audioHash.slice(0, 16)}.wav`) ||
    !Array.isArray(take.groups) ||
    take.groups.length > 1000
  )
    throw Error("Voice take metadata invalid / Ses denemesi bilgisi geçersiz.");
  return take;
}
function list(folder, c) {
  const live = current(c),
    ids = new Set(live ? [live.id] : []);
  const candidates = fs
    .readdirSync(folder)
    .filter(
      (name) =>
        name.endsWith(".take.json") && validId(c.id, name.slice(0, -10)),
    );
  // Only read a bounded recent comparison window; no audio or metadata is deleted.
  const ordered = candidates
    .map((name) => ({
      name,
      time: fs.lstatSync(path.join(folder, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  for (const item of ordered.slice(0, 30)) ids.add(item.name.slice(0, -10));
  const textHash = hash(c.text),
    takes = [];
  for (const id of ids) {
    try {
      const take = read(folder, c, id);
      let available = true;
      try {
        audio(folder, c.id, id);
      } catch {
        available = false;
      }
      takes.push({
        id,
        current: live?.id === id,
        textMatches: take.textHash === textHash,
        available,
        textHash: take.textHash,
        createdAt: take.createdAt,
        status: ready(take.groups),
        groups: take.groups.length,
        reviewGroups: take.groups.filter((g) => g.status !== "ready").length,
      });
    } catch {
      /* Untrusted or missing sidecars are never offered as verified takes. */
    }
  }
  return {
    takes,
    textHash,
    truncated: ordered.length > 30,
    historyIncomplete: !!c.takeHistoryIncomplete,
  };
}
function open(folder, c, id, digest) {
  const take = read(folder, c, id),
    target = audio(folder, c.id, id),
    actual = digest(target);
  if (
    !id.endsWith(`-${actual.slice(0, 16)}.wav`) ||
    (take.audioHash && actual !== take.audioHash)
  )
    throw Error("Voice take changed on disk / Ses denemesi diskte değişti.");
  return { take, path: target };
}
function select(folder, c, request, digest) {
  if (request.textHash !== hash(c.text))
    throw Error(
      "Text changed; reload comparisons / Metin değişti; karşılaştırmayı yenileyin.",
    );
  const chosen = open(folder, c, request.takeId, digest);
  if (chosen.take.textHash !== hash(c.text))
    throw Error("This take belongs to older text / Bu deneme eski metne ait.");
  if (path.basename(c.output || "") === chosen.take.id) return;
  preservePrevious(folder, c, digest);
  c.output = chosen.path;
  c.textHash = chosen.take.textHash;
  c.groups = chosen.take.groups;
  c.qualityMissing = chosen.take.qualityMissing === true;
  c.status = ready(c.groups);
  c.position = 0;
  c.voiceSettings = chosen.take.voiceSettings || {};
  c.capturedAt = chosen.take.createdAt || null;
  c.lastOutputId = chosen.take.lastOutputId || null;
  c.activeJob = null;
}
module.exports = { remember, preservePrevious, list, open, select };
