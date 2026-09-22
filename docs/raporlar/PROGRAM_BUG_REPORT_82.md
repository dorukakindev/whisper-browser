# PROGRAM BUG REPORT 82 — Güvenlik yüzeyi derin denetimi (navigasyon / izin / indirme / sır taşıma)

- **Tarih:** 2026-09-19 15:17
- **Tür:** Salt-okunur kaynak denetimi — ürün kodu değiştirilmedi (değişiklikler paralel AI'da)
- **Yöntem:** Doğrudan kaynak okuma. Bu tur için görevlendirilen 6 keşif alt-ajanının hiçbiri sonuç döndüremedi (kullanıcı kesintisiyle iptal); aşağıdaki her bulgu ve temiz kararı bizzat dosya/satır okunarak doğrulandı.

---

## 1. Doğrulanmış bulgular

### B82-01 · P3 — Invidious giriş şifresi `argv`'de; proje kendi env-konvansiyonunu ihlal ediyor

`ipcMain.handle('invidious:login')` şifreyi alt sürece **komut satırı argümanı** olarak geçiriyor:

```js
// src/main.js:1539-1540
const args = ['login', '--username', String(username).slice(0, 100),
              '--password', String(password).slice(0, 200)];
```

Projenin kendi kuralı (AGENTS.md "Gizli anahtarlar"): *"HF token ve LLM API key argv'den değil ortam değişkeninden geçer — süreç listesinde görünmesin diye."* Aynı dosyada YouTube akışı bu kurala birebir uyuyor: `client_secret`, `refresh_token`, `access_token` ve `device_code` **`WHISPER_YT_*` env değişkenleriyle** taşınıyor (`src/main.js:993-998`), yalnız gizli olmayan `clientId` argv'de (1094).

**Etki:** Login çağrısının yaşadığı ~saniyeler boyunca Invidious hesap şifresi süreç komut satırında düz metin durur; aynı makinedeki başka kullanıcılar/süreçler (WMI `CommandLine`, Process Explorer) okuyabilir. Uzak saldırı vektörü yok — bu yerel-açık / hijyen sınıfı bir bulgu, o yüzden P3.

**Öneri:** `youtubeAuthEnv()` kalıbını tekrarla — `WHISPER_INVIDIOUS_PASSWORD` env'i + `backend/invidious.py`'de argv yoksa env'den oku (`transcribe.py`'nin `WHISPER_HF_TOKEN` kalıbı). `--username` argv'de kalabilir.

---

## 2. Denetlenip TEMİZ çıkan yüzeyler

Bulgu üretmeyen ama satır satır doğrulanan alanlar — sonraki turlarda yeniden bakmaya gerek yok:

| Yüzey | Kanıt | Karar |
|---|---|---|
| **Navigasyon politikası** | `src/browser-navigation-policy.js:6-12` şema allowlist'i (yüzey başına internal/external ayrımı); `:16-19` kontrol-karakter reddi; `:31` userinfo yasağı ("credentials-not-allowed"); `:101` external yalnız ana-çerçevede; `:108-114` `will-frame-navigate` alt-çerçeve bekçisi | Temiz |
| **Popup akışı** | `main.js:4190-4208` — `browserWindowOpenHandler` `decideUrlPolicy`'den geçiriyor, `MAX_BROWSER_POPUPS` üstü reddediyor; `:4212-4221` popup'a `securePopupWebPreferences` (sandbox, izolasyon, `navigateOnDragDrop:false`); `:4237-4244` iç içe popup'lar da aynı bekçiye bağlanıyor | Temiz |
| **Site izinleri** | `src/browser-site-permissions.js` — izin adı allowlist'i (15 değer), bilinmeyen/boş origin ⇒ `'block'` (`:43`), 200 origin üst sınırı; `main.js:11162` arka-plan sekme isteği otomatik red + bildirim; `:11171-11177` 30 sn zaman aşımında red | Temiz |
| **İndirmeler** | `src/browser-downloads.js` — `setSavePath` YOK (native kaydetme diyaloğu + üzerine-yazma onayı korunuyor, `:57` yorum bilinçli); 8 eşzamanlı / 100 kayıt sınırı; `open-player` medya-uzantısı allowlist'i (`:120`); `done`'da listener temizliği (`:85`) | Temiz |
| **webRequest** | `browser-playback-diagnostics.js:180-208` — yalnız `onCompleted`/`onErrorOccurred` tanı dinleyicisi; başlık değişikliği yok; `main.js:3801-3807` kanıt yalnız etkin `webContentsId`'den kabul | Temiz |
| **Invidious SID hijyeni** | `sid` renderer'a gitmeden önce soyuluyor (`main.js:1551-1554`); `safeStorage` ile kalıcı (`:1548`); backend'e yalnız `WHISPER_INVIDIOUS_SID` env (`:1172-1173`); `backend/invidious.py:518-526` SID host'a bağlı — failover instance'a sızmaz; bilinmeyen instance'da `False` (güvenli varsayılan) | Temiz |
| **YouTube token hijyeni** | `main.js:993-998` tüm sırlar env'de; `:1697-1701` backend `login`/`token` emit'leri renderer'a iletilmiyor (yalnız `log`); `:1725-1728` `youtube:browse` browse-id allowlist'i | Temiz |
| **Ayar güvenliği** | `settings-security.js` — `scanJsonShape` derinlik/düğüm sınırları, `__proto__` reddi, endpoint-identity'ye bağlı sır mirası (`:255-263` — endpoint değişince eski anahtar yeni host'a Authorization olarak sızamaz), 16MB import sınırı | Temiz |
| **`emit(login, sid=…)`** | `backend/invidious.py:581` SID'i NDJSON'a basıyor görünse de tüketicisi yalnız ana süreç; renderer'a giden yol yukarıda soyuluyor | Bilinçli tasarım — FP elendi |

