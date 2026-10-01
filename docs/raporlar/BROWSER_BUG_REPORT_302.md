# BROWSER_BUG_REPORT_302 — R379–R382 derin okuma turu

Tarih: 2026-10-01 · Dal: `devin/1790849768-r379-r382-deepread` · Taban: `0da1635`

## Kapsam

| Dosya | Satır | Sonuç |
|---|---|---|
| `src/browser-overlay-controller.js` | 828 | Temiz — tam okuma, doğrulanmış kusur yok |
| `src/browser-translation-scheduler.js` | 800 | 1 bug düzeltildi (B-302-01) |
| `src/settings-security.js` | 903 | Temiz — tam okuma |
| `src/watch-index.js` | 508 | Temiz — tam okuma |
| `src/renderer/ui-locale.js` | ~2895 | 3 semantik yanlış-eşleşme pinlendi (düzeltme B-302-03) |
| `backend/invidious.py` | 1174 | 1 bug düzeltildi (B-302-02) |
| `backend/youtube.py` | 599 | Temiz — tam okuma |
| `backend/update_ytdlp.py` | 576 | Temiz — tam okuma |
| `backend/media.py` | 555 | Temiz — tam okuma |
| `src/preload.js` | 294 | Temiz (önceki turda tamamlandı) |

## Doğrulanmış kusurlar

### B-302-01 — `onState` istisnası scheduler'ı takılı bırakıyordu (browser-translation-scheduler.js)

`emitState()`, `this.onState()` geri çağrısını korumasız çağırırken `onResult` `emitResult` içinde try/catch'liydi. UI tarafı fırlatan bir callback verirse istisna `pump()` → `start()`'ın `.finally` zinciri üzerinden unhandled rejection'a dönüşüyor ve `resolveIdleIfNeeded` çağrısı atlanıyordu → `whenIdle()` bekleyicileri sonsuza dek asılı. Düzeltme: `emitState()` içine try/catch + `stateSnapshot()` ayrıştırması; regresyon testi `tests/browser-translation-reliability.test.js`'e eklendi (fırlatan onState + whenIdle tamamlanma kanıtı).

### B-302-02 — Çok satırlı VTT NOTE/STYLE/REGION blokları sahte cue üretiyordu (backend/invidious.py)

`_vtt_to_srt` yalnız meta başlık satırını (`NOTE`, `STYLE`) atlıyordu; blok içeriğinin sonraki satırları (yorum devamı, CSS kuralları) `cur`'a eklenip `len(cur)>1` koşulunda zaman damgasız sahte SRT girdisi oluyordu. `NOTE`-içeren cue metni korunuyor (mid-cue satırları eskisi gibi tek satır düşer). Düzeltme: `in_meta_block` bayrağı — blok boş satıra kadar atlanır. Kanıt: `STYLE`/`NOTE`/`REGION` içeren fixture → sahte cue yok, gerçek cue'lar korunuyor.

### B-302-03 — ui-locale yinelenen EN anahtarlarında yanlış kazanan (ui-locale.js)

`toTurkish` Map son-yazan-kazanır semantiğiyle 33 yinelenen EN anahtarı taşıyor (silinemez — TR anahtarlar `toEnglish` ters çevrimi için gerekli). Üçünde kazanan anlam yanlıştı: `'and'` bağlacı başka bir eşleşmeye kaybediyordu, `'Cancel'` diyalog düğmesi `'Tamamlandı'`/başka metne kayıyordu, `'Completed'` kütüphane durumu yerine farklı bir karşılık alıyordu. Dosya sonuna kanonik-kazanan `toTurkish.set` override'ları eklendi (mevcut `'Media library'→'Arşiv'` emsali); `tests/ui-locale-dedupe.test.js` (5/5) whitelist + kazanan + TR-benzerliği kilitler.

## Temiz doğrulananlar (özet)

- **overlay-controller**: prefixMax/suffixMin sınır indeksi, 3-probe mutasyon, pointerId kilitli sürükleme, isTrusted kapıları, native-caption görünürlüğü (kapalı modda site altyazısına dokunmaz), observer LRU 128 + document muaf, 400ms fallback kuyruğu, fullscreen wrap/unwrap (yalnız kendi yazdığı style prop'ları geri alır).
- **scheduler**: trailing-group erteleme, joinCompleteTrackFragments, translationCacheKey malzemesi, planTranslationWindow, grapheme/spaceless dağıtım, coveredCueIds, in-flight dedupe + consumer-counted abort, armRetry re-arm (Windows timer drift), provider/definitive kesici, generation bekçileri.
- **settings-security**: SECRET_KEYS/normalizedKey, endpointSetting (kredensiz http/https), sanitizeUiSettings katı/toleranslı, endpointIdentity miras kapısı, crafted-backup `clearedSecretFields` yalnız allowSecrets yolu, sanitizePlayerPositions DANGEROUS_KEYS, 16MB parseImportText, per-segment symlink assertSafeJsonFile, journal'lı writeJsonTransaction + recoverJsonTransaction, withoutSecretEnv/buildSecretEnv.
- **watch-index**: şema v4 + sürüm kapısı + ALTER migrasyonları, BEGIN IMMEDIATE yardımcı, upsertMedia 0-koruma, FK-sıralı renameMediaId, cue_id #N dedupe, safePageIndexUrl kredensiz, 3000-satır sayfa tavanı, ftsQuery tırnak-kaçışı + `*` prefix + AND, tr_fold UDF kapılı arama + 5000-satır JS yedeği.
- **youtube.py**: secret'lar yalnız env; `_endpoint` loopback-only test hook (keyfi host'a token yönlendirmesi reddedilir); browse_id beyaz liste; TV istemcisi belgeli; PKCE exchange; revoke `remote_ok` dürüstlüğü; 6-denemeli ağ-hatası bütçesi.
- **update_ytdlp.py**: `_ipv4_literal` kısaltma/hex/oktal kapısı, sayısal-benzeri host reddi, per-hop redirect SSRF, dosya adı tek-segment, sha256 zorunlu, zip traversal+symlink+boyut+dosya-sayısı kapıları, `-I` izole doğrulama, sağlıklı-geri-dönüş, O_EXCL kilit + Windows-güvenli PID sorgusu, staging transactions.
- **media.py**: cookie-browser whitelist, noprogress NDJSON koruması, audio_lang charset kapısı, klip 60dk tavan, download_stream http/https-only + ffmpeg ön-kontrol + tmp temizliği + yarım-çıktı silme, hata metni eşlemesi (bot-doğrulama/cookie/ENOSPC/EACCES).
- **invidious.py (geri kalan)**: SID host-kilitli (`_session_url_ok` netloc eşitliği), failover'da credential sızmaz, lang charset traversal kapısı, `out_path.resolve().parent` doğrulaması, kanal/playlist charset whitelist, feed_partial kademeli akış (bölüm düşerse UI yerel fallback'e iner — tasarım gereği).

## Testler

- `node tests/ui-locale-dedupe.test.js` — 5/5 PASS
- `node tests/browser-translation-reliability.test.js` — PASS (yeni onState-izolasyon senaryosu dahil)
- `node tests/report65-invidious-bridge.test.js` — 21/21 PASS
- `python3 -m py_compile backend/invidious.py` + fixture doğrulaması — PASS
- `node --check` değişen src dosyaları — PASS

## Windows notu

Değişiklikler platform-nötr (saf JS/Python). Windows'a özgü doğrulanmayan sınır yok.
