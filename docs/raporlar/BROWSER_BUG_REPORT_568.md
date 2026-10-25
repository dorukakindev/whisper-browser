# 568 — P01: Kaynak bölüm ve sesli üretim

Raf EPUB/TXT okuyucusunda **Bölümü sesli üretimde aç** güncel bölümü üretimde açıp yalnız o bölümü seçer, kendiliğinden GPU işi başlatmaz. Yeni EPUB'da sourceId+spine sırası eşleşir; eski metadata yoksa ancak aynı indeks ve birebir metin kabul edilir. Değişmiş/eksik kaynak veya belirsiz bölümde sıfırıncı bölüme sessiz fallback yoktur. **Kaynak bölüme dön** kaynak dosyanın boyut/zaman ve raf/proje bağını kontrol eder. PDF'de bölüm indeksi yerine gerçek pageNumber kullanılır; mevcut reader'dan hazırlanan projede açık sayfa seçili aralıkta ise o bölüm odaklanır.

Yeni book-chapter-link helper'ı, book-source eylemi, sourceChapter istek/yanıtı ve openProject odak seçeneği mevcut yetkili IPC üzerinden çalışır. Raf book-open parser öncesi/sonrası dosya imzasını karşılaştırır. Kapatma düğmesi ek eylemlerle tek başına satıra düşmesin diye okuyucu başlığında sağ üstte sabitlendi. Kaynak değişimi kontrolü boyut/mtime temellidir; metadata korunarak bilerek değiştirilen dosya için kriptografik bütünlük garantisi iddia edilmez.

Native test iki gerçek mevcut bug ortaya çıkardı:

- Main'in linkShelfBook callback'i `atomicWriteFileSync` kullanıyor ama import etmiyordu; gerçek yeni raf üretimi hata veriyordu. Import düzeltildi; tarihsel yarım kalmış raf bağlantısı mevcut proje tekrar bulununca tamamlanabilir.
- Başka kitaba geçerken eksik voicePreferences alanları önceki kitabın referenceId/kalite ayarlarını taşıyordu. Her kitap için varsayılanlar önce sıfırlanır, sonra o projenin değerleri uygulanır.

9 hedefli sonuç geçti; kaynak değişen gerçek dosya, yanlış kimlik/spine, eski düzenlenmiş metin ve boş PDF sayfa aralığı reddi. NativeWindows `.uiprev/book-reliability549-1792919296514` exit0: gerçek ZIP EPUB parser/raf/ikinci bölüm>üretimde ikinci bölüm+yalnız o seçim>aynı EPUB bölümüne dönüş; genel sesin yeni kitaba sızmaması; PDF üretim ikinci bölümünden özgün page2/context dönüşü. Görüntüler incelendi; PDF/Review/asistan/M4B akışı da geçti. İlk native hata gerçekten eksik main importuydu, kapı/eşik gevşetilmedi. GPU/gerçek TTS/liveAPI/kişiselstart.bat/CI yok.

P01 ve eskiN39 kabul kapsamı tamam. Yeni runtime bağımlılığı/kurulum/kalıcı şema yok; mevcut source metadata ve selectedChapters kullanılır. Eski düzenlenmiş projede source kimliği yoksa otomatik eşleme yerine manuel açma gerekir.
