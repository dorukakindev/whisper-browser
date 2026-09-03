# Denetim sonrası düzeltmeler — 3 Eylül 2026

Başlangıç: `49db7cb`, `codex/browser-integration-2026-09-01`.
Bu belge bütün eski raporların kapatıldığı anlamına gelmez. Son iki rapor eski
satır numaraları ve artık değişmiş uygulama davranışları içeriyor.

## Bu partide düzeltildi

1. **Gizli anahtar silme:** işletim sistemi kasası kullanılamazken silme isteği
   açık ayarlarda bir alan adı işaretiyle korunur. Kasa açılınca eski anahtar geri
   yüklenmez; yeni anahtar ancak başarıyla kaydedilirse işaret kaldırılır.
   Kasa açılamadığı için boş gösterilen, kullanıcının değiştirmediği alanlar
   silme talebi sayılmaz. Gizli değerler açık ayarlara yazılmaz.
2. **Ayar dışa aktarma:** normal dışa aktarma, iç içe alternatif API key/token/
   secret alanlarını da ayıklar. Gizli alan yolu yardımcıları prototip anahtarlarını reddeder.
3. **Altyazı parmak izi:** ilk/son örnek yerine tüm cue metinleri, başlangıçları
   ve bitişleri akış halinde özetlenir. Ortadaki değişiklik artık kaybolmaz.
4. **NDJSON:** NaN/Infinity ölçümleri geçerli JSON `null` olur. Sonlu olmayan
   zamanlı tekil segment gösterilmek yerine uyarı üretir. Bu, tüm motor çıktısının
   anlamsal doğruluğu için garanti değildir.
5. **LLM son düzeltme sayacı:** eksik, boş, yanlış tipli veya reddedilmiş yanıt
   başarılı sayılmaz. Kaynak metin korunur, failed sayısı ve uyarı doğru çıkar.
6. **Devam kaydı:** imzada kanonik kaynak yolu, boyut ve nanosaniyelik değişiklik
   zamanı vardır. Bu bir içerik hash'i değildir. Geçersiz zaman/metin içeren
   checkpoint reddedilir. NaN yazma hatası önceki sağlam dosyayı bozmaz.
   Eski v2 iş imzaları yeni v3 ile eşleşmez; mevcut dosyalar silinmez.
7. **JSON'dan yeniden üretim:** tek bir bozuk segment bütün işi çökertmez.
   Sonuçta atlanan sayısı görünür; geçerli metin ve zamanlar korunur. Bozuk
   kök/dil/ölçüm/kelime alanları da kontrol edilir.
8. **Edinme planı:** onayın geri alınması blocked olarak yansır; kazanan yol
   diğer çalışan yolları skipped yapar. Bu durum makinesi değişikliğidir,
   tek başına gerçek ASR sürecini durdurduğu iddia edilmez.
9. **Oturum:** ayrıştırılabilen ama geçersiz JSON yapısında `.bak` denenir.
   Bilinçli boş oturum geri diriltilmez. 24 sekme sınırında aktif sekme korunur;
   bozuk ana dosya sağlam yedeğin üstüne kopyalanmaz.
10. **Gömme kurtarması:** çalışan gömme sırasında recover/discard reddedilir.
    Asenkron inceleme sırasında başlayan yeni iş de tekrar kontrol edilir;
    eski FFmpeg hâlâ çalışıyorsa kurtarma dosyaları korunur.
11. **Süreç iptali:** Windows taskkill yanıt vermezse 5 saniye sonra tek seferlik
    yedek iptal uygulanır. Çocuk süreç kapanmadan iş sahipliği bırakılmaz.
12. **Native web katmanı:** gezinme modalı delerek görünümü açamaz. Yer imleri/
    geçmiş paneli de ortak gizleme kontrolüne katıldı; bir panel kapanırken
    açık kalan modalın üstüne web görünümü dönmez.
13. **Widevine:** hazırlık arka planda başlar, pencere 15 saniyelik hazırlık
    beklemesine takılmaz. Korumalı gezinmenin kendi hazır olma beklemesi korunur.
14. **HLS forced izi:** görünen etikete `(zorunlu)` eklenir; mevcut iz saklama
    ve seçici yolları bu etiketi taşır. Otomatik dil/sıralama politikası değiştirilmedi.

## Son iki raporun değerlendirmesi

