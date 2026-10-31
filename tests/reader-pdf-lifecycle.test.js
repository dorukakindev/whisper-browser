"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync(
  require.resolve("../src/renderer/media-workflows-ui.js"),
  "utf8",
);
const begin = source.indexOf("  async function readChapter("),
  end = source.indexOf("  async function closeReader()", begin);
assert(begin >= 0 && end > begin);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise(setImmediate);
function fixture({ textGate, renderGate, fontSize = 21 } = {}) {
  let renders = 0,
    mounts = 0,
    observers = 0,
    contextRequests = 0;
  const nodes = [];
  const el = (tag) => {
    const node = {
      tag,
      children: [],
      style: {},
      dataset: {},
      isConnected: true,
      clientWidth: 700,
      append(...n) {
        this.children.push(...n);
      },
      prepend(...n) {
        this.children.unshift(...n);
      },
      replaceChildren(...n) {
        this.children = n;
      },
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      querySelector() {
        return null;
      },
      getContext() {
        return {};
      },
      scrollIntoView() {},
      pause() {},
      load() {},
      play: async () => {},
      currentTime: 0,
    };
    nodes.push(node);
    return node;
  };
  const page = {
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    getTextContent: () => {
      contextRequests++;
      return textGate?.promise || Promise.resolve({ items: [] });
    },
    render: () => {
      renders++;
      return { promise: renderGate?.promise || Promise.resolve(), cancel() {} };
    },
  };
  const ctx = {
    localStorage: { getItem: key => key === 'whisper.bookReaderFontSize' ? String(fontSize) : null, setItem() {} },
    readerRequest: 0,
    readerGeneration: 0,
    readerRender: null,
    readerPdfMap: null,
    readerTask: null,
    readerResize: null,
    project: { id: "pdf", format: "pdf", chapters: [{ text: "Chapter one" }] },
    chapter: 0,
    dialog: { open: true, querySelector: () => null },
    selected: new Set([0]),
    saveChapter: async () => {},
    call: async (name) =>
      name === "book-listen"
        ? { path: "C:\\chapter.wav", chapter: "One", groups: [], position: 0 }
        : { path: "C:\\book.pdf" },
    clearBody: () => {
      ctx.readerGeneration++;
      return el("body");
    },
    el,
    button: (text) => {
      const n = el("button");
      n.textContent = text;
      return n;
    },
    t: (en) => en, uiLabel: en=>en,
    status() {},
    bookContext() {},
    mountBookSearch() {},
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    getPdfJs: async () => ({
      getDocument: () => ({
        promise: Promise.resolve({ getPage: async () => page }),
        destroy: async () => {},
      }),
    }),
    ResizeObserver: class {
      constructor() {
        observers++;
      }
      observe() {}
    },
    window: {
      ReaderAudioControl: require("../src/reader-audio-control"),
      api: { openPdf: async () => ({ ok: true, fileUrl: "fixture.pdf" }) },
      PdfSpokenMap: {
        mount: () => {
          mounts++;
          return { matched: 1, total: 1 };
        },
      },
    },
  };
  vm.createContext(ctx);
  const fontInitializer=source.slice(source.indexOf("  const readerFontKey ="),source.indexOf("  let bodyVersion="));
  assert(fontInitializer.includes('localStorage.getItem(readerFontKey)'));
  vm.runInContext(fontInitializer + source.slice(begin, end), ctx);
  return {
    ctx,
    nodes,
    counts: () => ({ renders, mounts, observers, contextRequests }),
  };
}

test("leaving a PDF while text extraction is pending cannot start an obsolete render or observer", async () => {
  const textGate = deferred(),
    f = fixture({ textGate });
  const pending = f.ctx.readChapter();
  await tick();
  assert.equal(f.counts().contextRequests, 1);
  f.ctx.readerGeneration++;
  let cancelled = 0;
  const newerRender = {
    cancel() {
      cancelled++;
    },
  };
  f.ctx.readerRender = newerRender;
  textGate.resolve({ items: [] });
  await pending;
  assert.equal(f.ctx.readerRender, newerRender);
  assert.equal(
    cancelled,
    0,
    "the obsolete page must not cancel the current page's render",
  );
  assert.deepEqual(f.counts(), {
    contextRequests: 1,
    renders: 0,
    mounts: 0,
    observers: 0,
  });
});

test("obsolete completed PDF render cannot replace the new highlight map or resize observer", async () => {
  const renderGate = deferred(),
    f = fixture({ renderGate });
  const pending = f.ctx.readChapter();
  await tick();
  assert.equal(f.counts().renders, 1);
  f.ctx.readerGeneration++;
  const map = {
    dispose() {
      throw Error("old render disposed new highlight");
    },
  };
  f.ctx.readerPdfMap = map;
  renderGate.resolve();
  await pending;
  assert.equal(f.ctx.readerPdfMap, map);
  assert.equal(f.counts().mounts, 0);
  assert.equal(f.counts().observers, 0);
});

test("a current PDF still renders, mounts highlights and observes resizing", async () => {
  const f = fixture();
  await f.ctx.readChapter();
  assert.deepEqual(f.counts(), {
    contextRequests: 1,
    renders: 1,
    mounts: 1,
    observers: 1,
  });
});
test("the actual reader initializer applies a saved font preference before PDF rendering",async()=>{
 const f=fixture({fontSize:28});await f.ctx.readChapter();const prose=f.nodes.find(n=>n.tag==='article');assert.equal(prose.style.fontSize,'28px');assert.equal(f.counts().renders,1);
});

test("zoom waits for cancelled drawing to settle before reusing its canvas", async () => {
  const renderGate = deferred(),
    f = fixture({ renderGate });
  const pending = f.ctx.readChapter();
  await tick();
  const zoom = f.nodes.find((n) => n.tag === "select");
  assert(zoom);
  zoom.value = "1.5";
  zoom.onchange();
  await tick();
  assert.equal(
    f.counts().renders,
    1,
    "the first canvas render is still pending",
  );
  renderGate.resolve();
  await pending;
  await tick();
  assert.equal(f.counts().renders, 2);
  assert.equal(
    f.counts().mounts,
    1,
    "only the latest zoom owns the highlight map",
  );
});
