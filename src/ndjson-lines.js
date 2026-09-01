'use strict';

function createNdjsonLineBuffer(options = {}) {
  const maxLineChars = Math.max(1024, Number(options.maxLineChars) || 32 * 1024 * 1024);
  const onOverflow = typeof options.onOverflow === 'function' ? options.onOverflow : () => {};
  let pending = '';
  let dropping = false;

  function push(chunk) {
    let text = String(chunk ?? '');
    const lines = [];

    if (dropping) {
      const newline = text.indexOf('\n');
      if (newline < 0) return lines;
      text = text.slice(newline + 1);
      dropping = false;
    }

    const combined = pending + text;
    pending = '';
    let start = 0;
    while (start < combined.length) {
      const newline = combined.indexOf('\n', start);
      if (newline < 0) break;
      const line = combined.slice(start, newline);
      if (line.length > maxLineChars) onOverflow(line.length);
      else lines.push(line);
      start = newline + 1;
    }

    pending = combined.slice(start);
    if (pending.length > maxLineChars) {
      onOverflow(pending.length);
      pending = '';
      dropping = true;
    }
    return lines;
  }

  function flush() {
    if (dropping || !pending) {
      pending = '';
      dropping = false;
      return [];
    }
    const line = pending;
    pending = '';
    return [line];
  }

  return { push, flush };
}

module.exports = { createNdjsonLineBuffer };
