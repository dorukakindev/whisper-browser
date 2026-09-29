# BROWSER_BUG_REPORT_216 — R264: CJK/emoji burn-in doğrulaması + sessiz glif kaybı uyarısı

## Özet (madde 14)
CJK/emoji içeren altyazının ffmpeg `subtitles=` (libass) ile gömülmesi doğrulandı:

- **CJK**: fontconfig'e uygun font bulununca (test: Noto Sans CJK) düzgün render ediliyor —
  kare görüntüsüyle doğrulandı (Japonca + Çince + Türkçe `ÇĞİÖŞÜ` temiz).
- **Emoji**: renkli emoji fontları (Noto Color Emoji gibi CBDT/bitmap) libass/freetype ile
  kullanılamıyor → `failed to find any fallback` → **tofu kutusu**. Monokrom emoji fontu
  taşıyan sistemlerde (ör. Windows Segoe UI Symbol kapsadığı kod noktalarında) glif bulunabilir.
- **Sessiz hata**: font bulunamasa bile ffmpeg başarıyla bitiyor; kullanıcı son videoda
  kutuları görünceye dek habersiz kalıyordu.

## Düzeltme
- `src/main.js`: burn-in ffmpeg stderr'inde `failed to find any fallback with glyph 0x…`
  satırları sayılıyor (benzersiz kod kümesi) ve `done` olayına `missingGlyphs` sayısı olarak ekleniyor.
- `src/renderer/renderer.js`: `done` sonrası `missingGlyphs > 0` ise iki dilli (TR/EN) uyarı satırı
  log'lanıyor — "kutu/boşluk görünebilir" açıklamasıyla.
- `tests/electron-burnin-ffmpeg.smoke.js`: fixture SRT'ye emoji + `U+10FFFE` (atanmamış
  noncharacter — hiçbir fontta glifi yok, CI'da deterministik) + CJK cue'u eklendi;
  `done.missingGlyphs >= 1` kilitlendi.

## Kanıt
- `xvfb-run -a npx electron tests/electron-burnin-ffmpeg.smoke.js --disable-gpu` → PASS,
  `missingGlyphs: 2` (emoji + nonchar; CJK bu kutuda font ile çözüldü — gerçek render kanıtı
  kare kare doğrulandı).
- ffmpeg stderr'inde CJK/emoji için `failed to find any fallback` satırları önceki koşuda
  gözlendi; Noto CJK kurulumu sonrası yalnız emoji kod noktaları kayıp kaldı.

## Windows etkisi
Windows'ta libass fontconfig üzerinden Segoe ailesini bulur; monokrom kapsam daha geniş olabilir
ama renkli emoji fontu yine kullanılmaz — uyarı o durumda da doğru davranıştır (glif gerçekten
kaybolmuştur). Uyarı sadece `done` olayında log satırı; iş akışını durdurmaz.

## Değişen dosyalar
- `src/main.js` — glif-kayıp sayacı + `done.missingGlyphs`
- `src/renderer/renderer.js` — TR/EN uyarı log satırı
- `tests/electron-burnin-ffmpeg.smoke.js` — fixture genişletme + `missingGlyphs` kilidi

## Çalıştırılmayanlar
Tam `npm test` koşulmadı (CI koşar). Windows'ta gerçek Segoe davranışı elle doğrulanmadı —
uyarı metni çıktığında doğru bilgi verir; kapsam farkı yalnız sayıyı değiştirir.
