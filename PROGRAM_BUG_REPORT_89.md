# PROGRAM_BUG_REPORT_89 — Bağımsız denetim turu (2026-09-20)

## Özet

**Kod değişikliği yok.** Mevcut koddaki 17500 satırlık `main.js`, Python backend, preload, ve
kritik modüller satır satır incelendi. `npm test` → `exit_code: 0` (tüm Node + Python testleri geçti).

Önceki raporlarda (R80–R88) ele alınmış bulgulara tekrar girilmedi; yeni veya
yeterince doğrulanmamış bulgulara odaklanıldı.

---

## Test durumu

| Test kümesi | Sonuç | Kanıt |
|---|---|---|
| `npm test` (tam Node + Python) | **PASS exit_code:0** | `exit_code: 0 elapsed: 86655ms` |
| Python: `test_transcribe.py` | **PASS** | Tüm testler OK |
| Python: `test_invidious.py` | **PASS** | Tüm testler OK |
| Python: `test_ytdlp_update.py` | **PASS** | Tüm testler OK (16 alt-test) |
| Sözdizimi kontrolü (boru) | **PASS** | B80-02 kapsamında |

---

## Yeni bulgular

### B89-01 / P3 — `browser:trusted-bridge`: `page-blocks` ve `page-action` aktif-sekme kontrolü yok

**Dosya:** `src/main.js:12810`
**Öncelik:** P3

```js
// 12804-12823: ipcMain.on('browser:trusted-bridge', ...)
if (!tab || (message.type !== 'page-blocks' && message.type !== 'page-action'
    && tab.id !== browserActiveTabId)) return;
```

Mantık: `page-blocks` veya `page-action` geldiğinde aktif-sekme kontrolü **uygulanmaz**.
Diğer tüm tipler (`manga-edit`, `overlay-style`, `subtitle-control`, `reading-position`)
için `tab.id !== browserActiveTabId` → erken dönüş yapılır.

**Savunma katmanı:** Her iki fonksiyon da `bridgeToken` kontrolü yapıyor:
- `acceptDynamicBrowserPageBlocks` (`main.js:6006`): `payload.bridgeToken !== tab.bridgeToken` → erken dönüş
- `handleBrowserPageAction` (`main.js:10325`): aynı kontrol

`bridgeToken = randomUUID()` (satır 3006, 11387) — kriptografik olarak rastgele.
Bir arka plan sekmesinin başka bir sekmenin token'ını keşfetmesi JavaScript kapsamı
nedeniyle **pratikte mümkün değil** (her sekme ayrı `webContents` context'inde çalışır).

**Ancak** token keşfedilseydi, arka plan sekmesi:
- Başka bir sekmenin `pageTranslateSession.blocks` haritasını `acceptDynamicBrowserPageBlocks`
  aracılığıyla değiştirebilirdi
- Başka bir sekmenin çeviri sonuçlarını `handleBrowserPageAction` ile `edit`/`exclude` edebilirdi

**Karar:** P3 — mevcut token savunması yeterli, ancak aktif-sekme kontrolü eklemek
savunmayı katmanlı hale getirirdi. Şu değişiklik önerilir:

```js
if (!tab || (tab.id !== browserActiveTabId)) return;
// page-blocks ve page-action için de aktif-sekme zorunlu kıl
```

**Doğrulama:** `src/main.js:12810` satırında koşulu değiştirerek test edilebilir.

---

### B89-02 / P3 — `redactForBackup`: URL parametre adı sızıntısı

**Dosya:** `src/settings-security.js:528-532`
**Öncelik:** P3

`redactForBackup` sır değerlerini split/join ile metinden ayıklıyor. Eğer bir sır
değerinin kendisi URL parametresi anahtarı ise (örn. `?key=sk-abc123`), yalnız değer
`[GİZLİ]` ile değiştirilir — parametre adı (`key`) durur:

```
?key=sk-abc123  →  ?key=[GİZLİ]
```

**Etki:** Yedeği alan kişi hangi parametre adının kullanıldığını görür. Bu, `translateBaseUrl`
gibi endpoint'lerde (bkz. B80-01 çözümü) `endpointSetting` fonksiyonu zaten parametreleri
kökten sildiği için uygulanmaz. Ancak `collectSecretValues`'a düşen herhangi bir sır değeri
için geçerlidir.

**Kod:**
```js
// settings-security.js:528-532
if (typeof value === 'string') {
    let clean = value;
    for (const secret of secretValues)
        clean = clean.split(secret).join('[GİZLİ]');
    return clean;
}
```

**Önceki rapor kapsamı:** B80-01 çözümü `translateBaseUrl` için `endpointSetting` üzerinden
tüm sorgu parametrelerini kökten siliyor. Diğer sır değerleri için (HF token, LLM anahtarı)
doğrudan değer değil URL içinde geçme olasılıkları düşük.

**Karar:** P3 — düşük olasılıklı kenar durumu. Düzeltme: URL parametre adı eşleşmesi
yapan regex tabanlı redaction eklemek veya URL değerlerini tamamen `endpointSetting` benzeri
bir fonksiyondan geçirmek.

---

### B89-03 / P3 — `probeCommand` vs `runMediaCommand` stderr tüketimi farkı

**Dosya:** `src/process-io.js` (test-only) vs `src/main.js:860` (üretim)
**Öncelik:** P3 — bilinen fark, bilinçli tasarım

`process-io.js`'deki `probeCommand` (test harness'ı) stderr tüketmez; test bu modülde
yapılır ve `main.js`'teki üretim kodu ayrıdır. Ancak:

