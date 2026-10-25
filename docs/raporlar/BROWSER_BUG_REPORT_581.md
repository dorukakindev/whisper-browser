# Rapor581 — Güncel Luna karşılaştırması ve Letterboxd/film ayrıntısı entegrasyonu

25 Ekim2026. Repo https://github.com/dorukakindev/whisper-browser, dal `codex/luna-gap581`. Başlangıç güncelmaster `6af9c342c6926b7de41b9736d752906034e63cd7`; ürün bitiş **94f308d68edd4b91036cc205de6bce87e29d09f3**. Önceki PR487 master'da; bu paket yeni PR'dır, kendiliğinden merge edilmez.

## Doğru kaynak ve görsel kanıt

GitHubAPI/remoteheads/releases ayrı doğrulandı: [Luna v1.9.2](https://github.com/Nothingman333/Luna-Player/releases/tag/v1.9.2) son yayımlanan **prerelease=true**, yayın24Ekim2026; main/tag aynı **22eaaa30c3fae8384c7a219a0159f22c23943565**. Kaynak packageversion1.9.2/CHANGELOG1.9.2C. Bilgisayardaki kuruluLunaexe FileVersion1.6.7, dolayısıyla güncel kaynak referansı olarak kullanılmadı. v1.3.9/eskiZIP değil.

Kaynak ignored `tmp/luna-current581` içine shallowclone edildi. Kendi lockfile'ıyla `npm ci --ignore-scripts --no-audit --no-fund`,211paket; yalnız bu referans klasöründe, Whisperpackage/lock/runtime bağımlılığı değişmedi. Yerel Vite127.0.0.1:1428 ve ayrıElectron testprofilinde gerçekReact kaynakları `mock.html` ile renderlandı. Kaynak mock'u yeni `live_caption_status` komutuna null döndürdüğü için LiveCaptionOverlay çöktü; referansın **yalnız önizleme nativeCore API sarmalayıcısında** bu çağrı için boş/kapalıdurum döndürüldü. `__TAURI_INTERNALS__.invoke/transformCallback` değiştirilmedi. Bu uyarlama ürünümüze taşınmadı; nativeTauri/WebView2/gerçekmpv/hesap doğrulaması değildir.

İlk denemelerde onboarding/ülke/yenilik pencereleri ve yanlış Continue eylemi görünümü örttü; o görüntüler tam sayfa incelemesi sayılmadı. Ayrıprofil onboarding bilgileri ayarlanıp doğru geri/navigasyon eylemleriyle son çekim exit0: `.uiprev/luna-current581/luna-home.png`, `luna-details.png`, `luna-discover.png`, `luna-books.png`, `luna-assistant.png`. Bunlar tam boy incelendi. Film/Keşfetfixture'ında geçerliTMDB anahtarı olmadığı için poster/Keşfet dolu listesinin güncel görsel kanıtı yok; kitap açıkkütüphane kartları/asistan ve filmüstmenü/ayrıntı düzeni görüldü. Kullanıcının kişiselLuna profili açılmadı/değişmedi.

Luna GPL-3.0, WhisperMIT. GPL kodu/varlık/ikon bu MIT ürüne kopyalanmadı. İşlevleri inceleyerek özgün Node/Electron/DOM entegrasyonu yazıldı. Kaynaklar:

- [letterboxd.rs](https://github.com/Nothingman333/Luna-Player/blob/22eaaa30c3fae8384c7a219a0159f22c23943565/app/src-tauri/src/letterboxd.rs): yapım kimliğiyle çözümleme/çok sayfa örneği.
- [FilmReviewAi.tsx](https://github.com/Nothingman333/Luna-Player/blob/22eaaa30c3fae8384c7a219a0159f22c23943565/app/src/FilmReviewAi.tsx): görünür yorum alma/analiz eylemi.
- [Discover.tsx](https://github.com/Nothingman333/Luna-Player/blob/22eaaa30c3fae8384c7a219a0159f22c23943565/app/src/Discover.tsx): karttan aynı tam yapım sayfasına geçiş.
- GlobalSearch.tsx,MediaGallery.tsx,TasteQuiz.tsx/tasteQuizModel.ts,App.tsx,CHANGELOG ayrıca incelendi; aşağıdaki kalanlar uygulanmış sayılmadı.

## Tamamlanan kullanıcı akışları

### 1. Elle URL aramadan yapımı ve yorum örneğini bulma

`src/letterboxd-auto.js`: kayıtlı movieTMDB veya IMDbkimliğinden sabit Letterboxd yönlendirme adresi; başlıktan film slug'ı tahmin edilmez.12/24/48yorum seçimi, en fazla4yorum sayfası,45sn toplam süre,3MBsayfa/120kJSONeditör sınırı, credentialsomit/manualredirect. RedirectyalnızHTTPSletterboxd.com ve desteklenen film/kimlik yollarında; kullanıcı/port/query/hash/haricihost reddedilir. Yanlışfilm/yıl/TMDB veya sonraki sayfada kimlik değişimi tüm örneği reddeder. Doğrulanamayan kimlik mevcut analiz önizlemesinde unverified kalır, sahte matched yapılmaz.

Tekrar metinler temizlenir/ID'ler yeniden tekil atanır, spoiler varsayılan dışarıda. Sonraki sayfa429gibi hata verirse daha önceki örnek açık `partial/warning` ile döner; sessiz tam başarı yok. İptal tüm işlemi durdurur. Dizi filmmiş gibi aranmaz; kimlik yoksa otomatik düğme kapalı/manuel seçenekler açık.

`media-tools-service.js` mevcut yetkiliIPC/jobAbortController/kilit yoluna `reviews-auto` ekler; yeniIPC/preload yetkisi yok. Geç gelen sonuç, katalog yapım kimliği arada değişmişse reddedilir. Filmin yorumları kayıtlı kişisel beğeni veya AI analizi diye otomatik kaydedilmez. Mevcut örnek inceleme/alıntıkanıtı/zevkprofili analizi korunur. **Yalnız yorum getirmek AI isteği başlatmaz.**

`review-decision-ui.js`: otomatikörnek sayısı + **Bu filmi bul ve yorumları getir** ana eylem. ElleURL/yapıştırma/TXTJSON/spoiler/sekmeyorumlarını alma kontrolleri kapalı açılır alanda; hamJSON varsayılan ekranı doldurmaz. **Bu filmi Browser’da aç** kimlik bağlantısını mevcutbrowser navigasyonuna taşır. Sonuçta alınan yorum/sayfa/kısmi durum ve mevcut matched/unverified bilgisi gösterilir. `media-tools.css` dar/geniş düzende mevcuttoken/odakları korur.

### 2. Keşfet'ten tam film deneyimi

Keşfet'teki kaydet/kütüphanede aç eylemi eski yönetimformu yerine **MediaTitleUI tam yapım sayfasını** açar: konuçevirisi/oyuncular/puan/kişiseldurum/yorumuygunluğu ve mevcut TMDB araçları. `media-discovery-service.js` önizlemede çevrilmiş açıklamayı **yalnız aynı kaynak metin** yeni kütüphane kaydına eklenirken aktarır. Önce çevirip sonra ayrıntıyı açınca yeniden ücretliçeviri istemez; özgünmetin ve kaynakhashkorunur. Çeviri tekbaşına hâlâ kütüphanekaydı oluşturmaz.

## Güncel fark envanteri — tamamlandığı iddia edilmeyenler

| Luna tarafı | Whisper mevcut durum / karar |
|---|---|
| Otomatik Letterboxd kimlik çözümü/örneksayısı | Bu paketle eklendi; başlıkfuzzyarama yok, yanlışfilm riskine karşı doğrulanmışkimlik şartı |
| Keşfet'ten tam ayrıntı | Bu paketle yönetimformuna giden yanlış kapı düzeltildi |
| Sade yorum alma/analiz yüzeyi | Bu paketle otomatik eylem öne, manuelJSONalanları açılır bölüme alındı |
| GlobalSearch farklı medya/kaynak sonuçları | Bizimüst arama mevcut sayfadakütüphane filtresi; kaynaklaraayrılmış genel arama hâlâ ayrı geliştirme |
| Tam ekran çokgörselliTMDBgaleri | Bizimdeğişenpaketinde yok; mevcuttekposter/backdrop ile eşdeğer sayılmaz, ayrı geliştirme |
| Yeni altıhikâyeli zevktesti | Bizimmevcut puan/yorum/genrekanıtlızevkprofili var; Lunatestinin eşdeğeri henüz yok |
| Kitap açıkklasikler/LibriVox keşfi | BizimmevcutyerelPDFEPUB/üretim/M4B güçlü; açıkklasikindir/LibriVox keşfi eşdeğer değil, bu tur eklenmedi |
| Asistanbaloncuğu/kitapbağlamı | Bizde zaten nativefloatingpanel ve P09tam bölüm/pasajvar; yerelLLM veya ikinciasistan eklenmedi |
| Whisper/altyazı/dublaj/gerçekseskabulü | MevcutWhisper üstünhattı korundu, Lunamotoruyla değiştirilmedi |

Bu liste bütünLuna özelliklerinin taşındığı beyanı değildir; değerli kalanlar somut kaynaklarıyla kaydedildi. Öncelikli sonraki paket kaynaklaraayrılmışgenel arama veTMDBgaleri; öneritestini kişiselkanıttan bağımsızkesintavsiye gibi sunma.

## Kanıtlar ve sınırlar

-35hedefliNodePASS: Letterboxdauto/parser/media-tools/Keşfetservice/CSP. Syntax/diff temiz. TestlerredirectSSRFriskleri, yanlışkimlik, sayfasonrahata, kesilmişbüyükörnek/tekilID/spoiler/abort ve mevcut kanıt sözleşmelerini içerir.
- Windowsnative `.uiprev/home-entry-actions-1792939732954`, exit0: gerçekElectron/main/preload/IPC/DOM, kontrollüprovider.12yorum kimliklegetir, URLotomatikdoldu, örnekhazır, Keşfet'ten tam sayfa, çevrilmişkonu taşındı.1440×1000 ve **gerçek800×900viewport** (yalnız testpenceresindemin640), yataytaşmayok. Thumbnail/PDFsesgiriş eski regresyonları da geçti. İlgili genel/dar/film tam görüntüler incelendi. Normal appminimum değişmedi.
- Canlı kamuya açıkArrival/TMDB329865denemesi **HTTP403** verdi. Otomatik erişim bu bağlantıda engelli; gerçeksitebaşarısı iddia edilmez. Browserfallback mevcut; Cloudflarebypass veya curl/TLSkimliktaklidi eklenmedi. Kullanıcının girişoturumu kullanılmadı.
- Luna önizlemeleri kaynaktan render, nativeTauribaşarısı değil. ÜcretliAI/gerçekzevkmodeli/GPU/DRM/kişiselstart.bat/fullsuite bu tur yok. CI beklenmedi/kapatılmadı. Start/install/package/lock değişmedi; yalnız haricireferans önizleme bağımlılıkları ignored alanda.
- YeniWhisperruntimebağımlılığı/kurulum/kalıcıayarşeması yok. Mevcut3kişiselbelgedeğişikliği/114untracked dosyalar ve ana uygulama korunur. Çalışma ayrıdal+PR; yeniözellikler ana kopyaya otomatik alınmadı.