| Rapor maddesi | Güncel durum |
| --- | --- |
| 1 — her karede tüm DOM taranıyor | Eski genelleme: ayrı overlay controller adayları ve değişiklik takibini kullanıyor. |
| 2 — web odaktayken kısayollar | Kabuk dinleyicileri var; native web odağına köprü yok. Sonraki iş; site yazı alanlarını ve kendi kısayollarını bozmayan test gerekli. |
| 3 — HTML tam ekran bounds | İlgili native tam ekran olay yönetimi eksik; gerçek Electron senaryosu doğrulanmadan kapatılmadı. |
| 4 — popup | HTTP(S) allow politikası mevcut. Giriş/OAuth akışlarını koruyan ayrı izin politikası gerekiyor; bu partide değiştirilmedi. |
| 5, 7 — indirme/sağ tık/bul | Eksik yetenekler. Zoom zaten var; web odağı bağlantısı ayrı sorun. |
| 6 — altyazı klasörü hiç temizlenmiyor | Yanlış: sweep ve asset bakım yolları mevcut. |
| 8 — senkron izin denetimi | Request handler var, check handler yok. DRM/clipboard ile birlikte ayrı doğrulama gerekiyor. |
| 9 — yoklama | Sabit zamanlayıcılar var; değişmeyen medya olayını göndermeme ve busy koruması da var. Tamamen korumasız değil. |
| 10 — cue aktarım maliyeti | Payload hâlâ serileştiriliyor. Ancak artık bütün frame'lere aynı biçimde gönderildiği iddiası güncel değil; trusted main yolu var. |
| 11 — sayfa köprüsü/gizlilik | Ağ hook'u sayfa dünyasında; manga/overlay artık izole preload köprüsünde. Çizilen DOM metni yine siteden gizli kabul edilemez. |
| 12–14 — panel/modal/açılış | Yukarıdaki 12–13 ile düzeltildi. “Her modal bozuk” genellemesi yanlıştı; ortak modal kontrolü zaten vardı. |
| 15 — HLS ilerleme/iptal | Ayrı UX ve iptal incelemesi; bu partide tamamlandı sayılmadı. |
| 16 — forced | Etiket düzeltildi. |
| 17 — varsayılan dil/iz | İlk iz fallback'i mevcut. Kullanıcı seçimini ezmeyen tercih politikası sonraki iş. |
| 18 — cue sayısı görünmüyor | Yanlış: seçeneklerde satır sayısı zaten var. |
| 19 — native confirm | Eski iddia: özel uygulama diyaloğu mevcut. |
| 20 — adres input türü | `url` kullanılıyor; form doğrulamasının gezinmeyi engellediği bu raporla kanıtlanmış değil. Küçük cila olarak değerlendirilebilir. |
| 21 — ekran okuyucu sinyali | Öncelik/bekletme destekli sinyal var. Gerçek ekran okuyucu testi yapılmadı. |
| 22 — unsubscribe | Tek SPA aboneliği tek başına sekme başına sızıntı kanıtı değil. |
| 23 — meşgulken izi sonra yükleme | Bekleyen eylemi otomatik yürütme yok; yeni kullanıcı niyeti/kuyruk özelliği olarak açık. |

Otomatik pilot, reklam engelleme, CC tıklaması, gizli mod, medya devri ve diğer
öneriler silinmedi veya yapılmış sayılmadı; ayrı özellik kapsamlarıdır.
Yer imi arama/klasör, overlay sürükleme ve görünüm ayarları zaten mevcut.

## Doğrulama ve sınırlar

- `npm test`: 40 Node test dosyası ve 122 Python testi.
- Yeni davranış testleri: 9 audit-followup, 3 IPC yarışı/başlangıç testi,
  1 iptal zaman aşımı testi, 4 Python regresyon testi.
- JavaScript sözdizimi ve Python derleme kontrolü; `git diff --check`.
- Testlerde API ve süreç/dosya olaylarının kontrollü taklitleri kullanıldı.
  Gerçek çeviri isteği, model indirme veya Electron açılışı yapılmadı.
- Native panel çizimi ve DRM oynatma gerçek oturumda henüz doğrulanmadı.
- Altyazı modeli `gemini-3.8-flash`, manga modeli ve sağlayıcı ayarları değiştirilmedi.
- Önceden bulunan iki untracked denetim raporu bu partinin commit kapsamına alınmadı.
