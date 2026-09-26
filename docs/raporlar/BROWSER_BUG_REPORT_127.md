# BROWSER_BUG_REPORT_127 — derin modül denetimi (yoğun bug turu)

**Tarih:** 2026-09-26 · **Dal:** `codex/r127-deep-audit-1790393957` · **Taban:** master `98ca826`

Yoğun bug-arama turu: desen süpürmesi (birim/koşul/yarış/parser hata kalıpları) + az denetlenen orta-katman modüllerde derin okuma. Süpürme grepleri temiz çıktı; bulgular derin okumadan geldi.

## Doğrulanmış ve düzeltilmiş bug'lar

### BUG-127-01 — `watch-index.js` `upsertMedia`: `lastWatched: 0` "şimdi"ye çevriliyordu (HIGH)

`Number(item.lastWatched || item.last_watched) || Date.now()` — açıkça `0` gönderilen "hiç izlenmedi" damgası falsy görülüp `Date.now()` ile eziliyordu. Sonuç: `listMedia` `ORDER BY last_watched DESC` altında **hiç açılmamış kayıt listenin en tepesine** çıkıyordu.

Gerçek akışlar doğrulandı: `main.js:3266` (`lastWatched: 0`), `main.js:3290` (`annotation.updatedAt || 0`), `main.js:3354` `saveWatchLibraryCollectionMutation` (`item.lastWatched` doğrudan) ve `upsertWatchItem` → `upsertMedia({ lastWatched: merged.lastWatched })`.

