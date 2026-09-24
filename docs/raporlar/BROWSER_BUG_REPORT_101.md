# BROWSER_BUG_REPORT_101 — T4: SmartTube/YouTube OAuth uçtan uca dayanıklılık

**Dal:** `devin/t4-smarttube-oauth`
**Başlangıç SHA:** `4453ae003ee092b33d06a802535b65b460169e31` (origin/master)
**Kapsam:** PKCE+loopback ve device-code yollarının sahte OAuth/YouTube sunucusu + gerçek Electron UI ile ayrı ayrı dayanıklılık testi: state uyuşmazlığı, iptal, geç gelen cevap, token yenileme, hesap değiştirme, abonelik feed'i ve oynatıcıya geçiş; çıkış/başarısız/girişli ekranların görsel+klavye doğrulaması.

## Yöntem

- Yeni smoke: `tests/electron-youtube-oauth.smoke.js` — gerçek `src/main.js` (gerçek IPC zinciri) + izole profil (`WHISPER_RESOURCE_SOAK_USER_DATA`) + 127.0.0.1'de sahte OAuth/YouTube sunucusu (`/device/code`, `/token`, `/revoke`, `/youtube/v3/channels`, `/youtubei/v1/browse`, `/` InnerTube-key HTML'i).
- Uç nokta yönlendirmesi yeni test kancasıyla: `WHISPER_YT_TEST_BASE` yalnız `127.0.0.1|localhost|::1` hedeflerinde geçerli — uzak host'a token akışı reddedilir (kimlik avı koruması, `backend/youtube.py::_endpoint`).
- PKCE tarafında `shell.openExternal` main-süreçte yamalanıp yetkilendirme URL'i yakalanır; callback'e `http.get` ile elle yazılır (yanlış/doğru state senaryoları).
- **Gerçek Google hesabı kullanılmadı.** Mock başarı gerçek hesap doğrulaması sayılmaz.

## Bulgular

### F-101-1 — FAIL-FIXED: Eşzamanlı `youtube:browse` istekleri "zaten çalışıyor" ile reddediliyor

- **Dosya:** `src/main.js` — `youtube:browse` handler'ı → `runYoutubeCommand` (`mediaJobs.youtube` tek slot).
- **Ulaşılabilir yol:** Cihaz koduyla giriş tamamlandığında renderer `startYoutubeDeviceFlow` başarı dalında `renderSmartTubeSection(stCurrentSection)` tetikler → `youtubeBrowse('FEwhat_to_watch')`. Kullanıcı bu sırada SUBSCRIPTIONS'a tıklarsa → `youtubeBrowse('FEsubscriptions')`. İkinci IPC ilkinin python süreci açıkken gelirse `runYoutubeCommand` hemen `{ok:false,'Bir YouTube işi zaten çalışıyor.'}` döndürüyor → renderer `showError('YouTube abonelikleri alınamadı.')` basıp bölümü boş bırakıyordu. Aynı çarpışma `ensureYoutubeAccessToken`'ın refresh spawn'ı ile bir browse spawn'ı arasında da mümkündü.
- **Kullanıcı etkisi:** Giriş sonrası bölüm değiştirme / hızlı sekme geçişi oturum varken "feed alınamadı" hatası üretiyordu — oturum sağlıklı olduğu halde kullanıcıya başarısızlık gösteriliyor.
- **Kırmızı test (gerçek Electron):** smoke Faz-4 — `Promise.all([youtubeBrowse('FEsubscriptions'), youtubeBrowse('FEwhat_to_watch')])` düzeltme öncesi `{ok:false, error:'Bir YouTube işi zaten çalışıyor.'}` döndürüyordu (rapor: ilk koşu `eşzamanlı browse[0]` assert'inde kırmızı). Ayrıca faz-3 organik çarpışma: login sonrası home re-render browse'u ile manuel subscriptions browse'u tek slot'a bindi.
- **Düzeltme:** `youtube:browse` handler'ı `_ytBrowseTail` promise-zinciriyle serileştirildi; zincir içinde `mediaJobs.youtube` doluysa ≤10 sn bekleme (uçuştaki refresh/poll bitişi). Poll/`device_code` gibi uzun işler için anlık red korunuyor (UI'nın "zaten çalışıyor" bilgisi anlamlı kalıyor), yalnız kısa+idempotent browse'lar kuyrukla.
- **Yeşil kanıt:** aynı smoke'ta iki eşzamanlı browse de `{ok:true}` döndü; sunucu `browseCalls`'ta her iki `browseId` sırayla görüldü. `report.concurrentBrowse=[{ok:true},{ok:true}]`.

