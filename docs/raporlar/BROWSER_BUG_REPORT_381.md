# BROWSER BUG REPORT 381 — Yeni-100 batch 8: güvenlik/mahremiyet derinleştirme

Tarih: 2026-10-02 · Dal: devin/1790909260-security-privacy-b8 · Başlangıç: `9d3e3df` · Bitiş kod: `2367433`

## Özet

Mahremiyet ve sır korunumu yüzeylerinin 10 maddelik derinleştirme turu (günlüklerdeki sır/URL sızıntısı, endpoint gizli-bilgi taşıması, çerez/depo kalıcılığı, kabuk hedefleri, dışa aktarım redaksiyonu, tanı metni temizliği, pano sınırları, kimlik bilgisi akışı, dosya yazma izinleri, mevcut ratchet doğrulaması). Sonuç: **2 doğrulanmış kusur giderildi**, 8 yüzey mevcut sertleştirmeyle doğrulandı (kayıt kanıtı aşağıda).

## Düzeltilen kusurlar

### B381-01 — İş günlüğünde sağlayıcı uç noktası tam URL kalıyordu

`redactJobLogArgs` (src/main.js:766) `--input`/`--output-dir`/`--cache-dir`/`--initial-prompt`/`--glossary`/`--translate-context` değerlerini `<gizlendi>` ile maskeliyordu ama `--translate-base-url` ve `--llm-base-url` listede yoktu. Kullanıcı-özel sağlayıcı uç noktası (ör. `https://ic-ag.corp/v1` — iç ağ adı, özel proxy) paylaşılabilen `logs/*.log` başlığının `# Ayarlar` satırına tam olarak yazılıyordu. Kullanıcı-bilgisi/parola ayar sınırında (`endpointSetting`) zaten reddedildiği için bu gizli-anahtar sızıntısı değil, mahremiyet sızıntısıydı.

**Düzeltme:** iki bayrak `hiddenValueFlags`'a eklendi — hem `--ad değer` hem `--ad=değer` biçiminde maskelenir.

### B381-02 — `safeTranslationEndpoint` userinfo'yu soyuyordu ama saklıyordu

Uç nokta normalizatörü (src/main.js:6114) `url.search`/`url.hash`'i temizliyor fakat `url.username`/`url.password`'u koruyordu. Kalıcı ayar yolu bu değerleri `endpointSetting` kapısında reddettiği için gövdede userinfo'lu URL'nin buraya ulaşması yalnız renderer-canlı değerlerle (ör. `translation:probe`'un `customBaseUrl`'i) mümkündü — erişilebilirlik düşük, ama isteğe gömülen `user:pass@` kimliğini ele geçirme derinliği kapatılmamıştı.

**Düzeltme:** `url.username = ''` / `url.password = ''` — uzak https ve yerel http yollarının ikisinde de gizli bilgi taşınamaz.

## Doğrulanmış-temiz yüzeyler (kusur yok)

- **Ayar sınırı** (`settings-security.js`): `endpointSetting` userinfo + `?api_key=`/`?token=` sorgu gizlilerini reddediyor; `sanitizeUiSettings`/`sanitizeEndpointGroup` tüm persist yollarından geçiyor.
- **Dışa/içe aktarım:** `collectAllSecretValues` + `redactForBackup` + `secretsExcluded:true`; içe aktarımda `allowSecrets:false` — sır anahtarları yedekten çıkmaz, içeri geri alınamaz.
- **Kabuk hedefleri:** `shell:openPath`/`shell:showInFolder` — `canonicalLocalPath` + uzantı beyaz listesi + `shellTargetAccess`/`subtitleFileAccess`/`mediaFileAccess`/`watchFolderAccess` izin kümeleri + kullanıcı onay diyaloğu + yeniden-doğrulama (`canonicalLocalPath(p) !== target` TOCTOU kapısı).
- **Çerez iletimi:** yalnızca same-origin altyazı getirisi; Secure çerez düz-http'ye taşınmaz; DNS-pinning + genel-URL doğrulaması + `ESUBTITLE_LIMIT` bütçesi.
- **Tanı metni:** `redactDiagnosticText` anahtar-bazlı + atama-desenli redaksiyon (token/sig/jwt/key/secret/sid/pass…).
- **Pano:** `clipboard:write` 4 MB üst sınırı + yetki kapısı.
- **Invidious SID:** safeStorage'la şifreli `invidious-session.safe.json`; `login` yanıtı renderer'a dönmeden önce `sid` alanı düşürülür.
- **Dosya yazma hedefleri:** tüm kullanıcı dışa aktarımları `showSaveDialog` (yerli onay) üzerinden.
- **Sır geçişi:** HF/LLM anahtarları yalnızca env (`WHISPER_HF_TOKEN`/`WHISPER_LLM_API_KEY`), argv'de asla.
- **İş günlüğü çerçevesi:** 4 MB `LOG_MAX_BYTES` + kesim işareti + `LOG_SKIP` olay süzgeci + akış-hatası izolasyonu + `pruneOldLogs`.

## Test kanıtı

- `tests/joblog-deadzone.test.js`: `t_redact`'a +2 senaryo — ayrı ve bağlı biçimde `--translate-base-url`/`--llm-base-url` maskesi. **4/4 PASS**
- `tests/validation.test.js`: endpoint testine +2 senaryo — uzak https ve yerel http userinfo soyma. **27/27 PASS**
- Komşu ratchet'ler (regresyon): settings-security 23, translation-endpoints 29, core-security-r4 8, report63-secret-redaction 19, adversarial-ipc 18, ipc-payload-fuzz, image-sink-security 5 — hepsi yeşil.
- `node --check src/main.js` temiz.

## Windows etkisi

Kod yolu platformdan bağımsız (URL ayrıştırma + dizgi süzgeci). `start.bat`/`install.bat` akışı etkilenmez. Windows-özel doğrulama gerektiren yüzey yok; Linux'ta denenemeyen tek yüzey safeStorage DPAPI davranışı — bu turda değiştirilmedi (Invidious mağazası yalnız doğrulandı).
