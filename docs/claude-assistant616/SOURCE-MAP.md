# Kaynak okuma haritası — doğrulanacak başlangıç noktaları

Bu harita repo HEAD'inden hedefli okumayla hazırlanmıştır; bütün yeteneklerin denetimi değildir. Satır numaralarını mevcut dosyada yeniden doğrula.

| Alan | Başlangıç |
|---|---|
| Asistan giriş ve yerel komut sırası | `src/renderer/renderer.js`: aiChatSend(), aiSourceScope(), globalAssistantContext(); AssistantMediaCommands ve AssistantPageCommands çağrıları |
| Sayfayı gerçekten çevirme | `src/assistant-page-command.js`, `src/renderer/assistant-page-commands.js`, renderer.handleBrowserPageTranslationAction() |
| Medya intent ve yürütme | `src/assistant-media-command.js`, `src/renderer/assistant-media-commands.js`; bazı eylemler yalnız ilgili paneli açar |
| Thread/kaynak/iş ilişkisi | `src/renderer/assistant-workspace.js`, `src/assistant-thread-store.js`, `src/assistant-source-context.js` |
| Native balon/pencere | `src/assistant-overlay.js`, `src/assistant-overlay-preload.js`, `src/renderer/global-assistant.js`, `src/renderer/assistant-overlay.*` |
| Web araştırması | `src/assistant-web-research.js`: provider Responses web_search; bunu bütün uygulama araç sistemiyle karıştırma |
| Gerçek YouTube ASR | renderer.startBrowserYoutubeWhisper(translate, config), startTranscribeSafe(); browserWhisperSubtitles/Translate butonları |
| Mevcut track çevirisi | renderer.startBrowserLiveTranslation(), useBrowserTrack(true), completeSelectedBrowserTranslation(); src/browser-subtitles.js ve browser-translation-scheduler.js |
| ASR main/backend | `src/main.js` transcribe:start; `src/preload.js`; `backend/transcribe.py`, `backend/assistant_stream.py` |
| Çeviri sağlayıcı/durum | src/translation-*.js, src/provider-api-keys.js, src/settings-security.js; backend/translate_*.py ve translation_*.py |
| Dublaj/iş/ref | `src/dub-service.js`, src/dub-background.js, src/voice-reference.js, src/renderer/dub-generator-ui.js, voice-reference-ui.js, browser-dub-audio.js |
| Kitap/PDF/asistan | `src/book-assistant-actions.js`, src/renderer/book-assistant-ui.js, pdf-reader-experience.js, media-workflows-ui.js; src/media-workflows.js |
| Ayarlar ve yetenekler | `src/browser-settings-registry.js`, src/renderer/app-settings-ui.js; renderer.buildOptsFromUI() ve saveAppSettings() |
| İş ve süreç sözleşmesi | `src/job-state-contract.js`, src/process-lifecycle.js, src/process-io.js |
| Kütüphane/keşfet/yorum | src/renderer/media-home.js, media-discovery-ui.js, media-title.js, media-tools-ui.js, review-decision-ui.js; src/letterboxd-reviews.js |
| Mevcut testler | tests içindeki assistant/page/media/book/translation/provider/browser/dub/settings adlarını rg ile tara; tools/ui-smoke.mjs, audit-ui.mjs |

Önemli: Yukarıdaki adlardan “asistan bunları yapıyor” sonucu çıkmaz. Ürün butonu varlığı, asistan entegrasyonu kanıtı değildir. Her gerçek çağrı zincirini kendin çiz.
