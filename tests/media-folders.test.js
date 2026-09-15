'use strict';

const assert = require('assert');
const path = require('path');
const {
  defaultMediaFolders,
  withDefaultMediaFolders,
} = require('../src/media-folders');
const fs = require('fs');

const downloads = 'C:\\Users\\Test\\Downloads';
const defaults = defaultMediaFolders(downloads);

assert.equal(defaults.rootDir, path.join(downloads, 'Whisper'));
assert.equal(defaults.inputDir, path.join(downloads, 'Whisper', 'GİRDİ'));
assert.equal(defaults.outputDir, path.join(downloads, 'Whisper', 'ÇIKTI'));

assert.deepEqual(
  withDefaultMediaFolders({ glossary: [] }, downloads),
  { glossary: [], inputDir: defaults.inputDir, outputDir: defaults.outputDir },
);

assert.deepEqual(
  withDefaultMediaFolders({
    inputDir: 'D:\\Özel Girdi',
    outputDir: 'E:\\Özel Çıktı',
  }, downloads),
  {
    inputDir: 'D:\\Özel Girdi',
    outputDir: 'E:\\Özel Çıktı',
  },
);

assert.throws(() => defaultMediaFolders('göreli'), /mutlak/);

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
assert.match(mainSource, /media:download'[\s\S]*?o\.inputDir[\s\S]*?Girdi klasörü/);
assert.match(mainSource, /media:downloadSubs'[\s\S]*?o\.inputDir[\s\S]*?Girdi klasörü/);
assert.match(mainSource, /args\.push\('--input-dir', options\.inputDir\)/);
assert.match(mainSource, /args\.push\('--output-dir', options\.outputDir\)/);
console.log('media-folders.test.js: OK');
