# Görev03 — Kitap/PDF/sesli kitap ve bağlama bağlı asistan

Bu görev için ZIP içindeki 00-START-HERE.md ve KNOWN-STATE.md geçerlidir. Baseline read-only; yeni probe/fixture/raporlar audit-output/ altında. Güncel kaynak kimliğini ve bağımlılıkları doğrula. Kontrol edemediğin gerçek model davranışını statik/fake başarıyla eşitleme.

## Sonuç hedefi

Kullanıcı kitabı raftan açıp seçtiği sayfa/bölümü okuyabilmeli, seçili pasajı asistana sorabilmeli ve tüm kitabı üretmeden doğru aralığı seslendirebilmeli. “Ekran var” yeterli değil; kitap kimliği→kaynak metin→üretim planı→ses→vurgu→M4B zincirini doğrula. Özellikle başka kitaptan kalan metin/ayar/sonuç ve güncel metinle eşleşmeyen ses kritik.

src/{media-shelf-service,media-workflows,book-chapter-link,book-assistant-actions,book-production-plan,book-export-inputs,book-workflow-status,book-voice-takes,pdf-translate,assistant-thread-store,assistant-source-context}.js dosyalarının mevcut olanlarını bul. Bazı isimler yardımcı test modüllerinde olabilir; varsayım yerine gerçek yolları envanterle. Renderer pdf-reader-experience, pdf-spoken-map, book-*-ui, media-workflows-ui ve global-assistant akışlarını birlikte oku.

## A — Kaynak kimliği ve değişen kitap

| ID | Zor görev | Beklenen |
| --- | --- | --- |
| B01 | Aynı PDF'yi raftan/reader'dan/üretim projesinden aç. | Farklı UI kimlikleri tek kaynağa nasıl bağlanıyor? Kopya proje veya yanlış kitabın sesi oluşmasın. |
| B02 | KitapA'da async extract/hash/çeviri sürerken B'ye geç; Asonucunu en son döndür. | Bbaşlığı/bağlamı/üretim planı Aile değişmesin. |
| B03 | PDF path aynı ama byte/mtime/text revizyonu değişsin. | Eski izin/cache/ses hangi kapıda ayrılır; kaynak değiştiyse eski sesi güncelmiş gibi sunmasın. |
| B04 | EPub spine sırası başlık/sayfa numarasından farklı olsun; aynı başlıklı iki bölüm kullan. | Seslendirme görünür kaynağın gerçek spine/id'sine bağlansın. |
| B05 | Yerel Türkçe/emoji/boşluk/apostrof yol ve uzun başlıkları kullan. | Seçim ve export argv güvenli; shell quoting sorunu olmayan dosyada da kimlik kaybı olmasın. |
| B06 | Bozuk/şifreli/taranmış/boş metinli dosya ve eksik bölüm dene. | OCR öncelik değil; okunabilir metin yokluğu açık bildirilsin, uydurma üretim başlamasın. |

## B — Seçim, metin hazırlama ve uzun içerik

- B07: Sayfa1–1,5–10,ters/sıfır/bilinmeyen/milyonluk aralık ve çakışan seçimleri dene. UI/handler/parser aynı sınırda mı? Büyük aralık listeye açılmadan reddedilmeli.
- B08: PDF bir sayfa,son sayfa,üç sütun,başlık/altbilgi,tablo ve satır sonunda tire örnekleri üret. Okuma sırası ile görünen metni karşılaştır; sırf canvas render oldu diye metin doğru sayma.
- B09: Metin temizleme önizlemesi ile gerçekten üretilen metni byte/hash bazında karşılaştır. Kaynak dosyası değişmeden farklı temizlik ayarı cache kimliğine yansımalı.
- B10: Çok uzun tek paragraf,yan yana iki konuşmacı,şiir,alıntı,dipnot ve bölüm sınırı kullan. Gruplama cümlenin ruhunu bozacak ortadan kesmeye ne zaman izin veriyor? Anlamlı sınır/uzunluk önceliklerini belgeleyip karşı örnek ara.
- B11: Üretim aralığını sayfa/bölüm/pasajdan başlat. Görünen aralık ve gerçek SRT/plan aynı metni kapsasın; önceki kitabın aralığı varsayılan olarak kalmasın.
- B12: Kullanıcı metni düzenlerken async plan hazırlanıyor olsun. Metin revizyonu, seçili grup ve tekrar üretim kimliği arasında kayıp olmasın. Eski ordinali yeni metne force etmek ciddi hata olabilir.

