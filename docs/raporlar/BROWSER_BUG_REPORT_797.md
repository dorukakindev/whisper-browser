# Rapor797 — LumaBrowser kaynak incelemesi ve Whisper için adaylar

Tarih30Ekim2026. Whisper master4a0ef526b88c8b6083707a774db56e4de196832b; Luma main747e634783cd2cd2e9fba537e91ab8946911a440. İnceleme salt okuma; ürün özelliği uygulanmadı, Luma çalıştırılmadı, tasarım screenshot/karşılaştırma testi yapılmadı. Yerel inceleme kopyası ignore tmp/luma-review içinde. README bütün özellikleri için başarı kanıtı sayılmadı.

## Öncelikli adaylar

1. **Sağlayıcıdan bağımsız web araştırması.** Bizim assistant-web-research.js Responses/web_search destekleyen endpoint'e bağlı. Luma WorkTab.js asistanın açtığı arka plan sekmesini sahiplik ile ayırıyor. Kendi araştırma sekmemiz + arama sonuçları/makale çıkarma + URL kaynakları, DeepSeek aracı desteklediği halde native web_search sunmayan uçlarda değerli. Bizim kaynak-owner/job sözleşmeleri korunur. Arama motoru/izin/başarısız sonuç adaptörü ayrıca gerekir; WorkTab tek başına arama motoru değildir. Luma'nın başarısız sekme açmada0ID fallback'ini kopyalamam; yanlış aktif sekmeye eylem yerine fail-closed olmalı.
2. **Uygulama rehberinde arama.** DocsKnowledgeBase.js salt okunur doküman deposunu ihtiyaçta açıp sürüm/contentHash ve kaynaklı arama sunuyor. KnowledgeLookup.js retrieval katmanına scope/k geçiriyor. Bizim capability registry ve settings araçları zaten var; asistanın hangi ayar ne işe yarıyor sorusuna sürümlü rehberden yanıt vermesi ek fayda. Yerel LLM gerekli değil; mevcut API modeline bulunan kısa parçalar gider. BM25/embedding kalitesini bu iki dosyadan çalışmış kabul etmiyorum.
3. **Uzun PDF/kitap kaynak araması.** Aynı kaynaklı retrieval yaklaşımı sayfa/bölüm sınırlarını koruyarak kitabın farklı kısımlarında arama için kullanılabilir. Mevcut sayfa bağlamımız yokmuş gibi yeniden yazılmamalı. Her sonuçta kitap kimliği, sayfa/bölüm ve alıntı sınırı şart; tüm eser okundu iddiası yok. İndeksleme/parçalama/arama doğruluğu ayrı kabul gerektirir.
4. **Katlanabilir gerçek işlem kartları.** AgentRunCards.js runID üzerinden yerinde güncellenen, aç/kapa tercihini koruyan adım/sonuç/hata kartları oluşturuyor. Bizde progress/action kartları mevcut; kaynak ve iş ID'siyle Whisper→çeviri→ses zincirini tek kompakt kartta sunmayı geliştirebiliriz. Gerçek aşama, süre, iptal ve üretilen dosya gösterilmeli. Dekoratif thinking animasyonu başarı kanıtı değildir; ham muhakeme gösterimi hedef değil. Grafit/amber, reduced-motion, scroll anchoring/dar ekran kontrolü gerekir.
5. **Sonuç iddiasını kanıta bağlama.** FinalAnswerGate.js boş yanıt için sınırlı retry, yerine getirilmeyen niyet için tek nudge, verifier uyarısı için final-retracted akışı sağlıyor. CompletionVerifier.js yalnız dar action/no_change durumunda uyarı üretir; genel başarı ispatı değildir. Bizim main-owned job receipts ve accepted≠completed ayrımı daha sıkı ve korunmalı. Öneri: yanıtın işaret ettiği exact job/ayar sonucu doğrulanmadıysa tamamlandı ifadesini engelle; sonsuz retry olmasın.
6. **Uzun araç çıktısı bütçesi.** ToolResultCompactor.js büyük sonucu yerel dosyaya bırakıp kısa outline/ref sunabiliyor. Bizde context sınırları var; çok uzun altyazı/kitap/yorum listesinde yeniden erişilebilir parça aracıyla geliştirmek değerli. Luma fallback'inin JSON'u karakter sınırında kesmesini almam; şemalı truncated/continuation/offset ve kaynak kimliğiyle geçerli JSON döndürülmeli.
7. **Dış MCP köprüsü.** McpServer.js stdio initialize/tools-list/tools-call→uygulamaHTTPköprüsü. Claude/Codex'in mevcut uygulama araçlarımızı kontrollü çağırması için mimari aday; varsayılan kapalı, yerel bağlantı/izin kapsamı ve kimlik doğrulamasıyla. Key/hesap/token ayarları modele açılmamalı. Bu kullanıcı içi asistanın temel işleri için zorunlu değil; geliştirici test otomasyonunda yüksek değer.

