# BROWSER_BUG_REPORT_128 — çok daha derin tur (uzak-veri yolu ve IPC sınırları)

**Tarih:** 2026-09-26 · **Dal:** `codex/r128-deeper-audit-1790410240` · **Taban:** master `1d0d83e`

"Çok daha derin devam" turu: R127'nin üzerine (a) genişletilmiş desen süpürmesi, (b) uzak-API-türevli veri yollarında derin okuma (redirect zincirleri, uzak XML/JSON parser'ları, LLM yanıt doğrulayıcıları), (c) main.js'teki tüm `fetch`/`session.fetch` çağrılarının URL kaynağına göre sınıflandırılması. **3 doğrulanmış bug** — hepsi regresyon testli düzeltildi.

## Doğrulanmış ve düzeltilmiş bug'lar

### BUG-128-01 — `browser-subtitle-search.js` `downloadStremioSubtitle`: redirect zinciri host kontrolünü aşıyordu (HIGH — SSRF)

Stremio/OpenSubtitles-v3 altyazı indirme yolu `approvedStremioUrl` ile yalnız **ilk** URL'yi doğruluyor, sonra `fetch(url, { redirect: 'follow' })` ile takip ediyordu. Onaylı `*.strem.io` / `dl.opensubtitles.com` adresi bir `Location:` yanıtıyla keyfi hedefe zincirlenebilirdi — iç ağ (`http://169.254.169.254/`, `192.168.*`, `localhost`), `http:` düşüşü veya `file:`/`data:` şeması. `session.fetch` aynı cookie deposunu kullandığı için yanıt gövdesi altyazı metni olarak kullanıcıya sunuluyordu.

Kanıt: `src/browser-subtitle-search.js` ~L285 — OpenSubtitles ana yolu (`downloadOpenSubtitlesFile`) zaten elle-redirect + hop-başına `assertPublicBrowserSubtitleUrl` yapıyordu; Stremio yolu bu korumayı atlıyordu. Aynı doğru örüntü `fetchMangaImageSource` (main.js:7211) ve `main.js:8927` altyazı fetch'inde de mevcut.

**Düzeltme:** `redirect:'follow'` → elle döngü (`redirect:'manual'`, ≤3 hop). Her `Location` önce göreli-URL çözümüne (`new URL(location, downloadUrl)`), sonra `approvedStremioUrl`'e girer; kural dışı hop `UNSAFE_URL`, eksik `Location` `INVALID_RESPONSE`, 4. hop `UNSAFE_URL` hatası verir. `AbortError` ağ hatasına çevrilmeden olduğu gibi yükselir.

Regresyon: `tests/browser-subtitle-search.test.js` +6 vaka — onaylı hop izlenir (2 fetch), 302→`169.254.169.254` reddedilir (yalnız 1 fetch çıkar), 302→`evil.example` reddedilir, eksik Location → `INVALID_RESPONSE`, kendine-redirect döngüsü 4. denemede `UNSAFE_URL`.

### BUG-128-02 — `invidious.py` `_convert_timedtext_to_srt`: sayısız/NaN nitelikte ham `ValueError` (MEDIUM)

srv1 (`<text start="…" dur="…">`) ve srv3 (`<p t="…" d="…">`) timedtext XML'inde `float(t.get("start"))`/`int(p.get("t"))` doğrudan çağrılıyordu. Uzak Invidious/YouTube uçları niteliği boş, sayısız veya `nan`/`inf` döndürebilir: `float("abc")` → `ValueError` (kuyruğu çökertir), `int(float("nan"))` → ayrıca `ValueError`. Tek bozuk satır tüm altyazı indirmesini öldürüyordu.

**Düzeltme:** `_num()` yardımcısı — `float()` parse eder, `math.isfinite` NaN/inf'i reddeder, sayısız/None → `None` döner; çağıran döngü o satırı atlar (`continue`). Hepsi bozuksa zaten var olan "boş transkript" `RuntimeError`'ı düşer (sahte SRT yazılmaz). `import math` header'a eklendi.

Regresyon: `test_invidious.py` `test_non_numeric_timing_attrs_skipped` — `abc`/`nan` satırları atlanır, `1`/`2` satırları korunur (srv1+srv3), tamamı-bozuk → `RuntimeError`.

### BUG-128-03 — `sentence_translation.py` `sentence_reply_issue`: boş `ids` `IndexError` (LOW — sağlamlık)

