# BROWSER_BUG_REPORT_134 — R134 derin denetim turu

Tarih: 2026-09-27 · Dal: `codex/r134-deep-audit-1790495763` · Taban: master `1f1d2be`

Kapsam: önceki turlarda yarım kalan modül bölümlerinin tamamlanması, küçük
depo/servis modüllerinin tam okuması ve yeni desen süpürmeleri.

## Doğrulanmış bulgu

### F1 — `decodeSubtitleBuffer` eski-kodlama tahminini iki kez çalıştırıyordu (düzeltildi)

`src/browser-textutil.js` FFFD dalında `pickLegacyEncoding(buffer, …)` hem koşulda
hem `else` kolunda yeniden hesaplanıyordu. Tek çağrı ~21 `TextDecoder` kurulumu +
tampon taraması demek; büyük altyazı dosyalarında ölçülebilir israf (davranış aynı).

- Düzeltme: sonuç tek `const legacy`'ye alınıp iki dal da paylaşıyor.
- Regresyon kilidi: yeni test `TextDecoder` kurulum sayacı takılıyor — ikinci bir
  çağrı ~20 ek kurulum üretir, sınır 45'in üstüne çıkarsa test kırılır.

### F2 — Seyrek-bozuk UTF-8 dalının legacy tahmininden önce gelmesi kasıtlı (belgelendi)

Denetimde sorulan soru: `else if` ("utf-8 bozuk bayt atlandı") dalı `legacy`'ye
kapılanmalı mı? Cevap **hayır** ve sıralama bilinçli:

- Dal yalnız dosya ≥%99 geçerli UTF-8 ve ≤%1 bozuk bayt içerdiğinde girer
  (`replacementCount <= max(2, 1%)`). Bu kadar temiz bir dosyada legacy kanıtı
  ancak zayıf dil-ipucu hızlı-kabulünden gelebilir — sağlayıcı `language='ru'`
  deyip UTF-8 dosya gönderebilir; tampondaki geçerli çok-bayt dizileri ipucundan
  güçlü kanıttır.
- Ters senaryo (gerçek cp1251/GBK dosyası) binlerce FFFD üretir ve kapıyı asla
  geçemez → `else` kolunda legacy doğru çalışır.
- `!legacy` kapısı eklenseydi ipucuyla-kabul edilen yanlış kodlama, gerçek UTF-8
  dosyayı tek-bayt mojibake'e çevirirdi.

Kod yorumu + regresyon testi eklendi: `language:'ru'` ipucuyla gelen seyrek-bozuk
UTF-8 tamponu UTF-8 olarak çözülmeye devam ediyor.

## Temiz çıkan yüzeyler (bu tur okunanlar)

| Yüzey | Sonuç |
|---|---|
| `watch-library-store.js` 508–646 (replaceItems/upsert/remove) | tombstone/overflow/limit disiplini tam |
| `watch-index.js` (SQLite FTS, migration, prune) | sınırlar + parametreli sorgular temiz |
| `media-catalog-store.js` / `media-catalog-service.js` | atomik commit + .bak, IPC yetki/doğrulama tam |
| `watch-library-state.js` | revision/feld-stamp merge mantığı tutarlı |
| `watch-folder.js`, `catalog-discovery.js`, `media-folders.js` | temiz |
| `ytdlp-runtime.js` (active.json çözümü) | `resolveInside` kök-çevrelemeli |
| `gpu-diagnostics.js`, `model-manager.js` (realpath + whitelist silme) | temiz |
| `local-file-access.js` (grant/inspect, PDF imzası) | temiz |
| `hls-recovery.js` (epoch/token/in-flight, stabilite penceresi) | temiz |
| `burnin-output.js` (yedekli rename + kurtarma eşlemesi) | temiz |
| `translation-model-score.js`, `translation-provider-probe.js`, `translation-endpoints.js` | temiz |
| `subtitle-output-contract.js`, `playback-policy.js`, `player-task-center.js` | temiz |
| `subscriptions-io.js` (OPML/CSV/NewPipe ayrıştırıcı) | temiz |
| `subtitle-corpus-discovery.js`, `subtitle-export-validation.js`, `translation-diff.js` | temiz |
| `queue-persistence.js` (gizli-anahtar süzgeci, snapshot birleştirme) | temiz |
| `async-timeout.js`, `process-io.js`, `ndjson_utils.py`, `io_errors.py` | temiz |
| `catalog_scan.py`, `browser_media_tools.py`, `browser_video_analysis.py`, `separate_dialogue.py`, `nmdb_catalog_import.py`, `workspace_video_package.py` | sınır/kapı/atomiklik tam |

## Süpürme sonuçları

- `main.js` 33 `JSON.parse` — hepsi try/.bak-fallback/protokol kapılı.
- `browserTabs`/`pdfDocuments`/`subtitleSearchCache` ve ~20 tarayıcı Map'i —
  tab kapanışı/sayfa değişiminde temizleniyor veya sınırlı LRU.
- `before-restore-*`/`frame-*` dosya adı sıralamaları sabit-haneli → leksik
  sort doğru. TODO/FIXME taramasında ürün kodunda açık iş yok.

## Windows'a taşınacak el kontrolleri (birikimli)

Bkz. R132/R133 raporlarındaki liste — bu tur yeni Windows etkisi yok
(kodlama yolu platformdan bağımsız bayt işlemi).
