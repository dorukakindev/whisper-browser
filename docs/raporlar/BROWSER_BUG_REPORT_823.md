# R823 — Ajanlarla işlevsel denetim: 3 yeni bug, düzeltme yok

31 Ekim 2026. Kaynak revizyonu **`ccc8927a03be4bd4fda91246e7f55d5ecfc2171a`**; başlangıç `master`, rapor dalı `codex/functional-audit823`. **Ürün kodu, testler, kişisel ayarlar veya bağımlılıklar değiştirilmedi; hiçbir düzeltme uygulanmadı.**

Üç ajan **GPT-6.1 Sol / medium** ile çeviri hafızası/dizi bağlamı, araştırma notları ve sayfa çevirisi alanlarını inceledi. Ana ajan bütün son kanıt betiklerini ayrı sentetik dizinlerde bağımsız yeniden çalıştırdı. R815 ve R820–R822 dahil önceki kayıtlar dedup için karşılaştırıldı. Dosyaların tarih boyunca hiç okunmadığı iddia edilmiyor; yeni olan aşağıdaki somut üretici/tüketici ilişkileridir.

| ID | Öncelik | Yeni doğrulanan sorun | Etki sınırı |
|---|---|---|---|
| F823-01 | P2 | Bir araştırma kartını kaydetmek diğer kartların kaydedilmemiş not/etiket/bağlantı girdilerini siliyor. | Diskte önceden kayıtlı not değil, henüz kaydedilmemiş taslak kayboluyor. |
| F823-02 | P2 | Türkçe için saklanan dizi terimi Almanca çeviri isteğine zorunlu sözlük olarak taşınıyor. | Yanlış hedef dil talimatı ve yanlış terim uyarısı; canlı model kalitesi ölçülmedi. |
| F823-03 | P2 | Uzun paragrafın son kısmı çeviriye gönderilmiyor; çeviri görünümü tüm paragrafı değiştirdiği halde eksiklik bildirmiyor. | Geçici çeviri görünümü/istek kaybı; özgün metin geri alınabiliyor. |

**3 yeni bağımsız bug** vardır. Aynı kart/diğer kart taslak kaybı, prompt/terim kontrolü ve replace/bilingual belirtileri ayrı buglara bölünmedi. Yeni bağımsız geliştirme önerisi **0**; kabul ölçütleri bug sayısına eklenmedi.

## F823-01 — Araştırma kartının başarılı kaydı başka taslakları siliyor

**Tetikleyici:** Kütüphane → araştırma defterinde iki kart A/B açıkken B'nin not, etiket ve bağlantı alanlarına henüz kaydedilmemiş içerik yazılır. A değiştirilip **Kaydet** tıklanır. İkinci varyant: A'nın kaydetme yanıtı beklerken A alanına daha yeni metin yazılır.

**Beklenen:** A'nın gönderilmiş sürümü diske kaydedilirken B'nin taslağı ve A'nın daha yeni girdisi korunmalı; kaydedilmemiş kullanıcı metni sessizce atılmamalı.

**Görülen:** A diske doğru kaydedilir. Başarılı yanıt sonrası bütün araştırma listesi yeniden okunur ve kart DOM'u kayıtlı değerlerden baştan kurulur. B'nin `unsaved-B`, `draft-tag`, `https://draft.test/` girdileri sırasıyla eski `saved-B`, `saved` ve boş değere döner. Gecikmeli aynı-kart varyantında `newer-A-during-save` girdisi gönderilmiş `new-A` sürümüne geri döner. Diskteki eski B korunur, dolayısıyla bu kayıt önceden kaydedilmiş notun fiziksel silinmesi iddiası değildir; **kullanıcının yeni taslağı kaybolur**.

