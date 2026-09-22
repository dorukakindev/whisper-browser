# Whisper Local — Güvenlik ve Kalite Denetim Raporu (NİHAİ)


> **GÜNCEL DOĞRULAMA NOTU — 2026-09-12:** K-1, K-2, K-3 ve Y-4 güncel kaynakta düzeltildi ve test edildi. Y-1, Y-2, Y-3 ve Y-5 bu turda uygulanmadı; teorik/yüksek olasılıklı kapsam olarak korunuyor.

**Tarih:** 2026-09-12
**Denetçi rolü:** Kıdemli yazılım güvenliği ve kalite denetçisi (yalnızca inceleme, test ve raporlama)
**Kapsam:** 20 görevin tamamı — Electron main/preload/renderer IPC, context isolation, DOM/XSS, subprocess yaşam döngüsü, NDJSON protokolü, kuyruk, ayar kalıcılığı, gizli anahtar aktarımı, yol doğrulama, ffmpeg, zaman ekseni, motor seçimleri, bölme/birleştirme, halüsinasyon filtresi, çeviri önbelleği, LLM postprocess, diarization, yazıcılar, re-export/burn-in/shift/import-export, test kapsamı.

---

## 1. Yönetici özeti

**İncelenen kod:** `src/main.js` (~13.200 satır), `src/preload.js` (197 satır), `src/renderer/renderer.js` (~19.800 satır), `src/renderer/index.html`, `backend/transcribe.py` (7.053 satır) ve destek modülleri (`queue-persistence.js`, `settings-security.js`, `secret-store.js`, `ndjson-lines.js`, `process-lifecycle.js`, `pipeline-job.js`, `queue-lifecycle.js`, `renderer-ui-model.js`, `burnin-output.js`, `local-file-access.js`, `browser-navigation-policy.js`, `browser-textutil.js`).

**Çalıştırılan testler:**
- `npm test` **üç kez** çalıştırıldı (aşağıdaki bütünlük olayı nedeniyle): 1. çalıştırma tamamen geçti; 2. çalıştırmada 2 geçici hata gözlendi; 3. (nihai) çalıştırma **tamamen geçti** (~125 Node test dosyası + 10 Python test dosyası, 0 başarısız).
- Bu denetim için yazılan kontrollü problar: **10 adet** (`scratch/` altında; tüm geçici veriler `%TEMP%` altında üretilip temizlendi).
- Fonksiyon düzeyi birim doğrulamalar: **60+ tekil kontrol**.

**Bulgu dağılımı:** 3 KESİN · 5 YÜKSEK OLASILIKLI · 7 TEORİK/MANUAL DOĞRULAMA · 6 FALSE POSITIVE.

**Ana risk alanları:**
1. Kuyruk disk kaydında API endpoint URL'lerinin düz metin kalması (K-1).
2. Halüsinasyon filtresinin gerçek diyalogu sessizce silebilmesi (K-2).
3. `transcribe:start` IPC'sinin girdi yolunu doğrulamaması (K-3).
4. GPU/model/diarization yollarının bu ortamda doğrulanamayan bölümü (T-1, T-2, T-3 — MANUAL).

**Bütünlük olayı (kritik not):** Denetim devam ederken çalışma ağacına **bu denetim dışı bir oturum/ajan tarafından 62 dosyada değişiklik yapıldı** (+1185/−268 satır). Değişiklikler bu raporun yazarına ait değildir. Etki analizi bölüm 11'de; bulguların geçerlilik durumu her biri için ayrıca işaretlendi.

**Genel değerlendirme:** Kod tabanı olağan dışı derecede savunmacı yazılmış (terminal mandalı, iş kimliği, transaction journal, atomik yazıcılar, DPAPI gizli anahtar kasası, URL politikası). Önceki denetim raporlarındaki birçok sorun zaten giderilmiş durumda.

---

## 2. Ortam ve yöntem

- **Repo durumu:** `master` dalı, `origin` ile eşit (ahead 0 / behind 0).
- **Ortam:** Windows, Node v25.6.1, sistem Python 3.14.3, venv Python 3.11.9 (`backend/venv`), ffmpeg 9.0.1 (`C:\ffmpeg\bin`). GPU/CUDA bu oturumda kullanılmadı.
- **Salt-okunur komutlar:** `git status --short`, `git diff --check`, `git diff --stat`, `git diff <dosya>`, `git show HEAD:<dosya>`, `node --check`, `py_compile`, `Select-String` taramaları.
- **Test yöntemi:** Önce repo yapısı/AGENTS.md/package.json okundu; sonra kaynak akışları statik incelendi; ardından sentetik, salt-okunur, repo-dışı-temp kullanan kontrollü testler koşuldu. Hiçbir gerçek kullanıcı dosyası, credential, API anahtarı veya token okunmadı. Ağ gerektiren testler çalıştırılmadı (kural 9).
- **Çalıştırılamayan testler ve nedenleri:**
  - YouTube indirme, LLM/çeviri API çağrıları, model indirme → ağ yasağı.
  - Gerçek GPU yolları (CUDA model yükleme, OOM, VRAM boşaltma, pyannote) → gerçek GPU + büyük model gerekir → MANUAL.
  - Electron GUI uçtan uca test → uygulamayı başlatmak gerçek `userData` profiline dokunur; IPC mantığı bunun yerine statik + modül düzeyinde denetlendi.
  - Symlink senaryosu → Windows `WinError 1314` (ayrıcalık yok) → doğrulanamadı.
