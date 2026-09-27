# BROWSER_BUG_REPORT_138 — birim-test kapsamı denetimi (R139)

Tarih: 2026-09-27

## Bulgular

Tüm `src/` ve `src/renderer/` altındaki Electron-bağımsız, export'lu modüller
tarandı; mevcut test dosyalarındaki require referanslarıyla çaprazlandı.

- **Zaten kapalı:** ~90 modül (testler isim yoluyla referanslıyor).
- **Kapanan:** `browser-mini-player.js` — 8 senaryoluk sahte-BrowserWindow
  testi eklendi (open/layout/owns/command guardları + geri taşıma).
- **Kalan (sınır):** `browser-dialogue.js` — ffmpeg + `separator-venv` python
  subprocess'leri; saf birim testi mümkün değil, Windows'ta
  install-browser-extras.bat mevcutken uçtan uca doğrulanır.

Bug bulunmadı; değer kapsam ratchet'inde.