**Düzeltme:** yeni `lastWatchedValue()` yardımcısı — `undefined`/`null`/sayısız → `Date.now()`; açık sonlu değer (0 dahil) → `Math.max(0, number)` olarak korunur. `lastWatchedValue` ayrıca export edildi (FTS5'siz Node derlemelerinde davranışsal test için).

### BUG-127-02 — `watch-library-store.js` `upsert`: aynı falsy-0 kalıbı (HIGH)

`lastWatched: patch.lastWatched || now()` — renderer `updateWatchItem({key, collections, lastWatched: item.lastWatched})` (renderer.js:21818) hiç izlenmemiş bir kayıtta `0` gönderir; store `0`'ı `now()`'a çevirip kütüphane dokümanında da en üste taşıyordu. `restore()` da aynı yolu kullanır.

**Düzeltme:** `patch.lastWatched === undefined || null` → `now()`; açık sonlu değer → `Math.max(0, Number(...))`; sayısız → `now()`. `firstWatched` davranışı değişmedi (`|| now()` orada doğru — ilk izleme damgası).

### BUG-127-03 — `settings-security.js` `pathSetting`: POSIX mutlak yolları reddediliyordu (HIGH, taşınabilirlik)

`path.win32.isAbsolute(text)` koşulsuzdu → Linux/macOS'ta `/home/...` gibi her POSIX mutlak yolu `SettingsValidationError` ile düşerdi. Etki yüzeyi geniş: `sanitizeSettings` (inputDir/outputDir/watchDir/lastInputDir), `sanitizeAbsolutePath` ve 8 `main.js` çağrı noktası (transcribe:start ~18171, dialog sonuçları vb.). **Linux geliştirme ortamında ayar kaydı ve iş başlangıcı tamamen kırıktı** (Electron testleri transcribe:start IPC'sini hiç sürmeyip doğrudan backend'i spawn ettiği için yakalanmamıştı).

**Düzeltme:** `path.isAbsolute(text) || path.win32.isAbsolute(text)` — `defaultMediaFolders`'ın kendi çift kontrolüyle aynı semantik. Windows'ta davranış birebir aynı (`path.isAbsolute === path.win32.isAbsolute` win32'de); değişiklik yalnız Windows-dışı platformları açar.

### BUG-127-04 — `series_memory.py` `_file_lock`: POSIX dalı `timeout`'u yok sayıyordu (MEDIUM)

`fcntl.flock(handle.fileno(), fcntl.LOCK_EX)` süresiz bloklanır — Windows dalı `msvcrt.LK_NBLCK` döngüsüyle `deadline`'a uyarken POSIX dalı uymuyordu. Kilitli kalan bir işlem transkribe görevini sonsuza dek dondururdu.

**Düzeltme:** POSIX dalı da `LOCK_EX | LOCK_NB` döngüsü + `time.monotonic()` deadline + 25 ms uyku ile aynı `TimeoutError` semantiğine getirildi. Regresyon testi iki platformda da tutuyor (msvcrt ayrı handle'da LK_NBLCK aynı anda başarısız).

### BUG-127-05 — `media.py` `download_clip`: boş `--output-file` şifreli hata (LOW)

`Path('').with_suffix('.mp4')` → anlaşılmaz `ValueError`. CLI `main()` `--output-file`'ı doğrulamıyordu.

**Düzeltme:** fonksiyon başında açık `ValueError("Klip için --output-file gerekli")`.

### BUG-127-06 — `media.py` `download()`: `audio_lang` yt-dlp format selector'üne ham gömülüyordu (LOW, sertleştirme)

`asel = f"bestaudio[language={audio_lang}]"` — `]`/`+`/`/` gibi karakterler selector sözdizimini bozup tüm formatı değiştirebilir.

**Düzeltme:** `re.fullmatch(r"[A-Za-z0-9._-]{1,32}")` geçmeyen değerler `ValueError("Geçersiz ses dili")` ile reddedilir.

### BUG-127-07 — `browser-playback-diagnostics.js`: `pass=` kanıtlarda açık sızıyordu (LOW, gizlilik)

`redactSensitiveAssignment`'ın `generic` beyaz listesi `pass`'ı içeriyordu — `SENSITIVE_KEY_NAMES`'te `pass` parola alanı olarak tanımlı olduğu halde tanı metninde `pass=hunter2` redakte edilmiyordu.

**Düzeltme:** `generic` listeden `pass` çıkarıldı (`code|state|exp|expires|policy|auth` korunur — kanıt okunabilirliği için kasıtlı).

## İyileştirme (bug değil)

- **`listMedia` deterministik sıralama:** `ORDER BY last_watched DESC` → `, id ASC` — eş damgalı kayıtlarda SQLite sonuç sırası nondeterministti; artık kararlı.

## Bilinçli bırakılan adaylar

- `watch-library-state.js:281` `!item.lastWatched` — burada `lastWatched` **monotonik maksimum** semantiği (izleme mutasyonu "dokunma" anlamı taşır); `Math.max` davranışı doğru. BUG değil.
- `watch-index.js:264` `upsertTrack` `updatedAt || Date.now()` — track `updated_at` için `0` "hiç" değildir; çağıranlar hiç 0 göndermez. BUG değil.
- `main.js:2986` `legacy.lastWatched || annotation.updatedAt || Date.now()` — tek seferlik migrasyon yedeği; 0 → `updatedAt`'e düşer (`now` değil). Marjinal; dokunulmadı.
- `renderer.js:15134` `_watchMutation.at` — mutasyonun kendi zaman damgası (`at`), `lastWatched` değil. BUG değil.

## Doğrulama

| Test | Sonuç |
|---|---|
| `tests/report127-regressions.test.js` (yeni, 5 test) | 5/5 yeşil |
| `backend/test_media.py` (yeni, 2 test) | 2/2 yeşil |
| `backend/test_series_memory.py` (yeni kilit zaman aşımı testi) | 7/7 yeşil |
| `watch-index-assets`, `watch-library`, `watch-library-migration` (161), `watch-library-subtitle-performance`, `browser-report86-regressions` (44), `settings-security` (23), `adversarial-ipc` (15), `audit-tur5-main`, `audit-tur6`, `codecraft-provider`, `browser-playback-diagnostics` (18), `report63-secret-redaction` (19) | tümü yeşil |
| `node --check` değişen 3 JS dosyası + `py_compile` 2 py dosyası | temiz |
| Tam `npm test` | koşulmadı (kural: kapsamlı süit değil, kapsamlı hedefli) |
| `watch-index` entegrasyonu bu Node derlemesinde FTS5'siz atlandı | CI/Electron'da koşar |

## Doğrulanmamış sınırlar

- Gerçek Windows makinede medya kütüphanesi sıralaması (hiç izlenmeyen kayıt en üstte değil artık) — el kontrolü önerilir; mantık platformdan bağımsız.
- `series_memory` POSIX kilit zaman aşımı Windows'ta aynı `TimeoutError` semantiğini tutar (msvcrt dalı zaten deadline'a sahipti; test iki dalı da kapsar) — ama gerçek Windows dosya kilitlemesi yalnız Windows CI'da koşar.
- `media.py` `audio_lang` reddi: UI'dan gelen değerler zaten `[a-z]{2}(-[A-Z]{2})?` biçiminde; şüpheli bir değer geçmişte selector'ü bozuyordu, artık açık hata verir.

## Taranan modüller (derin okuma)

`watch-index.js`, `watch-library-state.js`, `watch-library-store.js`, `browser-media-controller.js`, `browser-playback-diagnostics.js`, `browser-translation-scheduler.js`, `browser-session-store.js`, `media-catalog.js` (renderer), `settings-security.js`, `browser-library-tools.js` (1–394), `browser-page-translate.js` (1–806), `backend/media.py`, `backend/series_memory.py`, `backend/update_ytdlp.py`, `backend/youtube.py` (kalan), `backend/sentence_translation.py` (desen taraması).

Yüksek sinyalli alanlar kapsandı; `browser-manga.js` orta bölümü ve `browser-page-translate.js` son ~600 satırı (enjekte edilen script gövdesi) bir sonraki tura bırakıldı.