- `runInvidiousCommand` (`main.js:1232`): `proc.stderr.on('data', ...)` ile stderr'i
  biriktirir ama **sadece son 500 karakteri** (`stderrTail = ...slice(-500)`) saklanır.
- `runMediaCommand` (`main.js:869`): aynı — son 500 karakter.

Bu, `ffmpeg`/`yt-dlp` gibi araçların uzun stderr çıktısını kırpıyor — diagnostic
maksimum 500 karakter bilgi taşıyor. Kullanıcı hata ayıklarken tüm stderr'i göremez.

**Önceki rapor:** B80-02 bu farkı belgeledi (test vs üretim kopyası farkı).
R87'de B80-02 çözüldü (`p.stderr.resume()` + 256 KB tavan). Ancak `runInvidiousCommand`
ve `runMediaCommand` hâlâ `stderr` üzerine `.resume()` çağırmıyor.

**Karar:** P3 — `proc.stderr.resume()` eklemek stderr birikmesini önler,
ancak diagnostic bilgi kaybına yol açar. Şu anda çalışıyor; değişiklik riskli.

---

### B89-04 / P3 — `Invidious login` SID'inin NDJSON stdout'a yazılması

**Dosya:** `backend/invidious.py:578`, `src/main.js:1549`
**Öncelik:** P3 — kontrol altında

```python
# invidious.py:578
emit("login", ok=True, username=username, instance=inst, sid=sid)
```

SID renderer'a sızabilir mi?

- `runInvidiousCommand` login çağrısı `onEvent=null` geçiyor → `mainWindow.webContents.send`
  **yapılmaz** ✓
- `INVIDIOUS_RESULT_TYPES` 'login' içeriyor → `result = ev` atanır ✓
- `main.js:1548-1559` SID'i yakalayıp döndürmeden önce temizliyor ✓
  ```js
  if (res && res.data && 'sid' in res.data) {
      const { sid, ...safeData } = res.data;
      res = { ...res, data: safeData };
  }
  ```
- `mainWindow.webContents.send('invidious:event', ev)` → login handler'da `onEvent=null`
  olduğu için **çağrılmaz** ✓

**Ancak dikkat:** `invidious:event` kanalına `onEvent` callback'i veren diğer
handler'lar (`subs`, `search`, `channel`, `playlist` vb.) varsa ve bunlar session
sırasında `login` olayı emit edilirse SID sızar. Login sırasında başka komut
çalışmadığı için bu senaryo **pratikte oluşmaz**.

**Karar:** P3 latent — token koruması yeterli ama `emit("login", ..., sid=sid)` yerine
SID'i ayrı `emit("login_token", sid)` olarak stdout'a yazmak ve IPC dönüşünde
yakalamak daha temiz olurdu.

---

## Önceki bulguların güncel doğrulaması

| ID | Bulgu | Durum | Kanıt |
|---|---|---|---|
| B80-01 | `translateBaseUrl` sorgu-sır sızıntısı | **ÇÖZÜLDÜ** | `endpointSetting` (satır 178-189) tüm hassas parametreleri siliyor; `createBackupPayload` → `redactForBackup` değerleri split/join ile ayıklıyor |
| B80-02 | `probeCommand` stderr boru tıkanması | **KISMEN** | `runMediaCommand` hâlâ `proc.stderr.resume()` yok; `stderrTail` 500 karakter ile sınırlı |
| B82-01 | Invidious şifresi argv'de | **ÇÖZÜLDÜ** | `main.js:1549` → `WHISPER_INVIDIOUS_PASSWORD` ortam değişkeni |
| B83-05 | AudioContext sızıntısı | **ÇÖZÜLDÜ** | R87 kaynak doğrulaması |
| B83-13/14 | Browser page blok birikmesi/mutasyon | **ÇÖZÜLDÜ** | `pruneReplacedBrowserPageBlocks()` + `latestOriginal` R87'de eklendi |
| B83-35 | Site temizliği HTTP cache | **BELGELENDİ** | `browser-session-privacy.js` kodu + test — `cache`/`backgroundFetch` Electron'da origin filtrelemez, davranış doğru |

