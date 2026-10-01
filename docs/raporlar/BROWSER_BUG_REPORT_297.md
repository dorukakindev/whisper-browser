# BROWSER BUG REPORT 297 — R330-1: doküman senkron turu

- Tarih: 2026-09-30
- Kapsam: `docs/GUVENLIK-MODELI.md`, `docs/ARCHITECTURE.md`, IPC kanal
  kataloğu, rapor indeksi
- Sonuç: **temiz — belgeler güncel**; eksik parça (IPC kataloğu) üretildi.

## Denetim

1. **GUVENLIK-MODELI.md** (R270'te yazıldı): iddiaları koda karşı tekrar
   doğrulandı — `preload-usage-ratchet` çıktısı belgedeki "234 export,
   7 dormant, 0 kullanılmayan" satırıyla birebir; `ipc-parity` çıktısı
   "216 handle · 12 on · 22 send, 0 unguarded" kilitlerini doğruluyor.
   webPreferences/webview/nonce/SSRF maddeleri ilgili ratchet dosyalarında
   canlı. Değişiklik gerekmedi.
2. **ARCHITECTURE.md** (R214'te yazıldı): mermaid diyagramı, dört-yerle-
   senkron kuralı, kuyruk/yardımcı bölümleri ve test yüzeyleri listesi
   mevcut kodla uyumlu. Değişiklik gerekmedi; IPC kataloğuna bağlantı
   eklendi.
3. **IPC katalog** (yeni): `docs/IPC-KATALOG.md` — `ipcMain.handle`
   kanalları önek gruplu tam liste (grep-extract; browser 105, library 14,
   media 14, invidious 14, youtube 10, burnin/dialog/models/pdf/youtube-tv
   ×5, settings/history 4, shell/watch 3, app/queue/subscriptions/subs/
   transcribe 2, translation/player/paths/notify/maintenance/logs/
   clipboard 1) + `ipcMain.on` ve renderer→main `send` listeleri.
   Yeniden-üretim talimatı belgenin başlığında. (R332 düzeltmesi: özgün
   özet app'i 4 ve queue'yu 3 saymıştı, youtube-tv'yi atlamıştı; ayrıca
   `browser:extras`, `browser:mini:command`, `media-catalog:request`
   servis modüllerinden geldiği için grep çıktısında eksikti — katalog
   216 kanala ve sendSync listesine güncellendi.)
4. **Rapor indeksi**: 297 satırı eklendi.

## Bulgular

- Bug yok. Kanal yüzeyi: `grep -oE` ile `ipcMain.handle` benzersiz 213
  kanal adı (parity testi 216 kayıt sayar — yardımcı-döngüyle eklenenler
  dahil); `ipcMain.on` 12; preload `send` 4.

## Sınırlar

- Katalog anlık döküm; yeni kanal eklendiğinde yeniden üretilir (belgede
  komut yazılı). Statik doğruluk parity+fuzz testlerinin işi.
