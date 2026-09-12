'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MediaFileAccess } = require('../src/local-file-access');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-media-access-'));
try {
  const media = path.join(root, 'video.mp4');
  const nonMedia = path.join(root, 'secret.txt');
  fs.writeFileSync(media, 'synthetic');
  fs.writeFileSync(nonMedia, 'secret');

  const access = new MediaFileAccess(new Set(['mp4', 'mkv']));
  assert.equal(access.inspect(media), fs.realpathSync(media));
  assert.throws(() => access.authorize(media), /kullanıcı tarafından seçilmedi/);
  assert.equal(access.grant(media), fs.realpathSync(media));
  assert.equal(access.authorize(media), fs.realpathSync(media));
  assert.equal(access.has(media), true);
  assert.throws(() => access.inspect(nonMedia), /yalnızca desteklenen medya/);

  console.log('media-file-access: uzantı, canonical path ve kullanıcı grant kontrolü geçti');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}