# PROGRAM_BUG_REPORT_80 — Derin satır-okuma turu: ayar yedeği + süreç sondası (2026-09-19 ~14:40)

R79'un devamı; bu turda grep düzeyinde kalmayıp **satır satır** okunan çekirdek modüller:
`src/settings-security.js` (827 satır, tamamı), `src/process-io.js`, `src/process-lifecycle.js`,
`src/async-timeout.js`, `src/queue-persistence.js`, `backend/ndjson_utils.py`,
`backend/browser_media_tools.py`, `backend/live_asr.py`, `backend/pipeline_control.py`.
Ürün/test kodunda **değişiklik yok**; yalnızca iki doğrulanmış bulgu aşağıda.

**Test durumu:** `npm test` → **GEÇTİ** (`EXIT:0`, `.tmp/npm-test-r79.log`).

> Bu turda tüm satır atıfları yayından önce canlı `grep`/`sed` ile doğrulandı; ilk taslakta
> yanlış yazdığım `settings-security.js` numaraları düzeltildi (aşağıdakiler doğrulanmış halleri).

---

## B80‑01 — **P2 (doğrulandı)** — Ayar yedeği "sırlar hariç" diyor ama URL'e gömülü sır yedeğe düz metin giriyor

### Kanıt

`node _repro/bug-r79_backup_secret_leak.js` (yalnız ürün modülleri yüklenir, gerçek çıktı):

```
=== A) createBackupPayload cikisi ===
  secretsExcluded alani     : true
  saklanan translateBaseUrl : https://api.example.com/v1?api_key=URLAPIKEY123&token=URLTOKEN456
  URLAPIKEY123           yedekte var mi? EVET  <-- SIZINTI
  URLTOKEN456            yedekte var mi? EVET  <-- SIZINTI
  hf_SUPERSECRETVALUE    yedekte var mi? hayir
  sk-TRANSLATESECRET     yedekte var mi? hayir
  sk-PROFILESECRET       yedekte var mi? hayir
  sk-LLMSECRET           yedekte var mi? hayir
  sk-MANGASECRET         yedekte var mi? hayir
  translate.apiKey alani    : undefined

=== B) publicSettings (renderer IPC) cikisi ===
  URLAPIKEY123 var mi? true

=== C) sanitizeSettings bu adrese izin veriyor mu? ===
  allowSecrets=true  -> https://api.example.com/v1?api_key=URLAPIKEY123&token=URLTOKEN456
  iceri aktarma       -> https://api.example.com/v1?api_key=URLAPIKEY123&token=URLTOKEN456
  endpointIdentity      : preset:https://api.example.com/v1?api_key=URLAPIKEY123&token=URLTOKEN456
```

Yani: alan adı bazlı sırlar (`hfToken`, `apiKey`, `apiKeyProfiles`, `sk-*` profilleri) doğru
şekilde siliniyor; ama **URL sorgusuna gömülü kimlik bilgisi** hem yerel ayar kaydında hem
**içe aktarmada** kabul ediliyor ve `createBackupPayload` onu olduğu gibi yedeğe yazıyor.

### Kod yolu (doğrulanmış satırlar)

1. `src/settings-security.js:165` `endpointSetting(value, label)` — yalnız `http/https` şeması ve
   userinfo reddi yapıyor; **sorgu parametreleri hiç taranmıyor**.
2. `src/settings-security.js:178` `sanitizeUiSettings`, `:199` içinde `translateBaseUrl` için
   `endpointSetting` çağırıyor. `translateBaseUrl` `PERSIST_VALUE_CONTROLS` içinde (`:26`),
   bu yüzden kalıcı ayar kaydının parçası ve içe aktarmada (strict) da aynı kapıdan geçiyor.
3. `src/settings-security.js:496` `redactForBackup` yalnız (a) `isSecretKey`/`DANGEROUS_KEYS`
   (`:13`, `:127`) adlı anahtarları düşürüyor, (b) `collectSecretValues` (`:475`) ile toplanan
   sır **değerlerini** dizgede `[GİZLİ]` yapıyor. URL'de yaşayan sır hiçbir kümeye girmediği için
   redaksiyon onu göremez.
4. `src/settings-security.js:517` `createBackupPayload` → `{ secretsExcluded: true, settings, … }`
   → `redactForBackup`. `settings.ui.translateBaseUrl` anahtar adı da sır sayılmadığı için
   tam URL yedeğe düşer.
5. Uçtan uca: `ipcMain.handle('settings:export')` (`src/main.js:15779`) →
   `createBackupPayload(loadSettings(), …)` (`:15797`) →
   `writeJsonTransaction([{ filePath: result.filePath, value: backup }])` (`:15804`)
   → kullanıcının seçtiği **paylaşılabilir dosya**.