`wholes.get(str(ids[0]))` — `ids` boş listeyse ham `IndexError`. Üretimde `row['ids']` `sentence_groups()` çıktısından gelir ve o fonksiyon hiç boş grup üretmez (doğrulandı), yani canlı yol tetiklenemez; fakat fonksiyon ayrı export edilen bir doğrulayıcı — harici çağrıyla (test, kurtarma betiği, gelecek kod yolu) `[]` geçilmesi sözleşme dışı çöküş üretir.

**Düzeltme:** tip kontrollerinin hemen ardından `if not ids: return "bos_kimlik_listesi"`. `accept_sentence_reply` bu kapıdan erken `None` döner — satır 979'daki `ids[0]` artık erişilemez.

Kanıt: 30k iterasyonlu property-fuzz (`rv()` rastgele-derin veri) öncesi 829/20000 `IndexError`, sonrası 0/30000.

Regresyon: `test_transcribe.py` `test_sentence_reply_issue_…` içine `[]` → `"bos_kimlik_listesi"` + `accept_sentence_reply([])` → `None` iddiaları.

## Doğrulanıp temiz çıkan yüzeyler (bu tur)

- **`fetch`/`session.fetch` envanteri (main.js):** 5111 `saveBrowserContextImage` (kullanıcı-sağ-tık görsel kaydı; mime=`image/*` kapısı), 5738/7411 (kullanıcı-ayarlı LLM uçları — redirect serbest, trust boundary kullanıcı), 8927 (zaten manual+allowlist), 12407 favicon (mime kapısı, data-URL'e çevrilir), 13091/13125 (fixture stringleri). Başka redirect-follow açığı yok.
- **`parse_llm_json_object`:** 15 adversaryal girdi — nesne-olmayan her şey `RuntimeError`, önek/sonek-kirli JSON kurtarma da nesne doğrular. `{"a":"\ud800"}` ve 400-hane sayısı sorunsuz.
- **`new RegExp` dinamik kalıpları:** `burnin-output` `base` regex-escape'li; `subtitle-sentence-layout` `phrase` yalnız üretilmiş Türkçe kelime; `browser-subtitles` `dashTemplateToken` sabit isimler, `matchDashSubtitleUrl` try/catch korumalı; `watch-folder` `escapedStem` escape'li; `subscriptions-io`, `browser-place-url` sabit/escape'li.
- **`sentence_groups`/`pack_sentence_groups`/`normalize_timings`/`_vtt_to_srt`:** grup asla boş değil (her append öncesi non-empty), `protected()` NaN/end≤start/SDH'a tekli bırakır; VTT ayrıştırıcı boş-satırsız cue'ları da toparlar.
- **`decideUrlPolicy`:** 'renderer-external' şema-beyaz-listesi (http/https/mailto) kullanıcı-indirme URL'leri için doğru model — host kısıtlaması tasarım gereği yok.
- Desen süpürmeleri: `data-browser-proxy` (20 hedef), `$('id')` 889 referans, UMD `window.X=`/`root.X=` çağrıları, dataset okumaları, 212 ipcMain↔invoke eşleşmesi, fs tmp+rename+bak atomikliği, kuyruk opts dondurma — hepsi temiz.

## Bilinçli bırakılanlar

- **`saveBrowserContextImage`/favicon redirect'leri iç IP'ye dönebilir** — Chromium "görseli kaydet"/favicon davranışıyla aynı; yanıt `image/*` mime kapısından geçmeli ve içerik kullanıcı-seçimli dosyaya/simgeye gider. Altyazı-metni yolundan farklı etki sınıfı.
- **`turkishNumberPhrasePattern`** yalnız boşluk escape eder — `phrase` bugün yalnız `turkishIntegerWords` çıktısı (harf); gelecekte ham kaynak metin geçilirse regex bozulur. Dokümante edildi, kod sabit girdiyle doğru.

## Koşulan testler

- `node tests/browser-subtitle-search.test.js` — PASS (yeni 6 vaka dahil)
- `backend/venv/bin/python test_invidious.py` — 75/75
- `backend/venv/bin/python test_transcribe.py` — 198/198
- `python3 -m py_compile invidious.py sentence_translation.py` — OK
- `node --check src/browser-subtitle-search.js` — OK
- 30k property-fuzz (sentence_translation tüm export'ları) — 0 çökme
- Koşulmadı: tam `npm test` paketi, Electron smoke (kod yolu renderer UI'ına dokunmuyor).

## Windows etkisi

Düzeltmeler platform-nötr (Node fetch semantiği + Python). `start.bat`/`install.bat`/file-picker/GPU etkilenmez. Windows'ta doğrulanacak pratik nokta: Stremio sağlayıcısından gerçek altyazı indirme (redirect zincirli CDN'de `UNSAFE_URL` yerine normal indirme görülmeli).
