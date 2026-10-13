# BROWSER BUG REPORT 406 — Oynatıcı işi çeviri aşamasında ilerleme çubuğu donuk

**Durum:** düzeltildi (2026-10-13). **Kaynak:** kullanıcı canlı günlüğü — "çeviriyor
gibi görünüyor ama ilerleyişi göremiyorum".

## Belirti

"Altyazı oluştur" (tek geçişli Whisper + çeviri) işinde transkripsiyon %100'e
ulaştıktan sonra çeviri aşaması başlıyor; günlüğe `Çeviri A-B: X/Y blok kabul
edildi` satırları düşüyor ama oynatıcının iş kartındaki ilerleme çubuğu ve metni
**transkripsiyonun son değerinde donuk kalıyor**. Kullanıcı çevirinin ilerleyip
ilerlemediğini arayüzden göremiyor.

## Kök neden

`playerJobEvent` içinde `llm_progress` olayları yalnız `job.kind === 'translate'`
işlerinde işleniyordu (`renderer.js` ~4809). Oynatıcının Whisper işi
`kind: 'progressive'` — tek geçişe indirildikten sonra da aynı türde kalıyor ve
çeviri aşamasında backend `emit("llm_progress", stage="translate")` yayınlıyor.
Bu olaylar `progressive` işinde hiçbir dala girmeden düşüyordu; çubuk son
`progress` değeri olan %100'de ve "Altyazı hazırlanıyor" metniyle sabitleniyordu.

## Düzeltme

- `src/renderer/renderer.js` — koşul `['translate', 'progressive']` türlerine
  genişletildi; metin aşama-duyarlı: `stage === 'translate'` →
  "Çeviri oluşturuluyor · %X", yoksa "LLM düzeltiyor · %X". Eksik blok sayısı
  ve `translationRetryAvailable` aynen korunur.
- `tests/browser-youtube-whisper.test.js` — `playerJobEvent` vm'de yüklenip
  progressive iş + `llm_progress` senaryosu eklendi (translate ve LLM-düzeltme
  etiketleri, dolgu genişliği, `job.completed`).

## Doğrulama

- `node --check renderer.js`, `browser-youtube-whisper` (yeni iddialar dahil),
  `player-ui` 153/153.
- Gerçek arayüzde uzun bir işin çeviri aşaması Windows'ta görsel olarak
  doğrulanmadı — `start.bat` ile kullanıcı koşusunda izlenecek.