6. Aynı redaksiyon `publicSettings` (`:515`) üzerinden renderer'a da gidiyor → çıktı B.

Ek olarak `endpointIdentity` (`src/settings-security.js:226`) kimliği tam URL ile ürettiği için sır
**kimlik dizgesine** de giriyor (çıktı C son satır); bu dizge karşılaştırma/log/teşhis yüzeylerinde
kullanılıyor.

### Neden hata sayıyorum (ve nerede tereddüt var)

* Aynı program bu kalıbı **başka kalıcı yüzeylerde açıkça temizliyor**:
  `src/queue-persistence.js:16` `SENSITIVE_URL_PARAMS` + `:33` `searchParams.delete(name)`,
  ve `src/browser-place-url.js` `safePlaceUrl`. Yani "URL içindeki sır kalıcılığa girmez" ilkesi
  projede yerleşik; **yedek yolu tek istisna**.
* Yedek dosyası kullanıcıya `secretsExcluded: true` diyerek veriliyor → sözleşme ihlali.
* Tereddüt (abartmama kaydı): dosya kullanıcının kendi makinesinde ve tetikleyici, kullanıcının
  sağlayıcı adresini `?api_key=…`/`?token=…` ile yapıştırmasıdır. Bu yüzden **P2**; ağ üzerinden
  sömürülebilir bir kaçak değil, "hassas veri paylaşılan artefakta yazılıyor" sınıfı bir kusur.

### Düzeltme taslağı (küçük kapsam)

* `queue-persistence` ve `settings-security` için **tek ortak** `SENSITIVE_URL_PARAMS` kaynağı;
  `endpointSetting`'i bu listeyle sorgu/fragment tarayacak şekilde genişlet.
* Savunmacı ikinci katman: `createBackupPayload` içinde `*BaseUrl`/`endpoint` anahtarlarının
  **sorgusunu ve fragmentını** düşür (adres yedekte kullanılabilir kalır, sır gitmez).
* `endpointIdentity` yalnız origin+path üzerinden üretilsin (sır kimliğe girmesin).
* Test: (1) `?api_key=`, `?token=`, `?sig=`, `?client_secret=` içeren `translateBaseUrl` hiçbir
  yedek alanında bulunmamalı; (2) `hfToken`/`apiKey` silme davranışı **aynen** korunmalı (regresyon);
  (3) içe aktarma bu adresi reddetmeli veya temizlemeli; (4) `endpointIdentity` çıktısı sır
  içermemeli.

---

## B80‑02 — **P3 (mekanizma doğrulandı, üretimde latent)** — `probeCommand` çocuk sürecin `stderr`'ini hiç tüketmiyor

### Kanıt (mekanizma + tek değişkenli kontrol)

`node _repro/bug-r79_probe_stderr.js` (her üç koşum da `timeoutMs: 5000` ile, gerçek çıktı):

```
=== A) kucuk stderr (normal yol) ===
  donen deger: "1.2.3"

=== B) boru kapasitesini asan stderr (gercek ipucu: 8 MB) ===
  donen deger: null | gecen sure: 5006 ms
  beklenen: "1.2.3"  (stdout ilk satiri)

=== C) ayni komut stderr tuketilerek (kontrol) ===
  donen deger: "1.2.3"
```

Aynı çocuk, aynı stdout, aynı zaman aşımı; tek fark stderr'in okunması. Yani çocuk süreç boru
kapasitesini aşan stderr yazdığında **bloke olur, `close` hiç gelmez** ve zaman aşımı `null`
döndürür — stdout'ta doğru cevap dururken. (C koşumu, bunun "zaman aşımı çok kısa" olmadığını
tek değişkenli olarak dışlıyor.)

### İki kopya ve aralarındaki fark (doğrulanmış)

| | `src/process-io.js:5` (test-only) | `src/main.js:15569` (üretim) |
|---|---|---|
| Kim kullanıyor | yalnız `tests/process-io.test.js:4` | `app:getEnvInfo` `:15608-15609`, ffprobe süre sorguları `:16314, 16318, 16387` |
| Zaman aşımı | 8 s (varsayılan) | 30 s |
| stdout üst sınırı | 64 KB (`:8`, `:32`) | **yok** (`out += d`) |
| `stderr` tüketimi | **yok** | **yok** |
| Zaman aşımında | `child.kill()` | `terminateProcessTree(p)` |