---

## Elenen adaylar (kanıtla)

| Aday | Sebep |
|---|---|
| `writeSubtitleAtomic` VTT BOM | `/\.(srt\|ass\|ssa)$/i.test(filePath)` → VTT BOM eklenmez. Sadece SRT/ASS/SSA'ya eklenir. SPEC'e uygun. |
| `PdfFileAccess` imza kontrolü | `Buffer.alloc` + `%PDF-` imza kontrolü mevcut (satır 110-113). `grant()` 1000 kayıt tavanıyla sınırlı. |
| `mediaFileAccess` / `subtitleFileAccess` | Grant listesi sınırlı (20.000 / 10.000), DOS yolu koruması `canonicalLocalPath` içinde (satır 11-30), alt-uzantı kontrolü mevcut. |
| `safePlaceUrl` (browser-place-url.js) | Temiz URL çıkarma — basic auth, hassas sorgu/fragment atılıyor. |
| `isSafeMangaImageUrl` | IPv4/IPv6 özel adres kontrolü, 6to4/Teredo SSRF vektörü engelli (satır 270-315). |
| `isPublicMangaIpAddress` | RFC 6890 özel adres aralıkları doğru (10.x, 172.16-31.x, 192.168.x, 127.x, 224+ vs 169.254.x, ::1, fe80::/10, 2002::/16, 2001::/32 dahil). |
| `createBrowserSessionPackage` | Checksum doğrulaması (`sha256:${checksumPayload}`) tüm paket bütünlüğünü korur; `sitePermissions`/`siteTerminology` dışa aktarmada düşürülür. |
| `translateBaseUrl` içe aktarım | `endpointSetting` sorguyu tarar; mevcut kasa korunur; yeni endpoint kimliği farklıysa sır taşınmaz. |
| `providerKeyForScope` (provider-api-keys.js) | `UNSAFE_PROFILE_SCOPES` (`__proto__`, `prototype`, `constructor`) kontrolü mevcut (satır 55). |
| `normalizeProviderModelProfiles` | `MAX_PROVIDERS=32`, `MAX_MODELS_PER_PROVIDER=64`, kontrol karakteri regex `/[\u0000-\u001f\u007f]/u` ile reddediliyor. |
| `secret-store.js` | `pathParts` `__proto__`/`constructor`/`prototype` kontrollü; `cloneJson` JSON.parse/stringify; `SafeSecretStore` safeStorage şifrelemesi. |
| `async-timeout.js` | `settled` flag'i ile double-resolve önleniyor; timer her durumda `clearTimeout`. TDZ riski yok — `const timer = setTimeout(...)` ataması aynı işlev içinde, senkron çalışır. |
| `pipeline-job.js` vs `process-lifecycle.js` `terminateProcessTree` | İki farklı dosyada iki farklı implementasyon — `main.js:14` doğru olanı import ediyor (`process-lifecycle`'tan). `pipeline-job`'daki async versiyon farklı kod yolunda (`waitForChildClose` vb.). |

---

## Test hijyeni notları

- `run-all.js` her test dosyası için 10 dk timeout uyguluyor — uzun süren testler
  (özellikle Python testleri) timeout'a yaklaşabilir.
- Electron smoke testleri (`run-electron-smokes.js`) ayrı çalışıyor — tam pakete dahil değil.
- Python venv yolu Linux VM'de `/usr/bin/python3` olarak çalışıyor — Windows `backend\venv`
  kullanılmıyor (ortam farkı, bilinen sınırlama).

---

## Önerilen sonraki adımlar

1. **B89-01** (P3): `browser:trusted-bridge` `page-blocks`/`page-action` için
   aktif-sekme kontrolü ekle. Test: arka plan sekmesinden bu olayları göndermeyi simüle et
   ve reddedildiğini doğrula.
2. **B89-04** (P3): `invidious.py` `emit("login", ..., sid=sid)` SID'i ayrı bir
   olay olarak stdout'a yazması; IPC yanıtında yakalanması.
3. **B89-02** (P3): `redactForBackup`'a URL parametre-adı eşleşmesi eklemek
   veya URL değerlerini `endpointSetting`-benzeri bir fonksiyondan geçirmek.
