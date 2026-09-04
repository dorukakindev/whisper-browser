# Tarayıcı indirmeleri

Whisper Local'ın gömülü tarayıcısından başlatılan indirmeler artık uygulamada izlenir.

## Davranış

- Chromium'un yerel **Farklı Kaydet** penceresi korunur; uygulama sessizce hedef yol seçmez veya mevcut dosyanın üzerine yazmaz.
- Araç çubuğundaki indirme düğmesi etkin iş sayısını gösterir.
- Panel dosya adı, indirilen/toplam boyut, belirsiz boyutlu ilerleme ve son durumu gösterir.
- Devam eden iş iptal edilebilir. Sunucu destekliyorsa kesilen iş için **Devam et** görünür.
- Tamamlanan dosya yalnız **Klasörde göster** ile bulunur; otomatik çalıştırılmaz/açılmaz.
- Gizli olabilecek kaynak URL ve sorgu parametreleri renderer'a veya geçmişe gönderilmez.
- Aynı anda en fazla sekiz indirme izlenir, son 100 terminal kayıt bellekte tutulur; kayıtlar uygulama kapatılınca silinir.
- Devam eden indirmeler varken uygulama kapanışı kullanıcı onayı ister.

## Sınırlar

İndirmeler uygulama yeniden başlatıldığında geri yüklenmez. Sunucunun yeniden başlatılabilir indirme koşulları (range, ETag ve Last-Modified) yoksa kesilen iş kaldığı yerden devam edemez.

## Doğrulama

`tests/browser-downloads.test.js`; yaşam döngüsü, güncelleme birleştirme, aktif/kayıt sınırı, kesinti-devam, iptal, dosya varlık kontrolü, güvenilmeyen IPC göndericisi, HTML benzeri dosya adı ve eski liste yanıtı yarışını kapsar. Electron'un gerçek kaydetme penceresi ve ağ indirmesi manuel uygulama testine bırakılmıştır.
