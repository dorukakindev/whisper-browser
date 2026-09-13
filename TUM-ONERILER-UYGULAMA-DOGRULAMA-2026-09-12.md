# Whisper Local — Tüm Öneriler Uygulama ve Doğrulama Raporu

Tarih: 12 Eylül 2026

Kapsam: Son öneri kümelerindeki çeviri belleği, SDH temizliği, oynatma/öğrenme, tarayıcı araştırma araçları, ekran yakalama, sayfa indeksleme ve dayanıklılık maddeleri.

Yöntem: Güncel kaynak incelendi; yok olduğu doğrulanmayan özellik yeniden yazılmadı. Kod değişiklikleri hedefli test, tam paket, Electron isolated-world smoke ve 400 çevrimlik soak ile sınandı. Kullanıcının gerçek SRT dosyaları yalnız okunarak ölçüldü; altyazı içeriği değiştirilmedi.

## Sonuç özeti

- Uygulanabilir 14 yeni veya eksik yetenek tamamlandı.
- Daha önce eklenmiş 5 yetenek güncel kaynak ve regresyon testleriyle korundu.
- 3 öneri, yanlış varsayım veya somut kapsam/risk gerekçesiyle yeniden uygulanmadı.
- Tam npm test paketi son durumda geçti; Python backend/test_transcribe.py sonucu 167/167.
- Electron köprü testi geçti.
- Tam soak 400/400 yakalama, 50/50 hibernasyon ve 0 işlenmemiş Promise reddiyle geçti.
- Gerçek kullanıcı altyazı korpusu beklenen şekilde başarısız kaldı. Bu, eski çıktı dosyalarındaki eksik/yankılı içerik kanıtıdır; ürün testinin başarısızlığı veya bu turda üretilmiş çıktı değildir.

## Madde bazında durum

