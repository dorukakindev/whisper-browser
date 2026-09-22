# Browser Bug Raporu 39 — Great Courses altyazı keşfi

Tarih: 2026-09-16
Başlangıç ürün kodu: `e929e9f92cbb9f7c746d0465c1b5f2c665879e80`
Kapsam: Great Courses oynatıcısında görünür `1-CC1` altyazısı varken uygulamanın “altyazı izi bulunamadı” demesi.

## Kullanıcı kanıtı

Ekran görüntüsünde `plus.thegreatcourses.com` oynatıcısının altyazı menüsü `1-CC1` izini gösterirken uygulama üst şeridi “Bu sayfada altyazı izi bulunamadı” durumunda kalıyor. `1-CC1` adı bant-içi CEA-608/708 olasılığını güçlendirir; fakat tek başına HLS, DASH veya kesin taşıma biçimi kanıtı değildir.

## Doğrulanan bulgular

### BUG-39-01 — P2 — Debugger geç bağlandığında manifest geri kazanılmıyordu

**Kök neden:** ağ yakalama güvenlik ölçümünden sonra başlıyor. Sayfa/player manifesti daha önce yüklediyse, mevcut kod yalnız sonradan gelen ağ yanıtlarını görüyordu. Oynatma başlaması ve periyodik iz taraması, `performance` kaynak geçmişindeki manifestleri aynı Electron oturumuyla tekrar istemiyordu.

**Kullanıcı etkisi:** manifestte bildirilen HLS gömülü CEA veya ayrı HLS/DASH altyazı izleri uygulamaya hiç ulaşmayabiliyor; sitede altyazı görünürken uygulama boş kalabiliyor.

**Düzeltme:** `src/main.js` içinde tüm aynı-sekme karelerinin Performance Resource Timing geçmişi ve medya kaynakları sınırlı biçimde taranıyor. Bulunan `.m3u8`, `.mpd` ve dar `master/manifest/playlist` adayları mevcut oturumla, mevcut URL/boyut/yönlendirme korumaları altında yeniden alınıp mevcut manifest işlem hattına veriliyor. Kurtarma güvenlik ölçümü sonrası, oynatma başladığında ve seyrek periyodik turda çalışıyor. Aday başına iki deneme, zaman aralığı, 8 aday ve 96 kayıt sınırı var. Gezinme kuşağı değişirse eski sonuç yeni sayfaya yazamıyor. Uzantısız adreslerde HLS/DASH türü gövde imzasından belirleniyor.

### BUG-39-02 — P2 — Aynı sekmedeki iframe keşif sinyali reddediliyordu

**Kök neden:** `browser:discovery-signal` yalnız `senderFrame === mainFrame` koşulunu kabul ediyordu. Video oynatıcı aynı WebContents içindeki bir alt karedeyse preload sinyali kaynağına bakılmadan atılıyordu.

**Kullanıcı etkisi:** iframe içindeki video oynatmaya veya text track değişimine başladığında güvenilir isolated-world probu tetiklenmiyor; doğrudan iz keşfi gecikiyor veya kaçabiliyordu.

**Düzeltme:** ana kare ile birlikte yalnız o ana karenin `framesInSubtree` ağacındaki gerçek alt kareler kabul ediliyor. Başka WebContents/sekme veya sahte frame kabul edilmiyor; etkin sekme ve gezinme kapıları korunuyor.

## Doğrulanan fakat bu turda değiştirilmemiş sınırlar

- `browserInstrumentationPending` fail-closed güvenlik kapısı debugger, capture ve text-track probunu bekletiyor. Bu davranış gerçektir; fakat kullanıcının ekran görüntüsü bunun takıldığını kanıtlamaz. Güvenlik kapısı kanıtsız gevşetilmedi.
- DASH video AdaptationSet içindeki CEA bildirimi için özel tam-yakalama desteği bulunmadı. Great Courses akışının DASH olduğuna dair MPD/ağ kanıtı olmadığı için spekülatif bir decoder eklenmedi.
- Manifestte bildirilmeyen bant-içi CEA için rastgele segment indirme/probe yolu eklenmedi. Bu hem ağ maliyetini hem false-positive yüzeyini büyütür; önce gerçek manifest/tanı kanıtı gerekir.

## Doğrulama

- `node tests/browser-manifest-recovery.test.js` — geçti.
  - aynı oturumla manifest geri alma ve başarı sonrası dedupe
  - pending güvenlik kapısında işlem yapmama
  - gezinme yarışı ve eski işin yeni busy durumunu temizleyememesi
  - HLS/DASH uzantı ve gövde imzası ayrımı
  - ana kare/alt kare kabulü ve yabancı kare reddi
  - güvenlik sonrası, oynatma ve periyodik bağlantılar
- `node tests/browser-cloudflare-compat.test.js` — 16/16 geçti.
- `node tests/browser-overlay-readiness.test.js` — geçti.
- `node tests/browser-subtitles.test.js` — 79/79 geçti.
- `node tests/browser-cea-full-capture.test.js` — geçti.
- `npm test` — exit 0; son satır `Tüm testler geçti`.
- `npm run test:electron-bridge` — exit 0; güvenilir köprü, TextTrack/EME ve gerçek iframe yaşam döngüsü geçti.
- `python -m py_compile backend/transcribe.py` ve üç JavaScript sözdizimi kontrolü — geçti.

## Açık gerçek-site kabulü

Bu oturumda kullanıcının kimlik doğrulamalı Great Courses oturumu otomasyonla açılmadı. Bu nedenle kod yolları ve regresyonlar doğrulanmış olsa da “Great Courses kesin düzeldi” denemez. Kabul testi: yakalama açıkken ilgili ders sayfasını yenilemek, videoyu başlatmak, `1-CC1` seçmek ve uygulamada manifest/CEA planının oluşup tam zaman çizelgesinin yayınlandığını görmek. Başarısızsa “Ayrıntılar” tanısı manifest türünü ve hangi aşamada durduğunu ayırmalıdır.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

1. **Bulgu:** geç bağlanan yakalama geçmişte yüklenmiş manifesti kaçırabiliyordu. **Düzeltme:** sınırlı Performance Resource Timing geri kazanımı, aynı oturum fetch'i, mevcut manifest işlem hattı ve kuşak koruması eklendi. **Doğrulama:** yeni davranış testi + tam paket + Electron köprüsü geçti.
2. **Bulgu:** gerçek aynı-sekme iframe discovery sinyali ana-frame eşitlik kontrolünde atılıyordu. **Düzeltme:** yalnız ana karenin doğrulanmış alt-frame ağacına izin verildi. **Doğrulama:** main/child/outsider deterministik testleri geçti.
3. **Ret:** pending güvenlik kapısını süre dolunca fail-open yapmak reddedildi; ekran görüntüsü kök nedeni kanıtlamıyor ve sayfaya güvenilir köprü açma güvenliğini zayıflatır.
4. **Ret:** DASH CEA ve bildirimsiz segment taraması bu site için kanıtsız olduğundan eklenmedi. Tanı/manifest kanıtı çıkarsa ayrı, gerçek fixture'lı iş olarak ele alınmalı.
5. **Sınır:** gerçek site hesabıyla son kullanıcı kabulü yapılmadı; bu sınır tamamlandı diye gizlenmedi.
