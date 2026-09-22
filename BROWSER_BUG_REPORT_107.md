# Browser Bug Report 107 — F-106-5: kalan tanımsız palet token'ları + st-upnext tema kaçağı

Kaynak: tema tutarlılığı QA turu (2026-09-22, F-106-4 doğrulaması sırasında). İki bulgu — ikisi de F-106-4'le aynı "palet refaktöründe atlanan isimler" ailesinden.

## Bulgular

### F-106-5a — `--bg-card` / `--bg-elev` tanımsız → menü ve plakalar şeffaf

`styles.css` 15+ yerde `var(--bg-card)` ve `var(--bg-elev)` kullanıyor ama iki token da **hiç tanımlı değil** (0 tanım). Etkilenen yüzeyler: `.st-card-menu` (sağ-tık kart menüsü — zemin `rgba(0,0,0,0)`, metin thumbnail üstünde yüzüyor), `.st-topbar`, `.st-display-panel`, `.st-side-item:hover` (bg-elev), `.st-sub-row`/`.st-pl-card`/display panelleri. F-106-4'te `--fg`/`--muted`/`--bg`/`--bg-sunken` köprüsü eklendi ama bu iki yüzey adı gözden kaçmıştı — metinler okunurdu ama zeminsizdi (canlı kanıt: sağ-tık menü ekran görüntüsü).

**Düzeltme:** `html` köprü bloğuna ekleme — `--bg-card: var(--bg-2)` (yükseltilmiş panel = `--surface-panel`), `--bg-elev: var(--bg-3)` (hover/aktif plaka = `--surface-control`). Açık/koyu tema değerleri kullanım yerinde kendiliğinden doğru.

### F-106-5b — `.st-upnext` açık temada dark-on-dark (~1.2:1)

`.st-upnext` video üstüne sabit koyu panel (`background: rgba(16,18,22,.92)` — doğru tasarım, video overlay) ama çocukları temalı `var(--fg)`/`var(--muted)`/`var(--bg-sunken)`/`var(--border)` kullanıyordu → açık temada metin `rgb(40,35,31)`/(98,91,84) koyu panelde görünmez. Koyu temada doğru görünüyordu (panel de zaten koyu).

**Düzeltme:** `.st-upnext` içine yerel token körlemesi — `--fg: #edf1f3`, `--muted: #a1adb7`, `--bg-sunken: #1c242c`, `--border: #3a4652`. `.st-card-live`'ın "sabit renk" kalıbıyla aynı yaklaşım; tüm çocuk elemanlar (başlık, yazar, thumb zemini, kenarlık) iki temada da sabit açık değerler alıyor. Canlı doğrulama: upnext metni `rgb(237,241,243)` on `rgba(16,18,22,.92)` ≈ 15:1.

## Doğrulama

- Canlı CDP: `--bg-card` → `#fffdf8` (light) / çözülüyor, `--bg-elev` → `#e9e3d9`; `.st-upnext` sentetik render'da metin `rgb(237,241,243)` (açık temada ölçüldü — koyuda da aynı sabit değerler).
- `node tests/renderer-state-a11y-responsive.test.js` → 11/11 geçti (son `:root` bloğu testi `html` seçiciye takılmıyor).
- `st-upnext` gerçek render yolu YouTube playback gerektirir (bu makinede ortam engelli); düzeltme token seviyesinde kanıtlandı.

## Sınırlar

- `.st-upnext` gerçek video-üstü görünümü canlı playback'te tekrar gözle doğrulanmalı (ilk YouTube oynatımında).
