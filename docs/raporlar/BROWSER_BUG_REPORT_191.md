# BROWSER_BUG_REPORT_191 — R234: PR #167 Devin Review triage

Başlangıç: master `ba45720` (PR #167 squash-merge sonrası)
Teslim dalı: `fix/browser-menu-split-shortcut` → `master` (PR #169, bu raporun squash kimliği kapanış notunda)

## Bulgular

### BUG_0001 — ⋯ menü arama kutusunda ok tuşları çift işleniyordu (DÜZELTİLDİ)

**Belirti:** Arama kutusunda ↓ ilk komuta değil ikinciye gidiyor, ↑ özet düğme yerine son komuta atlıyordu.

**Kök neden:** `moreSearch`'in keydown işleyicisi `preventDefault()` çağırıp odağı ilk eyleme taşıyordu, ama olay durdurulmadığı için üstteki `<details>` öğesine kabarcıklanıyordu. `wireDetailsMenuNav` (renderer-helpers.js:642, menü açılışında 19797'de bağlı) aynı ↓/↑ tuşunu details seviyesinde tekrar işleyip `document.activeElement`'ten bir sonraki/önceki öğeye kaydırıyordu — net etki: ↓ ikinci komuta, ↑ son komuta.

**Düzeltme:** `renderer.js:20060-20064` — ↓/↑ dalında `event.stopPropagation()` eklendi (Enter dalında da). Kullanıcı görünen davranışta değişiklik yok; çift işlenme giderildi.

**Kanıt:** `tests/browser-menu-proxy.test.js` — fixture'a `wireDetailsMenuNav` eşdeğeri details-seviye dinleyici eklendi ve ok tuşları `bubbles:true` ile gönderiliyor. `stopPropagation` olmadan ↓ `q2`'ye, ↑ son öğeye düşerdi; şimdi ↓ `q1`'de, ↑ `moreMenuSummary`'de kalıyor.

### ANALYSIS_0001 — İkincil sekme kısayolu için Electron smoke'u eksikti (DÜZELTİLDİ)

**Belirti:** CONTRIBUTING'in "birim testlerin erişemediği UI davranışı için Electron smoke" kuralı R233'te uygulanmamıştı; bölünmüş-görünüm ikincil-sayfa kısayol kapısı yalnız kod incelemesiyle doğrulanmıştı.

**Düzeltme:** Yeni `tests/electron-browser-split-shortcut.smoke.js` — gerçek tuş yolu: iki sekme (split-smoke.test/one, /two), ikincili bölünme, ikincil WebContents'e `sendInputEvent` ile Ctrl+K; onaylar: (1) `player.browserActiveTabId` ikincil sekme kimliğine terfi eder, (2) `browserCommandPaletteState.open === true` + palet görünür. `run-electron-smokes.js` glob'uyla otomatik keşfedilir.

**Sınır:** Bu kutu başsız — Electron smoke'lar burada `Electron exited early: 9` ile koşamaz (bilinen ortam kısıtı, master'da aynı). Betik PR'ı inceleyen/Windows makinede `node tests/run-electron-smokes.js electron-browser-split-shortcut` ile koşulmalı. Statik sözdizimi (`node --check`) geçti; jsdom kilitleri jsdom tarafında doğrulandı.

## Doğrulama

- `node --check src/renderer/renderer.js` — temiz
- `node --check tests/electron-browser-split-shortcut.smoke.js` — temiz
- `node tests/browser-menu-proxy.test.js` — PASS (tur-3 ok gezintisi + çift-işlenme kilidi dahil)

## Windows etkisi

- Menü ok düzeltmesi platformdan bağımsız (bubbling davranışı aynı).
- Yeni smoke Windows'ta koşabilir — `node tests/run-electron-smokes.js electron-browser-split-shortcut` el kontrolü önerilir.

## Çalıştırılmayan kontroller

- Yeni Electron smoke'u (başsız kutu kısıtı — gerekçe yukarıda).
- `npm test` tam tur (kapsam dışı dosya değişmedi; hedefli jsdom test koşuldu).