## 3. Önceki raporlardan hâlâ açık kalanlar (bu tur yeniden doğrulandı)

| Bulgu | Durum |
|---|---|
| **B80-01 (P2)** — `endpointSetting` sorgu parametrelerini taramıyor; `?api_key=`/`?token=` gömülü `translateBaseUrl` yedeğe düz metin düşüyor | **Açık.** Çalışma ağacındaki `settings-security.js` değişikliği yalnız `modelProfiles` alanı ekliyor; `endpointSetting` (:165-176) ve `sanitizeUiSettings` `translateBaseUrl` yolu (:199-206) değişmemiş. `queue-persistence.js:16`'daki `SENSITIVE_URL_PARAMS` kalıbı hâlâ paylaşılmıyor |
| **B80-02 (P3)** — `main.js` üretim `probeCommand`'i stderr'siz + sınırsız stdout; `process-io.js` yardımcısı 64KiB + stderr okumalı | Açık (latent; normal çağırıcılar `ffmpeg -version` gibi küçük çıktılı) |
| **D81-01 (P2)** — 262 Türkçe UI dizgesi `ui-locale.js` tablosunda yok | Açık; `_repro/audit-i18n.js` çıktısı ekleme listesi olarak hazır |
| **P79-01..04** — SDH set rebuild (~10×), TM `SequenceMatcher` 240 çağrı/sorgu (~19.5ms), DP ~50-90ms, semantik arama modeli istek başına yükleme | Açık (paralel AI'ya devredilmeye hazır) |
| **R77 SL1/SL2/SL4** — `browser-link-intent.js` öksüz (üretim kopyası preload inline), sahte telemetri 4 sabit-0 alan, `normalizeCues`/`cuesToSrt` üçer kopya | Açık |

## 4. Paralel AI WIP gözlemi (dokunulmadı)

- `src/renderer/renderer.js` + `index.html` + `ui-locale.js` + `settings-security.js` + yeni `src/provider-model-profiles.js`: sağlayıcı model profilleri + `testTranslationProvider` bağlantı-probe özelliği WIP. `window.api.testTranslationProvider` metoduna ihtiyaç duyuyor — preload/main tarafı bu diff'te görünmüyor; WIP tamamlanırken IPC handler'ının `authorizedBrowserSender` + `decideUrlPolicy('renderer-external')` benzeri endpoint doğrulamasıyla geldiği doğrulanmalı (probe endpoint'i kullanıcı-URL'si alıyor → SSRF sınırı).
- `m[1])` 0-bayt kök artefaktı hâlâ diskte (silme kullanıcı onayı gerektirir).

---
*Rapor hazırlayan: salt-okunur denetim oturumu. Bulgular `.md` kuralı gereği bu dosyada kalıcıdır.*
