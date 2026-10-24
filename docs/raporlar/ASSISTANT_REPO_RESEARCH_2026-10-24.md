# Asistan için GitHub kaynak araştırması — 24 Ekim 2026

Araştırma ve uygulama planıdır; aşağıdaki modüller henüz ürüne eklenmedi. Başlangıç HEAD `c427f13a272cc8227903c8c54f442787d0740625`. Ürün kodu değişmedi; son ürün commit'i `a3164a88f0edb3f16db97683f265e8cfeb0f0b0f`.

Yedi resmi deponun default HEAD, kaynak ağacı, lisansı ve seçilmiş modülleri incelendi. 31 lisans/kaynak/paket dosyası `tmp/assistant-repo-research` önbelleğine alındı. İlgili algoritma ve bağımlılıklar okundu; tüm projelerin denetlendiği veya çalıştırıldığı iddia edilmiyor. Ham üçüncü taraf kodları ürüne/Git'e eklenmedi. İlk sandbox ağ reddinden sonra resmi API/raw salt okunur çağrıları yükseltilmiş ortamda geçti; anahtar kullanılmadı.

## Doğrudan alınabilecek veya uyarlanabilecek parçalar

### assistant-ui — kalıcı ve dallanabilen sohbetler, MIT

İncelenen commit: `1fbf00dd0388fee912af95401876a6cc3c232b2c`.

