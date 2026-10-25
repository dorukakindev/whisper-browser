# Rapor554 — Yeni videoya önceki dublaj ayarının sızması

2026-10-25 06:58 Europe/Istanbul. Repo https://github.com/dorukakindev/whisper-browser; codex/book-reliability549/PR487. Başlangıç195ebf8220309ca3f34d1317a98201b4e983b499; bitiş ürün **929df08481bee5593cde434613a5c4302a2aadcc**.

`src/renderer/browser-dub-audio.js` attach, önceki priorMuted/baseRate değerini yalnız tabId eşitliğine bakarak taşıyordu. Aynı sekmede mediaKey/generation değişmiş yeni video kendi mute/hızını kaybedebiliyordu. Şimdi mevcut tam mode/tab/mediaKey/generation/mediaId eşleşmesi kullanılır; aynı video için önceki davranış korunur. `tests/browser-dub-audio.test.js` aynı sekmede yeni video muted=true/rate1.75 ve remove sonrası muted=true kalmasını doğrular; önceki koşulda yeni oturum false/1 değerlerini alıyordu.

Dört hedef dosya runner8PASS/0FAIL (`tmp/session554.log`); dub sync/pause/offset/ad/stale telemetry/cleanup, generator, book-review ve reader yarışları. Syntax/diff geçti. Görünüm/bağımlılık/kurulum/şema değişmedi. Native gerçek YouTube/DRM/GPU/start.bat bu küçük saf controller düzeltmesinde koşulmadı; controlled context/mute/rate API kanıtı. Önceki fixed-sleep ve sporadik native Review timeout açık. Master/kişisel dosyalar korunur. Sonraki odak: ses için çeviride anlam kaybı ve oynatma/grup kimliği.
