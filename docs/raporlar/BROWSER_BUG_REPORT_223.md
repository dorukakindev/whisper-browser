# BROWSER_BUG_REPORT_223 — R272: innerHTML/DOM-sink envanteri + ratchet

## Kapsam
10'lık plan madde 2: tüm first-party `src/` kodunda innerHTML/outerHTML/insertAdjacentHTML/createContextualFragment/document.write/eval/new Function envanteri çıkarıldı; her enterpolasyonun kaçış durumu denetlendi ve statik ratchet kuruldu.

## Envanter sonucu
- **innerHTML siteleri:** renderer.js (33 aktif + temizleme), renderer-helpers.js (1), browser-analysis-tools.js (1), browser-dialogue.js (1), browser-page-translate.js (2 — statik buton markapı).
- **Diğer sink'ler:** insertAdjacentHTML / outerHTML= / document.write / createContextualFragment / new Function / eval — first-party kodda **yok** (yalnız vendor/pdf.worker.min.mjs).
- **URL sink'leri:** `img.src`/`link.href` siteleri `absThumb()` (`/^https?:/i` kapısı) veya `decideUrlPolicy`+`shell.openExternal` üzerinden doğrulanıyor — javascript:/data:/file: şemaları kapalı.
- **escapeHtml:** `&<>"'` beşinin tamamını kaçırır — gövde ve çift/tek tırnaklı nitelik bağlamı için yeterli.

## Bulgu 1 (düzeltildi): kuyruk durumu innerHTML'e kaçışsız basılıyor
- `renderQueue`'da `data-open="${item.id}"`, `data-retry="${item.id}"`, `data-id="${item.id}"` nitelikleri ve `${STATUS_TEXT[item.status] || item.status}` yedeği ham basılıyordu.
- `item.id`/`item.status`, diske yazılan `queue-state.json`'dan geri yüklenir — dosya bozuksa/bilinçli yazıldıysa `" onmouseover=...` biçiminde attribute enjeksiyonu mümkündü. CSP (`script-src 'self'`) script çalıştırmayı engelliyor ama `style`/`data-*` nitelikleriyle görünüm/manipülasyon riski kalıyordu.
- **Düzeltme:** üç nitelik ve durum yedeği `escapeHtml` ile sarıldı.

## Bulgu 2 (düzeltildi): sayfa-çevirisi bölüm satırlarında ham IPC verisi
- `renderBrowserPageReport`'un bölüm satırında `row.translated`, `row.excluded`, `pct`, `eligible` doğrudan yazıldı. `sections` dizisi sayfa-içi çeviri köprüsünden gelen IPC verisidir — sayfa tarafı zehirlenmiş veri üretebilir.
- **Düzeltme:** `Number(...) || 0` zorlaması; metinsel değerler artık basılamaz (`row.section` zaten `escapeHtml`'li).

## Ratchet
`tests/dom-innerhtml-ratchet.test.js`:
- 5 dosyada tüm `innerHTML =` atamalarını statik ayrıştırır; her `${...}` gövdesinin güvenli kalıba (`escapeHtml`, `Number`, `Boolean`, `encodeURIComponent`, locale/biçim yardımcıları, `.toFixed`/`.toLocaleString`, literaller, `.length`, bilinen sayısal üye adları) uymasını ya da ifade-seviyesinde izin listesinde bulunmasını ister.
- Ternary dallarını yinelemeli tarar; koşul ifadeleri DOM'a basılmadığı için içerikleri denetlenmez.
- İzin girdileri (`icon` SVG literal, `ts` saat dizisi, `start`/`end` `formatTime` çıktısı) satır/ifade eşleşmesiyle doğrulanır — kod kayarsa ikinci test düşer.
- Kırmızı kanıt: `data-id="${item.id}"` ham bırakılınca FAIL; düzeltilince PASS.

## Test sonuçları
- `node tests/dom-innerhtml-ratchet.test.js` — 2/2 PASS (red→green doğrulandı)
- `node tests/queue-lifecycle.test.js` — 21 PASS
- `node --check src/renderer/renderer.js` — temiz

## Windows etkisi
Nötr-olumlu; kaçışlama platform bağımsız. Doğrulanmadı: queue-state.json'un %APPDATA% altında elle bozulması senaryosu (aynı mantık her iki platformda).

## Çalıştırılmayanlar
- Tam `npm test` CI'a bırakıldı.
- Tarayıcı içi sayfa DOM'ları (browser-page-translate'in çevirdiği sayfa içeriği) ayrı güven sınırı — sayfa içeriği zaten ana renderer'da değil site bağlamında çalışır.