- **Kanıt standardı:** KESİN bulgular için (1) dosya+satır, (2) tetikleme yolu, (3) deterministik yeniden üretim veya kontrollü test, (4) somut kullanıcı etkisi, (5) mevcut testlerin neden yakalayamadığı, (6) başka kod yoluyla engellenmediğinin kanıtı — altı ölçütün tamamı arandı.

---

## 3. Kesin bulgular

### K-1 — Kuyruk disk kaydında API endpoint URL'leri düz metin saklanıyor

- **Önem:** Düşük-Orta (bilgi ifşası)
- **Görev:** 7, 8, 15
- **Dosya/satır:** `src/queue-persistence.js:23-38` (`sanitizeOptionUrl`), `src/queue-persistence.js:62-77` (`clonePublicOptions`); geri yükleme: `src/renderer/renderer.js:109-120` (`queueSecretsFromCurrentUi`)
- **Teknik açıklama:** `clonePublicOptions` gizli anahtarları (`hfToken`, `translateApiKey`, `llmApiKey` ve regex'e yakalanan türevleri) kuyruk snapshot'ından çıkarıyor; `sanitizeOptionUrl` yalnızca `username:password@` taşıyan URL'leri reddediyor. Credential'sız `translateBaseUrl`/`llmBaseUrl` değerleri `queue-state.json` içine düz metin yazılıyor. Renderer bunu biliyor: işi yeniden başlatırken `savedOptions[key]` boşsa güncel UI değerini çalışma anında geri ekliyor (`queueSecretsFromCurrentUi`) — yani tasarım URL'yi de diskten çıkarmaya izin veriyor ama çıkarmıyor.
- **Tetikleme yolu:** Kullanıcı özel (custom) LLM/çeviri endpoint'i ayarlar → kuyruğa iş ekler → uygulama kapanır → `queue-state.json` diskte endpoint'i düz metin tutar.
- **Yeniden üretim:** `clonePublicOptions({ translateBaseUrl: 'https://ozel-saglayici.internal.example/v1' })` URL'yi olduğu gibi döndürür (modül düzeyinde, bu oturumda doğrulandı). `https://user:pass@host/` ise `undefined` döner (reddedilir).
- **Gözlenen sonuç:** Yalnızca userinfo'lu URL'ler ve hassas query parametreleri temizleniyor; düz host URL'leri korunuyor.
- **Kullanıcı etkisi:** İç/dış sağlayıcı altyapı bilgisi (şirket içi LLM gateway adresi vb.) kullanıcının haberi olmadan kalıcı dosyada birikir. Anahtar sızmaz; etki sınırlı ama sessiz.
- **Testler neden yakalayamadı:** `queue-persistence.test.js` gizli anahtar reddini test ediyor; endpoint URL'sinin kalmasını "beklenen" kabul eden bir sözleşme testi yok.
- **Başka yol engelliyor mu:** Hayır — renderer tarafındaki `queueSecretsFromCurrentUi` yalnızca anahtarları ve (boşsa) endpoint'i geri ekler; diske yazılan içeriği değiştirmez.
- **Güven düzeyi:** KESİN. **Bütünlük olayı sonrası durum:** `queue-persistence.js` değişen 62 dosya arasında **yok** → bulgu aynen geçerli.

### K-2 — Halüsinasyon filtresi gerçek diyalogu koşulsuz ve sessizce siliyor

- **Önem:** Orta (veri bütünlüğü — sessiz içerik kaybı)
- **Görev:** 14
- **Dosya/satır:** `backend/transcribe.py:1781-1808` (`HALLUCINATION_PATTERNS`), `backend/transcribe.py:1867-1877` (`is_hallucination`); çağrılar: `transcribe()` içinde ~4873-4879 (bölme öncesi `is_hallucination(text)` + temizlik sonrası `is_hallucination(cleaned)`)
- **Teknik açıklama:** Filtre, metin kalıpla eşleşirse bloğu **hiçbir uyarı üretmeden** atar. Kalıplar tüm satırı kapsıyor (`^...$`) ama içerik bağlamına bakmıyor. Bu oturumda doğrulanan örnekler:
  - `is_hallucination('İzlediğiniz için teşekkürler.')` → `True` (bir belgeselin kapanış cümlesi olabilir)
  - `is_hallucination('Abone olmayı unutmayın arkadaşlar')` → `True` (YouTube içeriğinde en sık söylenen gerçek cümlelerden)
  - `is_hallucination('Altyazı çevirisi: John Smith')` → `True` (jenerikte gerçekten geçebilir)
  - `is_hallucination('Copyright 2024')` → `True`
  - Karşı örnek (doğru davranış): `'Lütfen abone olun dedi adam.'` → `False`, `'(gülüşmeler) dedi'` → `False` — kalıp yalnızca satırın tamamıysa yakalıyor.
- **Tetikleme yolu:** Kullanıcı, kapanışında bu cümlelerden birini gerçekten içeren bir video transkribe ettirir → ilgili blok hem `done` olayındaki önizlemeden hem SRT/VTT/ASS/JSON çıktısından sessizce düşer; zaman çizgisinde açıklanamayan boşluk oluşur.
- **Yeniden üretim:** Yukarıdaki çağrılar bu oturumda koşuldu; deterministik.
- **Gözlenen sonuç:** Blok çıktıda yok; kullanıcıya "N blok filtrelendi" bilgisi hiçbir kanaldan (`done.warnings`, log, kalite raporu) verilmiyor.
- **Kullanıcı etkisi:** Ana kullanıcı kitlesi (YouTube içeriği transkribe edenler) için videonun gerçek kapanış sözleri altyazıdan eksilir. Sessiz olduğu için fark edilmez; yanlış senkron/boşluk sanılabilir.
- **Testler neden yakalayamadı:** `test_transcribe.py` kalıpların halüsinasyonu yakaladığını test ediyor; gerçek diyalogun korunması gereken **negatif** senaryolar (false-positive korpusu) hiç yok.
- **Başka yol engelliyor mu:** Hayır — `drop_repeated_hallucinations` güven skoru eşiği kullanıyor ama `is_hallucination` regex yolu skora bakmıyor.
- **Güven düzeyi:** KESİN. Not: kısmen bilinçli tasarım bedeli (kaynak "Bag of Hallucinations"ı referans alıyor) ama sessizlik ve geri alınamazlık bulgu olarak duruyor. **Bütünlük olayı sonrası durum:** `backend/` hiç değişmedi → bulgu aynen geçerli.

### K-3 — `transcribe:start` girdi yolunu hiç doğrulamıyor

- **Önem:** Düşük (derinlemesine savunma eksiği; mevcut tehdit modelinde istismar yolu kapalı)
- **Görev:** 1, 9
- **Dosya/satır:** `src/main.js:12673-12676` (`args.push('--input', options.input)`); karşılaştırma: `src/main.js:9328-9344` (`authorizeSubtitleFile`) ve `src/local-file-access.js:10-30` (`canonicalLocalPath`)
- **Teknik açıklama:** `transcribe:start` handler'ı `options.input` değerini varlık, uzantı, tip veya konum kontrolü olmadan Python argv'sine aktarıyor. Diğer dosya IPC'leri (`media:readSubtitle`, `media:writeSubtitle`, `subs:shift`) `authorizeSubtitleFile` + `canonicalLocalPath` ile sıkı doğrulama (uzantı beyaz listesi, 32 MB sınırı, symlink çözümleme, kullanıcı onayı) uygularken transkripsiyon girdisi tamamen denetimsiz. Python tarafı yalnızca `Path(source_path).exists()` kontrolü yapıyor (`transcribe.py:4655`).
- **Tetikleme yolu:** Renderer'da `window.api.startTranscribe({ input: <herhangi bir yol> })` çağrısı → main doğrudan spawn eder. Normal UI akışında yol native dialog/drop'tan gelir; ancak preload köprüsü herhangi bir string kabul eder.
- **Yeniden üretim:** Kaynak inceleme — handler'da `fs.existsSync`, uzantı beyaz listesi veya `canonicalLocalPath` çağrısı yok (tüm handler gövdesi okundu). `options.outputDir` için de doğrulama yok (Python tarafında `preflight_output_dir` yazılabilirlik kontrolü yapıyor — bu iyi).
- **Gözlenen sonuç:** `options.input` doğrudan argv'ye; `options.youtube` için de şema/host kontrolü yok (yt-dlp'ye iletiliyor).
- **Kullanıcı etkisi:** Bugün pratik etki yok: Python yalnızca okur ve hata mesajı sabit metin. Ancak renderer'a girecek olası bir XSS (CSP + contextIsolation ile engelleniyor — Görev 2'de doğrulandı) bu kanaldan sistemin herhangi bir dosyasını ffmpeg/Whisper ile okutabilir.
- **Testler neden yakalayamadı:** `main-args.test.js` argüman eşlemesini test ediyor; yetkilendirme sözleşmesi testi yok.
- **Güven düzeyi:** KESİN (kaynak kanıtlı), etki derecesi düşük. **Bütünlük olayı sonrası durum:** `main.js` değişti ancak diff incelemesi `transcribe:start` handler bölgesine dokunulmadığını gösteriyor (değişiklikler browser/PDF/settings-loadWarning bölgelerinde) → bulgu aynen geçerli.