| No | Madde | Durum | Kaynak ve doğrulama |
|---:|---|---|---|
| 1 | Dizi/bölüm hafızası | **[TAMAMLANDI]** | backend/series_memory.py; SxxExx, S10 EP 11, Season 13 Episode 04, 1x05, Episode/Bölüm, anime ve puntata adları; NFC slug; önceki bölüm kanonu; backend/test_series_memory.py geçti. |
| 2 | Güvenli fuzzy çeviri hafızası | **[TAMAMLANDI]** | backend/translation_memory.py ve backend/transcribe.py:2996; SQLite, bağlam ve medya/dizi kapsamı, sayı/olumsuzluk/zamir/özel ad/iç noktalama kapısı; testler 2/2 ve tam backend 167/167 geçti. |
| 3 | İncelikli SDH temizliği | **[TAMAMLANDI]** | backend/subtitle_sdh.py, gerçek çağrı backend/transcribe.py:1960; yalnız yapısal betimlemeleri temizler, başlık/konuşmacı/şarkı/sözlü parantezi korur; testler 4/4. |
| 4 | Prompt güvenliği, ton ve küfür/argo | **[ZATEN VAR + SAĞLAMLAŞTIRILDI]** | backend/transcribe.py:2619-2696 anlam-öncelikli çeviri, register, profanity ve güvenilmeyen metin kuralını zaten taşıyordu. Yinelenmedi. Dizi hafızası güvenilmeyen veri etiketiyle sarıldı ve modelden gelen kalıcı alanlar temizlenip sınırlandı. |
| 5 | Yerel kalite korpusu genişletmesi | **[TAMAMLANDI]** | Mevcut gerçek SRT manifesti ve repodaki altın küme korundu. quality/subtitle-sdh-external-corpus.json, src/subtitle-corpus-discovery.js ve denetim aracı eklendi. 17 yapısal ham/reviewed çift geçti; bir sıfır-cue hedef açık gerekçeyle dışlandı. |
| 6 | Link hints | **[TAMAMLANDI, BELGELİ SINIR]** | src/browser-link-hints.js, src/main.js:10567, komut paleti ve kısayol entegrasyonu; görünür link/form, shadow DOM, en çok 700 ipucu ve temizleme. Testler 9/9. Cross-origin iframe ipuçları kare başına bağımsız olduğundan tam Vimium eşdeğeri global etiket koordinasyonu yok. |
| 7 | Site hız hafızası, fightback ve preservesPitch | **[TAMAMLANDI]** | src/browser-media-controller.js ve src/browser-site-profiles.js; site yaşam döngüsünde hız yeniden uygulama, 1,5 saniye açık kullanıcı-niyeti penceresi, ses perdesi koruma ve SPA medya temizliği. Testler 23/23 ve site profilleri 13/13. |
| 8 | Cue başına döngü | **[TAMAMLANDI]** | src/playback-policy.js:11-48; 2–20 tekrar, doğal cue sonu, manuel seek ve örtüşme yarış koruması, UI ve kalıcılık. Güvenlik şeması loop-cue ile eski shadowing değerlerini de kabul ediyor. |
| 9 | Temiz video karesi ve altyazılı kompozit, panoya kopyalama | **[TAMAMLANDI, GÜVENLİ SINIR]** | src/main.js:5856-5918; video dikdörtgeni, zoom çarpanı, kontrol katmanı gizleme, Whisper altyazısı kompoziti, kaydetme/panoya PNG. İç içe cross-origin iframe koordinatı güvenilir değilse yanlış kırpma yerine tam sayfa yedeğine düşer. Testler 13/13. |
| 10 | Gezilen sayfalarda yerel FTS | **[TAMAMLANDI]** | src/watch-index.js:24,146-160,312-334; FTS5, 20 bin karakter/sayfa ve 3000 sayfa sınırı, query/hash/kimlik bilgisi temizliği. Hibernasyon sırasında geciken indeks zamanlayıcısının ölü webContents kullanması ayrıca düzeltildi. Testler 19 ve entegrasyon 7. |
| 11 | Ses normalleştirme ve video filtreleri | **[TAMAMLANDI, BELGELİ SINIR]** | src/browser-media-controller.js:52-72; DynamicsCompressorNode, parlaklık/kontrast ve site profili. CORS izin vermeyen çapraz-kaynak ses Web Audio’ya zorla bağlanmaz; görüntü/ses kesmek yerine güvenli biçimde normal oynatılır. |
| 12 | Sayfa koyulaştırma | **[TAMAMLANDI]** | Sabitlenmiş darkreader 4.9.130 ve src/browser-dark-mode.js. API yalnız isolated world’de çalışır, üretilmiş CSS insertCSS ile eklenir, sonra Dark Reader globali silinir. Electron smoke ana dünyada/globalde sızıntı olmadığını doğruladı. |
| 13 | Tam sayfa ekran görüntüsü | **[TAMAMLANDI]** | CDP Page.getLayoutMetrics ve Page.captureScreenshot(captureBeyondViewport: true); 30 bin piksel boyut ve 120 milyon piksel alan bütçesi, mevcut debugger sahipliğini koruma. |
| 14 | Anki .apkg dışa aktarımı | **[ZATEN UYGULANMIŞ, DOĞRULANDI]** | backend/export_anki.py, src/main.js:12349, preload IPC. HTML escape, medya sınırları/hash, atomik değişim, iki dışa aktarımda GUID kararlılığı ve ZIP+SQLite doğrulaması; backend 3/3, sözleşme 7/7. |
| 15 | Condensed playback ve cue sonu auto-pause | **[ZATEN UYGULANMIŞ, KORUNDU]** | Merkezi playback-policy.js durum makinesi üzerinden mevcut. Yeni cue loop aynı politika katmanına eklendi; tam UI/regresyon paketi geçti. |
| 16 | SponsorBlock chapter | **[TAMAMLANDI]** | src/browser-sponsorblock.js:76-114 ve src/browser-chapters.js; chapter eylemi skip listesinden ayrıldı, yerleşik bölümlere öncelik veren toleranslı birleştirme yapıldı. Testler 13/13 ve chapter 10/10. |
| 17 | Provenance kontrollü gerçek-dünya parser korpusu | **[TAMAMLANDI]** | tests/fixtures/subtitle-realworld/manifest.json; 6 sentetikleştirilmiş yapısal fixture, 12 cue, SHA-256, kaynak, lisans ve dönüşüm kaydı; canlı ağ yok. Parser fuzz ayrıca 54.024 vaka geçti. |
| 18 | Site bazlı reklam engelleyici duraklatma | **[ZATEN VAR, YENİDEN YAZILMADI]** | isSitePaused ve allowed-by-site-switch güncel kodda bulundu. Yeni özellik diye çoğaltılmadı; regresyon testi eklendi/korundu. |
| 19 | Altyazı satırına tıklayıp seek | **[ZATEN VAR, YENİDEN YAZILMADI]** | Renderer’daki seekToCue mevcut. Cue kimliği/seek regresyonları 4/4 geçti. |
| 20 | Piper TTS | **[RET]** | Önerinin dayandığı eski repo arşivlenmişti; güncel halef farklı lisans ve ayrı model/runtime değerlendirmesi gerektiriyor. Bu turdaki altyazı/çeviri hedefini genişleten ağır bir bağımlılık olduğu için kanıtsız eklenmedi. |
| 21 | Tam CEA-608 decoder | **[ÖLÇÜTLÜ RET]** | Gerçek kullanım korpusunda ihtiyaç sıklığı kanıtlanmadan decoder kapsamı büyütülmedi. Mevcut tanı tespit/destek durumu düzeyinde tutuldu. Somut örnek gelirse ayrı fixture ve kabul ölçütüyle ele alınmalı. |
| 22 | Playwright bağımlılığı | **[ÖLÇÜTLÜ RET]** | Mevcut Electron gerçek-köprü smoke, yerel HLS/DASH fixture’ları ve 400 çevrim soak ile kapsanamayan somut bir kullanıcı akışı gösterilmedi. Yalnız araç eklemek için bağımlılık eklenmedi. |

