# BROWSER_BUG_REPORT_473 — Eksik altyazı önbelleği kayıtları canlı dosya sildiriyor

## Doğrulama

`src/browser-subtitle-files.js` LRU indeksi ilk taramadan sonra bellekte
kalıyor. Bir dosya dışarıdan silinirse kayıt kotada kalıyordu. unlinkSync
ENOENT hatası da yutulup kayıt korunuyordu. Sonuç: limit 3, başlangıçta 5
kayıt ve dışarıdan silinmiş 2 dosyada kalan 3 dosyadan 2'si gereksiz silindi.
Bu cache dosyalarının kaybıdır; kullanıcı tarafından seçilmiş özgün altyazı
bu mağazanın dosya adı/dizin kapsamı dışındadır.

## Düzeltme

Kota aşılınca silmeye başlamadan indeksin tüm kayıtları stat ile kontrol
edilir. Yalnız ENOENT kayıtları elenir; izin/kilit hataları korunur. Dosya
stat ve unlink arasında kaybolursa unlink ENOENT de indeksi temizler.
Olmayan dosyalar removed sayacında gerçek silme sayılmaz.

İki kontrollü fixture eski/yeni LRU konumlarında eksik kayıtları kapsar.
Eski kod repro: removed=2 (beklenen 0). Yeni kod: 2/2 geçti. Mevcut
browser-subtitle-files 5 testi de geçti; kilitli dosyayı yeniden deneme ve
etkin dosya koruma davranışı korundu. Windows Node, node --check ve git
diff --check geçti. Tam paket/CI bekleme/start.bat/gerçek YouTube yok.
UI, bağımlılık, kurulum ve şema değişmedi.
