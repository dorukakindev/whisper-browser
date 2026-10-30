# Rapor798 — Luma esinli API asistan geliştirmeleri

Başlangıç master `7eadbc5464fba2885bec77731683b86f54162b81`; bitiş ürün `2992d059a17ce59dd7faf2d6ae981e3528fb47fe`. Dal `codex/assistant-workspace798`. Yerel LLM/model sunucusu kurulmadı; mevcut API sağlayıcısı korunur. Luma AGPL kodu/CSS'si kopyalanmadı; R797'de incelenen yaklaşımlar mevcut MIT mimarimizle bağımsız yazıldı. Yeni bağımlılık yok.

## Kullanılabilen geliştirmeler

1. **API sağlayıcısına bağlı olmayan browser araştırması.** Hem research_web aracı hem Web'de araştır düğmesi, asistanın kendine ait geçici/sessiz arka plan sekmesini kullanır. Google okunabilir kaynak döndürmezse DuckDuckGo ve Bing adaptörleri sırayla denenir. En çok3kaynak okunur, kaynakURL ve Wkimlikleri döner. Etkin kullanıcı sekmesi değiştirilmez, araştırma sekmesi kapanır. Kullanıcı sekmeyi kendisi etkinleştirirse artık kapatılmaz. Arama/Cloudflare başarısızlığı boş başarılı sonuç gibi gösterilmez. Tarayıcıdaki ortak oturum kullanılır; ayrı sıfır-çerez profili değildir. Bu, internette her siteye erişim veya Cloudflare aşma garantisi değildir.
2. **search_app_guide.** Uygulamanın Whisper, altyazı, çeviri, dublaj, kitap, ayar ve iş sözleşmelerini sürümlü, kaynakID'li kısa rehberde arar. Kişisel dosya/anahtar taranmaz. Rehber elle yazılmış ürün bilgisidir; depo genelinde tüm dokümanları otomatik indeksleyen sistem değildir.
3. **search_book.** Açık kaynağa kayıtlı PDF/kitap okuyucusunda anahtar sözcük arar. PDF özgün textContent, raftaki kitap bölümleri ve üretim bölümleri bağlandı. Gerçek sayfa kimliği/excerpt döner. En fazla40sayfa/bölüm bir partide; next ile devam edilir. Sayfa başına200000karakter limiti ve truncatedPages açık bildirilir. Bu semantik embedding araması, OCR veya bütün eseri tek bağlamda okuma iddiası değildir. Canlı sentetik45bölüm denemesinde model ikinci partiye devam etti.
4. **Katlanabilir işlem günlüğü.** Main-owned gerçek tool-step olayları asistan cevabına bağlanır, sohbetle kalıcı saklanır. Aşama, kontrol/başarısız/engelli/önerildi/kabul edildi ayrımı ve süre görünür. Önerildi geçmiş olaydır; uygulanmış demek değildir. Aç/kapa tercihi görüntü yenilenirken korunur. Argüman/metin/anahtar taşımayan sınırlı ad+durum kaydı; mevcut onay kartları ve exact-job receipts korunur.
5. **Sonuç doğrulaması.** Kayıtlı araç başarısız/engelli dönerse modelden bir kez sınırlı nihai kanıt düzeltmesi istenir, eylem otomatik tekrar edilmez. Main nihai yanıta başarısız kontrol sayısını ekler. accepted/completed ve kaynak-owner güvenliği korunur. Bu, her serbest metin iddiasına tam semantik doğruluk garantisi değildir.
6. **Uzun araç sonucunu koruma.** Aynı tur içinde bellekte bounded sonuç deposu; kısa preview + gerçek resultID/uzunluk döner. read_tool_result6000karakterlik parçaları getirir.512000karakter teksonuç/1048576toplam limit, başka tura erişim yok. Taşma hata verir; JSON gelişi güzel ortadan kesilip geçerli tam sonuç sayılmaz. Hassas kullanıcı metni diske dump edilmez.
7. **Opsiyonel MCP stdio adaptörü.** tools/whisper-mcp.cjs üzerinden search_app_guide,get_jobs,get_tabs salt okuma araçları sunulur. Yerel127.0.0.1 bağlantısı, ayrı token ve port açıkça ayarlanmadıkça listener başlamaz. TarayıcıOrigin reddedilir; genel shell/dosya yazma/anahtar veya mutasyon aracı yok. Dahili /rpc özel taşıması stdio adaptörü içindir; genel StreamableHTTP sunucusu diye sunulmaz. Yerel LLM gerektirmez.

