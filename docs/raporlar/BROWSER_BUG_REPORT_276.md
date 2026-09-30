# R323-4 — URL/host normalizasyon fuzz'ı (IDN/punycode/SSRF)

**Tarih:** 2026-09-30
**Dal:** `devin/1790764391-r323-4-invidious-ssrf`
**Kapsam:** `isLocalInvidiousInstance` + `safePlaceUrl`/`redactUrlSensitiveParams` + `normalizeBrowserUrl` + `hostMatches`/`canonicalMediaIdentity`.

## Bulgular

### B-323-02 — Invidious SID kapısı sayısal-önekli DNS sahtelerine açık (DÜZELTİLDİ)

`isLocalInvidiousInstance` http instance'ları yalnız yerel/özel ağda kabul edip SID env'i ekler (K7). Özel-IP kontrolleri `^127\.` `^10\.` `^192\.168\.` `^172\.(16-31)\.` önek regex'leriydi — fakat WHATWG host parser `127.evil.com` gibi adları **alan adı olarak bırakır** (IPv4 normalizasyonu yalnız son etiket sayısal olduğunda tetiklenir). Sonuç: `http://127.evil.com` "yerel" sayılıyor ve SID saldırgan kontrollü DNS'e sızıyordu — R167 trailing-dot sınıfının devamı.

**Kanıt:** `new URL('http://127.evil.com').hostname` → `'127.evil.com'`; `isLocal` master'da `true` (test master'da FAIL, dalda PASS).

**Düzeltme:** `localhost`/`.local` ve IPv6 `[…]` dalları aynen korundu; IPv4 kontrolleri artık yalnız `^[\d.]+$` (kanonik rakam+nokta host) altında çalışır. Kısa/hex/octal/dword biçimler parser'da zaten kanonikleştiği için gerçek `127.1`/`0x7f.1`/`2130706433`/`0177.0.0.1` → `127.0.0.1` → hâlâ yerel.

**Etki:** uzak `http://<numeric-prefix>.<attacker>` instance tanımlayan kullanıcının Invidious SID'i dışarı sızabilirdi — düşük olasılık, yüksek şiddet (oturum ele geçirme).

## Denetlenen diğer yüzeyler (temiz)

- `safePlaceUrl`: credential sıyırma, hassas/izleme parametreleri (sorgu + `;jsessionid` path + `#/route?x=` hash-sorgusu), OAuth-fragment (`#access_token=`) hash silme, `#t=`/`#start=` zaman bağlantısı koruma, 8192 sınırı, 400-tohum idempotans — hepsi doğru.
- `redactUrlSensitiveParams`: değişiklik yoksa ham adresi korur (geri-yükleme stabilitesi), hash içi hassas parametre siler.
- `normalizeBrowserUrl`: IDN NFC/NFD/büyük-harf → aynı punycode (`xn--mnchen-3ya`), credential sıyırma, parametre sıralama, `#!`/`#!/` SPA route koruma, 16384 sınırı geçerli URL bırakır, 400-tohum idempotans.
- `hostMatches`/`isAmazonHost`: yalnız nokta-sınırlı suffix — `evilamazon.com`/`amazon.com.evil.com` eşleşmez.
- `canonicalMediaIdentity`: credential/tracking varyantları tek kimliğe iner (path case bilinçli olarak korunur — URL spec).

## Kalan sınırlar

- `localhost.` (trailing-dot FQDN) ve `*.local.` kapıdan düşer — deny yönünde, bilinçli.
- 169.254.0.0/16 link-local kapsam dışı (mevcut davranış, dokümante).
- IPv4-mapped IPv6 `[::ffff:…]` yerel sayılmaz — SID yerleşimi için güvenli yön.

## Testler

- `node tests/url-host-fuzz.test.js` → 12/12 (master'da B-323-02 kırmızı kanıtlı)
- `browser-place-url`, `browser-places-*`, `report65-invidious-bridge` → PASS

## Windows etkisi

Yok — URL mantığı platform bağımsız.
