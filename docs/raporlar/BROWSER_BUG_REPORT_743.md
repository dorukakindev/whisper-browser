# Rapor743 — Asistan altyazı çevirisinde bekleme sahipliği ve erken aralık doğrulaması

## Doğrulanan iki kök
1. `AssistantCaptionActions.translate` yalnız girişte running/queue kontrol ediyordu. Sağlayıcı profili çözülürken veya YouTube altyazısı indirilirken başka iş başladığında eski istek kaynak listesini değiştirebiliyor; useBrowserTrack genel UI davranışı nedeniyle gizli ertelenmiş yükleme bırakabiliyordu. Metin yüklemesi sırasında iş başlarsa çeviri kabulüne kadar ilerleyebiliyordu. Bu dört senaryo dört ayrı bug diye sayılmadı.
2. Zaman aralığı indirmeden ve track eklemeden sonra doğrulanıyordu.60sn videoda55–90sn isteği hata verse de indirme/track mutasyonu önce gerçekleşiyordu.

Parent hedefli test6PASS/4FAIL: [önce özeti](evidence743/before.txt). Bu modelin yanlış araç seçimi iddiası değildir; doğru seçilmiş aracın renderer adaptöründe yarış/yan etki sırasıdır.

## Kod
- `src/renderer/assistant-caption-actions.js`: aynı kaynak/sohbet/süre/iptal kontrolüne ek olarak running,queueRunning,browserTranslatePreparing durumları girişte, profil çözümü sonrasında, indirme sonrasında ve track yükleme sonrasında yeniden kontrol edilir. useBrowserTrack'a verilen iptal kontrolü arada başlayan işi de kapsar; eski iş sessiz deferredtrack bırakamaz. Başlatılan çevirinin kendi preparing bayrağını kendine iptal saymamak için startPlayerSubtitleTranslation'a mevcut kaynak/iptal sözleşmesi korunur.
- Aynı dosyada istek aralığı başlangıçta sabitlenir ve indirmeden önce doğrulanır. Video süresi sonradan güncellenirse indirme/bağlama/çeviri öncesinde tekrar kontrol edilir. Reklam oynarken belirsiz süre için mevcut Whisper politikasıyla0kullanılır; kişisel kayıtlı aralık değiştirilmez. Hedef dil/forSpeech/sağlayıcı profili mevcut iş parametreleri olarak korunur; mevcut altyazı isteği Whisper'a çevrilmez.
- `tests/assistant-caption-actions.test.js`: download sırasında rakip iş, profil beklerken queue veya preparing, geçersiz aralıkta0download/0track, yükleme sonrası rakipqueue. Önceki tam/fractional aralık ve tek-iş sağlayıcı kontrolleri korunur.
- `tests/electron-assistant-captions.smoke.js`: gerçek Electron ana/preload/renderer/overlay üzerinden kontrollü downloadawait sırasında state.running alınır; işlem reddedilir ve track/deferred/çeviri sayısı aynıdır. Gerçek validateBrowserWhisperRange60snkaynakta55–90'ı indirmeöncesi reddeder. Normal probe→caption→de5–25speechtranslation→track→dublaj aralıkdevri zinciri de aynı koşuda geçer.

## Kanıt
`node --test --test-isolation=none tests/assistant-caption-actions.test.js tests/assistant-video-intent.test.js tests/assistant-caption-jobs.test.js`:15PASS/0skip. Dört yeni kontrol parentta kırmızıydı. Değişen JSsyntax ve gitdiffPASS. Son hata kontrol sırası değiştikten sonra native tekrar exit0.

[Windows native sonuç](evidence743/acceptance.json): competingCaptionJobBlocked=true,invalidRangeBeforeDownload=true,noTrackOrDeferredMutation=true; normal asistan3HTTP isteği/kontrollü model, toplam2altyazıindirme(normal1+yarış1),2kontrollüsesbaşlangıcı.480CSSpxasistanpaneli taşmaz. Yeni CSS veya ekran tasarımı yok; bu tur görsel yenileme teslimi iddiası yapılmadı.

## Yaklaşım ve sınırlar
Mevcut AssistantAppActions kaynak kimliği, typed validation, useBrowserTrack iptalcallback'i ve startPlayerSubtitleTranslation girişleri kullanıldı. Daha önce incelenen [Electron async IPC sözleşmesi](https://www.electronjs.org/docs/latest/api/ipc-main) çerçevesinde uygulama durumunun awaitsonrası yeniden doğrulanması gerekir. Yeni kütüphane/üçüncü tarafkod/yeniIPC/kalıcıayar/şema eklenmedi; kaynak araştırması mevcut kod ve resmî sözleşmeyle sınırlı, yeni repo özellikleri alınmış sayılmaz.

Native testte YouTubeprobe/download,modelHTTP,çeviri tamamlanması ve ses motoru kontrollüdür; gerçek site/ücretli model/GPU/çeviri kalitesi kabulü değildir. CanlıDeepSeek/Whisper/TTS/BATetkileşimli kabulü/tamCI sonucu yok. Mevcut11before-quitlisteneruyarısı sürer. CI açık ve sonucu beklenmedi. Kişisel oturum/ayar/dosya kullanılmadı. P003/P006/P010/P071/P077 kısmi ilerleme;90hedef devam,müzik kapsam dışı.