[message-repository.ts](https://github.com/assistant-ui/assistant-ui/blob/1fbf00dd0388fee912af95401876a6cc3c232b2c/packages/core/src/runtime/utils/message-repository.ts): parentId/headId, dal seçimi, export/import, ebeveyn sırası ve yetim mesaj temizliği. [attachment-send-operations.ts](https://github.com/assistant-ui/assistant-ui/blob/1fbf00dd0388fee912af95401876a6cc3c232b2c/packages/core/src/runtime/utils/attachment-send-operations.ts): eklerin taslak/gönderim/hata/kaldırma/iptal yaşam döngüsü.

Bizde RAM taslakları ve pinler var; kalıcı çoklu sohbet deposu/dallanma yok. Uygulama hedefi: video başına adlandırılmış sohbetler ve soru düzenleme/yeniden üretmede eski yanıtı koruyan dallar. Bağımsız algoritmalar bildirimiyle uyarlanabilir. Bütün React runtime gerekli değil; incelenen core0.3.31 React peer, assistant-cloud/assistant-stream/nanoid bağımlılıkları taşıyor. local-thread-list-runtime-core tek başına kalıcı arşiv sağlamaz.

### Vercel AI SDK — gerçek streaming ve geçmiş budama, Apache-2.0

İncelenen commit: `e729d588b3291e22cfcd6cba32b6dcf7778ef21c`.

[read-ui-message-stream.ts](https://github.com/vercel/ai/blob/e729d588b3291e22cfcd6cba32b6dcf7778ef21c/packages/ai/src/ui-message-stream/read-ui-message-stream.ts) tek mesajın akış durumları/iptal/hata yönetimini; [prune-messages.ts](https://github.com/vercel/ai/blob/e729d588b3291e22cfcd6cba32b6dcf7778ef21c/packages/ai/src/generate-text/prune-messages.ts) eski parçaları budarken tool call/result/approval ilişkilerini korumayı içeriyor. Budama tek başına token sayacı değildir.

Bizim Python `chat_about_video` hâlâ tamamlanmış cevabı tek `chat` olayıyla yayımlıyor; geçmiş son 8 mesaj/mesaj başına 4000 karakter ile sınırlı. Önce Python → NDJSON → main → renderer boyunca gerçek delta akışı, iptalde kısmi cevabı koruma ve akış başladıktan sonra kör retry yapmama gerekir. Uygun algoritmalar uyarlanabilir; sadece UI harf animasyonu yeterli değil. İncelenen ai7.0.152 provider/zod bağımlılıkları taşıyor; bütün Python sağlayıcı hattını taşımak önerilmez. GitHubAPI NOASSERTION döndürse de LICENSE/paket Apache-2.0 doğrulandı.

### Streamdown / Remend — yarım Markdown'ı toparlama, Apache-2.0

İncelenen commit: `97c1f87ff6b231edc6a752f8510a4d6f320bf712`.

[Remend giriş modülü](https://github.com/vercel/streamdown/blob/97c1f87ff6b231edc6a752f8510a4d6f320bf712/packages/remend/src/index.ts), bold/code/link/başlık gibi yarım akış parçalarını handler'larla tamamlıyor. [Paket](https://github.com/vercel/streamdown/blob/97c1f87ff6b231edc6a752f8510a4d6f320bf712/packages/remend/package.json) sürümü **1.4.0**, dependencies/peerDependencies boş. React istemeyen en doğrudan paket adayı; mevcut esbuild üzerinden yerel renderer modülüne bağlanabilir.

Remend bir Markdown renderer veya XSS temizleyici değildir. Bizim izinli DOM/textContent, katı CSP ve dış kaynak sınırları korunmalı. Tam Streamdown React bileşeni gerekli değil. Önce gerçek streaming uygulanınca anlamlı olur; tek başına backend hızını artırmaz.

### LibreChat — kaynak kartları ve sohbet önbelleği, MIT

İncelenen commit: `a4c80ee0b47c381abdcf4a196480b7d0a381f29b`.

[Citation.tsx](https://github.com/LibreChat-AI/LibreChat/blob/a4c80ee0b47c381abdcf4a196480b7d0a381f29b/client/src/components/Web/Citation.tsx) dosya/sayfa/atıf metadata görünümü; [processFileCitations](https://github.com/LibreChat-AI/LibreChat/blob/a4c80ee0b47c381abdcf4a196480b7d0a381f29b/api/server/services/Files/Citations/index.js) kaynak sınırı ve metadata zenginleştirme; [retention hook](https://github.com/LibreChat-AI/LibreChat/blob/a4c80ee0b47c381abdcf4a196480b7d0a381f29b/client/src/hooks/Messages/useMessagesRetention.ts) açık/çalışan konuşmayı koruyan cache boşaltma.

Bizde doğrulanmış zaman/kimlik altyazı atıfları zaten var. Geliştirme: gerçek alıntı, kaynak/çeviri satırı, video zamanı veya PDF sayfasını gösteren kanıt kartı; tıklayınca ilgili konumu açma. Modelin rastgele URL'si kanıt sayılmamalı. React bileşenleri DOM'a uyarlanır; küçük metadata yardımcıları alınabilir. İncelenen prompts/truncate.js yalnız karakter kısaltıcısıdır, akıllı token bütçesi değildir. Eski danny-avila adresi resmi LibreChat-AI deposuna yönleniyor.

### AnythingLLM — uzun altyazıda kaynaklı arama, MIT

İncelenen commit: `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9`.

[Workspace akışı](https://github.com/Mintplex-Labs/anything-llm/blob/a5bb8b9c7b1262635ea58fc17d4899619cbf58e9/server/utils/chats/stream.js) sabitlenmiş/seçili belge ve similarityThreshold/topN/rerank aramasını birleştiriyor. [Vector arayüzü](https://github.com/Mintplex-Labs/anything-llm/blob/a5bb8b9c7b1262635ea58fc17d4899619cbf58e9/server/utils/vectorDbProviders/base.js) contextTexts/sourceDocuments/scores kontratını tanımlıyor.

Bizde `BrowserTranscriptSearch.buildTranscriptEvidence` zaten var. Alınacak geliştirme, mevcut sözcük aramasına isteğe bağlı yerel embedding/yeniden sıralama ekleyip farklı ifade edilmiş soruyu doğru kesite bağlamak. Zamanlı SRT için baştan ağır vectorDB zorunlu değil. Bütün Node/Prisma/React uygulaması taşınmamalı; veri kontratı ve küçük yardımcılar uyarlanmalı. Türkçe/İngilizce örneklerde faydası ölçülmeli.

### CopilotKit — uygulama araçlarını kullanabilen asistan, MIT

İncelenen commit: `b0c17366cd2eb3a7637230d139d3c9b7dc0e6bdf`.

[useFrontendTool](https://github.com/CopilotKit/CopilotKit/blob/b0c17366cd2eb3a7637230d139d3c9b7dc0e6bdf/packages/react-core/src/v2/hooks/use-frontend-tool.tsx) isim/agent bazlı kayıt; [useHumanInTheLoop](https://github.com/CopilotKit/CopilotKit/blob/b0c17366cd2eb3a7637230d139d3c9b7dc0e6bdf/packages/react-core/src/v2/hooks/use-human-in-the-loop.tsx) yanıt bekleme, iptal ve listener temizliği sunuyor.

Bizde kısayollar sabit eylemler. Hedef araçlar: seek_to_time, get_current_subtitle, find_subtitle, preview_translation_change, open_voice_preparation. Kaynak doğrulamalı dar şemalar mevcut IPC üzerinden çalışmalı; serbest shell/JavaScript veya tüm IPC kanallarını açmak gerekmez. Dosya değişimi/uzun üretim önizleme ve mevcut başlatma akışıyla yönetilir. Hook'lar React'e bağlı; mevcut Electron köprüsüne yaşam döngüsü yaklaşımı uyarlanır. Kök MIT bütün ayrı servislerin lisansı sayılmaz.

### Cherry Studio — tasarım referansı, AGPL-3.0

İncelenen commit: `8c6f9045f4276caf36a2f82d182871df11acecd9`.

[attachmentBudget.ts](https://github.com/CherryHQ/cherry-studio/blob/8c6f9045f4276caf36a2f82d182871df11acecd9/src/main/ai/messages/attachmentBudget.ts) system/tool/history/native-media harcamalarından sonra dosyalara ortak bütçe ayırıyor. Fikir değerli; fakat kök LICENSE AGPL-3.0. MIT ürüne koşulları değerlendirilmeden doğrudan kod kopyalanması önerilmez. Bağımsız uygulama veya diğer MIT/Apache adayları tercih edilebilir.

## Benim uygulama sıram ve teslim sınırları

1. Gerçek streaming/kısmi cevap/iptal; ardından Remend.
2. Kalıcı sohbet listesi ve dallanma; kaynak nonce/job güvenliği korunarak.
3. Kanıt kartları ve ölçümlü altyazı arama geliştirmesi.
4. Dar uygulama araçları; mevcut IPC whitelist üzerinden.

MIT kodda telif/lisans, Apache kodda LICENSE ve varsa ilgili NOTICE/değişiklik kaydı tutulmalı. Bu, ek kullanıcı onay kapısı değil normal teknik teslim işidir. React/Next/Prisma'ya toplu göç önerilmiyor. Alınan küçük modül de kaynak kapsamı ve güvenlik kontratımızla sınanmalı.

Ürün/dependency/lock/UI değişmedi; ürün testi koşulmadı. Doküman indeks/diff kontrolü yeterli. Canlı sağlayıcı, embedding/Türkçe kalite, streaming uyumluluğu ve Windows entegrasyonu henüz sınanmadı. Default HEAD incelemesi kararlı sürüm kullanımı değildir; uygulamada uygun sürüm sabitlenmeli. Bu rapor bütün bağımlılık ağacının lisans veya güvenlik denetimi değildir.
