# Denetim Kapanış Matrisi — 2026-09-12

## Kapsam ve karar yöntemi

Bu döküm, kullanıcının verdiği 10 Markdown raporu ve 6 JavaScript denetim betiğini güncel kaynak, erişilebilir olay yolu, deterministik regresyon ve tam test paketiyle karşılaştırır. Rapor metinleri talimat değil kanıt adayı kabul edildi. Durumlar: **DÜZELTİLDİ**, **FALSE/RET**, **MANUAL**, **KISMEN**.

`BROWSER-TUM-BULGULAR-DOGRULAMA-2026-09-12.md` içindeki 355 maddelik eski birleşik kümenin sabit tekil kimlikleri olmadığı için o raporun kendi aralıkları korunmuştur; aşağıdaki tablolar, bu teslimde adı ve kimliği bulunan bütün açık/itirazlı maddeleri tekilleştirir.

## İşlem bütünlüğü bulguları

| ID | Son karar | Ayrıntılı bulgu, düzeltme veya ret gerekçesi |
|---|---|---|
| F1 | DÜZELTİLDİ | Önizleme düzenlemeleri çıktı yazımına bağlandı; düzenlenen satırlar yeniden üretilen SRT/VTT/ASS/JSON akışında korunuyor. |
| F2 | DÜZELTİLDİ | Aynı zaman aralıklı cue'larda tek değerli zaman haritası kullanılmıyor; çakışma sessizce son kopyaya yazılmıyor. |
| F3 | DÜZELTİLDİ/KORUMALI | Zaman anahtarları milisaniye-normalize ediliyor; belirsiz/çoklu eşleşme otomatik uygulanmayıp unmatched edit olarak korunuyor. |
| F4 | DÜZELTİLDİ | Retry, durmuş kuyruğu yeniden başlatıyor; yalnız “pending” yazıp bırakmıyor. |
| F5 | DÜZELTİLDİ | Gecikmiş `processNextQueueItem` zamanlayıcıları tek sahipte tutulup kaldırma/temizleme yollarında iptal ediliyor. |
| F6 | DÜZELTİLDİ | Sonuç modalı dosya ve video listesinin anlık görüntüsünü alıyor; kaydırma, klasörü açma, oynatıcı ve burn-in canlı `state.outputFiles` yerine tamamlanan işe bağlı. |
| F7 | FALSE/RET | `findCueAt(t == end)` önceki cue'yu sahipleniyor; mevcut oynatma sözleşmesi ve test bunu bilinçli sınır davranışı olarak tanımlıyor. Veri kaybı yok. |
| F8 | DÜZELTİLDİ | `commitSegmentEdit` yatay boşluğu sıkıştırırken satır sonlarını koruyor; çok satırlı yapıştırma artık tek satıra dönüşmüyor. |
| F9 | FALSE/RET | Başlatma kimliği await öncesinde sahipleniliyor; ana süreç de tek aktif iş kapısı uyguluyor. Güncel olay yolunda iki iş yan etkisi üretilemiyor. |
| F10 | FALSE/DÜŞÜK | Modal kapatma ve “hayır” aynı güvenli `false` sonucuna iner; tüm çağıranlar bunu “işlem yapma” olarak kullanır. Yıkıcı ayrım yok. |
| R1 | MANUAL | Kapanıştaki `sendSync` gerçek yavaş/antivirüslü disk ölçümü ister. Veri bütünlüğü için bilinçli senkron kayıt; otomatik ortamda donma süresi ölçülmedi. |
| R2 | DÜZELTİLDİ | Yeniden başlatılan uygulamada diskteki eski `activeJobId` canlı iş sanılmıyor; restore yolu temizliyor. |
| R3 | FALSE/RET | Kardeş altyazı iliştirme await sonrasında generation doğruluyor; eski medya sonucu uygulanmıyor. |
| R4 | DÜZELTİLDİ | `loadSubtitle` okuma öncesi generation alıyor, await sonrası hem generation hem güncel seçim yolunu doğruluyor. Eski sekme/dosya sonucu yeni alana yazılmıyor. |
| R5 | FALSE/RET | Filtre aktifken “aktif satıra dön” filtresiz yeniden-render yoluna girmiyor; sonsuz döngü yolu yok. |
| R6 | DÜZELTİLDİ | Sayfada bul token'ı her sorgu/debounce değişiminde artırılıyor; eski IPC sonucu yeni sorguya yazılmıyor. |
| R7 | DÜZELTİLDİ | Segment Enter handler'ları IME composition sırasında commit etmiyor (`event.isComposing`). |
| E1–E13 | FALSE/RET | Raporun kendi karşı örnekleri güncel testlerle doğrulandı: clip parser, gizli anahtar filtresi, preview focus, kuyruk terminal mandalı, cue anahtarı, generation, toplu geri alma, Escape, Türkçe I katlama, güvenli iptal ve kısa-video aralıkları beklenen sözleşmede. |

