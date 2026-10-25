"use strict";
const { app, BrowserWindow } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, ".uiprev", "library-window546-" + Date.now()),
  profile = path.join(out, "profile");
fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
app.setAppPath(root);
app.commandLine.appendSwitch("disable-gpu");
fs.writeFileSync(
  path.join(profile, "media-catalog.json"),
  JSON.stringify({
    version: 1,
    items: Array.from({ length: 5000 }, (_, i) => ({
      id: randomUUID(),
      kind: "film",
      title: "Film " + String(i).padStart(4, "0"),
      year: 2000 + (i % 25),
    })),
  }),
);
require("../src/main");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(80);
  }
  throw Error("Timed out " + label);
}
app
  .whenReady()
  .then(async () => {
    let win;
    await until(() => {
      win = BrowserWindow.getAllWindows().find(
        (w) =>
          w.webContents.getURL().includes("index.html") &&
          !w.webContents.isLoading(),
      );
      return win;
    }, "main");
    win.show();
    const run = (code) =>
      win.webContents.executeJavaScript("(async()=>{" + code + "})()", true);
    await until(() => run("return !!window.MediaHomeUI"), "home");
    await run(
      'await initialSettingsReady;document.querySelector("[data-home-page=films]").click();return true',
    );
    await until(
      () =>
        run(
          'return !!document.querySelector(".mh-virtual-grid [data-virtual-index]")',
        ),
      "grid",
    );
    const before = await run(
      'return {nodes:document.querySelector(".mh-virtual-grid").children.length,resources:await api.mediaWorkflows({action:"resources"}),rect:document.querySelector(".mh-virtual-grid").getBoundingClientRect().toJSON(),scroller:document.getElementById("mediaHome").clientHeight}',
    );
    assert(before.nodes < 120 && before.nodes > 0, JSON.stringify(before));
    await run(
      'document.getElementById("mediaHome").scrollTop=50000;return true',
    );
    await until(
      () =>
        run(
          'return Number(document.querySelector(".mh-virtual-grid [data-virtual-index]")?.dataset.virtualIndex)>100',
        ),
      "scroll",
    );
    const after = await run(
      'return {nodes:document.querySelector(".mh-virtual-grid").children.length,index:Number(document.querySelector(".mh-virtual-grid [data-virtual-index]").dataset.virtualIndex),resources:await api.mediaWorkflows({action:"resources"})}',
    );
    assert(after.nodes < 120);
    await run(
      'const n=document.querySelector(".mh-virtual-grid [data-virtual-index]");n.focus();n.dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));return true',
    );
    assert.equal(
      await run("return Number(document.activeElement.dataset.virtualIndex)"),
      4999,
    );
    await run('UiLocale.set("en",false);applyUiTheme("light");return true');
    await wait(200);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        { ok: true, out, before, after, keyboardEnd: true },
        null,
        2,
      ),
    );
    try {
      fs.writeFileSync(
        path.join(out, "library.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    } catch {}
    console.log(
      JSON.stringify({
        ok: true,
        out,
        before: before.nodes,
        after: after.nodes,
      }),
    );
    app.exit(0);
  })
  .catch((e) => {
    fs.writeFileSync(path.join(out, "error.txt"), e.stack);
    app.exit(1);
  });
setTimeout(() => app.exit(2), 90000).unref();
