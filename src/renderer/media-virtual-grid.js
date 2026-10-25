(() => {
  "use strict";
  function mount(container, rows, create, scroller) {
    let columns = 1,
      stride = 320,
      start = -1,
      end = -1,
      frame = 0,
      disposed = false;
    const nodes = new Map();
    container.classList.add("mh-virtual-grid");
    container.setAttribute("role", "list");
    container.setAttribute("aria-label", `${rows.length}`);
    function draw() {
      frame = 0;
      if (disposed || !container.isConnected) return;
      const width = container.clientWidth;
      if (!width) return;
      const next =
          window.innerWidth <= 700
            ? 2
            : Math.max(1, Math.floor((width + 22) / 187)),
        gap = window.innerWidth <= 700 ? 14 : 22,
        cardWidth = (width - (next - 1) * gap) / next;
      const changed = next !== columns;
      columns = next;
      stride = cardWidth * 1.5 + 78 + gap;
      container.style.height = `${Math.ceil(rows.length / columns) * stride}px`;
      const relative =
        scroller.getBoundingClientRect().top -
        container.getBoundingClientRect().top;
      const lastRow = Math.max(0, Math.ceil(rows.length / columns) - 1);
      let a =
          Math.min(lastRow, Math.max(0, Math.floor(relative / stride) - 2)) *
          columns,
        b = Math.min(
          rows.length,
          Math.max(
            a + columns,
            (Math.ceil((relative + scroller.clientHeight) / stride) + 2) *
              columns,
          ),
        );
      const focused = document.activeElement?.closest("[data-virtual-index]"),
        index =
          focused && container.contains(focused)
            ? Number(focused.dataset.virtualIndex)
            : -1;
      const wanted = new Set();
      for (let i = a; i < b; i++) wanted.add(i);
      if (index >= 0) wanted.add(index);
      for (const [i, node] of nodes)
        if (!wanted.has(i)) {
          node.dispose?.();
          node.remove();
          nodes.delete(i);
        }
      for (const i of wanted) {
        let node = nodes.get(i);
        if (!node) {
          node = create(rows[i]);
          node.dataset.virtualIndex = String(i);
          node.setAttribute("role", "listitem");
          node.setAttribute("aria-posinset", String(i + 1));
          node.setAttribute("aria-setsize", String(rows.length));
          nodes.set(i, node);
          container.append(node);
        }
        node.style.position = "absolute";
        node.style.left = `${(i % columns) * (cardWidth + gap)}px`;
        node.style.top = `${Math.floor(i / columns) * stride}px`;
        node.style.width = `${cardWidth}px`;
      }
      start = a;
      end = b;
    }
    const schedule = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    };
    function key(event) {
      const current = event.target.closest("[data-virtual-index]");
      if (!current) return;
      const offsets = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
        Home: -rows.length,
        End: rows.length,
      };
      if (!(event.key in offsets)) return;
      event.preventDefault();
      const at = Math.max(
        0,
        Math.min(
          rows.length - 1,
          Number(current.dataset.virtualIndex) + offsets[event.key],
        ),
      );
      const top =
        container.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop +
        Math.floor(at / columns) * stride;
      scroller.scrollTop = Math.max(0, top - 100);
      draw();
      nodes.get(at)?.focus({ preventScroll: true });
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    scroller.addEventListener("scroll", schedule, { passive: true });
    container.addEventListener("keydown", key);
    schedule();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      scroller.removeEventListener("scroll", schedule);
      container.removeEventListener("keydown", key);
      for (const node of nodes.values()) node.dispose?.();
      nodes.clear();
    };
  }
  window.MediaVirtualGrid = Object.freeze({ mount });
})();
