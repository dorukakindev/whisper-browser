# BROWSER_BUG_REPORT_211 — Console-error ratchet (R259)

**Tarih:** 2026-09-29 · **Dal:** `fix/r259-console-ratchet` · **Kapsam:** plan maddesi 8 — renderer `console-message` akışında severity=error sıfırlığının ratchet'i

## Senaryo

`tests/electron-console-ratchet.smoke.js`: izole profilli gerçek uygulamada ana yüzeyleri gezerken `webContents.on('console-message')` ile level≥3 (error) ve level=2 (warning) mesajları toplanır; koşu sonunda **0 hata** beklenir.

Yürüme yüzeyleri (hepsi yerel, ağ yok):

1. **Ayarlar** — tüm `details` bölümleri açılır, dil seçimi varsa EN/TR geçişi
2. **Oynatıcı** — `openPlayer()`, side tab'ler `subs/ai/library/tools`, görünüm modları `cinema/reading/study`
3. **Tarayıcı** — sekme açılışı, ⋯ menüleri (`appMenu`, `browserMoreMenu`, `browserTranslateMenu`, `browserPageQuickMenu`, `browserSignalMenu`, `browserSplitMenu`, `appModeMenu`, `playerLayoutQuickMenu`), komut paleti, Ctrl+F sayfada-bul, split aç/kapa, sekme kapatma
4. **Dönüş** — player moduna geri

İzin listesi: yalnız `Autofill` (Chromium'un headless'ta devre dışı autofill altyapısı — ürünle ilgisiz). Başka kural yok: beklenti sıfır.

## Bulgular

**0 hata, 0 uyarı — PASS.** Tüm yüzey turunda renderer console'u temiz.

Bu smoke'un değeri geçmişteki sınıfları kilitlemesinde: yakalanmamış DOM yolu (kaldırılan elemente erişim), kaynak 404, DOMException isimleri (AbortError vb. — R202/R254 `friendlySystemError` süpürmesinin görünürlük yüzeyi), deprecation uyarıları. Yeni bir hata türü ortaya çıkarsa ilk CI koşusunda düşer.

## Windows etkisi

Ürün kodu değişmedi. Smoke platformdan bağımsız (süreç-içi API + DOM). Windows'ta `console-message` akışı aynı.

## Sınırlar

- Yalnız **renderer** console'u ölçülür; ana süreç stderr (Electron'un kendi hata yazıcısı) ayrı sınıf — mevcut smoke'ların `render-process-gone` sayaçları kapsıyor.
- Yürüme akışı deterministik ama yüzeysel — derin kullanıcı yolculuğu değil; amaç "hiç hata üretmeme" garantisi, kapsam haritası değil.
- `--disable-gpu` ile GPU-bağımlı konsol uyarıları (örn. WebGL) tetiklenmeyebilir — gerçek donanımda farklı gürültü çıkabilir.

## Koşulan komutlar

```
node --check tests/electron-console-ratchet.smoke.js
xvfb-run -a npx electron tests/electron-console-ratchet.smoke.js --disable-gpu
# → PASS: 0 hata, 0 uyarı
```
