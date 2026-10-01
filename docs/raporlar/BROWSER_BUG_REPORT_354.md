# BROWSER_BUG_REPORT_354 — Madde 42: Ağ yönlendirme sınırları

**Tarih:** 2026-10-01 · **Dal:** devin/…-net-redirect-bounds · **Başlangıç master:** `c00abe8`

## Kapsam ve yöntem

Tüm ana-süreç ağ yüzeyleri envanterlendi: `net.request`, `session.fetch` ve Node `fetch` çağrılarının her biri yönlendirme politikası, DNS-pinning, adres-sınıfı kapısı ve kimlik bilgisi taşıması açısından tek tek denetlendi. İstemci tarafı kullanıcı kararı bekleyen proxy politikasına dokunulmadı (madde gereği).

## Temiz çıkan yüzeyler (denetlendi, kusur yok)

| Yüzey | Kontrol | Durum |
|---|---|---|
| Altyazı indirme (`requestPinnedSubtitleBuffer`) | DNS `lookup(all)` + `isPublicMangaIpAddress` kapısı, `lookup` sabitine pinlenmiş Node istek (rebinding kapalı), manuel ≤5 hop, her hop yeniden doğrulama + protokol/kimlik/8192 kapısı | Temiz |
| Manga görüntü (`requestPinnedMangaImage`) | her hop `assertPublicMangaImageHost` + pin, ≤4 manuel hop | Temiz |
| Stremio/OpenSubtitles | `approvedStremioUrl`/`approvedDownloadUrl` host allowlist + manuel ≤3 hop | Temiz |
| SponsorBlock/DeArrow/RYD `net.request` ×3 | `redirect: 'error'`, `credentials: 'omit'`, sabit host | Temiz |
| catalog-extensions TMDB | `redirect: 'error'` | Temiz |

## Bulunan ve düzeltilen kusurlar

### B-354-01 `saveBrowserContextImage` — kapısız zincir + kimlik sızıntısı (düzeltildi)

Sağ-tık "görseli kaydet" çağrısı `session.fetch(url, {redirect:'follow'})` + `Referer: <sayfa>` gönderiyordu:

- Farklı kökenli hedef için genel-adres doğrulaması yoktu → sayfa `http://192.168.1.1/…` veya `http://169.254.169.254/…` adresini `src` olarak ilan edip ana süreçten **SSRF-to-disk** yaptırabilirdi.
- `follow` zinciri her hop'u doğrulamadan izlerdi; ilk genel CDN hop'u iç ağa zincirlenebilirdi.
- `Referer` (tam sayfa URL'i) ve oturum çerezleri zincirin **her** hop'unda üçüncü kökene sızıyordu.

**Düzeltme:** manuel yönlendirme döngüsü (≤4 hop). Her hop'ta hedef `sameOriginAsPage` değilse `assertPublicBrowserSubtitleUrl` ile DNS-tabanlı genel-adres doğrulaması; `credentials`/`Referer` yalnız sayfa-kökeni hoplarında taşınır; hop hedefi `https?:` + kimlik-bilgisiz + ≤8192 kapısından geçer. Yerel ağ sitesinin kendi görseli (aynı köken) etkilenmez.

### B-354-02 Favicon — aynı-köken `follow` zinciri dışarı taşabilirdi (düzeltildi)

Farklı kökenli favicon zaten genel-adres kapılı + `manual` idi; aynı-köken hedef `follow` varsayılanına kalıyordu → aynı-köken ilk isteğin 3xx hop'u ayrılmış/özel bir adrese taşıyabilirdi.

**Düzeltme:** her zaman `manual`; hop hedefi `sameOriginAsPage` veya genel-adres doğrulamalı olmalı, ≤2 hop; çerezler yalnız aynı-köken hoplarında. Geçersiz/güvensiz hop sessizce reddedilir (favicon opsiyonel veri).

### B-354-03 RSS besleme — `follow` zincir hedefi doğrulanmıyordu (düzeltildi)

`subs:rssFeed` işçisi `fetch(feedUrl, {redirect:'follow'})` yapıyordu; zincir sonundaki keyfî host gövdesi feed XML'i olarak ayrıştırılırdı.

**Düzeltme:** manuel döngü (≤2 hop); her hop hedefi `https:` + `youtube.com` / `*.youtube.com` ailesinde kalmalı; aksi durumda kanal hatası sayılır, kuyruk sürer.

## Kalan sınır (belgeleme)

Düzeltilen üç yol `session.fetch` kullanır (Chromium çözümleyicisi) — genel-adres kontrolü Node `dns.lookup` ile yapılır, Chromium isteği ayrıca çözümler. TOCTOU penceresi teorik olarak durur; altyazı/manga hattında kapatılan tam DNS-pinning bu yardımcı yollara taşınmadı (düşük-riskli ikincil indirmeler). IPv6 ULA/link-local dahil tüm özel/ayrılmış adres sınıfları `isPublicMangaIpAddress` tarafından reddedilir. Proxy politikası talimat gereği dokunulmadı.

## Kanıt

- `node --check src/main.js` — temiz
- `node tests/browser-controls-behavior.test.js` — geçti (yeni: 4 görsel-kaydetme + 4 favicon ratchet'i)
- `node tests/subscription-feed.test.js` — 35 kontrol (yeni: 3 feed ratchet'i)

**Windows etkisi:** davranış değişikliği ana süreç içinde; `.bat` akışı etkilenmez. Aynı-köken yerel-ağ görsel/favicon'u korunur.