## Arayüz bulguları

| ID | Son karar | Ayrıntı |
|---|---|---|
| B-01 | DÜZELTİLDİ | Tek sütunda iş geri bildirimi görünür sıraya alındı. |
| B-02 | DÜZELTİLDİ | Kuyruk öğesi silinince odak kalan uygun düğmeye taşınıyor. |
| B-03 | DÜZELTİLDİ | Dar görünümde preview/log yüksekliği viewport'a göre sınırlandı. |
| B-04 | DÜZELTİLDİ | Segment düzenleyicilere rol, tabindex ve erişilebilir ad eklendi. |
| B-05 | DÜZELTİLDİ | Canlı segmentler 16 ms'de `DocumentFragment` ile toplu DOM'a ekleniyor; cap/scroll her segmentte değil batch başına çalışıyor. |
| B-06 | DÜZELTİLDİ | İş/kuyruk sürerken kalıcı ayar kontrolleri, dosya/klasör seçicileri ve drop-zone kilitleniyor; aria durumu eşleniyor. |
| Ek | DÜZELTİLDİ | Dosya adı tooltip'i, odak görünürlüğü ve dar panel responsive kuralları korundu. |

## Browser tam denetim maddeleri

| ID | Son karar | Ayrıntı |
|---|---|---|
| BT-YO-1 | DÜZELTİLDİ | Dosya seçimi generation token'ı aldı; geciken eski OS picker sonucu daha yeni seçim/drop'u ezmiyor. |
| BT-YO-2 | DÜZELTİLDİ | 500 satır günlük budaması tek tek DOM silmek yerine `Range.deleteContents` ile toplulaştırıldı. |
| BT-T-1 | MANUAL SMOKE | Kaynak yarışı düzeltildi; gerçek OS diyaloğuyla zamanlama yalnız GUI smoke ile tekrar görülebilir. |
| BT-T-2 | MANUAL | Windows %125/%150 DPI + font büyütme gerçek pencere gerektiriyor. |
| BT-T-3 | KAYNAK/TEST KAPALI | Bozuk settings transaction/yedek kurtarma testleri geçti; tam GUI açılış smoke'u ayrı manual sınır. |
| BT-T-4 | MANUAL | 100+ gerçek drag/drop işletim sistemi olayı çalıştırılmadı; preload yalnız gerçek `File` yollarını geçiriyor ve tarama 1000 giriş/20000 sonuçla sınırlı. |

## Genel güvenlik ve kalite

