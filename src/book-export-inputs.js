"use strict";
const { inspectVoiceOutput } = require("./voice-output");
function streamList(files) {
  if (files.length < 2 || files.some((file) => /[\r\n\0]/.test(file)))
    return null;
  const formats = files.map((file) => inspectVoiceOutput(file)?.formatKey);
  if (!formats[0] || formats.some((format) => format !== formats[0]))
    return null;
  return (
    "ffconcat version 1.0\n" +
    files
      .map(
        (file) =>
          "file '" + file.replace(/\\/g, "/").replace(/'/g, "'\\''") + "'\n",
      )
      .join("")
  );
}
module.exports = { streamList };