Yani **test edilen kopya üretimde çalışmıyor**; üretimdeki kopya test edilmiyor
(`probeCommand` yalnız `tests/process-io.test.js` ve `tests/audit-report-regressions.test.js`
içinde geçiyor). B80‑02'nin mekanizması test kopyasında kanıtlandı; üretim kopyası aynı
`stderr` boşluğunu taşıyor.

### Neden "latent" diyorum (abartmama kaydı)

* Üretimdeki çağrı yerleri `ffmpeg -version`, `nvidia-smi --query-gpu=…`, `ffprobe` süre sorguları.
  Bu üç araç normal koşulda 64 KB stderr yazmaz → kullanıcıya yansıyan bir hata **kanıtlayamadım**;
  bu yüzden "latent" ve P3.
* Gerçekçi ikinci etki (kanıtladığım kadarıyla): stdout üst sınırı olmadığı için, bozuk bir
  `ffprobe`/sürücü kombinasyonu boruyu doldurup süreç ağacı öldürülene dek `out` dizgesini
  büyütebilir. Abartmıyorum: hata üretimde gözlenmedi, yalnız sınırın yokluğu kayda değer.

### Düzeltme taslağı

Tek bir paylaşılan `probeCommand` (test kopyasının stdout sınırı + üretim kopyasının
`terminateProcessTree`), `stderr.resume()` (ya da `stderr.on('data')` ile `errorTail`), ve
üretimdeki 30 s değeri parametre olarak. Böylece test kopyası üretimi temsil eder.

---

## Bu turda **elenen** adaylar (kanıtla)

| Aday | Neden hata değil |
|------|------------------|
| `loadSettings` içinde `recoverJsonTransaction` bozuk günlükte fırlatıyor | `src/main.js:2302` çağrısı `try/catch` içinde; `:2304-2307` uyarı yazıp güvenli varsayılanlarla (`settingsVersion: 3`, boş glossary, boş `hfToken`) dönüyor — sert çökme yok |
| `writeJsonTransaction` sınırı ile `validateTransactionJournal` sınırı | Tek sabit `MAX_TRANSACTION_RECORDS = 16` (`settings-security.js:10`, `:618`, `:698`) — yazıcı ve okuyucu tutarlı |
| Kurulum sırasında `rename` başarısız olursa rollback | `movedOriginal`/`installed` bayrakları ve ters sırada geri alma, ilk kaydın `tmp→filePath` hatası dahil doğru; `existed=false` durumunda hedef siliniyor |
| `queue-persistence.sanitizePublicValue` ile `__proto__` | `JSON.stringify` prototype özelliklerini dışa yazmaz ve klon çıktısı yeniden `JSON.parse` ediliyor → kalıcılığa taşınmıyor |
| `settings-security.pathSetting` yalnız `path.win32.isAbsolute` kabul ediyor | Uygulama Windows'a özel (`install-browser-extras.bat`, `backend/venv/Scripts/python.exe`) — bilinçli |
| `live_asr.py` son `stopped` olayının tüketicisi yok | `proc.on('close')` durumu sıfırlıyor; bilinmeyen olay tipi sessizce atlanıyor → davranış kaybı yok |
| `browser_media_tools.py` hata durumunda `exit 0` | Çağıran `result.ok`'u denetliyor (`browser-media-tools.js:60`) |
| `transcribe.py`'de "sıcak yolda `re.compile`" | 20 eşleşme modül düzeyindeki `HALLUCINATION_PATTERNS` elemanları |

## Kapsam notları

* `C79‑01` (R79): `backend/`'de 8 modül hiçbir testte yok — bu turda `ndjson_utils.py`,
  `browser_media_tools.py`, `live_asr.py` (dolaylı), `browser_align.py` satır satır okundu;
  ek doğrulanmış hata çıkmadı (girdi sınırları, base64/8 MB denetimi, `valid_cues` zaman
  aralıkları ve `_pid_is_alive` Windows yolu tutarlı).
* R79'un dört performans bulgusu (SDH `is_sdh_descriptor` 10.3×, çeviri hafızası 19.5 ms/arama,
  `fitTranslationParts` 50-90 ms, anlamsal aramanın istek-başına model yüklemesi) geçerli;
  bu raporda tekrarlanmadı.
* Electron smoke/soak seti hâlâ koşulmuyor (R77 envanter boşluğu + ortam `ELECTRON_RUN_AS_NODE`).

## Yazılan dosyalar

* `PROGRAM_BUG_REPORT_80.md` (bu rapor)
* `_repro/bug-r79_backup_secret_leak.js`, `_repro/bug-r79_probe_stderr.js`
* `docs/devir/2026-09-19-1440.md`