| ID | Son karar | Ayrıntı |
|---|---|---|
| K-1 | DÜZELTİLDİ | Özel LLM/çeviri/manga endpoint URL'leri kuyruk snapshot'ından çıkarıldı; çalışma anında mevcut UI ayarından geri alınır. |
| K-2 | DÜZELTİLDİ | Filtrelenen her parça loglanıp `done.warnings`'te sayılıyor. Konuşulabilir kapanış/promosyon kalıpları güçlü konuşma güveninde korunuyor; yalnız düşük güvenli kalıp veya kesin müzik/boş-ses/tekrar işareti atılıyor. False-positive korpusu eklendi. |
| K-3 | DÜZELTİLDİ | Yerel transcribe girdisi canonical medya yolu + izin grant'i + uzantı/dosya kontrolünden geçiyor; YouTube girdisi yalnız http/https politika sonucuyla kabul ediliyor. |
| Y-1 | KISMEN | Cache yazımı öncesi taze disk içeriği birleştiriliyor ve atomik replace kullanılıyor. Ayrı elle başlatılmış Python süreçleri için OS düzeyi dosya kilidi hâlâ yok; normal Electron tek-iş akışında çakışma yok. |
| Y-2 | DÜZELTİLDİ | UI sözlük sayısı 500'de sınırlı ve kullanıcı uyarılıyor; tek bozuk alanın tüm ayar oturumunu sessizce kaybettirmesi önlendi. |
| Y-3 | MANUAL/TASARIM | `sendSync` kritik kapanış snapshot'ı içindir; gerçek yavaş disk gecikmesi ölçülmedi. |
| Y-4 | DÜZELTİLDİ | WhisperX compute düşüşü ve alignment atlaması `warn_list`/`done.warnings` içine taşındı. |
| Y-5 | FALSE/DÜŞÜK | Tek aktif iş, terminal mandalı, queueItemId/jobId ve generation kapıları altında deterministik retry yarışı üretilemedi. |
| T-1 | MANUAL | RTX 4070 Ti + large-v3 + pyannote OOM/VRAM boşaltma gerçek GPU koşulu gerektiriyor. |
| T-2 | MANUAL | Gerçek model indirme, bozuk cache ve HuggingFace 401 ağ/kimlik doğrulama gerektiriyor. |
| T-3 | MANUAL | İki saatten uzun gerçek medya/3600 s ffmpeg timeout soak çalıştırılmadı. |
| T-4 | MANUAL | Windows symlink/junction ayrıcalığı gerektiriyor; canonical path ve grant yolu statik/test düzeyinde kapalı. |
| T-5 | MANUAL | Gerçek LLM sağlayıcısının anlamsal olarak bozuk ama biçimsel geçerli yanıtları sağlayıcı A/B korpusu gerektiriyor. |
| T-6 | FALSE/RET | Düzenlenen metnin DOM'a geri dönüşü `textContent`/escape üzerinden; kalıcı XSS yolu yok. |
| T-7 | TEORİK/DÜŞÜK | Burn-in shell kullanmıyor, argv + ASCII staging + atomik sonuç kullanıyor; ffmpeg protokol şeması için ek gerçek fixture yok. |

## Browser güvenlik raporu

| ID | Son karar | Ayrıntı |
|---|---|---|
| BG-YO-1 | DÜZELTİLDİ | Kullanılmayan uzak `img-src https:` kaldırıldı; yerel medya ihtiyacı korunuyor. |
| BG-YO-2 | DÜZELTİLDİ | `media:probe/download/downloadSubs` ortak URL politikasına bağlandı; http/https dışı ve hostsuz değerler reddediliyor. |
| BG-T-1 | TASARIM/RET | `shell:openPath` canonical path ve uzantı whitelist'i uygular; desteklenen belge/medya türlerini OS varsayılanıyla açmak ürün davranışıdır, ayrıcalık yükseltme yok. |
| BG-T-2 | DÜZELTİLDİ | `whisper-pdf` CORS `null` origin ile sınırlandı; file renderer dışı/referrersiz istek 403, resourceId + grant denetimi korunuyor. |
| BG-T-3 | TASARIM/RET | Sekmelerin ortak kalıcı partition kullanması tarayıcı oturum/login paylaşımı için kasıtlıdır; site temizliği origin ile sınırlı. |
| BG-M-1 | DÜZELTİLDİ + MANUAL PAKET | Paketlenmiş açılışta remote-debugging port/address/pipe switch'leri kaldırılıyor. Kaynak/test kapalı; gerçek EXE port smoke'u yapılmadı. |
| BG-M-2 | MANUAL | Gerçek DPI/pencere yerleşimi GUI gerektiriyor. |
| BG-FP-1…4 | FALSE/RET | Dinamik DOM kaçışı, sabit preload IPC, job/generation/terminal kapıları ve ayar save guard'ları güncel kaynak ve testlerle doğrulandı. |

