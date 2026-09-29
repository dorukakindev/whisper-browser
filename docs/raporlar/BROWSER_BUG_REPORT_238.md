# BROWSER_BUG_REPORT_238 — Öznitelik/URL sink denetimi (tur 2)

R290 · Tarih: 2026-09-30 · Dal: `fix/r290-attr-sinks` · Temel: `77bbf3e`

## Sonuç: TEMİZ — bug yok, ratchet kuruldu

escapeHtml turu 2: textContent/innerHTML dışındaki sink'ler (öznitelik
atamaları, href/src URL sink'leri, on* öznitelikleri, location/window.open
navigasyonu) tarandı. Tek kritik yüzey `link.href = vurl` ana süreçte
zaten https-kelepçeli (main.js:2148) ve onclick preventDefault +
`openExternalByPolicy` kapısıyla korunuyor.

## Kapanan yüzeyler
| Yüzey | Sonuç |
| --- | --- |
| title/aria-* atamaları (~40 nokta) | Güvenli — öznitelikler HTML ayrıştırmaz |
| img.src (favicon, icon, katalog, thumbnail) | CSP `img-src 'self' data: https:` + `^data:image/` kapısı |
| link.href (ytVerificationUrl) | main'de https indirgeme + preventDefault + openExternalByPolicy |
| video.src | içsel çağrılar + media-src CSP |
| setAttribute('on*') / eval / document.write / location.href / window.open | Sıfır bulgu |

## Kilitleme
`tests/attr-sink-ratchet.test.js` — yasak kalıp taraması + href envanteri
(1 site) + window.open=0: 78 kontrol. Yeni sink eklenirse test düşer ve
envanterin bilinçli güncellenmesi gerekir.
