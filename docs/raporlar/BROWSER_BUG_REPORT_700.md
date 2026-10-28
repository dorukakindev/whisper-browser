# Rapor700 — Gerçek aşama zinciri ve açılışta videoyu örten panel

Başlangıç master `51033c8f982db998cb1531d1585655ae6d2883d5`; ürün `e5ca03305bd21a83528cb0264c4e72255230321b`; dal `codex/pipeline-acceptance700`.

## Bulunan gerçek hata
DOMContentLoaded sonrasındaki100ms timer, o sırada video/iş açılmış olsa bile SmartTube başlangıç panelini koşulsuz öne getiriyordu. Gerçek Windows kabul görüntüsünde yerel video decode/oynatma çalışırken üstünü YouTube “Start watching” paneli kapatıyordu. Üretim callback'ini çalıştıran yeni regresyon mevcut kodda kırmızı verdi. Timer mevcut `showHomeWhenNoVideo` kapısına bağlandı: loaded media veya çalışan iş varsa örtmez; boşta başlangıç davranışı korunur. Son native görüntüde yerel video görünür, panel gizli assert edildi.

## Gerçek aşama zincirinin kapsamı
1. Kişisel olmayan Windows System.Speech İngilizce cümleleri,2s sessizlik ve14s FFmpeg video oluşturuldu.
2. Üretim `backend/transcribe.py` gerçek cached tiny/faster-whisper CPU/int8 ile2–10s aralığını işledi. İngilizce kaynak tam metni çıktı. Kaynak ve TR speech SRT,2.128–5.760s orijinal zamanında; aynı sourceId/sourceHash,1/1 tamam,0 başarısız.
3. Üretim çeviri HTTP/JSON/kalite/ikinci geçiş hattı loopback kontrollü sağlayıcı ile çalıştı.2istek,0yapısal ret. Bu gerçek LLM çeviri kalitesi değildir: yanıtı bilinen fixture üretir. `--translate-for-speech true`, kaynak ve çeviri ayrı dosyada.
4. Tam bu `.tr.speech.srt`, kurulu gerçek VoxCPM2/nano-vLLM CUDA motoruna kişisel olmayan sentetik referansla verildi. Clone15adım,akıcı gruplama,2paralel kapasite,2–10s aralığı/video zamanlaması. Tek grup çıktı,8s nihai WAV;0hızlandırma/0kırpma/0taşma. Model11.062s,referans1.672s,üretim6.438s,toplam20.328s (aşamalar örtüşebilir).
5. Native test aynı özgün video ve bu WAV/sync dosyasını gerçek dosya seçme/katalog/altyazı/decoder yollarıyla açtı. Aralık öncesi özgün ses,aralık içi dublaj,pause,aralık sonrası özgün ses PASS. Video3.0119s/audio1.0187s yerel aralık eşlemesi doğrulandı. Başka fiziksel videoya geçince ses eski kaynaktan ayrılır; eski context ile geç attach reddedilir.

Bu, CLI aşamalarından çıkan gerçek artifact'ların oynatıcıda aynı kaynağa bağlandığı kabulüdür; tamamının tek UI tıklamasında üretildiği, gerçek YouTube indirmesi veya canlı LLM semantik kalitesi anlamına gelmez. Önceki ayrı testlerden bütün zincir geçti sonucu türetilmedi.

## Ses kalitesindeki açık belirsizlik
Üretimin fast doğrulaması `not_checked`; bunu kelime doğrulandı diye göstermedik. Ayrı small/CPU ASR: beklenen “Kütüphane bugün açık…” yerine “Kötüphane bugün açık…”; kelime benzerliği0.8571, omission/insertion/number/negation kapıları boş. Bu tek harfin gerçek telaffuz mu ASR yanılması mı olduğu insan dinlemesi olmadan bilinmez. Kusursuz/insan gibi sonuç veya kalite tercihi iddiası yok. Eşik yükseltilmedi, problem gizlenmedi.

## Testler ve araçlar
player-startup-browse testi önce1kırmızı/1yeşil, düzeltme sonrası2PASS. browser-dub-audio,dub-sync-map,assistant-video-intent ile8Node kontrolü PASS;syntax/diff PASS. Native Windows pipeline-source son koşusu PASS ve görüntü incelendi. İlk native denemede test, select değerini ayarlamadan loadSubtitle helper'ını çağırıyordu; gerçek playerPickSub kullanıcı düğmesine geçirildi, bu harness hatası ürün bugı sayılmadı.

[faster-whisper güncel transcribe kaynağı](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) ve [MIT lisansı](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) incelendi; motor zaman alanları ile uygulamanın clip offset'i ayrı kalır. Mevcut motor/kitaplık korunur, yeni paket/kod kopyası yok.

Problar/komutlar PIPELINE700_2026-10-28/REPRODUCE.md içinde. Gerçek WAV,video,profil ve ham kişisel yol/loglar Git'e konulmadı.11before-quit uyarısı açık. Tam CI beklenmedi; temiz start.bat/kurulum/DRM/canlısite yok. start.bat/install.bat/CUDA bağımlılıkları değişmedi. Ürün100 P001/P003/P010 kısmi güçlendi; tüm browser/otomatik bağlama ve canlı kalite kapsamları açık.
