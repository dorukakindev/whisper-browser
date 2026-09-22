# Browser Bug Report 106 — Player feed görünmezlik + YouTube TV girişi

Kullanıcı raporu (2026-09-22): "oynatıcı kısmının ana ekranında youtube videoları falan hiçbir şey görünmüyor çok uzun sürüyor ayrıca bir şeylerin yüklenmesi ayrıca hala youtube tv auth ile giriş olayı yok bunu düzelt". Üç şikâyet: boş ana ekran, yavaş yükleme, TV auth yok. "Normal YouTube da olabilir, Invidious şart değil."

## Bulgular

### F-106-1 — SmartTube kart thumbnail'ları iki bağımsız nedenden hiç görünmüyor

**Kök neden A (render — üç katman):** Kartların tamamen görünmez olmasının altında üst üste üç Chromium boyutlandırma tuzağı vardı; ilk ikisi tek başına da kartı öldürüyordu:

1. `.st-card-thumb`'ın `aspect-ratio:16/9`'u, `.st-card` `display:flex; flex-direction:column` içindeki flex item'da hypothetical main size çözülürken cross eksen (width) henüz kesin olmadığından **0px**'e çöküyordu. İlk denemede `.st-card`→`display:grid` iç thumb'ı kurtardı (172px) ama kart bu kez dış grid'in implicit satırında ~57px letterbox'a sıkıştı.
2. Asıl derin neden: `.st-card`'daki **`overflow:hidden`**, kartı sanal scroll kabı yapar; grid item'ın auto-track yükseklik katkısı Chromium'da o zaman ~min-content'e (ölçüm: 25px) düşer. E2E ajanının CDP bisect'i kanıtladı: `overflow:clip` ile katkı normale döner (kart 252px), `display:block`/`content-visibility` kapalıyken bile `hidden` kaldıkça çöküş sürer.
3. `aspect-ratio`'nun grid item'da da auto-track'e katkı üretemediği görüldü (satır "0px 80px") — thumb için `padding-top:56.25%` (klasik, genişlikten çözülen oran) kalıcı çözüm.

`.st-card` tasarım gereği `background:transparent; border:transparent` — thumbnail + başlık olmadan "hiçbir şey görünmüyor" birebir bu semptomdu.

**Düzeltme:** `.st-card` → `display:grid` + `overflow:clip` (köşe kesimi korunur, scroll-kabı olmaz); `.st-card-thumb` → `height:0; padding-top:56.25%` + img `position:absolute; inset:0` (16:9 her sütun genişliğinde kesin). Canlı ölçüm: kart 252.25px, thumb 170.25px, `grid-template-rows:"170px 80px"`, başlık görünür — HOME + TRENDING tam kartlarla render ediliyor.

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

### F-106-4 — Tanımsız palet değişkenleri tüm SmartTube kromunu açık temada görünmez kılıyor

Kartlar F-106-1 düzeltmesinden sonra doğru boyuta geldi ama kullanıcı "altında video başlığı bile yazmıyor" diye bildirdi. CDP ölçümü: `color: rgb(240,240,242)` başlık metni `rgb(247,244,237)` krem zemin üstünde — neredeyse görünmez.

**Kök neden:** `.st-*`/`.inv-*`/`.yt-*` katmanları dosyada 47+ yerde `var(--fg)`, `var(--muted)`, `var(--bg)`, `var(--bg-sunken)` kullanıyor ama bu adlar **hiçbir yerde tanımlı değil** — palet refaktöründe kanonik token'lara (`--text`, `--text-muted`, `--bg-1`, `--bg-3`) taşınırken bu blok atlanmış. Tanımsız `var()` geçersiz sayılıp `inherit`'e düşer; SmartTube katmanının atası player-stage'in koyu-zeminli metin rengini (rgb 240,240,242) miras alıyordu. Koyu temada tesadüfen okunaklı kalıyordu (açık metin koyu zeminde) — hata ancak açık temada fark ediliyordu. Yan etki: sidebar etiketleri (TRENDING, POPULAR…), öneri listesi, Invidious login modalı metni, `--bg`/`--bg-sunken` zeminleri (transparan render) da aynı sebepten silikti/görünmezdi.

**Düzeltme:** `:root`'a köprü alias bloğu — `--fg: var(--text)`, `--muted: var(--text-muted)`, `--bg: var(--bg-1)`, `--bg-sunken: var(--bg-3)`. `var()` kullanım yerinde çözüldüğü için `html[data-theme="light"]` geçersiz kılmaları otomatik doğru değer verir. Doğrulama (canlı): başlık `rgb(40,35,31)` on `rgb(247,244,237)` — tam kontrast; sidebar + tüm krom etiketleri geri döndü. Not: file:// stylesheet'i normal `location.reload()` bellek önbelleğinden getirebiliyor; doğrulamada `?r=` query-bust ile taze yükleme kullanıldı.

## Testler

- `npx mocha tests/report70-youtube-oauth.test.js tests/report65-invidious-bridge.test.js tests/report104-youtube-browse.test.js` → **25/25 geçti**. Üç test kasıtlı değişiklik yüzünden güncellendi: R70-03 session cevabına `deviceCapable`/`authMode` eklemek yerine whitelist korundu (alanlar kaldırıldı); R70-13 endpoint taramasına `http://gdata.youtube.com` scope-URI istisnası (ağ uç değil, Google'ın sabit scope kimliği); R70-14 refresh kapısı regex'i tvMode koşuluna güncellendi (invariant korundu: custom modda creds yoksa ağ yok).
- `node --check src/main.js src/preload.js src/renderer/renderer.js`, `py_compile backend/youtube.py backend/invidious.py` → temiz.
- Görsel: HOME + TRENDING thumbnail'ları gerçek uygulamada render edildi (DevTools `naturalWidth=320` + ekran görüntüsü). E2E turu (gerçek Electron): TRENDING refetch→30 kart+görsel 3.4s; cihaz kodu akışı QR+`google.com/device`+gerçek kodlar (GWK-KLR-PPNX, SVC-NZP-FJG); kuyruk rayı + menü çevirisi doğru; kartlar son CSS ile 252px tam boy.

## Sınırlar

- Gerçek Google hesap onayı yapılmadı (kullanıcı cihaz kodunu girene kadar akış durur). Device-code grant'ın kabulü kanıtlandı; token takası kullanıcı onayına bağlı.
- Invidious instance listesi hâlâ kamu ağına bağımlı; f5.si de ölebilir — kullanıcı "direkt YouTube da olur" dedi, feed hâlâ Invidious + yt-dlp fallback zincirinde (çalışıyor).
- Bu rapordaki Chromium boyutlandırma davranışları (aspect-ratio×flex/grid, overflow:hidden grid-katkısı) bu makinedeki sürümde canlı ölçüldü; eski/derlenmiş başka Electron sürümlerinde farklı olabilir. `overflow:clip` Chromium ≥90 ister — paketli Electron'ın çekirdeği bunun üstünde.
