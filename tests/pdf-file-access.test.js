'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PdfFileAccess, MAX_PDF_BYTES } = require('../src/local-file-access');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-pdf-'));
try {
  const valid = path.join(root, 'kitap.pdf');
  fs.writeFileSync(valid, Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'ascii'));
  const access = new PdfFileAccess();
  assert.equal(access.inspect(valid), fs.realpathSync(valid));
  assert.equal(access.grant(valid), fs.realpathSync(valid));
  assert.equal(access.has(valid), true);

  const prefixed = path.join(root, 'bomlu.pdf');
  fs.writeFileSync(prefixed, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('%PDF-1.7\n', 'ascii'),
  ]));
  assert.equal(access.inspect(prefixed), fs.realpathSync(prefixed));

  const wrongSignature = path.join(root, 'bozuk.pdf');
  fs.writeFileSync(wrongSignature, Buffer.from('not-a-pdf', 'ascii'));
  assert.throws(() => access.inspect(wrongSignature), /PDF imzası/);

  const wrongExtension = path.join(root, 'kitap.txt');
  fs.copyFileSync(valid, wrongExtension);
  assert.throws(() => access.inspect(wrongExtension), /yalnızca PDF/);
  assert.equal(MAX_PDF_BYTES, 300 * 1024 * 1024);
  console.log('pdf-file-access: canonical path, signature and extension guards passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
