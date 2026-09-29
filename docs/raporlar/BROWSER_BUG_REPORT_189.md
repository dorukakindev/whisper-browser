# BROWSER_BUG_REPORT_189 — Tarayıcı UI tur-2 paketi uygulama ve doğrulama (R232)

Tarih: 2026-09-29 · Dal: `fix/browser-ui-round2` · Taban: `master` @ `6cd3e3b`
Paket: `whisper-browser-ui-round2.zip` (kullanıcı tarafından sağlanan tur-2 UI düzeltme paketi)

## Kapsam

Kullanıcının ikinci UI-fix paketinin repoya uygulanması ve TESTS-FOR-DEVIN.md'de
istenen doğrulamaların koşulması. Paket 1 commit (`446ac10`, `git am` ile temiz
uygulandı), 4 dosya, 18 ayrı UI bulgusu içeriyor. En kritik bulgu: **Ctrl+K komut
paleti hiç çalışmıyordu** — `executeBrowserCommandPalette` eşleştiriciye ham sekme
nesnesi (`{id,…}`) veriyordu, eşleştirici `{tabId,…}` bekliyordu; her Enter/tıklama
"komut yeniden seçilmeli" hatasıyla bitiyordu.

## Paketin 18 düzeltmesi (BULGULAR.md)

1. Komut paleti: hiçbir komut çalışmıyordu (ham sekme nesnesi → iş akışı bağlamı).
2. Sekme-grubu diyaloğunda Ctrl+W/T/Tab/1-9 arkadaki sekmeyi etkiliyordu.
3. Ayarlar sekmesi öndeyken Ctrl+W gizli web sekmesini kapatıyordu.
4. Palet/adres çubuğunda Esc diğer panel/diyalogları da kapatıyordu.
5. Palet açıkken Ctrl+K: eski metin kalıyordu, odak kayboluyordu.
6. Öneri listesi açıkken Home/End imleç yerine satır seçiyordu (artık Alt+Home/End).
7. Kütüphane araması dönünce ↓ öneriyi sıfırlıyor, Enter yazılan metni açıyordu.
8. QR paneli Esc ile kapanmıyordu (odak hiç taşınmıyordu).
9. QR ile Yer imleri/İndirmeler aynı köşede üst üste açılıyordu.
10. Oynatıcıya geçişte yalnız İndirmeler kapanıyordu; diğer paneller geri dönüşte beliriyordu.
11. Oklüzyonlu panelde donmuş sayfa görüntüsüne tıklamak paneli kapatmıyordu.
12. Sekme sağ-tık menüsünün alt öğeleri native sayfanın arkasında kalıyordu.
13. Sekme kapat düğmesine hızlı çift tıklama grup diyaloğunu açıyordu.
14. Odak kapat/sessiz düğmesindeyken ←/→ ilk/son sekmeye atlıyordu.
15. Gruplar varken "Sağdaki sekmeleri kapat" iç sırayı kullanıyor, soldakileri kapabiliyordu.
16. Yer-imleri listesi her yenilemede klavye odağını body'ye düşürüyordu.
17. Sayfa odaklıyken Ctrl+L/Alt+D/F6/Ctrl+K/T adres çubuğunu gösteriyor ama tuş sayfaya gidiyordu (main.js).
18. SPA gezisinde (pushState/hash) bul çubuğu kullanıcı yazarken kapanıyordu.

## Doğrulama (TESTS-FOR-DEVIN.md)

### §1 Statik + tam test
- `node --check` src/main.js, src/browser-page-find.js, src/renderer/renderer-helpers.js, src/renderer/renderer.js → 4/4 temiz.
- `npm test` (302 dosya) → ilk koşuda 2 dosya düştü; ikisi de paketin değiştirdiği işlevleri dilimleyen test harness'larıydı, ürün bug'ı değil:
  - `tests/audit-tur5.test.js`: `closePlayer` artık `closeBrowserTransientPanels()` çağırıyor (düzeltme #10); sahte bağlama eklendi.
  - `tests/browser-places-filter.test.js`: `renderBrowserPlaces` odak koruması için `list.contains()`/`querySelector()` kullanıyor (düzeltme #16); sahte düğüm sınıfına minimal metotlar eklendi.
  - Düzeltme sonrası `npm test` → **Tüm testler geçti.**

### §2 İstenen 3 birim testi — `tests/browser-ui-round2.test.js` (yeni)
- **Paletten ham sekme nesnesiyle komut çalıştırma:** `executeBrowserCommandPalette`'e
  `{id}` biçimli ham sekme verilince bile iş akışı bağlamı doğru kurulur; komut
  artık "yeniden seçilmeli" demeden yürütülür (regresyon #1).
- **`browserTabsRightOf` ekran sırası:** [A, B(grup), C, D(grup)] görsel düzeninde
  D'nin sağındaki tek sekme C'dir; C'nin sağı boştur; sabit (pinned) sekmeler
  sayılmaz (regresyon #15).
- **SPA aynı-belge gezisinde bul çubuğu sıfırlanmaz:** `did-start-navigation`
  `isSameDocument`/`inPlace` olayında erken döner; sayaç/durum korunur (regresyon #18).

### §4 Electron smoke'ları
- `electron-browser-find.smoke.js` → **geçti** ("1 / 3 → 2 / 3 → 1 / 3 → kapandı").
- `electron-browser-trusted-bridge.smoke.js` → **geçti**.
- `electron-browser-experience-smoke.js` → bu başsız kutuda `Electron exited early: 9`
  ile düşüyor; aynı komut `master@6cd3e3b` worktree'sinde **birebir aynı noktada**
  düşüyor — ortam sınırı, paketle ilgisiz (önceki turlarda da belgelenen kısıt).

## Değişen dosyalar
- `src/browser-page-find.js`, `src/main.js`, `src/renderer/renderer-helpers.js`,
  `src/renderer/renderer.js` — paket commit'i `446ac10` (18 bulgu).
- `tests/browser-ui-round2.test.js` — yeni regresyon kilidi.
- `tests/audit-tur5.test.js`, `tests/browser-places-filter.test.js` — harness uyarlama.
- `docs/raporlar/BROWSER_BUG_REPORT_189.md` — bu rapor.
- `docs/devir/2026-09-29-0417.md` — devir notu.
- `CHANGELOG.md`, `DEVIR-NOTU.md` — kayıt.

## Windows etkisi
Hepsi renderer/main klavye ve panel mantığı; Windows'ta davranış aynı. Kullanıcı
tarafında §3'teki 15 maddelik el-kontrol listesi doğrulanmalı (palet Ctrl+K ile
komut çalıştırma, diyaloglarda Ctrl+W izolasyonu, Esc zinciri, QR paneli,
sağ-tık menüsü katmanı, sekme şeridi ok tuşları, "Sağdakileri kapat" sırası,
yer-imleri odak tutma, sayfa-odaklı kısayollar, SPA bul çubuğu). Paket yazarının
saplanmış arayüzle doğruladığı master-vs-yeni karşılaştırması pakette belgeli.

## Çalıştırılmayan kontroller
- §3 Windows el-kontrol listesi (kullanıcı makinesinde).
- `electron-browser-experience-smoke` — başsız ortam sınırı (master'da aynı).
- Gerçek sitelerde (YouTube dahil) uçtan uca bul çubuğu ve palet gezintisi.
