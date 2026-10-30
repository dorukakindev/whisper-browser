# Rapor805 — Ürün100 P21–P30 asistan açıklığı

Başlangıç `a4df5233eb7e77f40326a9c0488e6811607a2bd0`; bitiş ürün kodu `354160f0d052455c57b01c3bcd6257210235127e`; dal `codex/product100-assistant805`. [Plan](PRODUCT100_2026-10-30.md):30aday işlendi,18geliştirildi,12mevcut;70sürüyor. Bu paket4geliştirme ve6mevcut davranış doğrulamasıdır;10yeni bug denmez.

## Ürün değişiklikleri ve neden

P21: Ses stüdyosu modele yalnız verification status veriyordu; neden sayı/olumsuzluk/ad sorunu olduğuna erişilemiyordu. dub-generator-ui.js içindeki EN/TR neden üretimi ortak yardımcıya taşındı. get_voice_status artık bounded reviewReasons,needsListening,qualityEvidence=automatic_checks_only döndürür. Ham ASR/debug/yollar açılmaz. Metin/kullanıcı adları güvenilmez veri; asistan bunu doğal ses kalitesi kanıtı saymamalı.

P23: assistant-workflow-settings.js önce/sonra kartı değişmeyen alanları da şişiriyordu. Şimdi yalnız gerçek farklar; tümü aynıysa açık değişiklik yok açıklaması. Snapshot geçerliliği her alan için hâlâ denetlenir; uygulama/undo eşiği gevşetilmedi.

P24: assistant-capabilities.js genel geçersiz-parametre hatası yerine kabul edilen alanları ve şemadan tip/enum/aralığı EN/TR açıklar. Reddedilen değer veya bilinmeyen anahtarın kendisi hata metnine eklenmez. required alan da iki dilli açıklanır. Şema aynı, yetki genişlemedi.

P29: renderer.js sayfa okuması null/genel hataya düşüyordu.4s timeout,reader hatası,boş gövde,başka kaynak ve bilinmeyen erişilememe ayrı code olur. assistant-context-manifest.js yalnız allowlist code ve statik güvenli sonraki adımı modele sunar. Ağ/Cloudflare nedeni bilinmiyorsa uydurulmaz. Gövde yokken seçili pasaj/açık makaleyi yeniden okuma önerilir. Gerçek site timeout testi değil, mevcut4s race ve controlled manifest regresyonudur.

## Mevcut bulunanlar

P22 accepted/completed exactjobId ledger/flow kapıları; P25 source/request/continuation iptal koruması; P26 yeni send retryPacket temizliği ve ID filtresi; P27 görünür sourceDescription/context ve scope; P28 uzun içerikte bounded code/card inner-scroll ve akış düzeni; P30 help/definitions aynı available filtresinden üretim. Bunlar yeni özellik diye sayılmadı. Registry/flow/agent-service/source-context testleri ve gerçek native kontrollü SSE bunları hedefli doğruladı.

## Kanıt ve komutlar

`node --test --test-reporter=spec tests/assistant-clarity805.test.js tests/assistant-voice-actions.test.js tests/assistant-workflow654.test.js tests/assistant-capabilities.test.js tests/assistant-flow-state.test.js tests/assistant-agent-service.test.js tests/assistant-source-context.test.js` →59/59geçti.9değişen JS syntax ve diff geçti. İlk yeni manifest testinde dönüş object iken JSON.parse yapılmıştı; test düzeltildi, ürün sonucu değiştirilmedi.

Gerçek Windows Electron `tests/electron-assistant-workspace798.smoke.js --clarity805` izole profilde5kontrollü HTTP/SSE isteğiyle geçti: araç kartı kendiliğinden uygulanmaz, onay gerçek settings açar, geçerli receipt tekrar uygulanamaz, kısmi SSE iptali metni korur ve otomatik retry etmez.480px uzun mesaj/code/kart için scrollWidth480, mesajlar çakışmıyor, değişmeyen içerik scroll koruyor. Açık tema uzun mesaj ve aşağıdaki işlem kartı görüntüleri gözle incelendi. Tema/locale güncellemesi synthetic elle eklenmiş öğeyi yeniden çizimde sildiğinden dark görüntü iptal durumunu gösterir; uzun mesaj dark kanıtı diye etiketlenmedi. evidence805 PNG/SHA256 içerir.

Önceden var11 before-quit listener uyarısı sürüyor; eşik artırılmadı. Canlı DeepSeek/GPU bu tur koşulmadı; kontrollü sağlayıcı kalite kanıtı değildir. Tam npm/CI beklenmedi. start.bat değişmedi, kişisel açık uygulama kapatılmadı. Yeni bağımlılık/kalıcı şema yok.

## Açık kaynak yaklaşımı

Mevcut araç kayıt defteri, ledger ve native overlay korundu; yeni agent framework alınmadı. [Anthropic tool tanımı rehberi](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) şema açıklığı ve yüksek sinyalli bounded sonuç ilkeleriyle karşılaştırıldı. Dış kod kopyalanmadı; lisanslı yeni bağımlılık eklenmedi. README iddiası çalışır ürün kanıtı sayılmadı.
