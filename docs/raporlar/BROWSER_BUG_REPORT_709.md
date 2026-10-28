# Rapor709 — Sayfa çevirisinde kaynak/hedef dil ayrımı

P074 devamı. Başlangıç7ed074d26b0930578e8713e5e989e075f62cff03; ürünf16b370463f601fca00b6441d6b806ccc260951d.

## Gerçek hata
`Türkçe sayfayı İngilizceye çevir` tr döndürüyordu; `İngilizce sayfayı Almancaya çevir` en döndürüyordu. Sabit dil sırasındaki ilk eşleşme kaynak/hedef ayrımı yapmıyordu. Ayrıca `Translate this Turkish page into English` hiçbir niyet döndürmüyordu çünkü page kalıbı aradaki kaynak dil sıfatını tanımıyordu.

## Düzeltme
assistant-page-command.js sınırlı TR/EN sayfa komutlarında hedef yönünü arar: Türkçe yönelme eki veya `İngilizce çevir`, English to/into ve in. Sayfayı niteleyen kaynak dil hedef olarak kullanılmaz; hedef belirtilmediyse boş kalır ve mevcut kullanıcı ayarı korunur. Bilinen dil sıfatlı this/the/current page kalıpları desteklenir. Negatif/alıntı/seçili metin/altyazı korumaları genişletilmedi veya kaldırılmadı. Mevcut typed agent ve sayfa aracı kullanılır; yeni NLP motoru yok.

## Kanıt
Yeni regresyon önce `'tr' !== 'en'` ile kırmızıydı. Sonra `node --test --test-isolation=none tests/assistant-page-command.test.js tests/assistant-page-accept650.test.js tests/assistant-video-intent.test.js`:18 PASS; syntax/diff PASS. Matris TR kaynak→EN, EN→DE, ES→FR; EN komutlarda TR→EN/EN→DE/FR→ES; açık hedef, kaynak-only, negation ve altyazı hariç tutma.
Windows `tests/electron-assistant-page.smoke.js`:gerçek panelden kaynakTürkçe/hedefİngilizce komutu gerçek renderer niyet adaptöründen `ensureVisible:true,targetLanguage:en` olarak kontrollü sayfa aracına ulaştı. Kısmi sonuç gerçek panelde dürüstçe gösterildi; ilerleme/iptal görünürlüğü ve ENlight dar ekran kontrolleri de geçti. [Görüntü/JSON](TARGET709_2026-10-28/) incelendi. Sağlayıcıya/gerçek çeviri motoruna çağrı yok; çeviri kalitesi kanıtı değil.

## Açık kaynak ve sınır
[i18next LanguageUtils](https://github.com/i18next/i18next/blob/master/src/LanguageUtils.js) ve [MIT lisansı](https://github.com/i18next/i18next/blob/master/LICENSE) incelendi: bu modül locale kodu/fallback içindir; komuttaki kaynak/hedef semantiğini çözmez. Bu nedenle bağımlılık eklenmedi/kod kopyalanmadı; mevcut yerel niyet modülü düzeltildi.
11 before-quit listener uyarısı açık. Kişisel profil/API/GPU/DRM/canlı site/start.bat/install ve canlı model kararı koşulmadı. CI beklenmedi, görülmeyen sonuç başarılı sayılmaz. P074 sayfa/TR-EN komut kapsamı kısmi; PDF/video/bağlama bağlı belirsiz komutların bütünü tamamlanmış sayılmaz. Kalıcı şema/IPC/dependency değişmedi.
