"use strict";
const fs = require("node:fs");
async function pdfPageCount(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw Error("Invalid PDF size / PDF boyutu geçersiz.");
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdf.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
  try {
    const doc = await task.promise;
    if (!Number.isSafeInteger(doc.numPages) || doc.numPages < 1 || doc.numPages > 1000) throw Error("Invalid PDF page count / PDF sayfa sayısı geçersiz.");
    return doc.numPages;
  } finally { await task.destroy(); }
}
module.exports = { pdfPageCount };
