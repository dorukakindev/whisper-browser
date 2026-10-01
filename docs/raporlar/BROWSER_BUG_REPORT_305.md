# BROWSER_BUG_REPORT_305 — R391–R393: backend test dosyaları + install-orchestrator derin okuma

Tarih: 2026-10-01 · Dal: `devin/1790851905-r391-r393` · Başlangıç: `759d5c8` (master) · Bitiş kod: `a52db97`

## Özet

R391: 7 backend test dosyasının tamamı (~7.8k satır) derin okundu ve hepsi yeşil koştu; **bir doğrulanmış kusur sınıfı** bulundu (B-391-01). R392: `tools/install-orchestrator.js` (618 satır) tam okundu; **bir doğrulanmış kusur** bulundu (B-392-01) — `install-whisperx.bat` ilk günden beri her çalıştırmada `PIN_MISMATCH` ile düşüyordu. Bir küçük UX düzeltmesi de yapıldı (kilit mesajına yol). Bulgular kırmızı kanıtlı regresyon testleriyle kilitlendi.

## B-391-01 — Invidious kanal-ID doğrulama boşluğu + sapan ikinci kapı

**Kök neden.** `backend/invidious.py`'de `channel()` kanal ID'sini hiç doğrulamadan `urllib_parse.quote(channel_id)` ile API yoluna gömüyordu; `quote()`'un varsayılan `safe='/'` parametresi `/` ve `..` içeren ID'lerin yol segmenti enjekte etmesine izin veriyordu. `channel_tab()` ise `main.js`'in IPC kapısından (`/^[A-Za-z0-9_-]{2,40}$/`, src/main.js ~1650/1670) sapan bir `isalnum()` kontrolü kullanıyordu — unicode alfanumerikler (`UCğüşı`) ve tek karakterli ID'ler backend'de kabul, IPC'te red görüyordu.

**Etki.** Defense-in-depth sınıfı: üretimde `authorizedBrowserSender` + regex kapısı saldırgan girdiyi zaten keser; fakat backend'in kendi başına (script/test/ileride başka çağıran) kullanımı korumasızdı ve iki kapı sözleşme olarak birbirinden sapmıştı.

**Düzeltme.** `_CHANNEL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{2,40}$")` + `_checked_channel_id()` ortak doğrulayıcısı eklendi; `channel()` ve `channel_tab()` aynı kapıdan geçiyor. Dize-dışı girdiler de tek tip `RuntimeError` ile reddediliyor.

**Kanıt.** `backend/test_invidious.py` içindeki `InvidiousChannelIdValidation` sınıfı kopya-regex testi yerine gerçek fonksiyonları çalıştıracak şekilde yeniden yazıldı: 13 düşmanca girdi (`""`, `"x"`, `"../etc/passwd"`, `"a/b"`, `"a/../b"`, `"UC ID"`, `"UC;rm"`, `"UCğüşı"`, 41-char, `None`, `12`…) için `_fetch_with_failover`'a hiç ulaşılmadan `RuntimeError` + geçerli UC ID'nin `/api/v1/channels/UC_x-1` yoluna ulaşması + main.js kaynağında aynı regex literalini arayan parity ratchet'i. Eski kodda test kırmızı (kanıt: `channel()` fetch'e düşüyor, `channel_tab()` `"x"`/`"UCğüşı"` kabul ediyor). Sonuç: 77/77 OK.

## B-392-01 — install-whisperx.bat ilk günden bozuk (PIN_MISMATCH)

**Kök neden.** `tools/install-orchestrator.js`: `expectedPins` her `whisperx || diarize` profili için `pyannote-audio==3.3.2` pini eklerken, `RealDriver.installIntoVenv` `requirements-diarize.lock`'u yalnız `diarize && !whisperx` koşulunda kuruyordu. `requirements-whisperx.lock` pyannote içermiyor (pip de onu whisperx bağımlılığı olarak kurmaz) → sahne venv'de pyannote yok → `verifyVenv` her seferinde `PIN_MISMATCH` fırlatıyor → kurulum rollback.