## Kullanım

Asistana “Whisper ile ses için çeviri arasındaki farkı rehberden açıkla”, “Bu kitabın tamamında kızıl anahtarı ara, sonraki partilere devam et” veya “Bu konu hakkında internette kaynak bul” denebilir. Araçlar uygun bağlamda sunulur; sonuçlar doğal dil sorusuna göre model tarafından seçilir. PDF/kitap aramasında kaynak değişirse bekleyen sonuç reddedilir. Günlük, asistan cevabının üstündeki İşlem günlüğü başlığından açılır. Eski sohbetler steps olmadan çalışır.

MCP kullanmak isteyen geliştirici, uygulamayı ve stdio adaptörünü aynı **ayrı, rastgele en az32karakterlik** WHISPER_MCP_TOKEN ve1024–65535arası WHISPER_MCP_PORT ortamıyla başlatır. Model API anahtarı bu token olarak kullanılmaz. Normal start.bat bu değişkenleri miras alır; varsayılan boş kalır. Dış istemci komutu `node` ve mutlak `D:\Whisper Local\tools\whisper-mcp.cjs` argümanıdır. Endpoint127.0.0.1:<port>/rpc yalnız adaptör içindir. İstemci initialize/tools-list/tools-call stdioJSON-RPC ile konuşur. Bu tur kişisel istemci ayarına MCP eklenmedi/token kaydedilmedi.

## Doğrulama

- Son kısa toplu koşum12testdosyasında79top-level testi geçti: workspace798,provider,agent-service,capabilities,book-actions,threads,overlay,web-research,book-assistant-actions,book-handoff758,pdf-reader-search-ui,ui-locale. Mevcut14locale assertion da geçti.
- Yeni workspace798 dosyasında10test: rehber sürüm/kaynak, büyük sonuç tamkuyruk okuma+tur izolasyonu,40/45batch+stale kitap, araştırma iptali/özelIPret/temizlik, MCPkimlik+Origin+read-only, karttoggle+escaping, provider sonuç kuyruğu, tekfailed-repair, gerçekNode stdioadaptör initialize/tool-call, kalıcıstepsargüman temizliği.
- Tüm değişen29JS/CJS dosyası node--check geçti; diff--check geçti. Önceki coverage registry senaryoları yeni bug sayılmadı.
- Gerçek Windows native main/preload/renderer/overlay, kontrollü HTTP/SSE sağlayıcıyla5istek: gerçek toolkartı, onayla ayar açma, kalıcı receipt, bekleyenayarda aşama göstergesi, iptal/kısmi yanıt koruma. BeşPNG çıktı; TRkoyu1440x1000 ve ENaçık720x680 ana pencere, overlay480CSSpx. Taşma ve composer sınırı assertleri geçti. Final koyukart/açıkkompakt görselleri gözle incelendi.
- İlk capture UnknownVizError nedeniyle yakalanamadı; ayrıtestprofilinde nativeocclusion/background throttling ayarıyla tekrar geçti. UTF8fixture okuması düzeltildi. Eski smoke “gizlenen progress texti boş” beklentisi yerine gerçek hidden sözleşmesi doğrulandı; ürün eşikleri gevşetilmedi. Var olan MaxListenersExceededWarning11before-quit native stderr'de devam ediyor; bu tur çözülmedi/gizlenmedi.
- Gerçek halka açık web araştırması3kaynak getirdi (OpenBMBGitHub/organizasyon/HuggingFace). İlkGoogle selectorsiz sonuç sonrası alternatif motorlar eklendi. İkinci kabul açıkexample.orgsekmesiyle yapıldı: aktifsekmeID+URL korundu, tabssayısı1→1. Cloudflare/reklam/giriş tüm sitelerde sınanmadı.
- Gerçek DeepSeekV4.1standart-tier5istek: search_app_guide çağırdı, sentetik45bölüm kitabı1–40sonra41–45taradı, B45-0alıntısını kaynaklı verdi. İki vaka geçti. Anahtar güvenli mevcutbroker'dan bellekte alındı; log/commit'e anahtar ve kişisel bağlam yok. Flex gönderilmedi, kişisel ayar değiştirilmedi. Bu modelin her komutta doğru araç seçeceği garantisi değildir.

