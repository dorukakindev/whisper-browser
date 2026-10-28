# Rapor 712 — Gerçek yerel video zinciri ve kaybolan dublaj aralığı

Başlangıç `919fc1de442b93c165b58c6b3c964c1ece2a7788`; bitiş ürün/test `ffdfe78b867470d965f47064d85c243c30bbe94c`. Müzik aktif kapsam dışındadır.

## Doğrulanan hata
Gerçek 14 saniyelik sentetik videonun 2–10 saniyesi, gerçek tiny CPU Whisper ve canlı DeepSeek ile tamamlandı. Üretilen SRT yerel oynatıcıya yüklendiğinde dublaj panelinin aralığı null kaldı; beklenen2–10 regresyonu kırmızıydı. Browser aralık yolu vardı, yerel kaynakta aralık bağlamı taşınmıyordu. Backend done/JSON dosyasından klip sınırları doğrudan okunamıyordu; cue başlangıç/bitişini klip sınırı saymak da doğru olmazdı.

## Düzeltme
- src/local-subtitle-context.js: başarılı yerel işin açık başlangıç/bitişini, seçilen SRT/VTT/ASS yolu ve SHA256 değeriyle, gerçek medya yolu ve stat kimliğiyle bağlar. İş başındaki medya statı ile bitiştekini karşılaştırır. Hatalı/açık uçlu aralık, değiştirilmiş metin, değiştirilmiş medya veya eski kayıtta bağlam döndürmez. Kesirli zaman ve Windows yol ayracı sınanır.
- main.js: mevcut iş geçmişine isteğe bağlı subtitleContexts ekler; media:readSubtitle aynı dosya için doğrulanmış playbackContext döndürür. Yeni IPC kanalı veya dış dosya sidecar'ı yoktur. Eski kayıtlar bağlamı olmadan açılmaya devam eder.
- renderer.js: okunan bağlamı birincil/ikincil altyazı ile saklar. browser-dub-ui.js: yalnız doğru seçili altyazı ve aynı yerel medyanın aralığını sunar; çeviri ikinci kanaldaysa onu esas alır. dub-generator-ui.js: browser ile birlikte player aralığını da devralır.
- tools/video-live-pipeline.cjs: açık --run-real-pipeline seçeneğiyle gerçek uçtan uca kabul. tests/local-subtitle-context712.test.js bağlama/dosya değişimi/sınırları; history.test.js gerçek yeni yardımcı bağımlılığını main.js bağlamından yükler. Test eşiği gevşetilmedi.

Geçmiş tutulmadığında, kayıt silindiğinde/aynı medyanın geçmiş kaydı yeni işle değiştirilince veya eski sürüm çıktısında aralık bilgisi yoksa otomatik sınır tahmin edilmez; kullanıcı manuel aralık seçebilir. Mevcut geçmiş saklama politikasının kapsamı genişletilmedi.

## Son gerçek kabul
[Temiz kanıtlar](PIPELINE712_2026-10-28/):
1. Sentetik İngilizce SAPI video ve İngilizce SAPI referans/döküm çifti kullanıldı; kişisel video veya ses verilmedi.
2. Gerçek medya seçici/yetkilendirme ve Başlat düğmesi → tiny/faster CPU,2–10s → DeepSeekV4.1standard iki canlı istek (çeviri+gözden geçirme).
3. Çıktı: `Kütüphane bugün açık. Birlikte kitap okuyabiliriz.`; SRT2.128–5.760, kaynak/çeviri sourceId/sourceHash eşit.
4. Sonuç penceresi gerçek Kapat düğmesiyle kapatıldı; aynı video ve çevrilmiş SRT oynatıcıda açıldı. Dublaj paneli yeniden aralık seçmeden0:02→0:10 gösterdi; görünür ekran incelendi.
5. Gerçek VoxCPM2/nano-vLLM15adım,4paralellik,akıcı gruplama,ayrıntılıASR.8sWAV ve senkron haritası oluştu. Hızlandırılan/kesilen/taşan grup0/0/0. Model12.390s,referans1.766s,üretim14.813s,doğrulama9.110s,toplam39.703s. Bu koşuda VRAM tepe örneklemesi yapılmadı.
6. Sesi kullan düğmesi → gerçek WAV decoder → aynı videoda1s özgünses,3s dublaj/özgünsesmuted, pause ile sesin durması PASS. Ayrı transkripsiyon ve dublaj başlatma adımlarıdır; tek browser düğmesi veya gerçek YouTube kabulü değildir.

## Kalite açık — başarılı sayılmadı
Ayrıntılı ASR grubu review yaptı: similarity0.0, duyulan metin İngilizceye benzeyen fonetik sözcüklerdi. Aynı WAV'a bilinen Türkçe dili verilerek bağımsız small CPU teşhisi yapıldı: similarity0.2857, yine review. Yalnız dil zorlamak sorunu çözmedi. İngilizce sentetik referansla Hi-Fi koşullaması/üretim kalitesi ayrıca karşılaştırılmalı; neden kesinleşmedi. Review kapısı korunur, eşik düşürülmedi. Teknik zincir başarısı doğal konuşma/kaliteli Türkçe dublaj kabulü değildir. language-diagnostic.json ham sentetik kanıtı korur.

## Test kurulumu sorunları ve sınırlar
İlk denemede olmayan formats=srt,json seçildi; gerçek seçenek srt,ass,json yapıldı ve başlatma öncesi form kontrolü eklendi. Genel dosya seçicisinin medya izni vermemesi nedeniyle sonraki test onayda bekledi; gerçek selectVideoWithGeneration yolu kullanıldı, erişim kontrolü kaldırılmadı. Done olayındaki flat path/url yerine output bekleyen test düzeltildi. İlk ekranlarda sonuç modalı alttaki paneli örtüyordu; gerçek Kapat adımı ve görünür aralık koşulu eklendi, son koşu yeniden tamamlandı. Bunlar ürün bugı diye sayılmadı. Hata halinde araç yalnız kendi transcribe/dub işlerini iptal eder.

Hedefli history/output-contract/restore/local-context kontrolleri PASS (Node6sonuç; wrapper dosyalarının iç kontrolleri de kendi çıktılarında geçti), syntax/diff PASS. Gerçek Windows arayüzü1280x900 incelendi. Ücretli anahtar711broker→anonimIPC→yalnız relay outbound başlığı; testte sentetik anahtar, kişisel ayar yok. Loopback relay gerçek DeepInfra yanıtını aynen iletir, sabit çeviri döndürmez. Normal CI bu opt-in aracı çalıştırmaz. Gerekli sentetik fixture dizini --fixture ile seçilebilir; önceki R700 fixture'ı kullanıldı.

[faster-whisper transcribe.py](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) klip/offset yaklaşımı ve [MIT lisansı](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) incelendi. Mevcut backend/ses motoru/711credential broker yeniden kullanıldı; dış kod veya yeni bağımlılık alınmadı.

11before-quit listener ve izole background ağ filtresi uyarısı açık. start.bat/install/DRM/canlıYouTube/hesap ve farklı medya biçimleri koşulmadı; nativeElectron normal launcher kanıtı değildir. CI beklenmedi. P001 hâlâ kısmi; P003 kapalı sınırlı yerel yol doğrulandı. İnsan dinleme ve ses kalitesi sonucu tamamlanmadı; kalan90hedef aktif.