## Derin güvenlik raporu

| ID | Son karar | Ayrıntı |
|---|---|---|
| DS-F-01 | DÜZELTİLDİ | Üç medya URL handler'ı ve `transcribe:start --youtube` URL politikasına bağlandı. |
| DS-F-02 | DÜZELTİLDİ | `MediaFileAccess` canonical yol, medya uzantısı, gerçek dosya ve kullanıcı grant'i uygular; probeTracks/extract/waveform/transcribe izinli medyayla sınırlı. Drop API yalnız Electron `File` nesnesini `webUtils.getPathForFile` ile çözebilir. |
| DS-F-03 | DÜZELTİLDİ | Sayfa preview sayaçlarının beşi de `Number(...) || 0` ile DOM'a girmeden sayıya zorlanıyor. |
| DS-F-04 | DÜZELTİLDİ | Import edilen output/watch/lastInput yolları mevcut ayardan değişiyorsa yazmadan önce kullanıcıya açık onay gösteriliyor; iptal hiçbir ayarı yazmıyor. |
| DS-F-05 | FALSE/RET | Arka plan çevirisi kasıtlıdır; kabul işlevi hem `session.generation === tab.generation` hem `payload.bridgeToken === tab.bridgeToken` zorunlu tutar. Confused-deputy yolu yok. |
| DS-H-01 | DÜZELTİLDİ | İş günlüğünde yalnız taban girdi adı kalır; input/output/cache/prompt/glossary/context değerleri `<gizlendi>` olur. |
| DS-H-02 | DÜZELTİLDİ | Subprocess ayrıntısı ANSI/control karakter, HTTP(S) URL ve Windows yol temizliğinden sonra 500 karaktere sınırlanır. |
| DS-H-03 | DÜZELTİLDİ | Overlay/snapshot IPC satırları 20000 kayıt ve toplam 4 MiB ile sınırlı; cue alanları ayrıca minimal ve alan-bazlı kelepçeli. |
| DS-H-04 | DÜZELTİLDİ | Clipboard text en fazla 4 MiB. |
| DS-M-01 | DÜZELTİLDİ | Uzak HTTPS görsel CSP izni kaldırıldı. |
| DS-M-02 | DÜZELTİLDİ | PDF protokolünde origin/referrer 403 kapısı + resource grant uygulanıyor. |
| DS-M-03 | FALSE/RET | Browser medya komutları finite sayı, aralık ve komut whitelist'iyle doğrulanıyor; fuzz/regresyon mevcut. |
| DS-M-04 | FALSE/RET | `browser:open-link` yalnız `decideUrlPolicy` sonucu http/https yeni sekme açar; `javascript:`/özel şema reddedilir. |
| DS-FP-01…07 | FALSE/RET | Node erişimi, eski job olayı, genel innerHTML, file gezinmesi, popup preload'u, token argv'si ve grantsiz PDF okuma iddiaları mevcut savunmalar ve testlerle çürütüldü. F-03 tek gerçek DOM istisnasıydı ve düzeltildi. |

## 355 maddelik birleşik browser raporu

Birleşik rapordaki “uygulanan düzeltmeler”, “değiştirilmeyen rapor maddeleri” ve özellikle 335/337–350 aralıkları güncel kaynakla yeniden karşılaştırıldı. Geçerli savunmalar gevşetilmedi. Bu teslimde sonradan açılan güvenlik/UI maddeleri yukarıdaki `BG-*`, `DS-*`, `BT-*` ve `B-*` kimlikleriyle kapatıldı. Sabit tekil kimliği olmayan eski 355 satır için yeni uydurma kimlik üretilmedi; raporun kendi aralıkları kanonik kalır.