## Bu turda doğrulama sırasında bulunan ek hatalar

### 1. Hibernasyon ile sayfa FTS zamanlayıcısı yarışı — **[DÜZELTİLDİ]**

İlk tam soak sırasında gecikmiş sayfa indeksleme callback’i, sekme hibernasyona girdikten ve view.webContents kaldırıldıktan sonra aynı nesneyi okumaya çalışıyordu. Bu, işlenmemiş Promise reddi üretiyordu; önceki soak sonucu kaynak bütçeleri yeşil görünse bile bu hatayı bütçe dışı bırakıyordu.

Düzeltme:

- Callback başlatılırken kararlı webContents referansı alındı.
- Çalıştırmadan önce isDestroyed ve sekme/nesil doğrulaması eklendi.
- destroyBrowserTab ve unloadBrowserTab yollarında timer temizlendi.
- Soak raporuna runtime.unhandledRejections sayacı eklendi.
- Bütçe azami 0 yapıldı; tek reddedilme bile soak’ı başarısız kılıyor.

Doğrulama: entegrasyon 7/7; tam soak’ta unhandled-promise-rejections: 0.

### 2. Yeni medya ayarları güvenlik şemasında yoktu — **[DÜZELTİLDİ]**

Tam npm test, renderer kalıcılık listesi ile merkezi ayar güvenlik şemasının ayrıştığını buldu. Cue tekrar sayısı, video parlaklık/kontrast ve yeni anahtarlar kaydedilebilse de güvenli dışa aktarma/geri yükleme turunda reddedilebilirdi. Ayrıca daha eski shadowing politika değeri de enum’da yoktu.

Düzeltme:

- playerCueRepeatCount, browserVideoBrightness ve browserVideoContrast izinli değer listesine ve gerçek UI aralıklarına eklendi.
- browserRateFightback, browserPreservesPitch, browserDarkMode ve browserNormalizeAudio güvenli boolean listesine eklendi.
- playerPlaybackPolicy enum’una shadowing ve loop-cue eklendi.
- Round-trip testi yeni alanların gerçek değerlerini kullanacak şekilde genişletildi.

Doğrulama: tests/settings-security.test.js 17/17; ardından tam npm test geçti.

### 3. Uygulama hız değişikliğinin fightback tarafından geri alınması — **[DÜZELTİLDİ]**

Site hız koruması, yalnız kullanıcı DOM etkileşimini niyet sayıyordu. Uygulamanın kendi hız komutu ratechange ürettiğinde eski site değeri yeni seçimi geri alabilirdi.

Düzeltme: uygulama komutları 1,5 saniyelik açık niyet penceresine alındı; renderer hız değişiminde profil senkronunu tetikliyor. Testler 23/23.

