# BROWSER_BUG_REPORT_195 — R238: avatar harfi kayıtlı alan adından

- Tur: R238 (tur-3 BULGULAR açık-isteğe bağlı madde) · Tarih: 2026-09-29
- Teslim dalı: `fix/r238-avatar-domain` · Başlangıç kod kimliği: `e62d97e` (master)
- Kapsam: `browserTabAvatar` (sekme şeridi, omnibox, hızlı-yer kutucukları, NTP kutucukları)

## Bulgu

Tur-3 BULGULAR listesinin "isteğe bağlı" maddesi doğrulandı: `browserTabAvatar`
harfi `hostname`'in ilk karakterinden alıyordu — `tr.wikipedia.org` → **T**,
`sub.bbc.co.uk` → **S**, `amazon.com.tr` → **A** (ikisi aynı harf, farklı renk).
Renk tonu da tam host'tan türetildiği için `mail.`/`drive.` alt alanları aynı
siteye farklı renk veriyordu.

## Kök neden

`Array.from(host)[0]` tam host'un ilk karakterini kullanıyordu; www. öneki
temizleniyordu ama diğer alt alan adları değil.

## Düzeltme

Yeni `browserAvatarDomainKey(host)` yardımcısı kayıtlı-alan anahtarı türetir:
son iki parçadan ibaret host'larda aynen döner; ikinci-düzey sonekler
(`co`, `com`, `org`, `ac`, `gov`, `k12`, `gen`…) + 2 harfli ccTLD kombinasyonunda
üç parça alır (`sub.bbc.co.uk` → `bbc.co.uk`). Harf ve renk tonu bu anahtardan
türetilir → aynı sitenin alt alanları aynı harf + aynı tonda kalır.

Sınırlar: tam PSL çözümlemesi değil, bilinen ikinci-düzey sonek kümesi;
`foo.weirdtld` gibi kapsam dışı kalan durumlarda eski davranışa düşer
(son iki parçanın ilki) — yine de ülke-dil subdomainlerinin çoğu düzelir.

## Doğrulanan temiz yüzey

- `quick.dataset.scope` (`syncBrowserAdblockQuick`): yazılan ama hiçbir
  yerde okunmayan öznitelik — hata değil, teşhis/stil kancası olarak bırakıldı.

## Testler

Yeni `tests/browser-avatar.test.js` (vm-ayırma, eleman stub'ı):

- `tr.wikipedia.org` → **W**; `sub.bbc.co.uk` → **B**; `amazon.com.tr` → **A**;
  `mail.google.com` → **G**; `www.` öneki korunur.
- `wikipedia.org` → **W**, `localhost` → **L**, `192.168.1.1` → **1** (önceki
  davranış), boş URL → `+` + `is-blank`.
- `mail.example.com` ile `drive.example.com` aynı `--avatar-hue`.

Sonuç: 3/3 test, 12 iddia — hepsi yeşil. `node --check` temiz.

## Windows etkisi

Yalnız renderer — her platformda aynı. Windows'ta ek doğrulama gerektirmez.

## Çalıştırılmayan kontroller

`npm test` tam seti (hedefli koşuldu), Electron smoke (başsız kutu), canlı
UI'da avatar görünümü (tutarlı harf değişimi, görsel kanıt PR'da değil).
