# Browser Bug Report 106 — Player feed görünmezlik + YouTube TV girişi

Kullanıcı raporu (2026-09-22): "oynatıcı kısmının ana ekranında youtube videoları falan hiçbir şey görünmüyor çok uzun sürüyor ayrıca bir şeylerin yüklenmesi ayrıca hala youtube tv auth ile giriş olayı yok bunu düzelt". Üç şikâyet: boş ana ekran, yavaş yükleme, TV auth yok. "Normal YouTube da olabilir, Invidious şart değil."

## Bulgular

### F-106-1 — SmartTube kart thumbnail'ları iki bağımsız nedenden hiç görünmüyor

**Kök neden A (render):** `.st-card-thumb` `aspect-ratio: 16/9` kullanıyor ve `.st-card` `display:flex; flex-direction:column` içinde bir flex item. Chromium'nun flex algoritması, `flex-basis:auto` item'ın hypothetical main size'ını çözerken cross eksen (width) henüz kesin değilse aspect-ratio'yu uygulayamıyor ve içeriğin (img `height:100%` → belirsiz yüksekliğe yüzde → 0 katkı) toplamına düşüyor → div yüksekliği **0**. Grid item'da aynı aspect-ratio normal çalışır (sütun genişliği baştan tanımlı). Canlı renderer'da CDP ile doğrulandı: `thumb.getBoundingClientRect().height === 0`, aynı dokümanda standalone div ile aynı aspect-ratio → 168.75px, `display:grid` verilen kartta → 172.125px. `content-visibility` ile ilgisi yok (CV'yi kaldırmak çözmedi).

`.st-card` tasarım gereği `background: transparent; border: transparent` — thumbnail olmadan kartta görünen tek şey soluk başlık metni, yani "hiçbir şey görünmüyor" birebir bu semptom.

**Düzeltme:** `.st-card` → `display:grid` (auto satırlar; body hâlâ kendi içinde flex-column). Kartın dış görünümü değişmez; yalnızca çocuk eksen çözümü değişir. `styles.css` içine Türkçe neden açıklaması eklendi.

**Kök neden B (veri):** Tüm thumbnail'lar Invidious instance'ının `/vi/<id>/mqdefault.jpg` proxy yoluyla geliyordu. Ölçüm (2026-09-22): `invidious.f5.si/api/v1/popular` veri döndürürken `…/vi/…/mqdefault.jpg` **HTTP 200 text/html** döndürüyor (bozuk proxy — img'e HTML basılıyor). Üstelik feed'i veren instance ile resmi vekilleyen instance aynı değilse uç çeşitli. `_check_instance` `/api/v1/stats`'e bakıyordu — 200 verse bile `/vi/` bozuk kalıyor (sağlık kontrolü yanlış-pozitif).

**Düzeltme:** `backend/invidious.py` `_ytimg_thumbs(vid)` — tüm video thumbnail'ları `https://i.ytimg.com/vi/<id>/{mq,hq,maxres}default.jpg` olarak üretilir; YouTube'un kendi CDN'i instance bağımsız ve her yerde tutarlı. Renderer'daki `lastInvidiousInstance + '/vi/…'` yolları (ana sayfa history kartı + "İzlemeye devam et") da i.ytimg.com'a çevrildi. CSP `img-src 'self' data: https:` zaten izin veriyor.

### F-106-2 — Feed yüklemesi ölü instance'larda seri failover ile uzuyor

`DEFAULT_INSTANCES` sonunda çalışan `invidious.f5.si` duruyordu; `nadeko`/`chocolatemoo`/`tiekoetter` feed uçlarında 403, `nerdvpn` 401 veriyor (2026-09-22 ölçümü). Seri sağlık-denetim + istek denemesi her seferinde saniyeler kaybediyordu.

**Düzeltme:** Liste yeniden sıralandı — ölçülü çalışan `f5.si` başa alındı, ölenler fallback olarak korundu. Ölçüm: `invidious.py home` toplam ~3.6 s (önce ~6 s+; fail-complete döngüsüyle daha kötüleşebiliyordu). Liste sırası değişebilir; sağlık kontrolü ilk çalışana iner.

### F-106-3 — YouTube TV (cihaz kodu) girişi yoktu

Eski akış Google Cloud OAuth client id+secret girilmesini şart koşuyordu (`ytClientView`); client olmayan kullanıcı `openYoutubeLogin`'de doğrudan o forma düşüyor, hiç giriş yapılamıyordu.

**Düzeltme (sıfır-kurulum):** `backend/youtube.py`'ye gömülü **YouTube TV (TVHTML5) OAuth istemcisi** eklendi — yt-dlp/SmartTube ile aynı kamu istemcisi (`861556708454-…` / device-authorization flow, scope `gdata.youtube.com` + `youtube-paid-content`). `--client-id tv` sentinel değeri gömülü client'a çözümlenir; `client_secret` env yoksa tv modunda gömülü secret'a düşer.

- `main.js`: `youtubeSession.authMode` (`'tv' | 'custom'`) persist edilir; `ensureYoutubeAccessToken`/`youtube:deviceCode`/`youtube:poll` tv modunda `--client-id tv` geçer. `youtube:setClient` ve `authCode` (PKCE loopback) başarısı `custom` yapar — özel client yolu korunur.
- `renderer.js`: `openYoutubeLogin` — `hasClient` yoksa artık client formu yerine **`startYoutubeDeviceFlow()`** ile QR + `google.com/device` + kullanıcı kodu görünümü açılır; "İstemciyi değiştir" ile özel-client formuna hâlâ erişilir. Akış/bağlantı hatası cihaz görünümünde kalır (eskiden forma düşüyordu).
- `youtube:session` cevabı alan beyaz listesinde tutuldu (ekstra alan ekleme yerine test whitelist'i korundu).

**Doğrulama:** Canlı uygulamada modal açıldı → TV client gerçek `device_code` üretti (QR + `www.google.com/device` + `DKH-YHH-FSHS` kullanıcı kodu), "Waiting for approval…" poll'u döndü, Cancel temiz kapattı. Gerçek Google onayına kadar uçtan-uca login bu oturumda yapılmadı (hesap gerektirir) — UI + device-code grant kanıtlandı.

## Testler

- `npx mocha tests/report70-youtube-oauth.test.js tests/report65-invidious-bridge.test.js tests/report104-youtube-browse.test.js` → **25/25 geçti**. Üç test kasıtlı değişiklik yüzünden güncellendi: R70-03 session cevabına `deviceCapable`/`authMode` eklemek yerine whitelist korundu (alanlar kaldırıldı); R70-13 endpoint taramasına `http://gdata.youtube.com` scope-URI istisnası (ağ uç değil, Google'ın sabit scope kimliği); R70-14 refresh kapısı regex'i tvMode koşuluna güncellendi (invariant korundu: custom modda creds yoksa ağ yok).
- `node --check src/main.js src/preload.js src/renderer/renderer.js`, `py_compile backend/youtube.py backend/invidious.py` → temiz.
- Görsel: HOME + TRENDING thumbnail'ları gerçek uygulamada render edildi (DevTools `naturalWidth=320` doğrulaması + ekran görüntüsü).

## Sınırlar

- Gerçek Google hesap onayı yapılmadı (kullanıcı cihaz kodunu girene kadar akış durur). Device-code grant'ın kabulü kanıtlandı; token takası kullanıcı onayına bağlı.
- Invidious instance listesi hâlâ kamu ağına bağımlı; f5.si de ölebilir — kullanıcı "direkt YouTube da olur" dedi, feed hâlâ Invidious + yt-dlp fallback zincirinde (çalışıyor).
- Bu rapordaki flex×aspect-ratio davranışı bu makinedeki Chromium sürümünde canlı ölçüldü; eski/derlenmiş başka Electron sürümlerinde davranış farklı olabilir.