---

## 4. Yüksek olasılıklı bulgular

### Y-1 — Çeviri önbelleği çok süreçli erişimde yazım kaybedebilir
- **Görev:** 15. **Konum:** `backend/transcribe.py:2806-2816` (`save_translate_cache`), yükleme: 2983, yazma: 3262.
- **Açıklama:** Cache iş başına bellekte yüklenip iş sonunda `atomic_text_writer` ile bütün olarak yazılıyor. İki eşzamanlı backend süreci (main.js tek iş kısıtı nedeniyle normalde olmaz; kullanıcı backend'i elle paralel çalıştırabilir) aynı `translate-cache.json` üzerinde son-yazan-kazanır yapar. Windows'ta eşzamanlı `os.replace` denemesi `WinError 5` ile başarısız olabiliyor — bu oturumda 8 iş parçacıklı stres testinde 2 kez gözlendi; hata yalnızca `warn` log'una düşüyor, veri sessizce kayboluyor.
- **Etki:** Çeviri maliyeti (API kotası) tekrar harcanır; kayıp kullanıcıya görünmez.
- **Test boşluğu:** Eşzamanlı çok süreç senaryosu test kapsamında yok.
- **Güven:** YÜKSEK OLASILIKLI. **Durum:** `backend/` değişmedi → geçerli.

### Y-2 — `settings:save` tek alan hatasında tüm kaydı reddediyor; renderer uyarıyı yalnızca bir kez gösteriyor
- **Görev:** 7. **Konum:** `src/settings-security.js:276-352` (`sanitizeSettings` throw), `src/main.js` `saveSettings`, `src/renderer/renderer.js:1934-1954` (`_settingsSaveWarningShown` tek seferlik bayrak).
- **Açıklama:** `sanitizeSettings` tek bir alan hatasında (ör. 500'ü aşan sözlük — UI'da sınır yok, `addGlossaryTerm` limitsiz push ediyor, `renderer.js:1813-1821`) bütün kaydı reddediyor. Renderer hatası log'a bir kez yazar; sonraki debounce'lu kayıtlar da aynı şekilde sessizce başarısız olur. Kullanıcı uygulamayı kapattığında o oturumdaki **tüm** ayar değişiklikleri kaybolur.
- **Tetikleme:** 501 sözlük terimi ekle → herhangi bir ayarı değiştir → kapat/aç → değişiklik yok.
- **Güven:** YÜKSEK OLASILIKLI. **Bütünlük olayı notu:** Yabancı değişiklik `loadSettings`'e `_loadWarning` yüzeyi ekledi (yükleme tarafı iyileşti) ancak `settings-security.js` **değişmedi** → kaydetme tarafındaki bulgu aynen geçerli.

### Y-3 — `settings:saveSync` (sendSync) ana süreçte disk yazımını senkron blokluyor
- **Görev:** 1, 7. **Konum:** `src/main.js:11789-11798`, `src/secret-store.js:150-176` (`save` → `writeFileSync` + `encryptString`).
- **Açıklama:** Kapanış öncesi akışlarda kullanılan `sendSync` renderer'ı, `writeFileSync`+DPAPI şifreleme ana süreci bloklar; yavaş/antivirüslü diskte kapanış donması riski. Kritik veri için bilinçli tercih olduğu yorumlarda belirtilmiş; yine de zaman aşımı/kapak yok.
- **Güven:** YÜKSEK OLASILIKLI (kaynak kanıtlı; gerçek yavaş disk koşulu MANUAL). **Durum:** ilgili dosyalar değişmedi → geçerli.

### Y-4 — WhisperX `int8_float16` sessiz düşüşü ve hizalama hatasının `done.warnings`'e taşınmaması
- **Görev:** 12. **Konum:** `backend/transcribe.py:3366-3369`, `3426-3432`.
- **Açıklama:** (a) `int8_float16` seçimi WhisperX'te `int8`'e düşürülüyor — `warn` log'u var ama `done.warnings`'e eklenmiyor; kuyruk özetinde görünmez. (b) Hizalama (`load_align_model`/`align`) herhangi bir hatada `log(..., 'warn')` ile atlanıyor; `need_words=true` istenmişken kelimesiz çıktı üretilebilir ve kullanıcı bunu ancak JSON çıktıyı açınca fark eder. Hata `warn_list`'e de eklenmiyor.
- **Güven:** YÜKSEK OLASILIKLI. **Durum:** `backend/` değişmedi → geçerli.

### Y-5 — Kuyruk terminal koruması yeniden-deneme (retry) yarışında dar bir pencere bırakıyor
- **Görev:** 6. **Konum:** `src/main.js:1068-1086` (`persistQueueTerminal`/`persistQueueRunning`), `src/queue-persistence.js:88-113` (`mergeQueueSnapshotForSave`).
- **Açıklama:** Terminal koruma `queueTerminalGuards`'a eklenen ID'ye bağlı; guard `persistQueueRunning`'de siliniyor. Retry akışında renderer `item.status='pending'` yapıp diske yazarken, henüz guard eklenmemiş eski bir terminal yazımıyla çakışma penceresi teorik olarak var. Tek iş kısıtı + 250 ms gecikme bunu pratikte kapatıyor; deterministik tetikleme üretilemedi.
- **Güven:** YÜKSEK OLASILIKLI. **Durum:** ilgili dosyalar değişmedi → geçerli.

---

## 5. Teorik ve manual doğrulama gerektiren maddeler

| ID | Görev | Madde | Sınıf |
|---|---|---|---|
| T-1 | 4, 17 | CUDA OOM / VRAM boşaltma (`del model` + `empty_cache`) gerçek RTX 4070 Ti + large-v3 + pyannote kombinasyonunda doğrulanmadı. Kaynak doğru görünüyor (`transcribe.py:4961-4966`, `run_diarization` finally bloğu). | MANUAL |
| T-2 | 12 | Model indirme/yükleme hatası (ağ, bozuk cache, HuggingFace 401) yalnızca kaynak düzeyinde denetlendi; `RuntimeError` mesajları sabit ve Türkçe, ancak gerçek indirme akışı ağ gerektirir. | MANUAL |
| T-3 | 10 | Çok uzun medya (>2 saat) + `extract_audio` 3600 s timeout sınırı: çok uzun dosyada timeout'a takılma olasılığı; gerçek uzun medya gerekir. | MANUAL |
| T-4 | 9 | Symlink/junction girdi senaryosu: Windows ayrıcalığı olmadan üretilemedi (`WinError 1314`). Python tarafı `Path.exists()` ile symlink'i izler; `canonicalLocalPath` yalnızca altyazı IPC'lerinde kullanılıyor. | MANUAL |
| T-5 | 16 | LLM sağlayıcısının "kısmen doğru ama anlamı bozuk" yanıtlarının kelime/karakter sapma eşiklerini (2x/0.5x, 1.6x/0.6x) aşıp aşamayacağı gerçek sağlayıcı verisi ister. Bozuk/kısmi/fenced JSON yolları bu oturumda doğrulandı ve güvenli. | TEORİK |
| T-6 | 3 | `contenteditable` segment metni `commitSegmentEdit` → state → `cuesToSrt`/kopyalama akışında DOM'a geri yazım `textContent`/`escapeHtml` üzerinden (doğrulandı). Kalıcı XSS yolu bulunamadı. | TEORİK (false positive'e yakın) |
| T-7 | 19 | Burn-in'de `videoPath` yalnızca `fs.existsSync` ile kontrol ediliyor; spawn argv olduğu için shell enjeksiyonu yok, ffmpeg protokol şeması (`concat:` vb.) riski teorik. `stageBurninSubtitle` ASCII kopya ile Unicode/tek tırnak sorununu kapatıyor (doğrulandı). | TEORİK |

