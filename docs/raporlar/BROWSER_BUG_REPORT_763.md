# Rapor763 — Kısaltma önerisinde güncel dublaj taslağını koruma

## Gerçek kök

Aynı kaynakta plan hazırlanırken kontroller kilitlidir; varsayılan bir ayar yarışı yeni bug diye sayılmadı. Somut hata: editörde kullanıcı özel adı/metni düzelttikten sonra Kısaltma önerisi düğmesi yalnız groupkey gönderiyordu; main plans haritasındaki ilkgroup.text kullanıyordu. Öneri mevcut taslak yerine eski metinden üretiliyor ve kullanıcının düzeltmesini geri alabiliyordu. Ayrıca renderer kaynak/plan kontrolü aynı kalmasına rağmen textarea taslağı sonradan değişirse geç gelen öneri onu ezebiliyordu.

## Düzeltme ve dosyalar

- src/renderer/dub-generator-ui.js: kısaltma isteği tamkey/sourceHash/günceltextarea taşır; geç yanıt ve geç hata ayrıca aynı taslak kontrolünden geçer. Öneri yalnız textarea'ya gelir, edits otomatik değişmez; Bu metni uygula kararı kullanıcıdadır.
- src/preload.js: aynı dub:shorten kanalında request nesnesini geçirir. Yeni kanal yok.
- src/dub-editor-request.js: shorteningInput mevcutplanda key/sourceHash doğrular ve1–4000karaktertext zorunlu kılar. Süre renderer'dan alınmaz, doğrulanmış gruptan gelir. Geçiş uyumluluğu için eski stringkey çağrısı aynı orijinalmetin davranışını korur.
- src/dub-service.js: geçerli taslağı editöre yollar; await sonrası sender destroyed veya plan nesnesi değişmişse eski öneriyi başarı olarak döndürmez. Metin dosyaya kendiliğinden kaydedilmez.
- tests/dub-shortening-draft763.test.js: günceltaslak/süre, eskihash/bilinmeyengrubu/boş veya aşırı metin reddi, gerçekDOMdüğmesi payload/ellekabul ve bayat önerinin yenitaslağıezmemesi4kontrol.
- tests/report454-regressions.test.js: mevcut servis fixture'ına2davranış; gerçekregisteredIPC handler günceltaslağıalır ve pendingeditör sırasında plan değişince stale sonucu reddeder. Önceki5kontrol aynıdır.

## Doğrulama

Yeni4+R756mevcut5NodePASS; report454doğrudan7PASS; dub-service.test.js doğrudanPASS; dub-editor-request.test.js doğaledit/süre sözleşmesiPASS.4JSsyntax/diffPASS. Test editör yanıtı kontrollüdür; canlıDeepSeek/kısaltmakalitesi/GPU/gerçek kişiselSRT bu tur denenmedi. UI/CSS veya yeni kullanıcı kontrolü değişmediği için Windows görsel yenilemesi yapılmadı; JSDOM gerçekHTMLdüğme akışıdır, nativeWindowsbaşarısı diye sunulmaz. Tamtest/uzunCI beklenmedi.

MevcutR454plan sahipliği testleri yenidenyeniBUG sayılmadı; burada metin taslağı ve awaitsonrası aynıplan kimliği boşluğu onarıldı. SourceHash metin içeriğiyle bağlanır; kişiselmetin/hash rapora alınmadı. Yeni bağımlılık/kurulum/ayar/schema yok, payload yalnız mevcutkanalda genişledi. Eskikeyçağrısı için uyumluluk korundu.

## Yaklaşım ve kapsam

Mevcut proje shorten/editorMessages ve plan sahipliği yolu önce incelendi. [VSCode textModel kaynağındaki](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/textModel.ts) model sürümleme yaklaşımı incelendi (ilk Monaco dosya adresi404 döndü; kaynak okunmuş sayılmadı); dış kod/dependency kopyalanmadı, projedeki snapshot+hash taslak kontrolü kullanıldı. Bu değişiklik sesçevirisinin genelkalitesi veya bütünplan100 tamamlanması değildir. P012/P021/P069/P079 kapsamı bu taslak düzeltmesiyle ilerler;90aktifhedef sürer,müzikyok.

Başlangıç9255331b2978ec55a03f0e6debbb2be9e0c04c0d; ürün/testbitişi18db37ed6c8a9eeb6391e50d6e1d7a3ad3e43436. Kod/belgeler ayrıcommit; normalPR/master ve kişisel dosyaları koruyarak ana güncelleme teslimi uygulanır.