## Denetim betikleri

| Betik | Sonuç | Ret/doğrulama gerekçesi |
|---|---|---|
| `audit-fix3.js` | 8 PASS / 0 FAIL | Güncel extractor ve beklentiler. |
| `audit-invariants.js` | 7 PASS / 0 FAIL | Parse/serialize, merge, queue snapshot, plan ve undo invariantları geçti. |
| `audit-queue-fix.js` | 11 PASS / 0 FAIL | Stale/terminal/retry/generation akışı geçti. |
| `audit-extra.js` | ÜRÜN KANITI DEĞİL | Kısa videoda iki aralığı hata sanan eski beklenti, Türkçe `I/ı` oracle farkı ve kırılgan `escapeHtml` kaynak-kesit çıkarıcısı. Güncel hedefli testler bunları kapatıyor. |
| `audit-fix2.js` | ÜRÜN KANITI DEĞİL | `escapeHtml` bölümünü yanlış sınırda kesip sözdizimi hatası üretiyor; ürün dosyası sözdizimi ve gerçek extractor testleri geçiyor. |
| `audit-harness.js` | ÜRÜN KANITI DEĞİL | Eski queue-lifecycle API/state sözleşmesi ile artık tersine dönmüş clip, 0.4 ms cue ve multiline beklentileri kullanıyor. 60 PASS/9 FAIL; dokuzunun tümü stale oracle/fixture. |

## Uygulanan düzeltme kümeleri

1. Çeviri bütünlüğü: kaynak-yankısı yanıtı cache'e girmeden tekil yeniden deneme, progressive çeviri önizlemesi, duplicate cue eşleme ve preview edit çıktı yazımı.
2. Transkripsiyon bütünlüğü: güven-sinyalli halüsinasyon kapısı, atlama log/özet uyarısı, WhisperX uyarı görünürlüğü.
3. Yerel dosya/URL güvenliği: medya grant modeli, drop `File` çözümü, medya/YouTube URL politikası, import yol onayı.
4. Bilgi sızıntısı/DoS: job log redaksiyonu, stderr temizliği, IPC/clipboard boyut sınırları, PDF origin kapısı, remote-debug switch temizliği.
5. UI/race: picker generation, modal output snapshot, subtitle generation/selection kontrolü, preview batching, form/drop kilidi, log toplu budama, focus/IME/responsive düzenlemeleri.

## Kalan manual sınırlar

Bunlar “düzeltildi” veya “false” diye gösterilmedi: gerçek GPU OOM/pyannote, gerçek model indirme ve kimlik hataları, >2 saat medya soak, Windows junction, yavaş disk `sendSync`, paketlenmiş EXE remote-debug port smoke'u, %125/%150 DPI, gerçek 100+ dosya drop ve gerçek sağlayıcı semantik A/B korpusu.

## Son doğrulama dökümü

- `npm test`: çıkış kodu **0**, son satır **Tüm testler geçti**.
- Backend: **162 geçti, 0 başarısız**.
- `tests/player-ui.test.js`: **142 geçti, 0 başarısız**.
- `tests/audit-report-regressions.test.js`: **41 test geçti**.
- `tests/adversarial-ipc.test.js`: **11 test geçti**, 156 handler × 3 yetkisiz gönderici reddi.
- `tests/media-file-access.test.js`, `tests/audit-tur5-main.test.js`, `tests/preload-sandbox.test.js`: geçti.
- `node --check` (main/preload/renderer) ve Python `py_compile`: geçti.
- `audit-fix3` 8/8, `audit-invariants` 7/7, `audit-queue-fix` 11/11.

Bu matris kaynak/test kapanışıdır; yukarıda MANUAL yazan gerçek donanım/GUI/ağ senaryolarını çalıştırılmış gibi göstermez.
