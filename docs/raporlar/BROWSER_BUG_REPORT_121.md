# BROWSER BUG REPORT 121 — YouTube cihaz-kodu onay kaybı + çoklu hesap (SmartTube usulü)

Tarih: 2026-09-24 · Dal: `codex/youtube-multi-account-1790264471` · Taban: `master @ 8a5410f`

## Kullanıcı raporu

1. **BUG:** Cihaz kodu akışında google.com/device'da onay verildi ama uygulama giriş yapmadı.
2. **Özellik:** SmartTube'daki gibi birden fazla Google hesabı — hesap ekleme, hesaplar arasında geçiş, hesap çıkarma.

## Kök neden (BUG-121-01)

Modal kapanışı (`closeYoutubeLogin` — Esc, backdrop, X, veya başka bir akışa geçiş) `_ytFlowGen++` yapıp `youtube:cancel` IPC'si çağırıyordu; bu, main sürecindeki `mediaJobs.youtubeAuth` altında çalışan `youtube.py poll` alt sürecini öldürüyordu. Kullanıcı Google'da onayı verdiği anda uygulama çoktan dinlemeyi bırakmış oluyordu — "onayladım ama girmedi" şikayeti tam olarak buydu.

İkincil riskler:

- **BUG-121-02:** Google `refresh_token` döndürmezse (hesap daha önce bu istemciye izin vermişse ilk grant'ten sonra tekrar döndürmez) poll başarı emit'ini hata sayıyordu → geçici (yalnız access-token) oturum hiç kurulamıyordu.
- **BUG-121-03:** `poll` komutu genel `mediaJobs.youtube` slotunu kullanıyordu; 30 dakikaya kadar sürebilen bir poll, slotu kilitleyip browse/refresh çağrılarını aç bırakıyordu.

## Çözümler

- **Pasif kapanış:** `closeYoutubeLogin` artık yalnız modalı gizler + client-secret alanlarını temizler; gen artışı ve backend iptali yok. Modalı yeniden açmak süren akışı canlı gösterir (cihaz kodu + geri sayım devam eder). Akışı öldüren tek yol "İptal" düğmesi ve akış-değiştirme korumalarıdır.
- **Yeniden başlatma koruması:** `startYoutubeDeviceFlow` başlangıcında süren aynı-tür akış varsa `youtube:cancel` ile değiştirilir (eski "erken return" korunmuş davranışı bozuyordu: pasif kapanış sonrası ikinci başlatma sessizce yutuluyordu).
- **Ephemeral oturum:** `refresh_token`'siz grant artık hata değil `ephemeral: true` hesap olarak kabul edilir; UI'da uyarı rozeti + osd gösterilir, diske yazılmaz (yeniden açılışta düşer).
- **Ayrı auth slotu:** `device_code`/`poll`/`exchange_code`/`revoke` → `mediaJobs.youtubeAuth`; browse/refresh `mediaJobs.youtube` slotunda kaldığından uzun poll artık akışı kilitlemiyor.

## Çoklu hesap (SmartTube usulü)

- **Yeni saf modül** `src/youtube-accounts.js`: `sanitizeAccount`, `accountIdFor` (refresh-token hash'e dayalı stabil kimlik), `migrateSecrets` (tek flat oturum → accounts haritası), `upsertAccount`, `removeAccount` (aktif çıkarılırsa sıradaki aktifleşir), `activeAccount`, `persistableAccounts` (yalnız `{refreshToken,userName,userEmail,authMode}` — kısa ömürlü token asla diske yazılmaz), `accountList` (renderer'a güvenli `{id,userName,userEmail,active,ephemeral}` listesi).
- **Kalıcılık:** `youtube-session.safe.json` içinde `accounts` (şifreli JSON blob) + `active_id`. SafeSecretStore yalnız string alan şifrelediği için çoklu-hesap durumu tek blob olarak tutulur; eski flat alanlar (`refresh_token`, `user_name`, …) ilk yüklemede migrate edilir.
- **Yeni IPC:** `youtube:accountSwitch` (aktif hesap değiştirir + persist + güvenli payload döner), `youtube:accountRemove` (hesabın kendi access token'ıyla revoke eder, sonra çıkarır). Mevcut `youtube:logout` artık **yalnız aktif hesabı** çıkarır — başka hesap kaldıysa oturum açık kalır.
- **`youtubeSessionPayload()`** tek merkezden `{loggedIn, userName, userEmail, ephemeral, hasClient, clientId, pendingCode, accounts}` döner; `session`/`switch`/`remove`/`logout`/`poll`/`exchange` hepsi aynı güvenli payload'u kullanır — token hiçbirinde renderer'a gitmez.
- **İstemci değişimi:** `youtube:setClient` artık TÜM hesapları sıfırlar (grant'ler istemciye aittir, taşınamaz).
- **UI:** Girişli modal "YouTube hesapları" görünümüne döndü — hesap listesi (satır tıkla → geçiş, ✕ → çıkar, aktif rozeti, ephemeral uyarı rozeti), "Hesap ekle" (yeni device-code akışı başlatır; başarıda listeye eklenir), "Oturumu kapat" (aktif hesabı çıkarır). TR+EN dizgiler ve `.yt-account-*` stilleri eklendi.

## Değişen dosyalar

| Dosya | Amaç |
|---|---|
| `src/youtube-accounts.js` | YENİ — saf hesap deposu modülü |
| `src/main.js` | accounts deposu, migrate, youtubeAuth slotu, switch/remove IPC, payload yardımcısı |
| `src/preload.js` | `youtubeAccountSwitch`, `youtubeAccountRemove` |
| `src/renderer/index.html` | hesap listesi görünümü |
| `src/renderer/renderer.js` | pasif kapanış + resync, restart koruması, hesap UI, ephemeral uyarı |
| `src/renderer/ui-locale.js` | TR/EN dizgiler |
| `src/renderer/styles.css` | `.yt-account-*` stilleri |
| `tests/youtube-accounts.test.js` | YENİ — 7 birim test |
| `tests/report70-youtube-oauth.test.js` | güncel içyapı sözleşmesi (payload yardımcısı, removeAccount, youtubeAuth slotu) |
| `tests/electron-smarttube-boot.smoke.js` | yeni kapanış≠iptal sözleşmesine göre güncellendi + regresyon assert'i |

## Testler

- `tests/youtube-accounts.test.js` — 7/7 geçti
- `tests/report70-youtube-oauth.test.js` — 25/25 geçti
- `tests/report104-youtube-browse.test.js`, `browser-youtube-style`, `browser-youtube-whisper`, `youtube-tv-mode`, `ui-locale`, `report67-smarttube-wiring` (84), `player-ui` (148) — geçti
- `node --check` — tüm değişen js dosyaları temiz
- Electron smoke: `electron-smarttube-boot` + `electron-smarttube-usage-matrix` — yeşil (login akışı, kişisel feed, logout temizliği, feed retry dahil)
- Tam `npm test` koşulmadı (kapsam dışı alanlar değişmedi).

## Doğrulanamayan sınırlar

- Gerçek Google hesabıyla uçtan-uca çoklu hesap (ekle→geçiş→revoke) yalnız Windows'ta gerçek girişle doğrulanabilir; burada mock handler'larla doğrulandı.
- Ephemeral oturum süresi Google'a bağlı (tipik ~1 saat); süre dolunca feed sessizce genel akışa düşer, hesap satırında uyarı rozeti görünür.
- `accounts` blob'u safeStorage şifreli; Windows'ta DPAPI kullanıcı hesabına bağlıdır — farklı Windows kullanıcısı altında okunamaz (mevcut sözleşmeyle aynı).

## Windows etkisi

- Yeni bağımlılık yok; `install.bat`/`start.bat` akışı değişmedi. SafeSecretStore mevcut Windows yolunu (`app.getPath('userData')` + DPAPI) kullanıyor — Windows'a özgü yeni risk yok. UTF-8/Türkçe dizgiler locale dosyasında iki dilli.
