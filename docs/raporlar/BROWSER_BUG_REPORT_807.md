# Rapor807 — Ürün100 P41–P50 etkileşim ve görünüm

Başlangıç `03477cf38f84ef1a57d645de9c6c40a63877853e`; bitiş ürün kodu `b3374e9610738da95064712564e93d6871c1726e`; dal `codex/product100-interface807`. [Plan](PRODUCT100_2026-10-30.md)50aday işlendi:28iyileştirildi,22mevcut;50aday sürüyor. Bu paket5iyileştirme/5mevcut davranış;50yeni bug veya tüm100tamamlandı denmez.

## Ürün değişiklikleri

P41 media-experience.js filtre state'i zaten korunuyordu; şimdi diğer gruplarda kaç işin gizlendiğini ve Tümü seçeneğini açıklıyor. Görev penceresi kapanınca origin focus preventScroll ile geri gelir. Ctrl+Shift+J artık form/contenteditable/repeat/Alt ile yazımı kesmez.
P42 dub-generator-ui.js dosya adı text/title ortak fileName atamasına taşındı. İlk native deneme overview güncellemesinden sonra done.name yazılınca title'ın bayat kaldığını gösterdi; bütün source/output/voice atamaları aynı helper ile düzeltildi. media-experience.css uzun çıktı adını ellipsis ile sınırlar; tam ad title'da kalır, gerçek kullanıcı metni çevrilmez.
P43/P44 dub-experience-ui.js dosya menüsünün Esc/focus,dıştık,scroll kapanışı korundu. Menü viewport'a göre max-height/inner-scroll ile sınırlandı. Generator close,kaynak değişimi ve karşılaştırma modalına doğrudan geçişte eski details.open temizlenir. Alt katmanda açık menü bırakılmaz.
P47 işlem merkezi açıkken locale değişimi artık başlık,intro,close label ve filtre/sayıları yeniler; yeniden açmayı gerektirmez.

## Mevcut davranışların kanıtı

P45 R806 gerçek800px%125 PDF ve bu tur900px%125 dublaj; footer/body ayrımı, yatay taşma ölçümleri geçti. P46 grafit/amber dark/light aktif durumlar görüntüden incelendi; bu tur tüm ürün için sayısal WCAG denetimi iddiası yok. P48 CDP reduced-motion emülasyonunda gerçek açık karşılaştırmanın animationName=none doğrulandı. P49 gerçek native browser/scheduler home'dayken kontrollü sağlayıcıyı tamamladı; aynı tab/mediaKey ve renderer sonucu korunarak geri dönüldü. Canlı YouTube/gerçek DeepSeek başarısı diye sunulmaz. P50 main kaynakgeneration/mediaId/closing değişiminde eski sonucu reddetme, aynı medya/iframe gezinmesinde işi koruma ve dub picker/config korumaları geçti.

## Kontroller ve test düzeneği onarımı

`node --test --test-reporter=spec tests/dub-generator-ui.test.js tests/dub-workspace-ui.test.js tests/assistant-voice-actions.test.js tests/browser-background-workspace.test.js tests/browser-background-navigation.test.js` →11test dosyası/Node subtest sonucu geçti (eski bazı dosyalar kendi iç assertionlarını tek dosya sonucu raporlar).7JSsyntax,diff geçti.

browser-background-navigation eski VM harness'ında assistantJobs ve observeAssistantCaptionJob eksikti; önce bunlardan kırmızıydı. Gerçek createJobs ve üretimdeki observeAssistantCaptionJob kaynak dilimi bağlandı; boş stub/eşik gevşetme yok. Ürün bugı diye sayılmadı.

Windows `tests/electron-dub-experience795.smoke.js --experience801 --interface807`14PNG ile geçti: Esc geri focus,dıştık/scroll,modal close temizliği, dosya tamadı, filtre korunması/gizli iş açıklaması, açıkkenEN/TR, reduced-motion ve900px%125. Görüntüler evidence807 SHA256'lı sentetik kanıttır. `tests/electron-browser-home787.smoke.js` gerçekbrowser yüzeyi/FFmpeg fixture/native ana ayar düğmesi/focus/occlusion ve pending provider→home→sonuç→geri dönüş geçti. background-result.json güvenli özeti ekli.

Önceden var11before-quit listener ve isolatedfilter ağ uyarısı sürüyor; gizlenmedi/eşik artırılmadı. Yeni bağımlılık/kalıcı şema yok; kişisel uygulama kapatılmadı,start.bat değişmedi. Gerçek GPU/DeepSeek/YouTube bu pakette yeni koşulmadı. Tam npm/uzun CI beklenmedi.

## Kaynak yaklaşımı

Mevcut details/native dialog/ortak tema korundu. [WAI menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) klavye odağı davranışıyla karşılaştırıldı; yeni menü framework'ü veya dış kod eklenmedi. Bu details menüsüne listbox/menu rolü uydurulmadı. Lisans/bağımlılık değişimi yok.