---

## 6. False positive olarak elenen iddialar

1. **"NDJSON satırları UTF-8 sınırında bölünürse bozulur"** — Yanlış. `main.js` `setEncoding('utf-8')` kullanıyor; Node stream decoder çok baytlı karakterleri birleştirir. 3001 satırlık Türkçe NDJSON akışı prob ile doğrulandı: 0 bozuk satır. (Denetimin ilk testi string-push ile yapay bozulma üretmişti; gerçek yol decoder üzerinden gidiyor.)
2. **"Çift terminal olayı (done+error) kuyruğu iki kez ilerletir"** — Engellenmiş. `createProcessTerminalLatch` (main) + `applyQueueRunEvent` run mandalı (renderer) çift korumalı; `queue-lifecycle.test.js` invariant'ları test ediyor.
3. **"İptal sonrası geç 'done' başarı modalı açar"** — Engellenmiş. Renderer `state.cancelled` kontrolü (`renderer.js:3520`), main `lifecycle.requestCancel()` sonrası terminal reddi.
4. **"Gizli anahtarlar argv/süreç listesine sızar"** — Engellenmiş. `buildSecretEnv` yalnızca ilgili özellik açıkken env'e koyuyor; `withoutSecretEnv` ebeveyn env'deki aynı adlı değişkenleri (küçük harf varyantları dahil) temizliyor; job log başlığına argv yazılıyor ama anahtarlar argv'de hiç taşınmıyor. Prob ile doğrulandı.
5. **"Re-export kaynak JSON'ın üzerine yazar"** — Engellenmiş. `reexport_from_json` çakışmada `.reexport.<fmt>` adına yönlendiriyor ve uyarıyı `done.warnings`'e taşıyor (prob ile doğrulandı: `video.tr.json` korundu).
6. **"Aynı girdi/çıktı yolu extract_audio'da kaynağı siler"** — ffmpeg aynı dosyaya yazmayı reddediyor; kaynak dosya prob sonrası birebir korunuyordu (boyut doğrulandı).

