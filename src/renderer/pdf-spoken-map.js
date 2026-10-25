(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PdfSpokenMap = factory();
})(typeof window === "object" ? window : globalThis, () => {
  "use strict";
  const normalize = (s) =>
    String(s || "")
      .normalize("NFKC")
      .toLocaleLowerCase("tr");
  function fold(source) {
    let text = "";
    const offsets = [];
    for (let i = 0; i < source.length; ) {
      const char = String.fromCodePoint(source.codePointAt(i));
      let keep = /[\p{L}\p{N}]/u.test(char);
      if (!keep && /[.,:/+\-−–]/u.test(char)) {
        let before = i - 1,
          after = i + char.length;
        while (before >= 0 && /\s/u.test(source[before])) before--;
        while (after < source.length && /\s/u.test(source[after])) after++;
        const nextDigit = /\p{N}/u.test(source[after] || "");
        keep =
          nextDigit &&
          (/[+\-−–]/u.test(char) || /\p{N}/u.test(source[before] || ""));
      }
      if (keep) {
        const value = /[−–]/u.test(char) ? "-" : char;
        text += value;
        for (let j = 0; j < value.length; j++) offsets.push(i);
      }
      i += char.length;
    }
    return { text, offsets };
  }
  function match(items, groups) {
    let source = "",
      spans = [],
      cursor = 0;
    for (const [i, item] of items.entries()) {
      const value = normalize(item.str);
      spans.push({
        start: source.length,
        end: source.length + value.length,
        i,
      });
      source += value;
    }
    const { text, offsets } = fold(source);
    return groups.map((group) => {
      const value = fold(normalize(group.text)).text;
      if (value.length < 6) return [];
      let start = text.indexOf(value, cursor);
      const numericEdge = /[\p{N}.,:/+\-]/u;
      while (
        start >= 0 &&
        ((/^[+\-]?\p{N}/u.test(value) &&
          start > 0 &&
          numericEdge.test(text[start - 1])) ||
          (/\p{N}$/u.test(value) &&
            numericEdge.test(text[start + value.length] || "")))
      )
        start = text.indexOf(value, start + 1);
      if (start < 0) return [];
      cursor = start + value.length;
      const sourceStart = offsets[start],
        sourceEnd = offsets[cursor - 1] + 1;
      return spans
        .filter((s) => s.end > sourceStart && s.start < sourceEnd)
        .map((s) => s.i);
    });
  }
  function rect(item, viewport) {
    const m = item.transform,
      matrix = viewport.transform;
    if (
      !m ||
      !matrix ||
      ![
        ...m,
        ...matrix,
        item.width,
        item.height,
        viewport.width,
        viewport.height,
      ].every(Number.isFinite) ||
      Math.abs(m[1]) > 0.01 ||
      Math.abs(m[2]) > 0.01 ||
      item.width <= 0 ||
      item.height <= 0 ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      return null;
    const points = [
      [m[4], m[5]],
      [m[4] + item.width, m[5]],
      [m[4], m[5] + item.height],
      [m[4] + item.width, m[5] + item.height],
    ].map(([x, y]) => [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5],
    ]);
    const left = Math.max(0, Math.min(...points.map((p) => p[0]))),
      top = Math.max(0, Math.min(...points.map((p) => p[1]))),
      right = Math.min(viewport.width, Math.max(...points.map((p) => p[0]))),
      bottom = Math.min(viewport.height, Math.max(...points.map((p) => p[1])));
    return right > left && bottom > top
      ? { left, top, width: right - left, height: bottom - top }
      : null;
  }
  function mount(container, canvas, items, viewport, groups, audio, onSeek) {
    container.querySelector(".pdf-text-map")?.replaceWith(canvas);
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-text-map";
    canvas.replaceWith(wrapper);
    wrapper.append(canvas);
    const matches = match(items, groups),
      boxes = [];
    for (const [group, indices] of matches.entries())
      for (const i of indices) {
        const box = rect(items[i], viewport);
        if (!box) continue;
        const { left, top, width, height } = box;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pdf-speech-box";
        b.dataset.group = String(group);
        b.setAttribute("aria-label", groups[group].text.slice(0, 200));
        b.title = groups[group].text.slice(0, 300);
        Object.assign(b.style, {
          left: (left / viewport.width) * 100 + "%",
          top: (top / viewport.height) * 100 + "%",
          width: (width / viewport.width) * 100 + "%",
          height: (height / viewport.height) * 100 + "%",
        });
        b.onclick = () => {
          if (onSeek) {
            void onSeek(groups[group].start);
            return;
          }
          audio.currentTime = groups[group].start;
          void audio.play().catch(() => {});
        };
        wrapper.append(b);
        boxes.push(b);
      }
    const update = () => {
      const i = groups.findIndex(
        (g) => audio.currentTime >= g.start && audio.currentTime < g.end,
      );
      for (const b of boxes)
        b.classList.toggle("pdf-active-box", Number(b.dataset.group) === i);
    };
    audio.addEventListener("timeupdate", update);
    update();
    return {
      matched: new Set(boxes.map((b) => b.dataset.group)).size,
      total: groups.length,
      dispose() {
        for (const b of boxes) b.classList.remove("pdf-active-box");
        audio.removeEventListener("timeupdate", update);
      },
    };
  }
  return { match, mount, rect };
});
