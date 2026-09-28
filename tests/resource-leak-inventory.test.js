'use strict';
// R163: kaynak sızıntı envanteri — timer/child-process/watch çiftleri ratchet'ı.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };
const read = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const main = read('main.js');

// fs.watch kullanımı yok — klasör izleme interval-tabanlı (belgelenmiş seçim)
{
  ok(!/fs\.watch\(/.test(main) && !/fs\.watchFile\(/.test(main),
    'fs.watch/fs.watchFile kullanılmıyor (interval modeli)');
  ok(/watchTimer\)\s*clearInterval\(watchTimer\)/.test(main) && /watchTimer\s*=\s*setInterval/.test(main),
    'watchTimer set/clear çifti');
}

// Üç periyodik browser timer'ının hepsi stopBrowserPolling içinde temizlenir
{
  const stopIdx = main.indexOf('function stopBrowserPolling');
  ok(stopIdx > 0, 'stopBrowserPolling bulunur');
  const stopBody = main.slice(stopIdx, stopIdx + 900);
  for (const timer of ['browserTrackTimer', 'browserMediaTimer', 'browserCaptureTimer']) {
    ok(new RegExp(`${timer}\\)\\s*clearInterval\\(${timer}\\)`).test(stopBody)
      || new RegExp(`clearInterval\\(${timer}\\)`).test(stopBody),
      `${timer} stopBrowserPolling içinde temizlenir`);
  }
}

// Child-process envanteri: modelProcesses set'ine eklenen her proc 'close'da silinir
{
  ok(/modelProcesses\.add\(/.test(main), 'modelProcesses add var');
  const adds = (main.match(/modelProcesses\.add\(/g) || []).length;
  ok(adds >= 1, `spawn envanteri (${adds} add)`);
  // Her add çağrısının yakınında bir close/delete vardır
  const closes = (main.match(/modelProcesses\.delete\(/g) || []).length;
  ok(closes >= adds, `her add için close-delete (${closes} ≥ ${adds})`);
}

// proc 'close' handler'ı olmayan spawn yok (canlı-ASR + medya yardımcıları dahil)
{
  // Kabaca: her `const proc = spawn(` ardından dosya geneli `proc.on('close'` eşi var.
  const spawns = (main.match(/\bspawn\(/g) || []).length;
  const procClose = (main.match(/proc\.on\('close'|proc\.once\('close'|activeJob\.on\('close'|jobProc\.on\('close'/g) || []).length;
  ok(procClose >= Math.min(3, spawns), `spawn close-handler'ı (${procClose} handler, ${spawns} spawn)`);
}

// jobLog akışı açılırsa kapanır
{
  ok(/jobLog\.stream\.end\(\)/.test(main), 'jobLog stream.end() mevcut');
  ok(/createWriteStream/.test(main), 'jobLog write stream oluşturulur');
}

// setTimeout/setInterval sayısı clear* sayısından çok büyük değil (gevşek oran ratchet'ı)
{
  const sets = (main.match(/setInterval\(|setTimeout\(/g) || []).length;
  const clears = (main.match(/clearInterval\(|clearTimeout\(/g) || []).length;
  ok(clears >= Math.floor(sets * 0.5), `set(${sets})/clear(${clears}) oranı`);
}

// Renderer: MutationObserver/intersection/resize disconnect çiftleri
{
  const renderer = read('renderer/renderer.js');
  const observers = (renderer.match(/new\s+(MutationObserver|IntersectionObserver|ResizeObserver)\(/g) || []).length;
  const disconnects = (renderer.match(/\.disconnect\(\)/g) || []).length;
  ok(disconnects >= observers, `observer disconnect çifti (${disconnects} ≥ ${observers})`);
}

// addEventListener removeEventListener denge süpürmesi (renderer, gevşek oran)
{
  const renderer = read('renderer/renderer.js');
  const adds = (renderer.match(/addEventListener\(/g) || []).length;
  const removes = (renderer.match(/removeEventListener\(/g) || []).length;
  ok(removes > 0, `removeEventListener mevcut (${removes}/${adds})`);
}

console.log(`resource-leak-inventory: ${n} kontrol geçti`);