---

## 7. Görev bazlı sonuç tablosu

| # | Görev | İnceleme | Test | Sonuç |
|---|---|---|---|---|
| 1 | IPC sözleşmesi | Tam | Statik eşleme + modül testleri | 200+ kanal preload/main eşleşiyor; `authorizedBrowserSender` tutarlı. K-3 ve Y-3 not edildi. |
| 2 | Context isolation/sandbox | Tam | Statik + URL politikası birim testi | `contextIsolation:true, sandbox:true, nodeIntegration:false` her pencerede; CSP katı; `javascript:`/`file:`/`data:`/credential'lı URL reddi doğrulandı. Temiz. |
| 3 | Renderer DOM/XSS | Tam | Statik innerHTML taraması (8 şüpheli → hepsi güvenli) + escapeHtml doğrulaması | Tüm kullanıcı verisi interpolasyonları `escapeHtml`'den geçiyor. Temiz. |
| 4 | Subprocess yaşam döngüsü | Tam | Kaynak + latch/terminate modül incelemesi | Terminal mandalı, sentetik terminal, taskkill+fallback, null-stdio koruması mevcut. Temiz. |
| 5 | NDJSON protokolü | Tam | 3001 satırlık akış probu + buffer birim testi | UTF-8 güvenli, 32 MB satır sınırı + overflow reddi, bozuk satır log'a düşüyor. Temiz. |
| 6 | Kuyruk | Tam | Kaynak + persistence modülü | Ayar dondurma, sıra, tek-iş, terminal koruması sağlam. Y-5 not edildi. |
| 7 | Ayar kalıcılığı | Tam | sanitize/import birim probları | Bozuk/eski/yanlış tip güvenli reddediliyor. Y-2 bulundu (yabancı değişiklik yükleme tarafını kısmen iyileştirdi). |
| 8 | Gizli anahtar aktarımı | Tam | buildSecretEnv probu | argv/log sızıntısı yok; kasa DPAPI; eksik anahtarda güvenli hata. K-1 bulundu. |
| 9 | Girdi/yol doğrulama | Tam | ffmpeg probları (Unicode, boşluk, klasör, aynı yol, olmayan dosya) | Hepsi güvenli. K-3 ve T-4 not edildi. |
| 10 | ffmpeg akışı | Tam | 8 senaryo (sessiz video, bozuk, ters aralık, aşan aralık, 44.1k→16k, clip) | Hepsi beklenen hata/çıktı. T-3 MANUAL. |
| 11 | Zaman damgası/offset | Tam | offset+normalize+reexport probları | Orijinal eksen segment/kelime/diarization/reexport'ta korunuyor.Temiz. |
| 12 | Motor seçimleri | Tam | resolve_device_and_compute birim + kaynak | CPU fallback + compute düzeltmesi doğru; Y-4 bulundu; T-2 MANUAL. |
| 13 | Kelime/bölme/birleştirme | Tam | 15+ birim kontrol (tüm split modları, merge, dedupe, stres) | Kelime kaybı/örtüşme/tekrar yok. Temiz. |
| 14 | Halüsinasyon filtresi | Tam | 15 kalıp + gerçek diyalog korpusu | K-2 bulundu. |
| 15 | Çeviri önbelleği | Tam | anahtar determinizm/bağlam/model/glossary + eşzamanlı yazım stresi | Bağlam anahtara dahil (doğru); Y-1 bulundu. |
| 16 | LLM postprocess | Tam | 9 yanıt biçimi probu + anahtarsız akış | Zaman/cue korunuyor, bozuk yanıt reddediliyor. T-5 TEORİK. |
| 17 | Diarization | Kısmi | assign_speakers birim + token eksikliği + PCM yükleme probu | Bellek temizliği finally'de; T-1 MANUAL. |
| 18 | Yazıcılar | Tam | BOM/Unicode/özel karakter/uzun satır/boş metin/NaN/format tutarlılığı | Tüm formatlar tutarlı; eski dosya korunuyor.Temiz. |
| 19 | Re-export/burn-in/shift/import-export | Tam | reexport 4 senaryo, shift sınırları, burn-in kaçış probu, import 5 senaryo | Hepsi sağlam. T-7 TEORİK. |
| 20 | Test kapsamı | Tam | `npm test` 3 kez (son: tamamı geçti) | Boşluklar bölüm 9'da. |

