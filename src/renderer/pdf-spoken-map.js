(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PdfSpokenMap = factory();
})(typeof window === "object" ? window : globalThis, () => {
  "use strict";
  const fold = (s) =>
    String(s || "")
      .normalize("NFKC")
      .toLocaleLowerCase("tr")
      .replace(/[^\p{L}\p{N}]/gu, "");
  function match(items, groups) {
    let text = "",
      spans = [],
      cursor = 0;
    for (const [i, item] of items.entries()) {
      const value = fold(item.str);
      spans.push({ start: text.length, end: text.length + value.length, i });
      text += value;
    }
    return groups.map((group) => {
      const value = fold(group.text);
      if (value.length < 6) return [];
      const start = text.indexOf(value, cursor);
      if (start < 0) return [];
      cursor = start + value.length;
      return spans
        .filter((s) => s.end > start && s.start < cursor)
        .map((s) => s.i);
    });
  }
  function mount(container, canvas, items, viewport, groups, audio) {
    container.querySelector(".pdf-text-map")?.replaceWith(canvas);
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-text-map";
    canvas.replaceWith(wrapper);
    wrapper.append(canvas);
    const matches = match(items, groups),
      boxes = [];
    for (const [group, indices] of matches.entries())
      for (const i of indices) {
        const item = items[i],
          m = item.transform;
        if (!m || Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01) continue;
        const matrix = viewport.transform,
          x = m[4],
          y = m[5],
          w = item.width,
          h = Math.max(1, item.height);
        const points = [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ].map(([x, y]) => [
          matrix[0] * x + matrix[2] * y + matrix[4],
          matrix[1] * x + matrix[3] * y + matrix[5],
        ]);
        const left = Math.min(...points.map((p) => p[0])),
          top = Math.min(...points.map((p) => p[1])),
          width = Math.max(...points.map((p) => p[0])) - left,
          height = Math.max(...points.map((p) => p[1])) - top;
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
      matched: matches.filter((m) => m.length).length,
      total: groups.length,
      dispose() {
        for (const b of boxes) b.classList.remove("pdf-active-box");
        audio.removeEventListener("timeupdate", update);
      },
    };
  }
  return { match, mount };
});