### 4. SPA medya elemanı kaldırıldığında Web Audio kaynağı — **[DÜZELTİLDİ]**

MutationObserver kaldırılan video/ses öğesini izlemeyi bıraksa da compressor/audio context grafiği kapanmıyordu. Uzun SPA oturumlarında kaynak tutma riski vardı.

Düzeltme: releaseMedia bağlantıları kesiyor, context’i kapatıyor ve WeakMap kaydını temizliyor. Tam soak bellek/timer/listener bütçeleri geçti.

### 5. Zoomlu sayfada video kırpma kayması — **[DÜZELTİLDİ]**

Video DOM dikdörtgeni ile capturePage piksel koordinatları site zoomunda ayrışabiliyordu. Kırpma koordinatları webContents.getZoomFactor ile ölçeklendi ve görünüm sınırlarına kelepçelendi. Ekran yakalama testleri 13/13.

## Kalite korpusu bulguları

### Altın küme — **[GEÇTİ]**

- Bilinen iyi: 15 örnek, engelleyici yanlış ret 0, oran yüzde 0.
- Beklenen düzeltme: 16 örnek, engelleyici yanlış ret 0, oran yüzde 0.
- Sonuç: anlam kapısının bu örneklerde iyi çeviriyi sert biçimde düşürmediği doğrulandı.

### Dış SDH/ham-reviewed envanteri — **[YAPISAL GEÇTİ]**

- 17 geçerli çift.
- 1 çift, hedefte ayrıştırılabilir cue sayısı 0 olduğu için gerekçesiyle dışlandı.
- Bu test yalnız cue kapsamı, zaman eşleşmesi, dosya hash’i ve yapısal korumayı ölçer.
- Bu dosyalar kaynak→Türkçe çeviri çifti değildir; çeviri doğruluğu veya her SDH editinin doğruluğu kanıtı olarak sunulmamıştır.

### Kullanıcının üç gerçek Border Security çifti — **[BEKLENEN BAŞARISIZLIK, DOSYA DEĞİŞMEDİ]**

- S10E11: kaynak 486 cue, hedef 288 cue, eşleşen 202, engelleyici bulgu 421.
- S13E04: 290/290 cue fakat 24 kaynak yankısı; engelleyici bulgu 24.
- S01E13: kaynak ve hedef yalnız 1 cue; beklenen asgari 175, engelleyici bulgu 2.

Bu ölçüm, önceki “yarısını çevirmedi / satırlar silindi / İngilizce kaldı” şikâyetlerini dosya düzeyinde yeniden üretir. Bu tur kaynak SRT veya .tr.srt dosyalarını onarmadı; gelecekteki üretimde aynı sınıfları önlemek için kod, anlam kapısı, kaynak-yankısı retry’sı, medya-kapsamlı TM ve bütünlük testleri güçlendirildi.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

### Bulgular ve düzeltmeler

1. Dizi tutarlılığı bölüm bağımsız exact cache ile sağlanamıyordu. Bölüm kimliği çıkaran, dizi başına kalıcı ve önceki bölümü kanon sayan hafıza eklendi. Hafıza içeriği prompt talimatı değil güvenilmeyen veri olarak sunuluyor.
2. Exact cache küçük yazım farklarında gereksiz API çağrısı yapıyordu. Geniş yüzde 85 benzerse kullan yaklaşımı güvenli bulunmadı; yalnız aynı medya/dizi kapsamı, bağlam ve semantik çapalar eşleşirse tekrar kullanan muhafazakâr SQLite TM uygulandı.
3. Eski SDH yaklaşımı satır içi betimlemeyi ya modele taşıyor ya da fazla geniş silme riski doğuruyordu. Yapısal önek ile konuşulan köşeli parantez, başlık ve konuşmacı ayrıldı; gerçek clean_text hattına bağlandı.
4. Site oynatma tercihleri yalnız tek komutluk değildi; reklam/seek/loadstart ve SPA yaşam döngüsünde yeniden uygulanması gerekiyordu. Tek medya denetleyicisi içinde niyet, fightback, pitch, filtre ve kaynak temizliği birleştirildi.
5. Sayfa indeksleme eklenince hibernasyon yarışı ortaya çıktı. Timer sahipliği sekme yaşam döngüsüne bağlandı ve reddedilme sayacı soak kabul kriteri yapıldı.
6. Yeni UI alanları renderer’a eklenirken güvenlik şeması unutulmuştu. Tam paket bu ayrışmayı yakaladı; merkezi allowlist/enum/range ve round-trip fixture birlikte güncellendi.