## Taşımayacağım parçalar

- Yerel llama.cpp/çokluGPU model sunucusu: kullanıcı hariciAPI istiyor; Whisper/VoxCPM GPU'sına gereksiz rakip.
- Alternatif TTS ve müzik üretim yığını: mevcut VoxCPM2 motorunu koruma ve müzik analizi kapsamını büyütmeme kararına uyar.
- Tool Forge ile modelin kalıcı araç kodu üretip yüklemesi, genel shell/PC kontrolü: mevcut güvenli tipli uygulama eylemlerine göre gerekçelendirilmedi.
- ToolCallGuard.js yalnız allowedTools kontrol ediyor. Bizim parametre/owner/source/risk doğrulamasından daha güçlüymüş gibi taşınmamalı.
- Ghostery/Chrome extension özelliği README'de var; bu tur adblock/extension uygulaması ayrıntılı incelenmedi. YouTube reklam döngüsüne kesin çözüm diye önerilmiyor.

## Lisans ve kaynaklar

Bizim LICENSE MIT. [Luma LICENSE](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/LICENSE) AGPL3.0-or-later ve ticari alternatif içeriyor. Kod veya CSS'yi alıp yalnız MIT kodu gibi dağıtma kararı verilmedi; doğrudan taşıma öncesi uyumluluk/atıf/dağıtım yükümlülükleri ayrıca değerlendirilmeli. Bu tur dış kaynak kod kopyalanmadı, bağımlılık/kurulum değişmedi. Genel davranış ve mimari fikirler mevcut altyapımızla bağımsız uygulanacak adaylardır.

İncelenen gerçek modüller (aynı sabitrevizyona bağlantı):

- [core/llm-server/agent/WorkTab.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/agent/WorkTab.js)
- [core/rag/DocsKnowledgeBase.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/rag/DocsKnowledgeBase.js)
- [core/rag/KnowledgeLookup.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/rag/KnowledgeLookup.js)
- [core/llm-server/ui/js/chat/turns/AgentRunCards.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/ui/js/chat/turns/AgentRunCards.js)
- [core/llm-server/agent/FinalAnswerGate.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/agent/FinalAnswerGate.js)
- [core/llm-server/agent/CompletionVerifier.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/agent/CompletionVerifier.js)
- [core/llm-server/agent/ToolResultCompactor.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/agent/ToolResultCompactor.js)
- [core/llm-server/agent/ToolCallGuard.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/llm-server/agent/ToolCallGuard.js)
- [core/shell/McpServer.js](https://github.com/amurgola/LumaBrowser/blob/747e634783cd2cd2e9fba537e91ab8946911a440/core/shell/McpServer.js)

Kabul: doküman bağlantıları ve diff kontrolü. Ürün testleri çalıştırılmadı; kod/UI değişmedi. Tam proje güvenlik/kalite denetimi veya kurulu uygulama karşılaştırması değildir. En yüksek fayda sırası: sağlayıcıdan bağımsız araştırma, uygulama rehberi araması, kompakt gerçek iş kartı; sonra kitap retrieval, çıktı bütçesi ve opsiyonel MCP.