---

## 8. Uygulama planı (yalnızca öneri — hiçbir düzeltme uygulanmadı)

### P0
Yok. (Hiçbir bulgu yaygın/deterministik veri kaybı veya uzaktan istismar edilebilir düzeyde değil.)

### P1
1. **K-2 — Halüsinasyon filtresine görünürlük ve gerçek-diyalog korpusu**
   - Neden: Bloklar sessizce atılıyor; kullanıcı içerik kaybını fark etmiyor.
   - Çözüm: Atılan her blok için `warn` log + `done.warnings`'e özet; kalıpları yalnızca düşük güvenli (`avg_logprob` eşiği altı) segmentlere uygulama seçeneği; YouTube kapanış kalıpları için "yalnızca ilk/son N blokta" kısıtı değerlendir.
   - Dosyalar: `backend/transcribe.py` (`is_hallucination` çağrı noktaları ~4873-4879, `HALLUCINATION_PATTERNS`).
   - Risk: Filtre gevşerse gerçek halüsinasyonlar geri döner — A/B fixture ile ölçüm şart.
   - Testler: Gerçek diyalog false-positive korpusu + mevcut halüsinasyon fixture'ları birlikte.
2. **K-1 — Endpoint URL'lerini kuyruk diskinden çıkar**
   - Neden: `queue-state.json` sağlayıcı altyapısını düz metin tutuyor.
   - Çözüm: `SECRET_OPTION_KEYS`'e `translateBaseUrl`, `llmBaseUrl`, `mangaBaseUrl` ekle (renderer zaten `queueSecretsFromCurrentUi` ile geri yüklüyor).
   - Dosyalar: `src/queue-persistence.js`, gerekiyorsa `src/renderer/renderer.js`.
   - Risk: Eski kuyruk kayıtlarından endpoint bekleyen geri yükleme akışı boş gelirse UI değerine düşer — mevcut fallback bunu karşılıyor; geriye uyum riski düşük.
   - Testler: `queue-persistence.test.js`'e "endpoint diske yazılmaz, çalışma anında UI'dan gelir" senaryosu.

### P2
3. **K-3 — `transcribe:start` girdi doğrulaması**: `options.input` için varlık + medya uzantısı beyaz listesi + `canonicalLocalPath`; `options.outputDir` için yazılabilirlik ön kontrolü. Dosya: `src/main.js`. Risk: bazı egzotik ama geçerli yollar reddedilebilir — hata mesajı eyleme geçirilebilir olmalı.
4. **Y-2 — Alan-bazlı ayar kaydı**: `sanitizeSettings` hatasında yalnızca sorunlu alanı reddedip kalanı kaydetme veya renderer'da sözlük sayacı (500 sınırı UI'da). Dosyalar: `src/settings-security.js`, `src/renderer/renderer.js`. (Yabancı değişiklik yükleme tarafına `_loadWarning` ekledi; kaydetme tarafı açık duruyor.)
5. **Y-4 — WhisperX uyarılarını `warn_list`'e taşı**: compute düşüşü ve hizalama atlaması `done.warnings`'e eklensin. Dosya: `backend/transcribe.py`.
6. **Y-1 — Cache yazımında kilit veya birleştirme**: `save_translate_cache` öncesi dosya kiliti (msvcrt.locking) ya da yazmadan önce taze okuyup birleştir. Dosya: `backend/transcribe.py`.
7. **Y-3 — `settings:saveSync` için boyut üst sınırı + zaman aşımı belgelemesi**: büyük payload'larda async yola düşür. Dosya: `src/main.js`.
8. **Y-5 — Retry akışında guard yaşam süresi**: `queueTerminalGuards` silinmesini renderer onayına bağla. Dosya: `src/main.js`, `src/queue-persistence.js`.

---

## 9. Test boşlukları