### Ret ve sınırlama gerekçeleri

- **Geniş fuzzy TM reddi:** Salt metin benzerliği anlam eşitliği değildir. Sayı, olumsuzluk, modal, zamir, özel ad, soru ve iç noktalama farklıysa tekrar kullanım kapalıdır.
- **Dış .ham.srt klasörünü çeviri korpusu sayma reddi:** Dosyalar İngilizce kaynak→Türkçe hedef değil, Türkçe ham→reviewed yapısındadır. Yalnız yapısal envanter olarak kullanıldı.
- **Cross-origin iframe link hints sınırı:** Güvenlik sınırını aşan global klavye/etiket koordinasyonu eklenmedi. Ana belge, same-origin ve shadow DOM kapsamı testlidir.
- **Nested iframe video crop sınırı:** Güvenilmez koordinatla yanlış kare üretmek yerine tam sayfa yedeği seçilir.
- **CORS’suz çapraz-kaynak ses sınırı:** Web Audio bağlama başarısızsa medya sessize alınmaz veya bozulmaz; normal oynatma korunur.
- **Piper/TTS reddi:** Eski aday arşivli, halefin lisans/model dağıtımı ayrı ürün kararıdır.
- **CEA-608/Playwright reddi:** Ölçülmüş kullanıcı ihtiyacı veya mevcut Electron/fixture testleriyle kapsanamayan somut senaryo yoktur.

### Çalıştırılan doğrulamalar

- Hedefli backend: 11/11.
- backend/test_transcribe.py: 167/167.
- Link hints: 9/9.
- Dark mode saf test: 6/6.
- Ekran yakalama: 13/13.
- Sayfa FTS entegrasyonu: 7/7; watch-index-assets: 19/19.
- Media controller: 23/23; site profilleri: 13/13.
- SponsorBlock: 13/13; chapter birleştirme/UI: 10/10.
- Anki sözleşmesi: 7/7; Python paket testi: 3/3.
- Cue seek: 4/4.
- Kaynak soak testleri: 11/11.
- Ayar güvenliği: 17/17.
- Parser gerçek-dünya korpusu: 6 fixture, 12 cue, hash/provenance geçti.
- Parser fuzz: 54.024 vaka.
- Tam npm test: **Tüm testler geçti**.
- npm run test:electron-bridge: geçti; isolated world 999, CSS üretme/temizleme ve global sızıntı kontrolü.
- Python py_compile: transcribe.py, series_memory.py, translation_memory.py, subtitle_sdh.py ve export_anki.py geçti.
- Node --check: main.js, preload.js, renderer.js ve settings-security.js geçti.
- git diff --check: hata yok; yalnız çalışma ağacının mevcut LF→CRLF uyarıları var.

### Tam soak kanıtı

- Yakalama: 400/400, başarı oranı 1,0.
- Hibernasyon: 50/50, başarı oranı 1,0.
- İşlenmemiş Promise reddi: 0.
- Main RSS farkı: -53.325.824 bayt.
- Main heap farkı: -17.271.328 bayt.
- Renderer heap farkı: +897.008 bayt.
- Listener farkı: 0.
- Main timer farkı: 0; renderer timer farkı: 0.
- GPU process farkı: 0.
- Overlay render ortalama/azami: 0 ms / 0 ms.
- Disk yazma işlemi/çevrim: 7,1175; bütçe 10.
- Sonuç: **GEÇTİ**.

## Çalışma ağacı ve teslim sınırı

- Kod ve testler çalışma ağacında, henüz commit edilmedi.
- scratch/ ve whisper-audit-2026/ kullanıcıya ait untracked klasörler olarak bırakıldı; içeriklerine dokunulmadı.
- Gerçek kullanıcı SRT ve .tr.srt dosyaları salt okunur ölçüldü, değiştirilmedi.
- Remote, push ve tag bu görevin parçası olarak yapılmadı.