Kanıtlar: [browser](evidence798/browser-research.json), [sentetik canlı model](evidence798/deepseek-tools.json), [native capture hashleri](evidence798/native-captures.json). HamPNG/profil vestdout/err .uiprev/tmp içinde Git dışında; sentetik canlı yanıt güvenli seçilerek yayımlandı.

## Tasarım incelemesi

frontend-design + make-interfaces-feel-better kullanıldı. Ortak yüzey/çizgi/amber/metin tokenları; tekdisclosure, satırhiyerarşisi, tabularsüre, scrolliçindesınırlı230pxgünlük; composerüstüne sabit katman eklenmedi. Hareket yalnız kesilebilir150ms caretrotation, reduced-motion kapatır. Sürekli adım animasyonu, heraraçtaparlayan ayrı kart ve hamreasoning gösterimi değerlendirildi ama reddedildi: kalabalık, durumyanılsaması, gerekçesiz hareket. Gerçek hover/focus renkleri ortak mevcutCSS'den; yeniGPU/geçişperformans benchmarkı/animasyonu10%replay koşulmadı. Görülen kapsamda blocker yok; bütün uygulama tasarım onayı değildir.

## Kaynaklar / sınırlar

R797'de sabit747e634Luma WorkTab,DocsKnowledgeBase,AgentRunCards,FinalAnswerGate/CompletionVerifier,ToolResultCompactor,McpServer incelendi. LisansAGPL olduğundan kod taşınmadı. [Resmi MCPstdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) sözleşmeleri kontrol edildi. Mevcut Electron/DOM/Node/fetch/JS kullanılmaktadır; yeni paket/embedding/modelindirmesi yok.

Bu tur start.bat ile yeni başlatma, GPUWhisper/VoxCPM, gerçekPDFdosyasının tüm sayfaları veya kişisel kitabın uçtanuca üretimi koşulmadı. PDFtext kaynağı mevcutpdfjs/okuyucuya bağlandı; batch tarama ve exactmountedreader yönlendirme kontrollü test edildi. Kütüphane/çeviri/dublaj özellikleri değiştirilmedi. UzunCI/tampaket beklenmedi. Kişisel açıkprogram kapatılmadı. MCPvarsayılan kapalı; kurulum/installer değişikliği yok.

## Dosyalar

- assistant-retrieval/guide/tool-results: kaynaklı sözcüksel arama, authoredrehber ve tur içi çıktıdeposu.
- assistant-browser-research + main + assistant-web-research: geçicisekme, aramaadaptörleri, makalesınırı ve mevcut UI/araçbağlantısı.
- assistant-capabilities/provider/agent-service: yeni araçşemaları, execute/kanıtkapısı, stabilWkimlikleri, gerçekstepolayları.
- assistant-run-steps/thread-store/assistant-overlay: sınırlandırılmışstepskalıcılığı ve nativeköprü.
- renderer/assistant-run-card/overlay(.html/.js/.css)/workspace/agent-ui/index: temalıkatlamalığünlük ve kayıt/yenilemebağlantısı.
- renderer/assistant-book-search/book-assistant-ui/assistant-book-actions/pdf-reader-experience/media-shelf-ui/media-workflows-ui: kaynaksahipliarama ve PDF/raf/üretimadaptörleri.
- assistant-mcp-bridge + tools/whisper-mcp: varsayılankapalısaltokumaopsiyonelgeliştiricibağlantısı.
- tools/assistant-workspace-live + tests/workspace798,book-actions ve ikinative798smoke: doğrulama. Kişisel dosyalar/testprofilleri commit dışı.
