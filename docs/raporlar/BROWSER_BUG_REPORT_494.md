# Rapor 494 — Konuşma anlamı, çeviri ve oynatmada 20 yeni hata

Tarih: 2026-10-20. Dal: codex/broad-bugs494.
Başlangıç: a52aa1d296da5bcb61d56803ef026f4971b2bf60 (temiz).
Ürün/test düzeltmesi: 3b88917eba539ae08c6c6fafc549e5047acb648e.
[PR466](https://github.com/dorukakindev/whisper-browser/pull/466).

Her bulgu başlangıç ürün kodunun ignored tmp/report494/before kopyasında
yeniden üretildi. Yeni 14 Node testi başarısız assertion, 6 Python testi
4 assertion ve 2 gerçek çalışma zamanı hatası verdi. Düzeltmede 20/20 başarılı.
Çalışma başında söylenen “apply_edits düzenlenmeyeni de kilitliyor” şüphesi
mevcut kodda çürütüldü; sayılmadı ve o fonksiyon değiştirilmedi.

| No | Tetik / kullanıcı etkisi | Düzeltme ve kanıt |
|---|---|---|
| 494-01 | Aynı metin elle kilitli veya otomatik düzenlenebilir olduğunda ses cache yolu aynıydı. Önceden değiştirilmiş ses, elle korunması istenen metin için geri gelebiliyordu. | Gerçek main cache-path ifadesine manual kimliği eklenir; duration-edit-v2. Kilitli/kilitsiz aynı cümle farklı WAV yoluna gider. |
| 494-02 | Kısaltmada sayılar sıralanarak karşılaştırılıyordu; 1:2 → 2:1 veya 12/05 → 05/12 kabul edilebiliyordu. | Sayı ilişkilerindeki sıra ve ayraç iskeleti de korunur. Ters oran/tarih reddedilir, aynı oranlı kısa öneri geçer. |
| 494-03 | İngilizce ses metninde not/no/never/can't gibi olumsuzluklar koruma kapısında yoktu; “should not” → “should” geçiyordu. | Açık/kısaltılmış İngilizce olumsuzluk kanıtı iki yönde ve çoklukla karşılaştırılır. Olumsuzluk ekleme ve çıkarma reddedilir. |
| 494-04 | Çeviri cache anahtarı kaynak dil seçimini içermiyordu. Gift metni İngilizce/Almanca seçilse de aynı cache'e gidiyordu. | sourceLanguage ortak cache kimliğine ve browser/PDF/sayfa scheduler bağlamlarına eklenir. İki kaynak dil farklı anahtar üretir. |
| 494-05 | Sayfa çevirisinin scheduler bağlamında provider yoktu. Aynı model adıyla başka endpoint'e geçince önceki sağlayıcının sonucu kullanılabiliyordu. | Üretim sayfa bağlamına güvenli endpoint kimliği eklenir. İki endpoint üretim bağlamından farklı cache anahtarı verir. |
| 494-06 | PDF durum dosyası yalnız PDF+endpoint ile adlandırılıyordu; farklı hedef dil veya model önceki dosyayı eziyordu. Sonra eski dile/modelle dönünce çeviriler yok görünüyordu. | Dosya kimliği PDF+endpoint+model+hedef dil içerir. Üç varyant gerçek diskte ayrı kalır ve geri yüklenir; eski endpoint/hash-only dosyalar uyumluluk kontrolüyle okunmaya devam eder. |
| 494-07 | İsteğe bağlı konuşma düzenleme yanıtı yarım/bozuk JSON olursa hata grup sentezine yükseliyor, okunabilir özgün metin sessiz fallback'e düşebiliyordu. | Bozuk/yanlış tipli yanıt ve dosya okuma hatasında özgün metin döner. Yanıt temizleme hatası da sesi düşürmez; iptal yutulmaz. Gerçek rewrite_for_window kontrollü bozuk yanıtta Original. döndürür. |
| 494-08 | HİÇ gibi büyük harfli Türkçe olumsuzluk casefold sonrası birleşen noktayla bölünüyordu; uzun cümlede tamamen düşmesi tespit edilmiyordu. | İ/i birleşen nokta normalleştirilir. HİÇ kaybı lost_negation olur; hiç olarak doğru okunması hata sayılmaz. |
| 494-09 | ASR doğrulaması yüksek genel benzerlikte özel yer adı değişimini kaçırıyordu: Ankara'ya → İzmir'ya aynı uzun cümlede review gerektirmiyordu. | Kesme işaretiyle açık özel ad kanıtı için missing_names kontrolü eklenir; kusurlu retry adayı da seçilmez. Farklı yer review, aynı adın küçük harfi geçerli. Bu tam NER/anlam doğruluğu garantisi değildir. |
| 494-10 | Kütüphane canonicalBrowserUrl bütün hash'i siliyor; #/watch/1 ve #/watch/2 tek kayda birleşip izleme verisini paylaşabiliyordu. | Ortak güvenli URL temizleyicisi SPA rotasını tutar, rota parametrelerindeki sırları ayıklar. İki browser anahtarı farklıdır. Önceden ezilen kayıt kendiliğinden kurtarılamaz. |
| 494-11 | Video duraklatılmışken boşluk atlama ilkesi yine seek kararı veriyordu; kullanıcı duraklattığı yerden başka altyazıya atlayabiliyordu. | paused bilgisi politika yardımcısına taşınır; duraklamada seek/loop/pause-for-shadowing üretilmez. |
| 494-12 | Doğal ilerleme sabit 1,5 medya saniyesiyle sınırlıydı. Browser 4× hızda 1 saniyelik tick verince gerçek oynatma seek sanılıp tekrar/otomatik duraklama kaçıyordu. | Eşik gözlenen hıza ölçeklenir. 4× doğal tick cue sonunu işler; aynı sıçrama 1× hızda hâlâ seek sayılır. |
| 494-13 | Genel medya kimliği ve canonicalUrl, SPA sorgusu ve pathname matrisindeki oturum verisini temizlemiyordu. Token değişimi aynı videoya farklı kimlik de üretiyordu. | Ortak cleanQuery/cleanPathParams, normal ve stream kimliklerinde kullanılır. SECRET fixture değeri kalıcı URL'de yoktur; temiz/kirli varyantın medya kimliği aynıdır. |
| 494-14 | Bilinen servislerin uzun içerik kuyruğu ilk 180 karaktere kesiliyordu. Uzun ve aynı önekli iki Hulu yolu aynı video kimliğine çöküyordu. | Uzun tam kimliğin hash'i sınırlı içerik kimliğine katılır. Sonu one/two olan iki yol artık farklıdır. |
| 494-15 | Elle eklenen ses bittiğinde veya offset nedeniyle henüz başlamadığında özgün video sesi kapalı kalıyordu. Video kalan bölümde sessizleşiyordu. | Bilinen gerçek ses süresi ve offset mute penceresini sınırlar. Ses dışında özgün mute tercihi geri gelir; içine seek edilince dublaj yeniden devreye girer. |
| 494-16 | Karışım önizlemesinin voice/music/ambience medya error olayı işlenmiyordu. Ses bozulsa bile diğer katmanlar/interval devam edebiliyordu. | Her önizleme medyasının error olayı tüm katmanları durdurur ve mevcut yerelleştirilmiş hatayı gösterir. |
| 494-17 | Tam ses süresi son cue'nun bitişinden hesaplanıyordu. Örtüşen 0–60 ve 10–11 saniye cue'larında 62 yerine 13 saniyelik çıktı planlanıyordu. | En büyük cue bitişi esas alınır; video uzunluğu kontrolü de bütün bitişleri kapsar. İç içe aralık testinde 62 saniye çıkar. |
| 494-18 | Geçerli WAV'ın metadata dosyası null/bozuksa final kalite toplama record.update sırasında çöküyordu. Dosya yoksa da ses sorgusuz ready sayılıyordu. | Cache raporu tip/status/text/verification kontrolünden geçer; eksik/bozuk rapor review/unavailable olur, WAV korunur. Yeniden üretimde eski metadata yanlış tipliyse de hata yayılmaz. |
| 494-19 | Nihai kalite raporu eksikse başarılı WAV kalite incelemesi olmadan otomatik videoya bağlanabiliyordu; kısmi/sessiz gruplar kullanıcıya hazır gibi sunuluyordu. | Servis kalite gruplarını doğrular; qualityUnavailable done/latest boyunca taşınır. UI otomatik attach yapmaz, TR/EN dinleme uyarısı verir; elle dinleme/kullanma olanağı korunur. |
| 494-20 | Kullanıcı başarısız PDF bloğunun çevirisini elle düzeltse de blok failed kalıyordu; sayfa tamam sayılmıyor, tekrar API'ye gönderiliyordu. | Elle düzeltme translated durumuna ve tamamlık hesabına katılır; retry sırasında aynı kaynağa ait düzeltme korunur, silinirse eksik duruma geri döner. |

## Doğrulama

- tests/report494-regressions.test.js: 14/14 başarılı; başlangıç kopyasında 14/14 kırmızı.
- tests/test_report494_audio.py: 6/6 başarılı; başlangıçta 4 assertion + 2 runtime hatası.
- İlgili mevcut Node test dosyaları: browser-dub-audio, dub-generator-ui,
  dub-workspace-ui, dub-text-guard, dub-service, pdf-translate,
  pdf-state-deadzone, pdf-partial-retry, pdf-manga-36-40,
  watch-library-migration, watch-library-mutation, watch-library,
  playback-timing-fuzz, browser-foundation, url-host-fuzz,
  browser-translation-job-context, browser-workflow-core, player-dub-ui,
  report493-audio: başarılı. Kısa iki grup test koşusunda kırmızı yok.
- tests/test_dub_generation_quality.py: 7, test_dub_quality.py: 4,
  test_dub_plan_regressions.py: 5 ve yeni Python dosyası: 6; toplam 22 başarılı.
- Değişen JS node --check; Python py_compile; git diff --check başarılı.
- Windows gerçek Electron trusted-bridge smoke başarılı.
- Ayrı geçici profilde gerçek Electron ses paneli açıldı; kalite raporu
  uyarısı ve manuel Sesi kullan görünümü incelendi. Fixture ekranı:
  ignored tmp/report494/quality-warning.png. Gerçek kullanıcı profili değil.

## Sınırlar ve geçiş etkileri

Tam npm test, start.bat üzerinden uygulama başlangıcı, gerçek GPU/model,
YouTube/DRM ve canlı sağlayıcı çağrıları koşulmadı. CI açık kalır; sonuç
kullanıcı tercihiyle beklenmez ve başarılı iddia edilmez.
Kontrollü ASR/üretim kanıtı gerçek model kalite artışı ölçümü değildir.
Özel ad/olumsuzluk kanıtları konservatiftir ve bazı okunuşları incelemeye alabilir.
Cache kimlikleri değiştiğinden ilk kullanımda yeni istek/üretim gerekebilir.
PDF durum şeması aynı; dosya adı kimliği genişletildi, eski uyumlu dosyalar
korunup okunur. Daha önce ezilmiş dil/SPA kayıtları bu düzeltmeyle üretilmez.
Yeni bağımlılık, kurulum veya SQLite şema değişikliği yoktur.
Ana checkout/çalışan uygulama güncellenmedi; PR merge edilmedi.
