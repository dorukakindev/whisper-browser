# Kaynak soak testi

Uzun tarayıcı oturumunu yerel bir fixture ve geçici `userData` profiliyle hızlandırılmış olarak tekrarlar. Gerçek izleme kütüphanesine, çerezlere, geçmişe veya ayarlara dokunmaz. Electron her zaman GPU çalışma ortamını hazırlayan `start.bat` üzerinden açılır; fixture yalnız `http://127.0.0.1:<port>` kökeninden kabul edilir.

```powershell
npm run test:soak
node tests/run-resource-soak.js --cycles=600 --warmup=30 --output=C:\Temp\whisper-soak.json --keep-profile
node tests/run-resource-soak.js --smoke --cycles=8 --warmup=2 --output=C:\Temp\whisper-soak-smoke.json
```

Varsayılan anlamlı koşu 20 ısınma ve 400 ölçüm döngüsüdür. `--smoke` yalnız Electron, fixture, altyazı yakalama ve rapor üretme yolunu kısa sürede doğrular; 200'den az döngü kaynak bütçelerinin geçtiğine dair kanıt sayılmaz.

Her döngü etkin tarayıcı sekmesini yeni bir fixture sayfasına götürür, iki cue içeren VTT yanıtını yakalar, belirli aralıklarla oynatıcı/tarayıcı alanları arasında geçiş yapar ve geçici izleme kütüphanesindeki dönen fixture kayıtlarından birini günceller. Örnekler ısınma sonrasında başlangıç, dört kararlı ara nokta, final ve tarayıcı görünümü kapatıldıktan sonraki temizleme noktalarında alınır.

Rapor şunları içerir:

- ana süreç RSS/heap ve toplam Electron working set,
- ana renderer ile etkin web renderer heap değerleri,
- renderer, fixture ve Electron event listener sayıları,
- ana süreç ve renderer timer sayıları ile koşu içi timer tepesi,
- GPU process sayısı ve working set,
- senkron disk okuma/yazma sayıları; veri güvenliği için yapılan kütüphane
  yedek okuması döngü başına ayrıca sınırlandırılır,
- `browser-subtitles` dosya sayısı ve bayt toplamı,
- altyazı yakalama başarı oranı ve kaynak bütçesi sonuçları.

Bütçeler `src/resource-soak.js` içindeki `DEFAULT_RESOURCE_SOAK_BUDGETS` nesnesinde sürümlenir. Proje sahipli timer'lar finalde en fazla +2, koşu içinde en fazla +12 olabilir. Electron iç timer'ları ayrı izlenir (final +32, tepe +64); ürün timer bütçesine karıştırılmaz. Bir bütçe değiştirilecekse aynı donanımda tekrarlı anlamlı ölçüm ve gerekçe gerekir; yalnız testi geçirmek için gevşetilmemelidir.
