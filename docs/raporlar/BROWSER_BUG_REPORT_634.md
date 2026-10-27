# Rapor 634 — PDF arama ve çeviri/dublaj kalite doğruluğu

## Doğrulanan ürün sorunları ve teslim

- PDF yakınlaştırması asenkron raster ve eski global smooth scroll yüzünden seçili sayfayı sayfa1'e geri taşıyabiliyordu. Render bekleyenleri aynı promise'e bağlandı, navigation/zoom sahipliği ayrıldı, özgün sayfa/ofset anlık korunuyor. Native önce kırmızıydı; aynı kabul koşulu düzeltmeden sonra geçti.
- Çeviri kalite sonucu yalnız KPS/çakışmayı değerlendirip anlam sorunu varken Sorunsuz diyebiliyordu. Sonuç artık sayı/olumsuzluk/ad/birim/para/zaman/kısalma satırlarını ayırıyor; başarısız satır varsa Kısmi çeviri ve hazır/toplam gösteriyor. Akustik kalite iddiası yok. Açık tema kontrastı tokenlara bağlandı; inceleme simgesi başarı tiki değildir.
- Türkçe nominal “Ofisi aramam gerekiyor”, “yapmamız lazım”, “elmam var”, “Tamam” ve before→“-meden önce” bağlamı yanlış negation_added üretebiliyordu. Python ve JS kapıları aynı bağlam kuralıyla düzeltildi; gerçek Yapmam/Gelemem/Okuyamam ve eksik olumsuzluk kontrolleri korunuyor. 120 çift corpus artık geçiyor, kalite eşikleri düşürülmedi.
- Ses dosyası tamamlanıp kalite raporunun grup sayısı eksik kalınca tamamı doğrulanmış gibi davranılabiliyordu. qualityIncomplete done/latest boyunca taşınıyor; ses korunuyor, otomatik videoya bağlama yapılmıyor; dinleme uyarısı EN/TR.
- Yeni: PDF içinde Ctrl+F arama, özgün sayfaya gitme, önceki/sonraki sonuç, Türkçe Unicode eşlemesi, kaynak değişiminde geç sonuç reddi ve açık 1000 sayfa/4 milyon karakter/80 sonuç bütçesi. OCR değildir. Başarısız sayfalar ve kısmi kapsam görünür.

## Kontroller ve kanıt sınırı

- Yeni/değişen saf davranış: Node 10/10; media-workflows ve gerçek ffmpeg export 3/3. Dublaj servis/UI mevcut dosyaları ayrıca geçti (toplu dosya sayımı iç regresyon sayısı değildir).
- Kaynak/altyazı/browser/adblock/caption/book/assistant boundary komutu 21/21; canlı YouTube/reklam/hesap başarısı değildir.
- Python speech/corpus/audit611/negation 33/33; ilaveten 5 mevcut ISO/konuşmacı/timeline/duration fonksiyonu geçti. py_compile ve değişen JS node --check, git diff --check geçti.
- Native Windows: assistant-flow-state 360×580 uzun kaynak+klavye, PDF search/zoom/çeviri sonucu; son exit0. Önceki aynı paket captions/books exit0. PDF arama ve sonuç açık tema, dar panel koyu tema görüntüleri elle incelendi.
- Yerel kanıtlar ignored .uiprev/pdf-reader547-1793080495146 ve .uiprev/assistant-flow-state/1793080228542-16604; tmp/634-boundaries.log, tmp/634-final-visual.out. Kişisel görüntü/log Git'e eklenmedi.
- İlk Python toplu komutunda PYTHONPATH eksikti; düzeltilince 33 geçti. Yeni kitap koruma beklentisi özgün metinle değil kullanıcı düzenlenmiş son metniyle kıyaslanacak şekilde düzeltildi. Ürün testi gevşetilmedi.
- Tam npm test, CI sonucu beklenmedi; start.bat/GPU/CUDA/gerçek VoxCPM2 ve canlı model/siteler bu paketle yeniden doğrulanmadı. Yeni bağımlılık/kurulum veya saklanan kişisel ayar şeması değişmedi.

100 planının açık hedefleri açık bırakılır; bu rapor 100 yeni bug bulunduğunu söylemez.
