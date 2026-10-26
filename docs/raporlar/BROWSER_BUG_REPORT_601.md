# Rapor 601 — Claude Task03 checkpoint ve Task02 metin iddialarının incelemesi

## Teslimin gerçek kapsamı

Başlangıç master0c188c218b5be58e8a6f830c59c00b14e211f881; çalışma codex/checkpoint601; ürün/test commit6ee5c6ba8eb8113ae2129635f79151fb66e58427. Alınan TASK-03-bf954ed-CHECKPOINT-1.zip SHA256 b9a29179c01458096b46792e828ba7fbac0f8af6a4fde4b5aefed988afde77b6,34girdi ve152158açılmış bayt. Kaynak snapshot bf954ed0e6bb4b8aac92cc2991cbe03ee2197c77; güncel kaynak bundan ileridedir.

ZIP **ara teslimdir**. Yalnız P01/P03 probe ve kanıtları, sentetik PDF/EPUB fixture'ları ve CHECKPOINT vardır. Task02'nin ham korpusu/patch'i/raporları yoktur; iki yapıştırılmış metindeki iddialar kanıt yerine alınmadı. Path traversal/boyut kontrolünden sonra yalnız ignore edilen tmp/task03-checkpoint1-601 altına çıkarıldı. İlk listelemede Python cp1254 emoji yazarken hata verdi; PYTHONIOENCODING=utf-8 ile tekrar geçti. Bu ürün bugı değildir. ZIP'teki bir dosya adı üreticinin kodlamasıyla mojibake görünür; kişisel dosyaya dokunulmadı. Shell setup-env script'i çalıştırılmadı; harness/probe kaynakları önce okundu. Talimat metinleri veri olarak değerlendirildi.

## Güncel kodda doğrulanan ve düzeltilen 7 kök

| Kaynak | Yeniden üretim | Düzeltme / sınır |
|---|---|---|
| Task02F01 | will→geleceğim/kazanacağız/edeceğim modal_missing | sentence_translation._TARGET_MODAL yumuşamış -acağ/-eceğ biçimlerini tanır. Might→kesin gelecek ve must→yeti kaybı negatif kontrolleri hâlâ reddedilir. Gerçek ücretli model değil saf kapı testidir. |
| Task02F10 | part_anchor_issue Ten years later→On yıl sonra ozel_ad_bozulma:0 | Cümle başı İngilizce sayı sözcükleri özel ad swap sezgisinin stoplist'ine alındı. Lawson→Larson yanlış ad hâlâ yakalanır. translation_blocking_issues tek başına bu örneği zaten reddetmiyordu; sorun part-anchor yolundadır. |
| Task02F02 | lexical_negatives gelmiyor/geçirmiyor/geçirmeyecek/geçirmez boş | JS ve Python'a aynı sınırlı şimdiki zaman/gelecek olumsuz ekleri, ortak sözlüğe geçir eklendi. Uzun cümlede review/koruma çalışır. Olumlu gelmeye/geçirmeye infinitifleri negatif sayılmaz. Türkçenin tamamı çözüldü iddiası yok; bare çalışma eski tasarımda emir olarak belirsizdir. |
| Task03B01 | Orijinal P01 güncel kaynakta4proje ve4başarısız kontrol | Aynı yetkili kaynak yolu+boyut/mtime+format+sayfa sayısı+birebir bölüm kapsamı/metni yeniden kullanılır. Düzeltilmiş P01:6/6geçti,1proje. Farklı sayfa aralığı veya düzenlenmiş metin üzerine yazılmaz/birleştirilmez; mevcut ses korunur. Raf bağlantısı uygun kayda bağlanır. Tam dosya içerik-hash dedupe iddiası yok. |
| Task03M4Bmetadata | =;#\ ve satır sonları boşluğa dönüşüyordu | FFMETADATA ters bölü kaçışıyla kitap/yazar/bölüm başlıkları korunur; CR/CRLF→LF kanonikleştirilir. Gerçek FFmpeg/ffprobe roundtrip Türkçe/emoji/\/=;# ve [CHAPTER] satırıyla birebir geçti; bölüm sayısı2kaldı. |
| Task03B06 | Şifreli/bozuk PDF ham parser mesajı | PasswordException ve InvalidPDFException açık EN/TR hata verir. ZIP'in gerçek encrypted/corrupt/blank fixture'larıyla doğrulandı; proje oluşturulmadı. Şifre alma/decrypt özelliği eklenmedi. |
| Task03B19 | 5200karakter seçim sessiz4000kırpılıyordu | Pasaj köprüsünde sınır aşımı bayrağı taşınır; kitap/raf getSource aynı bayrağı korur. Açıklama düğmesi kapatılır ve görünür EN/TR kısa seçim uyarısı gösterilir; hiçbir istek gönderilmez. Actions.prepare doğrudan uzun/işaretli girdiyi de reddeder. Tam4000seçim kabul edilir; tüm bölüm özeti100000sınırı aynı. |

## Açık kalanlar — düzeltilmiş değildir