**Etki.** Windows'ta `install-whisperx.bat` kesinlikle hiç başarılı olamazdı; `diarize` sonra `whisperx` (veya tersi) birleşik profilde de aynı düşüş. Orchestrator'ın ilk yazımından (commit `b528f8d`) beri var. `install-supply-chain.test.js`'teki `FakeDriver` `verifyVenv`'i pinlerden paket uydurarak geçtiği için kusur görünmezdi — gerçek `RealDriver.installIntoVenv` dosya-seçim yolu hiç sürülmüyordu.

**Düzeltme.** `needsDiarizeProfile(profiles)` = `whisperx || diarize` tek kaynak fonksiyonu eklendi; hem `installIntoVenv` hem `expectedPins` onu kullanıyor → pin/kurulum kararı artık kayamaz.

**Kanıt.** Yeni test `RealDriver lock dosyasi secimi pin sozlesmesiyle hizali`: `run()` kaydedilen gerçek `RealDriver` üzerinde 4 profil kombinasyonu — lock seçimi pin kararıyla birebir. Kırmızı kanıt: düzeltme geri alınınca `actual: false, expected: true` (whisperx için diarize.lock eksik). Sonuç: 51/51 OK.

## R392 kalan denetim notları (temiz)

- Kilit: `.whisper-install.lock` O_EXCL + ölü-pid kurtarma + tek-retry; eşzamanlı-kazanç durumunda `CONCURRENT_INSTALL` — doğru.
- Kilit dosyası okunamayan/bozuk iken kalıcı bloklama vardı → mesaja kilit yolu eklendi (`CONCURRENT_INSTALL: ... ${this.lockPath}`), kullanıcı hangi dosyayı sileceğini bilir.
- Sahne→takas→rollback: `assertSafeTemporary` regex + relative sınırı; swap'ta yedek geri-alma; `rollbackVenv`/`rollbackNode` sırası; `finalizeBackups` yalnız `writeState` sonrası — tutarlı.
- `install-state.json` tmp+rename atomik; `existingHealthy` parmak izi + manifest + paket listesi eşitliğiyle idempotent atla — doğru.
- `repairVenvScripts` takas sonrası console-entry-point'leri yeniden üretir — Windows `Scripts/` yolu doğru.
- `npmInvocation` win32 `npm_execpath` → `npm-cli.js` yedeği; `spawnSync shell:false`; `PYTHONUTF8` env — doğru.
- Kenar: `systemPythonVersion` desteklenmeyen `firstDetected`'i döndürür ama preflight `PYTHON_VERSION` ile keser; `createVenv`'e erişilemez — kabul edilebilir.

## R391 kalan denetim notları (temiz)

`test_transcribe.py` (4759), `test_invidious.py`, `test_sentence_distribution.py` (735), `test_youtube.py` (401), `test_ytdlp_update.py` (400), `test_diarization.py` (383), `test_golden_corpus.py` (371) — tümü yeşil; iddialar gerçek kodla uyumlu. `update_ytdlp._process_alive` `pid <= 0` koruyucusu process-group yanlış-pozitifini önlüyor (kontrol edildi). Tek kusur B-391-01.

## Windows doğrulaması

`install-orchestrator.js` Windows-birincil araç: kusur koddan + lock dosyası içeriklerinden mantıksal olarak kanıtlandı; düzeltme Linux'ta birim testle kilitlendi. **Windows'ta çalıştırılmayanlar:** gerçek `install-whisperx.bat` pip kurulumu (ağ + ~GB paket indirme gerektirir), bozuk-kilit elle senaryosu.

## Değişen dosyalar

- `backend/invidious.py` — `_CHANNEL_ID_RE`/`_checked_channel_id` + iki fonksiyonda ortak kapı
- `backend/test_invidious.py` — `from unittest.mock import patch` + gerçek-fonksiyon doğrulama sınıfı
- `tools/install-orchestrator.js` — `needsDiarizeProfile` + iki kullanım + kilit mesajına yol
- `tests/install-supply-chain.test.js` — RealDriver lock-seçimi pin-parite testi
