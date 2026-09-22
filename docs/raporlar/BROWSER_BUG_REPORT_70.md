# BROWSER_BUG_REPORT_70 — Gerçek YouTube OAuth (SmartTube cihaz-akışı) implementasyonu + öz-denetim

**Tarih:** 2026-09-18 19:47 · **Dal:** master · **Kapsam:** `backend/youtube.py` (yeni), `src/main.js`, `src/preload.js`, `src/renderer/{renderer.js,index.html,styles.css}`, testler

## 1. İstek

Kullanıcı SmartTube'un TV'de yaptığı gibi **gerçek YouTube hesabıyla** giriş istedi (Invidious değil). Seçilen yöntem: **OAuth cihaz kodu akışı** (A şıkkı) — SmartTube'un gerçek yöntemi.

## 2. Mimari

```
renderer  ──ipc──>  main.js (youtubeSession bellek + SafeSecretStore disk)
                         │  gizli değerler YALNIZ env kanalı
                         ▼
                   backend/youtube.py (saf urllib, NDJSON)
                         │
            oauth2.googleapis.com/device/code → token → revoke
            youtubei/v1/browse (Bearer)  ·  youtube/v3/channels?mine=true
```

- **Gizli değerler:** `client_secret`, `refresh_token` safeStorage'da kalıcı (`youtube-session.safe.json`); `access_token` yalnız bellekte; `device_code` ana süreçte `_ytDevice`'ta.
- **Env kanalı:** `WHISPER_YT_CLIENT_SECRET / _REFRESH_TOKEN / _ACCESS_TOKEN / _DEVICE_CODE` — argv'de asla.
- **browse_id beyaz liste** (çift katman, main + backend): `FEsubscriptions`, `FEwhat_to_watch`, `FElibrary`, `FEhistory`, `VLWL`, `VLLL`.
- **Scope:** `youtube.readonly` (salt-okuma).
- **Süreç:** `mediaJobs.youtube` tek-slot + `terminateProcessTree` iptali + timeout.

## 3. Kod incelemesinde bulunan ve COMMIT ÖNCESİ düzeltilen gerçek buglar

| # | Bug | Etki | Düzeltme |
|---|---|---|---|
| R70-K1 | `youtube:poll` `onEvent` her NDJSON'u `youtube:event` ile renderer'a forward ediyordu; backend `login` emit'i `access_token`+`refresh_token` taşır | **Token sızıntısı renderer'a** | Yalnız `type==='log'` olayları iletilir |
| R70-K2 | `youtube:deviceCode` `verification_url`'i olduğu gibi dönüyordu | Kötü niyetli/hatalı yanıtta `javascript:`/`data:` şeması renderer'a | https'e indirgeme, fallback `google.com/device` |
| R70-K3 | `runYoutubeCommand` `proc.on('error')` → `err.message` renderer'a dönüyordu | Ham spawn ayrıntısı sızıntısı (ytdlp-runtime sözleşmesi ihlali) | Türkçe sınıflı mesaj + sanitizeProcessDetail log'a |
| R70-K4 | `restoreYoutubeSession()` `restoreBrowserSessionState()`–`createWindow()` arasına girdi | browser-foundation sıra sözleşmesi kırıldı | Oturum restore'ları `restoreBrowserSessionState()` ÖNCESİNE taşındı (K2 kalıntısı da aynı ihlali yapıyordu — ikisi birden düzeldi) |

## 4. Doğrulanan güvenlik invariants (test kanıtlı)

- `youtube:session` cevap anahtarları ⊆ {loggedIn,userName,userEmail,hasClient,pendingCode}
- `youtube:poll` başarı cevabı token alanı içermez
- `youtube:deviceCode` cevabı `device_code` içermez
- `persistYoutubeSession` `access_token` persist ETMEZ
- 7 handler'ın hepsi `authorizedBrowserSender` kontrolünde
- continuation 2000 char'a sınırlı; browse_id whitelist çift katman
- Tüm backend URL'leri https + googleapis/youtube/ytimg origin'lerinde
- `youtube:setClient` biçim doğrulama `[A-Za-z0-9._-]{10,200}`

## 5. Renderer entegrasyonu

- Sidebar'a `stYtLoginBtn`/`stYtLogoutBtn` (YouTube ▶)
- `youtubeLoginModal` — 3 görünüm: client kayıt / cihaz kodu (kod + doğrulama linki + iptal) / bağlı durum
- `restoreYoutubeSession()` boot'ta oturumu geri yükler
- **subscriptions bölümü:** `youtubeLoggedIn` ise `youtube:browse('FEsubscriptions')` → gerçek abonelik feed'i; statü satırı `YouTube: <kanal>`; yoksa eski Invidious yolu
- Cihaz kodu iptali `youtube:cancel` → süreç ağacı öldürülür

## 6. Test kanıtı

| Test | Sonuç |
|---|---|
| `tests/report70-youtube-oauth.test.js` (yeni) | **19/19** |
| `backend/test_youtube.py` (yeni, 18 test — mock'lu) | **18/18** |
| `report67-smarttube-wiring` | 66/66 |
| `report65-invidious-bridge` | 21/21 |
| `adversarial-ipc` | 15/15 |
| `design-system` | OK |
| backend unittest toplam | **143/143** |
| Electron smoke (gerçek DOM) | GEÇTİ — `ytModal, ytLoginHidden, ytLogoutVisible, ytSubsRendered, ytStatus, ytLogoutCleanup` tümü true |

## 7. Bilinen kalan kırmızılar (kapsam dışı)

`report62`, `report63-secret`, `report63-ssrf` — başka iş akışının commit'siz WIP testleri (bekledikleri ürün kodu yazılmamış). Dokunulmadı.

## 8. Sınırlar — dürüst değerlendirme

- **Canlı Google akışı test edilmedi.** Device-code isteği, polling, refresh, browse yanıt ayrıştırması mock/fixture düzeyinde doğrulandı. `youtubei/v1/browse`'a OAuth Bearer kabulü plausibl ama canlıda PO-token/ek doğrulama gerekebilir.
- **Tek seferlik kurulum gerekiyor:** kullanıcı Google Cloud'da "TV ve sınırlı girişli cihazlar" tipinde OAuth client + YouTube Data API v3 etkinleştirmeli.
- InnerTube API key youtube.com HTML'inden çıkarılır; çıkarılamazsa gömülü genel WEB anahtarına düşer (rotasyon riski).
- `FEwhat_to_watch`, `FElibrary`, `FEhistory`, `VLWL`, `VLLL` backend'de destekli ama UI'da henüz bağlı değil — yalnız subscriptions gerçek veriye geçti.
