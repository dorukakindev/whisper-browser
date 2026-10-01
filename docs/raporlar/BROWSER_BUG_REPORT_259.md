# BROWSER_BUG_REPORT_259 — R310: whisper:// derin-link handler güvenliği

- Tarih: 2026-09-30
- Kapsam: 20'lik kuyruk maddesi 13 — `whisper://` derin-link handler güvenliği.
- Dal: `devin/1790747885-deeplink-surface` (master `78008c0` üzerine)

## Bulgu

**Uygulamada OS düzeyi derin-link kaydı hiç yok — saldırı yüzeyi sıfır.**

- `setAsDefaultProtocolClient` çağrısı yok (kaynak ve package.json `protocols`
  alanı yok) → Windows registry şema anahtarı hiç yazılmıyor.
- macOS `open-url` handler'ı yok.
- `second-instance` handler'ı yalnız pencereyi öne getirir; `argv` işlenmez
  (Windows derin-link kanalı kapalı).
- `process.argv` kullanımları `--dev` ve `--electron-*` smoke bayraklarıyla sınırlı.
- `install.bat`/`start.bat` protokol kaydı yapmıyor.

## İç ayrıcalıklı şemalar (R242–R247'de sertleştirildi)

- `whisper-pdf:` — Origin/referrer file:// bekçisi, GET/HEAD kısıtı, 64-hex
  oturum-nonce kaynak kimliği, dosya-izni yeniden kontrolü, Range doğrulaması.
- `whisper-assets:` — oturum nonce'lu host; sabit tahmin edilebilir ad 404.
- Bu handler'lar harici uygulamalardan çağrılamaz (yalnız kendi renderer'ları).

## Eklenen ratchet

`tests/deep-link-surface.test.js`: protokol kaydı, `open-url`, argv işleyen
second-instance, beklenmeyen `process.argv` bayrağı ve ayrıcalıklı-şema listesi
değişikliklerini CI'da kırmızıya çevirir — derin-link bir gün eklenirse güvenlik
incelemesi zorunlu olur.

## Doğrulama
- `node tests/deep-link-surface.test.js` → PASS.

## Windows etkisi
Derin-link hiç yok; kullanıcı görünürlüğü değişmez. Eklenecekse Windows registry
anahtarının `install.bat` içine alınması ayrı tasarım konusudur.
