'use strict';

const path = require('path');

const MEDIA_ROOT_NAME = 'Whisper';
const INPUT_FOLDER_NAME = 'GİRDİ';
const OUTPUT_FOLDER_NAME = 'ÇIKTI';

function defaultMediaFolders(downloadsPath) {
  if (typeof downloadsPath !== 'string' || !path.isAbsolute(downloadsPath)) {
    throw new TypeError('İndirilenler klasörü mutlak bir yol olmalıdır.');
  }
  const rootDir = path.join(downloadsPath, MEDIA_ROOT_NAME);
  return {
    rootDir,
    inputDir: path.join(rootDir, INPUT_FOLDER_NAME),
    outputDir: path.join(rootDir, OUTPUT_FOLDER_NAME),
  };
}

function withDefaultMediaFolders(settings, downloadsPath) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings : {};
  const defaults = defaultMediaFolders(downloadsPath);
  return {
    ...source,
    inputDir: typeof source.inputDir === 'string' && source.inputDir.trim()
      ? source.inputDir : defaults.inputDir,
    outputDir: typeof source.outputDir === 'string' && source.outputDir.trim()
      ? source.outputDir : defaults.outputDir,
  };
}

module.exports = {
  INPUT_FOLDER_NAME,
  MEDIA_ROOT_NAME,
  OUTPUT_FOLDER_NAME,
  defaultMediaFolders,
  withDefaultMediaFolders,
};
