# Rapor 414 — Dublaj süre ve kalıcı kayıt eksikliği

2026-10-14. Python üretici toplam süreyi stdout'a yazıyordu; Electron yalnız kısa hata kuyruğunu bellekte tutuyordu. Üretim süresi kalıcı kayıtta ve arayüzde yoktu.

Çözüm: userData/dub-logs altında her yeni iş için JSON özet ve NDJSON olay kaydı. Başlangıç/bitiş ISO zamanı, monoton saatle toplam saniye, grup ilerlemesi, örnek seçimi, çıkış kodu ve done/cancelled/error sonucu saklanır. Zamanlama ve motor süre özetleri olay kaydına alınır; ham altyazı/standart çıktı dökümü kaydedilmez. Başlangıçta running özeti yazılır; uygulama zorla kapanırsa bu kayıt tamamlanmış sayılmaz. Yazma hatası ses üretimini bozmaz, arayüze logError ile bildirilir.

Arayüzde geçen süre ve bitince Üretim kaydını aç düğmesi eklendi. Süre motor yüklemeyi ve son ses birleştirmeyi kapsar. Mevcut çalışan eski uygulama işlerine geriye dönük kayıt eklenmez; yeniden açtıktan sonra başlayan işler içindir.

Kanıt: dub-service testi tamamlanma/iptal/hata JSON içeriklerini, ilerleme ve motor süre özetini, kişisel altyazının kayda geçmemesini ve yazılamayan log klasöründe sesin yine tamamlanmasını doğruladı. ui-locale, preload/innerHTML ratchet, sözdizimi/diff geçti. Gerçek Windows Chrome renderer/CSS + kontrollü API ile 1400/720px görünüm, final 65sn→01:05 ve kayıt düğmesi doğrulandı. Yeni gerçek GPU/start.bat/YouTube uçtan uca ve tam test paketi koşulmadı; Windows CI önceki hesap engeli nedeniyle doğrulanmadı.