- **B08 yeniden üretildi:** ZIP'in row-major üç sütunlu PDF'si narasyonda satır-satır sütunları karıştırıyor; column-major doğru sütun akıyor. İkisinde de ÜST BİLGİ ve Sayfa7 narasyona giriyor. `tmp/layout601.cjs` gerçek book-import/pdfs ile çıktı aldı. Otomatik başlık/sütun temizleme bu pakete konulmadı; metni yanlış silme/yeniden sıralama riski için ayrı düzen/önizleme işi gerekir.
- **F06 yeniden üretildi:** `3 men and3women` kaynakta aynı rakamın bir hedefte bir kez kalması ve `Three people→Beş kişi` kapıdan geçiyor. Küme üyeliği ve yazılı İngilizce sayı kapsamı ayrı eksik. Birim dönüşümü/sayı bağlamı istisnalarını bozmadan çokluk/hizalama gerekir; bu turda kapanmadı.
- **F03 ASR yazılı sayı örneği doğrulandı:** uzun cümlede yirmi beş→yirmi altı similarity0.9375 ile review:false döndü. Genel kapalı sınıf/isim-rol takası, sadece/hariç ve sayı sırası korumalarının tamamı doğrulanıp çözülmüş değildir. Gelen13/9probe sayılarını ham korpus olmadığı için tekrarlamadık.
- **ASR Türkçe I/ı:** kısa ılık/Ilık ve ışık/Işık örneği review:true yanlış pozitif verdi. Karışık İngilizce/Türkçe casefold, dil bağlamıyla ayrıca ele alınmalı; çözülmedi.
- **B07 sayfa sayısı:** reader ana süreçte r.numPages'e dayanır; gerçek dosyadan sayfa500senaryosu bu turda çalıştırılmadı. Kod bulgusu var, runtime tekrarı yok.
- **pdfHash/B03:** örneklenmiş dosya kimliği ve stat çakışması iddiası ayrı incelenmeli. Aynı mtime+boyut+farklı orta bayt ile gerçek PDF/cache yanlış yeniden kullanımını bu turda kanıtlamadık; düzeltildi demiyoruz.
- **B13 manualApproval:** capture grupları yeniden kurar. Farklı sese eski onay taşımak da yanlış olur; değişmemiş grup ses kimliği gösterilmeden onay kopyalama uygulanmadı. Runtime repro yok.
- Task02T14–24, Task03B02/B11–15/B18/B20–22/B24–26 ve gönderilmeyen checkpoint2 içerikleri tamamlandı sayılmadı. Haricî bütünlük/test sayılarına yalnız beyan düzeyinde referans var.

## Yerel kanıt ve testler

- ZIP'teki incelenmiş p01-duplicate-projects.js güncel handler ile önce4FAIL/4proje, sonra6PASS/1proje. WB_ROOT çalışma checkout'u; gerçek pdfjs kurulu sürümü kullanıldı. Paket kanıtları Git'e aynen taşınmadı; asıl ZIP korunur, çalıştırma çıktıları tmp altında.
- Node hedefli8dosyalık paket:17runner sonucu geçti; backend-sentence-translation125kontrol, package-integrity9kontrol geçti. `media-workflows.test.js` dahil ayrı kaynak/edited-text/invalid-scope testleri geçti. Yeni checkpoint601.test.js aynı kaynak/full/subset/edited taslak ayrımını kilitler.
- Python test_checkpoint601:3; test_dub_quality:9; test_dub_generation_quality:19; backend/test_golden_corpus:6 geçti. Golden hedefleri ve mock pipeline çalışır; gerçek model kalitesi değildir. Bir yeni negatif kontrol başlangıçta bare çalışma için hatalı beklenti taşıdı; olumlu çalışmaya infinitifiyle düzeltildi. Ürün eşiği/test silinmedi.
- book-export:test gerçek AAC/M4B metadata, karışık sample rate/kanal ve decode süresi dahil geçti. Bu, tüm platform/kodeklerin garantisi değil.
- Gerçek Windows `electron-book-assistant.smoke.js`: ayrı profil,5kontrollü istek ve EPUB/PDF/üretim bağlamları geçti.5200seçiminde0istek, görünür4.000uyarısı; screenshot `.uiprev/book-assistant-1793011896099/book-selection-limit-tr.png` açılıp incelendi. İlk görünürlük denemeleri asistan menüsü kapalı/yenileme nedeniyle zaman aşımı verdi; yalnız prepare testinin yetmediği görüldü. Kalıcı uyarı/disabled koşulu refresh'e bağlandıktan sonra gerçek test geçti. Son başarısız/başarılı sonuçlar ayrıldı, sahte UI başarı iddiası üretilmedi.
- Syntax (değişen renderer/main modülleri), py_compile ve git diff--check geçti. Tam npm test/uzunCI beklenmedi. Windows Türkçe yol, gerçek nativeUI/ffmpeg test edildi; temiz start.bat/install, gerçekGPU/model/ücretliAPI/canlıYouTube/DRM doğrulanmadı. Kişisel açık uygulama/profil/anahtar kullanılmadı.

## Teslim

Yeni bağımlılık/kurulum/kalıcı şema yok. Context'e yalnız geçici selectedTextTruncated bayrağı eklendi. Önceki cache ve metin/çeviri düzeltmeleri korunur. Mevcut kişisel OFFLINE manifest/INDEX516/untracked dosyalar kapsam dışıdır. Kod ve belge commitleri ayrıdır; PR/master güncellemesi tarihli devir notunda tamamlanır.