## C — Review, yeniden üretim ve dinleme

- B13: Ready/review/failed karışık bölüm oluştur. Review satırına git,dinle,düzenle,onayla veya yalnız o grubu yeniden üret. Tek grubun işlemi diğer grubun inceleme kararını silmesin.
- B14: Üretim başarısız ama eski iyi bölüm sesi mevcut olsun; metin de değişmiş olsun. Eski sesin metni doğru etiketlenmeli; güncel metin tamamlandı gibi sunulmamalı.
- B15: İki farklı voice take arasında A/B seçimi,referans değişimi ve geç tamamlanan iş oluştur. Aktif take,metin revizyonu ve dinleme konumu birbirine sızmasın.
- B16: Sayfa çevrilmiş/özgün/yan yana görünümde dinlemeyi başlat,seek et,bölüm değiştir. Vurgu hangi metne/zamana ait? Approximate eşlemeyi kelime hizalaması diye sunma.
- B17: Metin-layer coordinate eşlemesini rotate/crop/zoom/değişen fontta incele. Görsel vurgu doğru satırda mı, yalnız sağ metin panelinde mi? Eksik özellik ile bugı ayrı sınıflandır.
- B18: Dinleme sürerken reader kapanışı,başka kitap,uyku/stop ve geç progress callback dene. Eski kitabın konumu yeni kitaba yazılmasın; timer/listener kalmasın.

## D — Asistanın gerçekten gördüğü kaynak

- B19: Seçili pasajı normalleştirme sonrası bölüm içinde doğrula; başka sayfanın seçimini,aynı görünen ama farklı Unicode metni ve aşırı uzun seçimi dene. Özet için tam bölüm gönderildi iddiası gerçek payload ile eşleşsin.
- B20: Hash hazırlanırken kaynak/sayfa değiştir. Aksiyonu başlatan source identity son kontrol olmadan B'ye bağlanmasın. Scope/thread ve bekleyen mesaj sahipliğini beraber izle.
- B21: “Bu sayfayı açıkla”,“bu bölümü özetle”,“burayı seslendir” ve genel film sorusunu aynı anda dene. Sayfa komutu yanlış videoya veya eski kitabın metnine uygulanmasın; ücretli çağrı başlamadan görünen kullanıcı niyeti doğru olsun.
- B22: Metne sistem talimatı gibi görünən alıntı,URL ve sahte kaynak etiketi koy. Bunlar tool yetkisi kazanmasın; asistan dışındaki bölüm içeriği kullanıcı emri sayılmasın.

## E — M4B'nin gerçek içeriği ve çalışma alanı

- B23: Farklı sample rate/channel/duration WAV bölümlerini M4B'ye aktar. ffprobe ile chapter başlangıç/bitişini,decode edilmiş toplam süreyi,sıralamayı ve metadata escape'ini bağımsız doğrula. Sadece ffmpeg exit0 yeterli değil.
- B24: Export sırasında bölüm metni/take değişsin veya cancel/save dialog geciksin. İncelenen ses kimliği ile mux'a verilen dosya aynı kalmalı; eski çıktı ezilmemeli. Bu çalışma yeni yedek sistemi kurmak değil mevcut export doğruluğudur.
- B25: Reader/üretim/raf arasında gidip dön; filtre,scroll,yer imi,seçili bölüm ve asistan taslağını kontrol et. Düz metin seçim satırlarının da erişilebilirliği ve kullanıcıya ne olduğu açık olsun.
- B26: 100/1000sayfa ve uzun bölümde DOM/bellek/çıkarma maliyetini ölç. Testteki yapay metin dosya boyutu ve sayfa sayısını yaz; sayfa render'larını tümü RAM'de tutarak performans sorunu çözmeye çalışma.

## Özel teslim

BOOK-JOURNEYS.md: raftan son sese kadar en az PDF/EPUB/yerelTXT için gerçek yürütme haritası, tutulan kimlikler ve gözlenen kesintiler. M4B-VALIDATION.json: ffprobe/decoded duration ve bölüm sınırları. CONTEXT-SAMPLES.json: yalnız sentetik gerçek istek payload'ları. DESIGN-REVIEW.md: reader, pasaj araçları, inceleme/yeniden üretim ve sesli kitap dinleme ekranları; viewport/tema/dil/zoom ve görsel kanıt.

Gerçek arayüz yoksa UI kusursuz deme. Bu görevde hipotetik tüm kitap özelliklerini önerip geçme; en önemli iş akışını sonuna kadar yürüt ve kırılan somut halkayı göster.
