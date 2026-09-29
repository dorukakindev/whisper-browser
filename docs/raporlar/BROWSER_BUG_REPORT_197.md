# BROWSER_BUG_REPORT_197 — R240: kullanıcı patch bakiyesi + docs-PR review flag'leri

- Tur: R240 · Tarih: 2026-09-29
- Teslim dalı: `fix/r240-triage` · Başlangıç kod kimliği: `ae4a81f` (master)
- Kapsam: `0005-fix-tests-tur1-3.patch` değerlendirmesi + #175/#177/#179 Devin Review flag'leri

## 1) Patch değerlendirmesi

Patch dört test dosyasını ve iki renderer savunmasını içeriyordu.
Test tarafı: `audit-tur5`, `browser-adblock`, `browser-places-filter`,
`browser-ui-regressions-r3` — master'da **3/3+1 zaten yeşil** (R233/R237 aynı
sorunları farklı düzeltmelerle kapatmıştı; örn. closePlayer'a
`closeBrowserTransientPanels` test bağlamı zaten eklendi, adblock sözleşmesi
site-bazlı güncellendi). Patch'in test hunks'ları eski sürümü varsaydığı için
temiz uygulanmadı; gerekmiyordu.

Ürün tarafında yeni ve geçerli iki savunma uygulandı:

- `renderBrowserPlaces`: `document.activeElement` doğrudan okuma →
  `globalThis.document?.activeElement` + `activeEl.classList?.contains`.
  Gerekçe: işlevin test ayıklaması document'siz VM bağlamında çalıştırılırken
  ReferenceError veriyordu; gerçek renderer'da document her zaman var, ama
  bekçi zararsız ve kodu taşınabilir tutar.
- `closePlayer`: `document.fullscreenElement`/`pictureInPictureElement`
  çıkışları `const doc = globalThis.document` bekçisine alındı — aynı gerekçe.

## 2) Review flag triage'ı (4 flag / 3 PR)

| Flag | Karar |
|---|---|
| #175 "kapanış notunda doğrulama sınırları eksik" | Düzeltildi — yeni not `2026-09-29-0658.md` alanları eksiksiz yazıyor |
| #177 "doğrulama kapsamı belirsiz" | Düzeltildi — aynı not |
| #179 "başlangıç kimliği/test eksik" | Düzeltildi — aynı not |
| #179 "kapanış sayısı işlerle uyuşmuyor" | needs_human-adaylı açıklama notta yazıldı: üç bulgu maddesi ↔ dört teslim PR'ı |

## 3) #176/#178 bug triage'ı (4 bug doğrulandı ve düzeltildi)

1. **Aynı harfli sitelerde avatar tonu bayat kalıyordu** — `syncBrowserTabItem`
   bayatlığı yalnız `textContent` (harf) üzerinden ölçüyordu;
   `news.google.com → music.github.com` (ikisi de "G") tonu yenilemeden
   bırakıyordu. Karşılaştırmaya `--avatar-hue` eklendi.
2. **Adres önerisi işaretleri eski harfi gösteriyordu** —
   `browserAddressResultMark` tam host üzerinden harf+ton üretiyordu;
   sekme avatarıyla aynı `browserAvatarDomainKey` kullanılıyor artık
   (`tr.wikipedia.org` önerisi de W).
3. **Farklı IP adresleri aynı tonu paylaşıyordu** — `192.168.1.1` ve
   `10.0.1.1` aynı `1.1` anahtarına düşüyordu. IPv4/IPv6 host'larında alan
   indirgemesi kaldırıldı (anahtar = tam host).
4. **Sığmayan önizleme kartı hâlâ kırpılıyordu** — kart krom alanından uzunsa
   `top=4`'e yerleşip altı native yüzeyin altında kalıyordu. Artık
   `maxHeight = max(16, topLimit - 8)` ile kendi içinde kırpılır
   (`overflow:hidden`).

## 4) #176/#178 flag triage'ı (4 flag / 2 PR)

| Flag | Karar |
|---|---|
| #176 "bitiş kod kimliği yok" | Düzeltildi — 0658 notu + sonraki kapanış notu kesin kimlik taşır |
| #176 "avatar görsel doğrulanmadı" | Düzeltildi — `electron-browser-tab-preview.smoke.js` gerçek Electron'da avatar tonu geçişini doğruluyor |
| #178 "Electron doğrulaması eksik" | Düzeltildi — aynı smoke kartın alt kenarının slot.top'u aşmadığını gerçek WebContentsView yerleşiminde ölçüyor |
| #178 "bitiş kimliği eksik" | Düzeltildi — aynı not zinciri |

## Testler
- `node --check src/renderer/renderer.js src/renderer/renderer-helpers.js` → temiz.
- `node --test` hedefli 4 dosya → 8/8 yeşil (avatar 4, tab-preview 4 dahil yeni kilitler).
- `xvfb-run npx electron tests/electron-browser-tab-preview.smoke.js` → **PASS**: kart altı 84 ≤ slotTop 88, maxHeight 80, aynı-harf geçişte ton 305→159 yenilendi.
- Belge zinciri + hash çözümü doğrulandı (0658 notunda ham çıktı).

## Windows etkisi
Avatar/önizleme davranışı renderer-DOM düzeyinde; native katman ilişkisi
Windows'ta da aynı (WebContentsView). Windows doğrulama oturumuna önizleme
kontrolü zaten aktarıldı.

## Çalıştırılmayan kontroller
Tam `npm test` (hedefli koşuldu); kalan Electron smoke seti (yalnız yeni smoke koşuldu).