**Kök/kaynak:** [renderer.js:19271](../../src/renderer/renderer.js#L19271) tek kartın alanlarını alır, [19278](../../src/renderer/renderer.js#L19278) başarı sonrasında `loadResearchLibrary` çağırır. [19252](../../src/renderer/renderer.js#L19252) liste verisini değiştirir; [renderResearchLibrary:19173](../../src/renderer/renderer.js#L19173) ve [replaceChildren:19177](../../src/renderer/renderer.js#L19177) bütün kartları siler. Alanlar [19206](../../src/renderer/renderer.js#L19206) sonrasındaki kayıtlı annotation'dan kurulur; bağımsız taslak veya gelen yanıt sürümüyle uzlaştırma yoktur. Gerçek ana handler'lar [main.js:19092](../../src/main.js#L19092) ve gerçek disk tüketicisi [BrowserNoteStore](../../src/browser-note-store.js) kullanılır.

**Kanıt/kontroller:** [probe.cjs](evidence823/notes/probe.cjs), [result.json](evidence823/notes/result.json). Değiştirilmemiş renderer render/action/list fonksiyonları jsdom/VM'de, gerçek list/upsert handler kaynakları ve gerçek store/atomik dosya yazımı/fsync/diskten yeni store ile yeniden açılış çalıştırıldı. Dört senaryo: aynı-kart gecikmeli yeni girdi kaybı, diğer-kart üç alan kaybı, ek taslak olmayan normal kayıt başarısı, kontrollü kayıt reddinde iki taslağın DOM'da korunması. Her senaryoda yetkisiz upsert reddi de geçti. IPC, authorization, watch-index ve çevre UI adaptörleri kontrollüdür; native Electron pencere testi değildir.

**Öncekilerden farkı:** R815-B51 Keşfet tercihleri `draw()` yolunda başka bağımsız modülün async taslağıdır. Buradaki esas varyant gecikme bile gerektirmeyen **iki araştırma kartı** arasındaki kayıptır; ortak hatalı yardımcı yoktur ve B51 onarımı bu renderer yolunu düzeltmemiştir. R815-B127 dışa aktarma limiti/B128 arama katlaması, R31/R73 taslak GC, R83/R85/R87 missing-unsave ve R478 cue kimliği farklıdır. R820–R822 bu tüketiciyi raporlamaz. [F36/F48 tarihsel imzaları](evidence823/notes/registry-reviewed.json) yeni senaryo sayılmadı.

**Geçici çözüm/kabul ölçütü:** Aynı anda tek kartı düzenleyip kaydetme sırasında yazmayı durdurmak kaybı önleyebilir. Olası düzeltmede A kaydedilirken B'nin üç alanı aynen korunmalı; A'nın daha yeni girdisi eski yanıtla ezilmemeli. Normal kayıt, hata halinde taslağı koruma ve yetki kontrolleri sürmeli. Uygulanmadı.

## F823-02 — Dizi terimlerinin hedef dil kimliği yok; TR sözlük DE isteğine ekleniyor

**Tetikleyici:** Hedef dil Türkçe iken aynı site/dizi için `Captain = Kaptan` kaydedilir. Aynı videonun sonraki çevirisinde hedef Almanca (`de`) seçilir. Kayıt sırasında dil alanı elle eklenmez; gerçek UI gibi yalnız seri adı ve profil gönderilir.

**Beklenen:** Hedef dildeki terim karşılığı uygun dil çiftiyle ilişkilendirilmeli veya farklı hedefte uygulanmadan önce açıkça ayrılmalıdır. Özel adların korunması gibi bilinçli tercihleri bozacak dil tahmini önerilmiyor; sorun, kaydedilen çeviri karşılığının bütün hedeflere aynı zorunlu talimat olarak verilmesidir.

**Görülen:** Gerçek config seçilen hedefi `de` yapar; provider isteğinde hem **“Metni de diline…”** hem **“Zorunlu sözlük: Captain=Kaptan”** bulunur. Profil kontrolü sentetik Almanca `Kapitän, warten Sie.` satırında `Kaptan` bulunmadığı için **1 terim sorunu** çıkarır; Türkçe `Kaptan, bekleyin.` kontrolünde **0** çıkarır. Tek saklama/okuma kökü iki yerde görünür; iki bug sayılmadı. Canlı modelin yanlış Türkçe yanıt ürettiği iddia edilmiyor.

**Kök/kaynak:** [browser-series-context.js:21](../../src/browser-series-context.js#L21) seri kimliğini site+ad olarak kurar; [profileOf:22](../../src/browser-series-context.js#L22) ve [translationContext:124](../../src/browser-series-context.js#L124) hedef/source dil alanı taşımaz. [renderer/browser-series-context.js:86](../../src/renderer/browser-series-context.js#L86) UI profili dil kimliği olmadan gönderir; [browser-feature-services.js:287](../../src/browser-feature-services.js#L287) gerçek save yoludur. [main.js:17762](../../src/main.js#L17762) çeviri handler'ı seçilen dili aktarır; [config:6440](../../src/main.js#L6440) bunu kullanır. Ancak [9433](../../src/main.js#L9433) sonrasındaki dizi context injection aynı terimleri glossary'ye koşulsuz ekler. [6620](../../src/main.js#L6620) hedef ve [6628](../../src/main.js#L6628) zorunlu sözlük tek prompt'a girer. [feature check:291](../../src/browser-feature-services.js#L291) → [series check:128](../../src/browser-series-context.js#L128) aynı karşılığı her altyazıda arar.

**Kanıt/kontroller:** [probe.cjs](evidence823/memory/probe.cjs), [result.json](evidence823/memory/result.json). Gerçek feature handler/store JSON/fsync/rename, gerçek `browser:translation:start` handler kesiti, config fonksiyonu, context injection ve provider request fonksiyonu çalışır. `selectedAtSave=tr`, `selectedAtNextTranslation=de`; iki glossary aynı, iki request, DE check1/TR check0. Yetkisiz feature isteği reddedilir; bağlanmamış medya context'i null'dır. `startBrowserTranslation` bütün scheduler gövdesi yerine options aktarımı kontrollüdür. Fetch, tab/app/yetki/transport adaptörleri kontrollüdür; gerçek HTTP, anahtar veya canlı model yoktur.

**Öncekilerden farkı:** R815-B41 backend sahne notu fuzzy scope, B70 sonradan oluşan kanonun exact cache kimliğidir; mevcut düzeltmeleri incelendi, tekrar sayılmadı. R46-56 substring, R46-57 paylaşılan profili ezme, R51-50 bozuk zamanda maliyet, R64-10/11 bozuk kayıt/I/O farklı köklerdir. Bu fixture tek save, geçerli zamanlar ve başarılı disk kullanır. [F12/F14 kapsamı](evidence823/memory/registry-reviewed.json) backend hafıza/kalite ailelerini saklar; browser profilinin dil kimliği→zorunlu sözlük/check ilişkisi için geçmiş PASS kanıtı değildir.

**Geçici çözüm/kabul ölçütü:** Hedef değiştirilince dizi terimlerini elle uygun karşılıklara güncellemek gerekir. Olası düzeltmede TR profilinden DE isteğine TR karşılığı zorunlu olarak taşınmamalı; aynı hedef dilde tutarlılık ve yetki/scope kontrolleri korunmalı. Uygulanmadı.

## F823-03 — Uzun paragraf sessiz kesiliyor; kısmi çeviri tam bloğa uygulanıyor

**Tetikleyici:** Normal bir makale `<p>` bloğu 2000 karakteri aşar. Fixture, sonuna gerekli makbuzun saklanmasına ilişkin ayırt edilebilir son cümle eklenmiş **2596 karakterlik** sıradan düz metindir. Sayfa çevirisinin yalnız çeviri/replace görünümü kullanılır.

**Beklenen:** Paragrafın tamamı çeviri planına alınmalı veya kesilen kısım açık eksik/kısmi sonuç olarak bildirilip görünür kalmalıdır. İş bütçesi sınırı başarıyla tam blok işlenmiş gibi sunulmamalıdır.

**Görülen:** Gerçek DOM scan bloğun ilk **2000** karakterini alır; normalize edilmiş gerçek main request'i **1999** karakterdir ve son cümleyi içermez. Buna karşılık node uzunluğu ve saklanan original ref'i **2596** karakterdir. Kontrollü prefix çevirisi başarıyla decode/apply edilir; `ok:true, partial:false, applied:1, missing:0` sonucu döner. Tam paragraf düğümü çeviriyle değiştirilir; son bölüm çeviriye hiç girmeden çeviri görünümünden kaybolur. `overflow:false`, warning boş, pending0; yeniden scan0 olduğundan kalan kuyruk işi de yoktur.

**Kök/kaynak:** [browser-page-translate.js:677](../../src/browser-page-translate.js#L677) metni `MAX_PAGE_BLOCK_TEXT` sınırına kırpar; [698](../../src/browser-page-translate.js#L698) sınırlanmış text ile **bütün özgün node uzunluklarını** aynı blokta taşır. [725](../../src/browser-page-translate.js#L725) refs bütün originals/nodes'u, [732](../../src/browser-page-translate.js#L732) knownIds işlenmiş bloğu tutar. [main.js:7323](../../src/main.js#L7323) gerçek unit→sentence üreticisi yalnız sınırlanmış text'i isteğe taşır. [pageApplyScript:876](../../src/browser-page-translate.js#L876), [dağıtım:925](../../src/browser-page-translate.js#L925) ve [translation görünümü:1005](../../src/browser-page-translate.js#L1005) sınırlı metnin çevirisini bütün özgün düğümlere uygular. [overflow:743](../../src/browser-page-translate.js#L743) aday/blok sayısına bakar; tek blok içindeki kesilme için eksiklik işareti oluşmaz.

**Kanıt/kontroller:** [probe.cjs](evidence823/pagetranslate/probe.cjs), [result.json](evidence823/pagetranslate/result.json). Gerçek DOM scan→normalize→units→main sentence producer→request/decode→apply→view/restore çalıştırıldı; sağlayıcı cevabı ve görünürlük geometrisi kontrollüdür. Gerçek scheduler decoder'ı (`requireParts=true`), hedef TR anlam kapısı ve markup denetimi üç senaryoda da geçer; tam scheduler kuyruğu çalıştırılmaz. 2596 karakter replace senaryosu yukarıdaki hatayı verir. Aynı uzun metnin bilingual/both görünümünde özgün metin bütünüyle görünür; aynı istek kesilmesi sürer. **94 karakter kontrolünde request94** ve son cümle istektedir. Üç senaryoda restore metni tam geri getirir. Bu nedenle **kalıcı metin/dosya kaybı veya canlı çeviri kalitesi** iddiası yoktur; eksik request ve tamamlanmış gibi uygulanan geçici görünüm bugıdır. Tam main scheduler/IPC veya native site çalıştırılmadı; unchanged sentence üretimi ve gerçek sayfa modülü jsdom'da kullanıldı.

**Dedup ve kabul:** Eski dosya/karakter sınırları başlı başına yeniden bug sayılmadı. R46-89 PDF source kırpması web sayfasının bu tüketicisi değildir. R64-27 aynı normalize metinle düğüm değiştirme/zombie ref, R83-13 yerinde metin değişiminde eski kimlik/tamamlanma ve R83-14 bayat özgün metni geri yükleme kökleridir. R815 sayfa cache/sahiplik ve manga OCR kökleri de farklıdır; bu kayıt aynı paragrafın bounded request'i ile bütün-node replace tüketicisinin uyumsuzluğudur. R51/R447 ve bütün raporlardaki 2000/MAX_PAGE_BLOCK_TEXT/paragraf/kırpma eşleşmeleri bu ilişkiyi raporlamaz. [F15/F44 imzaları](evidence823/pagetranslate/registry-reviewed.json) tarihsel kayıttır. Geçici çözüm kaynak/both görünümüne dönmek veya geri almaktır. Olası düzeltmede 2000 üzeri paragrafın son cümlesi çevrilecek veri içinde kalmalı veya açık kısmi durumla korunmalı; kısa blok ve restore davranışı sürmeli. Uygulanmadı.

## Doğrulama, ayrı öneriler ve sınırlar

Yeni bağımsız öneri eklenmedi. Sadece hata nedenleri ve ileride düzeltme için kabul ölçütleri yazıldı. Ana ajanın kitap yer imi/yedeği, arşiv revizyonu, review-summary/issue-scan, playback/timeline ve altyazı tercih yollarındaki ek okumaları güçlü bağımsız yeni bug üretmedi; R815 kitap yedekleri ve eski kalibrasyon kökleri yeniden sayılmadı. Normal navigasyonda üretilmeyen boş-mediaId anchor adayı sayılmadı.

Repo kökünde aşağıdaki betikler her koşuda varsayılan olarak yeni `.uiprev/audit823-*` dizini kullanır. `AUDIT823_OUT` ile ayrı sentetik dizin seçilebilir. Profile, SQLite, ham log, medya veya gerçek API anahtarı yayımlanmaz.

```powershell
node docs/raporlar/evidence823/notes/probe.cjs
node docs/raporlar/evidence823/memory/probe.cjs
$env:AUDIT823_HEAD = 'ccc8927a03be4bd4fda91246e7f55d5ecfc2171a'
node docs/raporlar/evidence823/pagetranslate/probe.cjs
```

Son yayımlanacak betiklerden **3/3 prob exit0**, **3 CJS syntax** geçti. İlk kanıt yolu uyarlamasında notes output değişkeni yerel `out` ile çakıştı; yalnız denetim betiği değişkeni düzeltildi ve final üç prob yeniden koşuldu. Memory probu son sürümde gerçek IPC hedef-dil aktarımıyla kuvvetlendirildi ve tekrar çalıştırıldı. Yanlış davranış assertion'larının geçmesi onarım değildir.

Mevcut kısa kontroller iki grup halinde çalıştı: `browser-series-context`, `browser-series-translation`, `browser-note-store` runner **3/3** (note-store11); `browser-page-translate`, `browser-page-translation-main`, `browser-page-archive` runner **3/3**. Test içerikleri/eşikleri değişmedi. Bu geçişler yeni invariantların mevcut testlerde kapsandığını göstermez. Kaynak/kanıt canonicalLF SHA256 ve **120 tarihsel imza** [manifestte](evidence823/manifest.json); ana kontrol/sınır kaydı [burada](evidence823/parent-verification.json). Bu120, yeni test/bug sayısı değildir.

AGENTS, YENI-BILGISAYAR, DEVIR0524, Night1000 README/ilgili registry, R815 mapping/remediation ve ilgili eski raporlar okundu. Node24.22.0/jsdom30.0.1 kullanıldı; yeni bağımlılık/şema yok. Windows yerel JSON/dosya/UTF-8/Türkçe metin işlendi. `start.bat`/`install.bat` kaynakları incelendi; normal açılış/kurulum yapılmadı. Native Electron/dosya seçici/DPI/CSS yerleşimi, gerçek site/hesap/LLM/GPU/CUDA/DRM/ses kalitesi/tam ürün kabulü yok. Tam npmtest ve CI sonucu beklenmedi; CI kapatılmadı. Mevcut kişisel değişiklikler korunup rapor tesliminden hariç tutulur.
