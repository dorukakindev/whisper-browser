"use strict";
// ASCII-only, readable PDF pages; no external tools or private book data.
module.exports = function pdfFixture(
  pages = ["First page reference.", "Second page evidence."],
) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", ""],
    kids = [];
  for (const text of pages) {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    const escaped = text.replace(/[\\()]/g, "\\$&"),
      stream = `BT /F1 18 Tf 60 710 Td (${escaped}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let data = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, value] of objects.entries()) {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${value}\nendobj\n`;
  }
  const xref = Buffer.byteLength(data);
  data +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
};