Mevcut paket geniş (300+ Node assertion'ı, 158 Python testi) ama şu kritik senaryolar kapsanmıyor:

1. **Halüsinasyon false-positive korpusu**: gerçek diyalog cümlelerinin (`İzlediğiniz için teşekkürler.` vb.) filtreden sağ çıkması gereken negatif testler.
2. **IPC yetkilendirme sözleşmesi**: her `ipcMain.handle` için `authorizedBrowserSender` kontrolünün varlığını doğrulayan statik test.
3. **`transcribe:start` girdi reddi**: var olmayan/uzantısız/dizin girdisinin handler düzeyinde reddi (şu an Python'a kadar iniyor).
4. **Çok süreçli cache yarışı**: iki backend süreci aynı cache diziniyle.
5. **Kuyruk endpoint gizliliği**: `queue-state.json`'a `translateBaseUrl`/`llmBaseUrl` yazılmadığının testi.
6. **WhisperX uyarı yüzeyi**: compute düşüşü ve hizalama atlamasının `done.warnings`'e ulaşması.
7. **Gerçek GPU regresyonu**: large-v3 + diarize VRAM tavanı (CI'da GPU runner gerekir — MANUAL).
8. **Uzun medya**: >1 saat dosyada `extract_audio` timeout davranışı.
9. **Ayar kaydı kısmi başarısızlığı**: tek bozuk alan varken diğer ayarların korunması.
10. **Paralel test izolasyonu**: `test_chat_requires_api_key` paylaşılan `%TEMP%\whisper-chat-key.json` dosyasını kullanıyor; aynı makinede iki `npm test` süreci çakışırsa FileNotFoundError üretebiliyor (bu denetimde gözlendi, bölüm 11). Test dosyasına benzersiz isim (PID/UUID) önerilir.

---

## 10. Çalıştırılan testlerin kaydı (komut · amaç · sonuç · sınırlama)

| # | Komut | Amaç | Sonuç | Sınırlama |
|---|---|---|---|---|
| 1 | `npm test` (1. çalıştırma) | Mevcut paketin sağlığı | Tamamı geçti | — |
| 2 | `npm test` (2. çalıştırma) | Yabancı değişiklik sonrası sağlık | 2 geçici hata (bölüm 11) | Paralel yük altında |
| 3 | `npm test` (3. çalıştırma) | Nihai doğrulama | **Tamamı geçti** | — |
| 4 | `node tests/subtitle-parser-fuzz.test.js` | Fuzz hatasını izole etme | 52.000 vaka geçti | — |
| 5 | `python backend/test_transcribe.py` | Chat hatasını izole etme | 158/158 geçti | — |
| 6 | `scratch/audit-ndjson-probe.js` | NDJSON UTF-8 bütünlüğü | 3001 satır, 0 bozuk | — |
| 7 | `scratch/audit-settings-probe.js` | Gizli anahtar env + sanitize + import | Sızıntı yok; bozuk veri reddi doğru | — |
| 8 | `scratch/audit-llm-probe.py` | LLM yanıt ayrıştırma | 9 biçim güvenli | — |
| 9 | `scratch/audit-path-probe.py` | Yol/ffmpeg senaryoları | Klasör/aynı-yol güvenli; symlink üretilemedi | WinError 1314 |
| 10 | `scratch/audit-clip-offset-probe.py` | Kırpma offset + reexport ekseni | Orijinal eksen korunuyor | — |
| 11 | `scratch/audit-json-writer-probe.py` | JSON yazıcı NaN/geçersiz zaman | Eski dosya korunuyor | — |
| 12 | `scratch/audit-burnin-probe.js` | ffmpeg subtitles kaçışı | Kaçış doğru | — |
| 13 | `scratch/audit-xss-scan.js` | innerHTML interpolasyon taraması | 8 şüpheli → hepsi güvenli | Statik |
| 14 | `scratch/audit-chat-key-probe*.py` | Chat anahtar hatası izolasyonu | Tek başına geçiyor | — |
| 15 | `scratch/audit-fn-compare.js` | HEAD vs çalışma ağacı fonksiyon farkı | `stripAssOverrideBlocks` yabancı değişiklikle değişmiş | — |
| 16 | 60+ doğrudan fonksiyon çağrısı | Zaman/bölme/merge/cache/checkpoint/yazıcı/URL politikası | Bölüm 3-7'de belgelenen sonuçlar | — |

---

## 11. Bütünlük olayı: denetim sırasında yabancı değişiklik

**Gözlem:** Denetimin ilk yarısında `git status` yalnızca izlenmeyen rapor dosyalarını gösteriyordu. Rapordan önceki son doğrulamada **62 izlenen dosyada değişiklik** (+1185/−268) ve yeni izlenmeyen test/rapor dosyaları görüldü. Bu değişiklikler **bu denetim tarafından yapılmadı**; paralel çalışan başka bir oturum/ajan ürünüdür. Kural gereği değişiklikler geri alınmadı, üzerine yazılmadı, gizlenmedi — burada açıkça raporlanıyor.

**Değişikliklerin bulgulara etkisi (diff incelemesiyle):**
- `backend/` → **hiç değişmedi**. K-2, Y-1, Y-4, T-1, T-2, T-3 aynen geçerli.
- `src/queue-persistence.js`, `settings-security.js`, `secret-store.js`, `preload.js`, `ndjson-lines.js`, `process-lifecycle.js`, `pipeline-job.js`, `queue-lifecycle.js`, `renderer-ui-model.js`, `burnin-output.js` → **değişmedi**. K-1, Y-3, Y-5 aynen geçerli.
- `src/main.js` → değişti; ancak diff `transcribe:start`, `buildSecretEnv`, kuyruk, burn-in, `subs:shift` bölgelerine **dokunmuyor**. Değişiklikler: browser popup sınırı (MAX_BROWSER_POPUPS=10), adblock başlatma akışı, çeviri timeout'ları, `<think>` bloğu temizliği, PDF viewport eşleme, `settings:load`'a `_loadWarning` yüzeyi. K-3 aynen geçerli; Y-2'nin **yükleme** tarafı bu değişiklikle kısmen iyileşmiş (kaydetme tarafı açık).
- `src/renderer/renderer.js` → değişti: log kırpma optimizasyonu (`trimLogLines` Range tabanlı), `_loadWarning` tüketimi, favicon, kısayollar. Denetlenen transkripsiyon/kuyruk akışlarına dokunmuyor.
- `src/browser-subtitles.js` → değişti: `stripAssOverrideBlocks` artık `\{` (kaçışlı süslü) dizilerini override saymıyor.

**2. test çalıştırmasındaki iki hata (açıklama):**
- `tests/subtitle-parser-fuzz.test.js:294` — `{\` × 10000 girdisinde ASS override beklentisi. `stripAssOverrideBlocks`'un yukarıdaki davranış değişikliğiyle ilişkili; izole çalıştırmada ve 3. tam çalıştırmada geçti → yük/paralellik duyarlı, deterministik değil. Değişikliği yapan oturumun doğrulaması gerekir.
- `test_chat_requires_api_key` — paylaşılan `%TEMP%\whisper-chat-key.json` üzerinden FileNotFoundError. İzole çalıştırmada ve 3. tam çalıştırmada geçti → paralel test süreçleri arasında temp dosyası yarışı (test izolasyonu zafiyeti; bölüm 9, madde 10).

**Nihai sağlık:** 3. `npm test` çalıştırması tamamen geçti.

---

## 12. Son doğrulama

- `git status --short`: 62 izlenen dosyada **yabancı** değişiklik (bu denetime ait değil); izlenmeyenler arasında bu rapor (`GUVENLIK-KALITE-DENETIM-RAPORU-2026-09-12.md`) ve `scratch/` altındaki denetim probları var. **Bu denetim hiçbir izlenen kaynak/test/ayar/veri dosyasını değiştirmedi.**
- `git diff --check`: temiz (çıktı yok).
- `git diff --stat`: 62 dosya, +1185/−268 — tamamı yabancı oturuma ait.
- Kullanıcı verisi, credential veya gerçek API anahtarı hiçbir aşamada okunmadı/kullanılmadı; tüm geçici dosyalar `%TEMP%` altında üretilip temizlendi.
- Uyarı: Çalışma ağacındaki yabancı değişikliklerin sahibi oturum bunları commit etmeden önce `npm test`'i bir kez de sakin ortamda (paralel denetim/test olmadan) çalıştırmalıdır; 2. çalıştırmadaki iki hata yük duyarlı görünse de `stripAssOverrideBlocks` davranış değişikliğinin kasıtlı olduğu ve fuzz beklentisinin güncellendiği doğrulanmalıdır.

> GÜNCEL EK: Y-1 düzeltildi. save_translate_cache yazma öncesi disk cache'i okuyup bellekteki değerlerle birleştiriyor; py_compile ve backend 160/160 geçti. Çoklu süreç atomik kilit MANUAL sınır olarak kaldı.

## GÜNCEL BULGU DURUMU — 2026-09-12

> Bu bölüm önceki “hiçbir düzeltme uygulanmadı” anlık görüntüsünü günceller. Bulgu metinleri kanıt adayı olarak doğrulandı.

### Bulgu yanıt tablosu

| ID | Durum | Ayrıntılı düzeltme / ret gerekçesi |
|---|---|---|
| K-1 | DÜZELTİLDİ | Endpoint URL'leri kuyruk snapshot'ından çıkarıldı; çalışma anında UI'dan alınır. |
| K-2 | DÜZELTİLDİ | Güçlü konuşma güveni olan “teşekkürler/abone olun” gibi gerçek replikler korunur; düşük güvenli kalıp ile kesin müzik/boş-ses/tekrar elenir. Her atlama loglanır ve `done.warnings` toplamı taşır. False-positive korpusu eklendi. |
| K-3 | DÜZELTİLDİ | Yerel input canonical medya grant'i ve uzantı/dosya kontrolünden; YouTube input http/https URL politikasından geçer. |
| Y-1 | KISMEN | Yazımdan hemen önce disk cache'i yeniden okunup birleştiriliyor ve atomik replace ediliyor. Normal Electron tek-iş akışı kapalı; elle paralel Python süreçleri için OS kilidi hâlâ manual eksik. |
| Y-2 | DÜZELTİLDİ | Sözlük UI'da 500 girdide sınırlı ve kullanıcı uyarılıyor; bütün ayar kaydının sessizce reddi önlendi. |
| Y-3 | MANUAL/TASARIM | `sendSync` kritik kapanış kaydı için bilinçli; yavaş/antivirüslü disk gecikmesi gerçek ortamda ölçülmedi. |
| Y-4 | DÜZELTİLDİ | WhisperX compute fallback ve alignment hatası `done.warnings` içine taşındı. |
| Y-5 | FALSE/DÜŞÜK | jobId/queueItemId/generation/terminal mandalı ve tek aktif iş altında deterministik yarış üretilemedi. |
| T-1 | MANUAL | Gerçek RTX 4070 Ti + large-v3 + pyannote OOM gerekir. |
| T-2 | MANUAL | Ağ/model indirme/401 gerçek servis gerekir. |
| T-3 | MANUAL | >2 saat gerçek medya soak gerekir. |
| T-4 | MANUAL | Windows junction/symlink ayrıcalığı gerekir; canonical grant testleri geçti. |
| T-5 | MANUAL | Gerçek LLM semantik A/B korpusu gerekir. |
| T-6 | FALSE/RET | DOM dönüşü `textContent`/escape üzerinden; XSS olay yolu yok. |
| T-7 | TEORİK/DÜŞÜK | Shell yok, argv + ASCII staging + atomik replace var; ek ffmpeg protokol fixture'ı çalıştırılmadı. |

### False-positive ret kaydı

Raporun altı false-positive maddesi korunmuştur: UTF-8 stream decoder, çift terminal mandalı, iptal sonrası geç done reddi, secret-env/argv ayrımı, re-export çakışma adı ve ffmpeg aynı-input koruması güncel testlerle uyumludur.

### Ayrıntılı doğrulama dökümü

`npm test` çıkış 0; backend 162/162; player 142/142; denetim regresyonu 41/41; sözdizimi ve `py_compile` geçti. Manual maddeler çalıştırılmış gibi gösterilmedi. Tam çapraz döküm: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.
