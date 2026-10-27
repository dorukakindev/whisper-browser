"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { match, rect, mount } = require("../src/renderer/pdf-spoken-map");

test('Disposed PDF speech boxes release their canvas and cannot restart old playback',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="page"><canvas></canvas></div>'),previous=global.document;global.document=dom.window.document;
 try{const container=global.document.getElementById('page'),canvas=container.querySelector('canvas'),audio=new dom.window.EventTarget();audio.currentTime=0;let seeks=0;
 const control=mount(container,canvas,[{str:'Hello world.',width:60,height:10,transform:[10,0,0,10,10,20]}],{transform:[1,0,0,-1,0,100],width:100,height:100},[{text:'Hello world.',start:0,end:1}],audio,()=>{seeks++;});
 const box=container.querySelector('.pdf-speech-box');assert(box);box.click();assert.equal(seeks,1);control.dispose();control.dispose();assert.equal(container.querySelector('.pdf-text-map'),null);assert.equal(container.querySelector('canvas'),canvas);box.click();assert.equal(seeks,1);
 }finally{global.document=previous;dom.window.close();}
});

test("PDF speech matching preserves decimal, sign, fraction and time distinctions across text items", () => {
  for (const [source, spoken] of [
    ["Süre 1.5 saat.", "Süre 15 saat."],
    ["Sıcaklık -20 derece.", "Sıcaklık 20 derece."],
    ["Oran 1/10 olarak açıklandı.", "Oran 110 olarak açıklandı."],
    ["Saat 10:30 gösteriyor.", "Saat 1030 gösteriyor."],
    ["Tutar 1,5 milyon.", "Tutar 15 milyon."],
    ["Sıcaklık -20 derece.", "20 derece."],
    ["Süre 1.5 saat olarak ölçüldü.", "5 saat olarak ölçüldü."],
  ])
    assert.deepEqual(
      match([{ str: source }], [{ text: spoken }]),
      [[]],
      source,
    );
  const items = [{ str: "Süre 1" }, { str: "." }, { str: "5 saat." }];
  assert.deepEqual(match(items, [{ text: "Süre 15 saat." }]), [[]]);
  assert.deepEqual(match(items, [{ text: "Süre 1.5 saat." }]), [[0, 1, 2]]);
  assert.deepEqual(
    match(
      [{ str: "Sıcaklık −20 derece." }],
      [{ text: "Sıcaklık -20 derece." }],
    ),
    [[0]],
  );
});

test("Turkish casing, composed marks, ligatures and repeated passages retain source order", () => {
  assert.deepEqual(
    match(
      [{ str: "IŞIK İLE ILIK İKLİM." }],
      [{ text: "ışık ile ılık iklim." }],
    ),
    [[0]],
  );
  assert.deepEqual(
    match([{ str: "I\u0307klim ve ﬁzik." }], [{ text: "İklim ve fizik." }]),
    [[0]],
  );
  assert.deepEqual(
    match(
      [{ str: "Aynı metin." }, { str: "Aynı metin." }],
      [{ text: "Aynı metin." }, { text: "Aynı metin." }],
    ),
    [[0], [1]],
  );
  assert.deepEqual(
    match(
      [{ str: "sık kullanılan metin" }],
      [{ text: "sik kullanılan metin" }],
    ),
    [[]],
    "distinct Turkish letters must not be conflated",
  );
});

test("highlight rectangles stay inside the rendered viewport, including rotated pages", () => {
  const item = { transform: [10, 0, 0, 10, -5, 90], width: 20, height: 20 };
  const viewport = { transform: [1, 0, 0, 1, 0, 0], width: 100, height: 100 };
  assert.deepEqual(rect(item, viewport), {
    left: 0,
    top: 90,
    width: 15,
    height: 10,
  });
  assert.equal(
    rect({ ...item, transform: [10, 0, 0, 10, -50, 90] }, viewport),
    null,
  );
  assert.equal(rect({ ...item, width: Infinity }, viewport), null);
  assert.equal(
    rect({ ...item, transform: [0, 10, -10, 0, 20, 30] }, viewport),
    null,
    "unsupported rotated glyphs are skipped",
  );
  assert.deepEqual(
    rect(
      { ...item, transform: [10, 0, 0, 10, 20, 30], width: 50, height: 10 },
      { transform: [0, 1, 1, 0, 0, 0], width: 800, height: 600 },
    ),
    { left: 30, top: 20, width: 10, height: 50 },
  );
});

test("unrenderable matched text is not reported as a visible PDF highlight and listeners are released", () => {
  const previous = global.document;
  const node = () => ({
    dataset: {},
    style: {},
    append() {},
    replaceWith() {},
    setAttribute() {},
    classList: { toggle() {}, remove() {} },
  });
  global.document = { createElement: node };
  const listeners = new Set(),
    audio = {
      currentTime: 0,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    };
  try {
    const result = mount(
      { querySelector: () => null },
      node(),
      [
        {
          str: "Aynı kaynak metni.",
          transform: [0, 10, -10, 0, 20, 30],
          width: 50,
          height: 10,
        },
      ],
      { transform: [1, 0, 0, 1, 0, 0], width: 100, height: 100 },
      [{ text: "Aynı kaynak metni.", start: 0, end: 1 }],
      audio,
    );
    assert.equal(result.matched, 0);
    assert.equal(result.total, 1);
    assert.equal(listeners.size, 1);
    result.dispose();
    assert.equal(listeners.size, 0);
  } finally {
    global.document = previous;
  }
});

test('English I/i passages match without collapsing distinct Turkish words',()=>{assert.deepEqual(match([{str:'INDEPENDENT IDEAS ARE IMPORTANT.'}],[{text:'independent ideas are important.'}]),[[0]]);assert.deepEqual(match([{str:'sık kullanılan metin'}],[{text:'sik kullanılan metin'}]),[[]]);});
