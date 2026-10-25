"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { JSDOM } = require("jsdom");
const { pageContextScript } = require("../src/browser-page-translate");
test("assistant page contract retains selection and excludes private form fields", () => {
  const dom = new JSDOM(
      '<title>Haber</title><main><h1>Bir araştırma</h1><p>Bu haberin uzun ve okunabilir metnini birlikte inceleyelim.</p><input value="PRIVATE_PASSWORD"><textarea>PRIVATE_NOTE</textarea></main>',
      {
        url: "https://example.com/news?token=private",
        runScripts: "outside-only",
      },
    ),
    w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, "getBoundingClientRect", {
    value: () => ({ width: 200, height: 30 }),
  });
  Object.defineProperty(w.HTMLElement.prototype, "getClientRects", {
    value: () => [{}],
  });
  const range = w.document.createRange();
  range.selectNodeContents(w.document.querySelector("p"));
  w.getSelection().addRange(range);
  const result = w.eval(pageContextScript());
  assert(result.ok);
  assert.equal(result.version, 2);
  assert.match(result.selectedText, /uzun ve okunabilir/);
  assert.match(result.articleText, /araştırma/);
  assert.equal(result.contentTrust, "untrusted-page-content");
  assert.equal(result.url, "https://example.com/news");
  assert(!JSON.stringify(result).includes("PRIVATE_"));
  range.selectNodeContents(w.document.body);
  w.getSelection().removeAllRanges();
  w.getSelection().addRange(range);
  assert(
    !JSON.stringify(w.eval(pageContextScript())).includes("PRIVATE_"),
    "Select-all must not expose textarea defaults",
  );
  w.document.querySelector("main").innerHTML =
    "<div>Public fallback text.</div><textarea>PRIVATE_FALLBACK</textarea>";
  w.getSelection().removeAllRanges();
  const fallback = w.eval(pageContextScript());
  assert(!JSON.stringify(fallback).includes("PRIVATE_"));
  assert.match(fallback.articleText, /Public fallback/);
  dom.window.close();
});
test("windowed grid bounds nodes, follows scroll, and disposes listeners", () => {
  const dom = new JSDOM('<div id="scroll"><div id="grid"></div></div>', {
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }),
    w = dom.window;
  let callback;
  w.ResizeObserver = class {
    constructor(fn) {
      callback = fn;
    }
    observe() {}
    disconnect() {}
  };
  let frame;
  w.requestAnimationFrame = (fn) => ((frame = fn), 1);
  w.cancelAnimationFrame = () => {};
  const scroller = w.document.getElementById("scroll"),
    grid = w.document.getElementById("grid");
  let top = 0;
  Object.defineProperty(scroller, "clientHeight", { value: 800 });
  Object.defineProperty(grid, "clientWidth", { value: 1000 });
  scroller.getBoundingClientRect = () => ({ top: 0 });
  grid.getBoundingClientRect = () => ({ top: -top });
  w.eval(
    fs.readFileSync(
      require("node:path").join(
        __dirname,
        "../src/renderer/media-virtual-grid.js",
      ),
      "utf8",
    ),
  );
  const dispose = w.MediaVirtualGrid.mount(
    grid,
    Array.from({ length: 10000 }, (_, id) => ({ id })),
    (r) => {
      const n = w.document.createElement("button");
      n.textContent = r.id;
      return n;
    },
    scroller,
  );
  frame();
  assert(grid.children.length < 100);
  top = 50000;
  scroller.dispatchEvent(new w.Event("scroll"));
  frame();
  assert(Number(grid.firstChild.dataset.virtualIndex) > 100);
  assert(grid.children.length < 100);
  dispose();
  dom.window.close();
});
