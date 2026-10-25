"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync(
  require.resolve("../src/renderer/media-experience.js"),
  "utf8",
);
const bookSource = fs.readFileSync(
  require.resolve("../src/renderer/media-workflows-ui.js"),
  "utf8",
);
const signatures = require("../src/assistant-source-context");
function fixture() {
  const owner = {
    open: true,
    isConnected: true,
    hidden: false,
    dataset: {},
    addEventListener() {},
  };
  const ctx = {
    window: {},
    document: { dispatchEvent() {} },
    CustomEvent: class {},
    dialog: owner,
    project: { id: "book", title: "Book", chapters: [{ title: "One" }] },
  };
  vm.createContext(ctx);
  const end = source.indexOf("  let taskDialog");
  assert(end > 0);
  vm.runInContext(
    source.slice(0, end) +
      "window.MediaExperience={setContext,context,bindPassage};})();",
    ctx,
  );
  const a = bookSource.indexOf("  function bookContext("),
    b = bookSource.indexOf("  function mountBookSearch(", a);
  vm.runInContext(bookSource.slice(a, b), ctx);
  return { ctx, owner, experience: ctx.window.MediaExperience };
}
function input(value) {
  const listeners = new Map();
  return {
    value,
    isConnected: true,
    selectionStart: 0,
    selectionEnd: 0,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    emit: (type) => listeners.get(type)?.(),
    listeners,
  };
}
test("a selected passage beyond the first 8k reaches bounded chapter context and stale selection invalidates pending replies", () => {
  const f = fixture(),
    text = "başlangıç ".repeat(1100) + "Seçili pasaj burada.",
    node = input(text);
  const off = f.experience.bindPassage(node, ({ text, offset, selectedText }) =>
    f.ctx.bookContext(0, text, offset, selectedText),
  );
  node.selectionStart = text.indexOf("Seçili");
  node.selectionEnd = text.length;
  node.emit("select");
  const context = f.experience.context();
  assert.equal(context.selectedText, "Seçili pasaj burada.");
  assert(context.excerpt.includes(context.selectedText));
  assert(context.excerpt.length <= 8000);
  const scope = signatures.scope({}, context),
    history = signatures.conversation({}, context);
  node.selectionEnd--;
  node.emit("keyup");
  assert.notEqual(signatures.scope({}, f.experience.context()), scope);
  assert.equal(
    signatures.conversation({}, f.experience.context()),
    history,
    "selection changes do not split chapter conversation history",
  );
  node.selectionEnd = node.selectionStart;
  node.emit("pointerup");
  assert.equal(f.experience.context().selectedText, "");
  off();
  assert.equal(node.listeners.size, 0);
});
test("DOM selection belongs only to the reader; quote is bounded and closed chapters cannot publish new context", () => {
  const f = fixture(),
    node = input(undefined),
    inner = {},
    other = {};
  delete node.value;
  node.textContent = "Source prose";
  node.contains = (n) => n === inner;
  let selection = {
    anchorNode: inner,
    focusNode: inner,
    rangeCount: 1,
    isCollapsed: false,
    toString: () => "x".repeat(9000),
    getRangeAt: () => ({ startContainer: inner, startOffset: 2 }),
  };
  f.ctx.window.getSelection = () => selection;
  f.ctx.document.createRange = () => ({
    selectNodeContents() {},
    setEnd() {},
    toString: () => "So",
  });
  f.experience.bindPassage(node, ({ text, offset, selectedText }) =>
    f.ctx.bookContext(0, text, offset, selectedText),
  );
  node.emit("pointerup");
  assert.equal(f.experience.context().selectedText.length, 4000);
  const previous = f.experience.context();
  selection = { ...selection, focusNode: other };
  node.emit("keyup");
  assert.equal(f.experience.context().selectedText, previous.selectedText);
  f.owner.open = false;
  selection.focusNode = inner;
  node.emit("pointerup");
  assert.equal(f.experience.context(), null);
});
