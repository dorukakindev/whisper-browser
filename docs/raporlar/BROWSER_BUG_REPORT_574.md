# Rapor 574 — Dar ekran kitap çalışma alanı

P07, 25 Ekim 2026. Başlangıç `0663379bbab4842f892a0bf43f6409781e2d1fee`; ürün bitiş `4b8c42e207b12043b9c12e5e16552a07c31a12f9`. Dal `codex/book-reliability549`, PR487.

## Ölçülen durum ve iyileştirme

800px/%100 başlangıç görüntüsünde 270px bölüm listesi editörü gereksiz daraltıyor, aşağı kaydırmada sol alan boş kalıyordu. Başlangıç ölçümünde yatay taşma veya ölçülen düğmelerde pointer engeli yoktu; bunları varmış gibi bug saymadım. Düzen artık 1000 CSS px altında tek sütun: kısa, kendi içinde kaydırılabilir bölüm listesi ve tam genişlik editör. Uzun bölüm adları minmax(0,1fr)/sözcük sarma ile alanını büyütmez. Dar ekranda sarılmış çok satırlı işlem şeridi sabitlenmez; kalite listesinin ikinci iç kaydırması da kaldırılır. Böylece metni örten bir işlem alanı yerine doğal sayfa akışı kullanılır.

Header/body boşlukları bu genişlikte tutarlı hale getirildi. Input/select/summary ve tabindex=0 okuma öğelerinde mevcut accent rengiyle görünür klavye odağı sağlandı. Geniş ekran düzeni ve kaynak PDF/ses/metin sözleşmeleri değişmedi. Yeni stil sistemi/bağımlılık veya animasyon eklenmedi; make-interfaces-feel-better rehberinin mevcut CSS sistemi ilkesi uygulandı.

## Gerçek Windows kanıtı

Son native koşu `.uiprev/book-reliability549-1792923217450`, exit0. Gerçek Electron penceresi 800×900 içerik boyutunda %100 ve %125 webContents zoom ile denendi. Yakınlaştırma tamamlanana kadar viewport eşitliği beklenir. %125'te ölçülen viewport 640×720 ve devicePixelRatio=1,25; %100'de 800×900 ve DPR=1. İlk tanı koşusundaki reader ölçümü zoom tamamlanmadan alınmıştı (zoomFactor1,25 olsa da viewport800/DPR1); bu geçerli %125 kanıtı sayılmadı ve test düzeltildi.

| Ekran | Zoom | Dialog/body yatay taşma | Kaydırıldıktan sonra kontrol hit testi |
|---|---|---|---|
| Metin hazırlama |125%|0 / 0|4/4|
| Grup planı |125%|0 / 0|7/7|
| Kalite/üretim |100%|0 / 0|12/12|
| Kalite/üretim |125%|0 / 0|12/12|
| PDF/takipli okuma/yer imi |125%|0 / 0|7/7|
| Ses karşılaştırma |125%|0 / 0|6/6|

Bunlar altı durumdaki 48 görünürlük/hit ölçümüdür; 48 ayrı bug veya bütün uygulama testi değildir. Her ölçümde kontrol kaydırılarak görünür alana getirildi ve merkezindeki elementFromPoint doğrulandı. Gerçek Tab tuşuyla review'da dinleme→metin düzenleme odak sırası, görünür outline ve örtüşmeme doğrulandı. %125'te PDF %200'e yakınlaştırılıp gerçek native mouseWheel ile iç panel scrollTop artışı görüldü; sonra genişliğe sığdır geri getirildi. PDF'nin kendi içindeki isteğe bağlı yatay yakınlaştırma kaydırması normaldir; dış dialog taşması değildir. Ekran görüntüleri incelendi. Mevcut native kitap/yer imi/PDF/EPUB/M4B akışları da geçti.

14 kısa hedefli PASS: csp-policy, reader-pdf-lifecycle, reader-audio-control. Diff temiz. Değişen ürün dosyası yalnız `src/renderer/media-workflows.css`; test `tests/electron-book-reliability.smoke.js` ölçüm ve etkileşim kanıtı ekler. Kişisel görüntüler/profile Git'e eklenmedi.

## Sınırlar

Uygulamanın normal minimum genişliği940px değiştirilmedi; yalnız izole test penceresinde minimum boyut düşürülerek daha dar800px sınandı. Bu Electron zoom/layout testi, Windows işletim sistemi DPI ayarını değiştirme veya farklı DPI'lı monitörler arasında sürükleme testi değildir. Gerçek GPU/TTS/DRM/liveAPI/kişisel start.bat/fullsuite/CI bu pakette yok. Yeni IPC, kalıcı şema, bağımlılık/kurulum yok. P07 tamam; P08–P10 açık. Master merge yok.
