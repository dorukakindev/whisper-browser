# Rapor767 — Dar okuyucuda metne alan ve kısa pencere menü sınırı

Başlangıç master `aeeb2643bf5a07f3050db43611f2c07b271b310a`; ürün/test bitişi `2b3b1fdaf45fafb79865a51ad08527ccdb246674`.

## Tasarım kararı

frontend-design ve make-interfaces-feel-better uygulandı. Ortak bg/text/accent token'ları, IBM Plex Sans/Sora başlıkları, 40px hedefler ve mevcut 140ms durum geçişleri korundu. Metin alanını büyütmek için dar genişlikte üç ikincil menüye aynı çizgi ailesinde currentColor SVG eklendi; gerçek metinleri erişilebilir ad olarak kaldı, tek dilde tooltip güncellenir. Genişte yazılı menüler sürer. Yeni panel/kart/palet/animasyon eklenmedi.

## Bulgular ve değişiklikler

| Önem | Konum | Önce | Sonra | Kullanıcı etkisi |
|---|---|---|---|---|
| Orta | pdf-reader.css / pdf-reader-experience.js | 640CSSpx/yüzde125'te ikincil yazılı araçlar üçüncü satır, toolbar168.4px | Üç40×40menü ikonu, erişilebilir ad/title TR-EN; toolbar122.4px | Metne46CSSpx ek alan, aynı araçlara klavyeyle erişim |
| Orta | pdf-reader-tools-content | Dar400×496görünümde menü altı532.4; 36.4px dışarıda. İlk kısa native denemede602/752CSSpx sınıfında da taşma görüldü | Açılma, locale değişimi ve resize sırasında gerçek üst konumdan kalan yüksekliğe maxHeight;16px alt pay | Dışa aktarma ve diğer uzun menüler pencere içinde kendi kaydırmasını kullanır |

`src/renderer/pdf-reader.css`: ikon/yazı adaptasyonu, hizalama ve dar sabit panel CSSfallback. `src/renderer/pdf-reader-experience.js`: üç SVG, korunmuş etiket düğümleri, locale tooltip ve açık menü yüksekliği. `tests/electron-pdf-reader-experience.smoke.js`: mevcut toolbar-only kabulüne kompakt yükseklik, gerçek Accessibility ağacı, üç menü Return/Escape, kısa pencere ve açıkken resize eklendi. Bunlar iki bağlantılı tasarım/erişim sorunudur; onlarca bug diye sayılmadı.

## Gerçek Windows kanıtı

- [Önce](READER767_2026-10-29/before-en-light.png) / [Sonra](READER767_2026-10-29/after-en-light.png), [TR koyu](READER767_2026-10-29/compact767-tr-dark.png), [EN açık](READER767_2026-10-29/compact767-en-light.png), [kısa açık menü](READER767_2026-10-29/compact767-short-menu.png) görüntüleri incelendi.
- `electron tests/electron-pdf-reader-experience.smoke.js --toolbar-only`: finalexit0; gerçek PDF/main/preload/renderer, native fare/klavye. [Kompakt ölçüler/erişilebilir adlar](READER767_2026-10-29/compact767.json). [Kısa pencere](READER767_2026-10-29/short767.json):602×496 ve400×496görünümlerde üç menü sınırlar içinde; açıkken400pxyüksekliğe küçülünce alt384,16px pay kaldı. [Önceki taşma](READER767_2026-10-29/short-before.json).
- Radyo okları/Home/End/tekTab, Return/Escapeodakdönüşü korundu; üç ikonun gerçek Chromium Accessibility ağacında DisclosureTriangle isimleri TR/EN doğrulandı. Her ikon40×40.
- [Hareket](READER767_2026-10-29/toolbar-motion.json): mevcut hover140ms,0.1oynatım hızında gerçek görüntü; reduced-motion0s. Yeni animasyon yok.
- `node tests/pdf-reader-search-ui.test.js`:5PASS. `node tests/design-system.test.js`:8sözleşmePASS. İki değişen JSsyntax ve diffPASS. Testeşiği gevşetilmedi.

## Diğer yüzey denetimi — yeni bug değil

PDF ve dublaj yapılandırma-hatası görünümü; TR/EN×açık/koyu×1280CSSpx/640CSSpx-yüzde125 toplam16görünümde mevcut kontrast probunda0metin ihlali ve0yatay taşma. [Ölçümler](READER767_2026-10-29/workspace-contrast.json). [Tekrar koşulabilir sentetik native script](READER767_2026-10-29/reproduce-workspace.cjs), repo kökünden Electron ile çalışır; gerçek engine/site çağrısı yapmaz. Probe boyanabilir metni inceler; gradient alanları, disabled öğeler ve kapalı details içi kapsam dışıdır. Kapalı summary etiketleri bu probun kapsamına girmez; onların erişilebilirliği yukarıdaki gerçek AX/klavye kabulüyle ayrıca doğrulandı. Bu tüm uygulamanın WCAG uygunluğu iddiası değildir.

Asistan overlay uzun24mesaj ve başarısızuzunkart/dar580yükseklik; açık/koyutemada mevcutprob0bulgu, nativeexit0. [Asistan ölçümü](READER767_2026-10-29/assistant-contrast.json). Asistan ürün kodu değiştirilmedi ve yeni özellik sayılmadı. Sentetik dış hata mesajı dublaj TRgörünümünde İngilizcedir; dış provider metninin yerelleştirildiği iddia edilmez.

## Değerlendirilen ve uygulanmayanlar

- Kontrastı geçen metin token'larını sırf değişiklik olsun diye koyulaştırmak: somut ihlal bulunmadı.
- Yalnız menü yazılarının yatay padding'ini azaltmak: geçici native CSS denemesinde toolbar yüksekliği değişmedi; uygulanmadı.
- Radix React toolbar'ını bağımlılık olarak taşımak: mevcut native details/summary ve radyo klavyesi çalışıyor; ikinci bir UI sistemi gereksiz. MIT [toolbar.tsx](https://github.com/radix-ui/primitives/blob/main/packages/react/toolbar/src/toolbar.tsx) içindeki RovingFocusGroup/ToolbarButton ve [lisans](https://github.com/radix-ui/primitives/blob/main/LICENSE) incelendi. Erişilebilirlik deseni karşılaştırıldı; harici kod kopyalanmadı, paket eklenmedi.

## Sınırlar ve teslim

Yeni bağımlılık/IPC/ayar/şema yok. Kişisel profil/API/ses kullanılmadı. Mevcut11before-quitlisteneruyarısı açık, bastırılmadı. Native engine/site hatası kontrollü; canlı API/GPU/kişisel start.bat/tam suite koşulmadı, CIbeklenmedi. İlk kısa testte gerçek menu taşması kırmızıydı; son ölçümlü düzeltmeden sonra geçti. P061/P062/P091/P093/P094/P095/P096/P098 bu kapsamda ilerledi; bütün90hedef veya tüm tasarım tamamlandı iddiası yok. Kod/belgeler ayrı commit; normalPR/master ve kullanıcı dosyalarını koruyan ana güncelleme teslimi.