## Senaryo matrisi (gerçek Electron UI + sahte sunucu)

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| Çıkış durumu ekranı (login düğmesi görünür, logout gizli) | PASS | `01-logged-out-modal.png`, `report.preLogin` |
| Modal Esc ile kapanır; input'ta Enter = Kaydet | PASS | modal hidden + `hasClient:true` |
| Device-code: kod+QR+doğrulama linki görünümü | PASS | `02-device-code-shown.png` (`ABCD-EFGH`) |
| Device iptal + geç gelen onay düşürülür | PASS | `youtubeCancel` → sonraki onay oturum açmadı (`session.loggedIn=false`) |
| Device reddedilme (access_denied) → hata satırı | PASS | `03-login-denied.png` — "reddetti" metni, giriş yok |
| PKCE state uyuşmazlığı → reddedilir, token takası YOK | PASS | callback 400 + `tokenGrants.code=0` + "state uyuşmadı" status, `04-pkce-state-mismatch.png` |
| PKCE iptal → loopback dinleyicisi kapanır; doğru callback bile bağlanamaz | PASS | `http.get` → ECONNREFUSED, `code` grant=0 |
| Device girişi başarılı → kanal adı + modal kapanış + logout düğmesi | PASS | `05-logged-in.png`, `06-logged-view.png`, `meCalls` |
| Abonelik feed'i `FEsubscriptions` → InnerTube kartları DOM'da | PASS | `07-subscriptions.png`, `browseCalls` içinde `FEsubscriptions` |
| Kart Enter → player handoff (`playerYtUrl`+`pendingAutoOpen`) | PASS | `report.handoff`, `08-player-handoff.png` |
| Token yenileme: `expires_in=30` → ilk browse'da tam 1 refresh; sonrası 0 | PASS | `tokenGrants.refresh=1` |
| Eşzamanlı browse (F-101-1) → serileştirilmiş, ikisi de başarılı | PASS | `concurrentBrowse` |
| İstemci değişimi eski oturumu düşürür | PASS | `youtube:setClient` → `session.loggedIn=false`, login düğmesi geri |
| PKCE başarılı giriş → `code_verifier`+`redirect_uri` takas edildi | PASS | `tokenGrants.code=1`, `lastAuthCodeForm.code_verifier` |
| Logout → revoke + UI sıfırlama | PASS | `revokeCalls=1`, `postLogout` |

## Sayaçlar (final)

`deviceCalls=3`, `tokenGrants={device:3, code:1, refresh:1}`, `revokeCalls=1`, `browseCalls=[FEwhat_to_watch, FEsubscriptions, FEwhat_to_watch, FEsubscriptions, FEwhat_to_watch, FEsubscriptions, FEwhat_to_watch]`, `meCalls=2`. Tümü `.uiprev/youtube-oauth/report.json` + `01..08` ekran görüntülerinde.

## Yeni test kancası

`backend/youtube.py::_endpoint` — `WHISPER_YT_TEST_BASE` env'i yalnız loopback host'a (http/https, `127.0.0.1|localhost|::1`) yönlendirir; `0.0.0.0`, `127.0.0.1.evil.com`, ftp ve uzak host'lar reddedilir (`backend/test_youtube.py::TestEndpointOverride`, 3 test). Token akışının keyfi host'a sapması (kimlik avı) engellenir.

## Çalıştırılanlar

- `node_modules/.bin/electron tests/electron-youtube-oauth.smoke.js` (DISPLAY=:0) — PASS
- `python3 -m unittest test_youtube` — 25 test OK (3 yeni)
- `npm test` — tam paket OK
- `npm run test:electron-bridge` — OK

## Açık sınırlar (dürüstlük)

- **Gerçek Google hesabı yok** — sahte sunucu onayı gerçek hesap doğrulaması değildir; gerçek consent sayfası, scope reddi, Google tarafı rate-limit/refresh-rotation davranışları kapsam dışı.
- **Gerçek timeout yolu koşulmadı** — 600 sn'lik loopback/poll süre-sınırı yerine `expired_token`/`access_denied` sonlu-hata yolları test edildi (zaman sınırı bekleme süresi CI'da pratik değil).
- **safeStorage kalıcılığı Linux'ta doğrulanmadı** — izole profilde oturum disk yazımı çalışır ama keyring yokluğunda `safeStorage` şifreleme davranışı platforma göre değişir (bilinen Linux sınırı, yeni değil).
- `slow_down` grant'ı ve InnerTube continuation sayfalaması bu turda senaryoya girmedi.
