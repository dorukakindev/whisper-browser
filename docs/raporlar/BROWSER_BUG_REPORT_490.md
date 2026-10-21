# BROWSER_BUG_REPORT_490 — 20 yeni davranış hatası ve düzeltme

Repo: https://github.com/dorukakindev/whisper-browser
Dal: `codex/broad-bugs490` · [PR462](https://github.com/dorukakindev/whisper-browser/pull/462)
Başlangıç: `5ebf6ede8d969e4d502b257611e2f5c5568f84b1`.
Son ürün kodu: `a20ee190791ac5293060eb3cfcea67c92d473da8`.
Ana checkout ve origin/master: `957bbfe91edee709accb24624e9e945e7a7a2969`.
Önceki 489 bulguları tekrar sayılmadı. Bunlar kontrollü sınır örnekleridir;
hepsinin günlük kullanımda sık görüldüğü veya yüksek kritik olduğu iddia edilmez.

| No | Doğrulanan kök / önceki etki | Onarım ve kanıt |
|---|---|---|
| 490-01 | Transcript normalizasyonu null zamanı 0, Infinity zamanı sonsuz kabul edip AI kanıtına katıyordu. | Tip/sonluluk ve end>=start doğrulaması; 3 satırdan yalnız geçerli satır kalır. |
| 490-02 | Watched kapsamındaki position=Infinity tüm gelecek satırları uygun sayıyordu. | Geçersiz konum 0'a düşer; 100sn'deki spoiler kanıta girmez. |
| 490-03 | İleri/ters senkron dönüşümü null/boş/bool girdiyi 0 saniye sanıyordu; seek yanlış konuma gidebiliyordu. | İki dönüşüm de eksik/yanlış tür zamanı reddeder; sonlu sayısal dizgiler korunur. |
| 490-04 | Export cue doğrulaması boş/bool zamanları kabul edip hayalet başlangıç üretiyordu. | Export aynı sıkı zaman doğrulamasını kullanır; geçersiz tüm satırlar varsa açık hata. |
| 490-05 | Kullanıcı düzeltmesi tekrar uygulandığında baseTranslation kullanıcı metnine dönüşüyordu; özgün model metni/geri alma kayboluyordu. | Önceden override edilmiş cue'nun model base'i korunur; tekrar uygulama ve override kaldırma doğrulandı. |
| 490-06 | Bilinmeyen gelecek sync/edit şeması güncel şema gibi eşleşiyordu. | Açık desteklenmeyen sürüm reddedilir; sürümsüz eski girdi ve v1 korunur. v99 iki eşleşmede de false. |
| 490-07 | Aynı tarama yolunun iki kez gelmesi tek dosyayı iki aday sayıp ambiguous sonucu veriyordu. | Normalize yol kimliğiyle aday tekilleştirme; gerçek iki dosyanın belirsizliği korunur. |
| 490-08 | Toplu relink tüm platform yollarını lowercase karşılaştırıp POSIX /Media ve /media köklerini karıştırıyordu. | Windows sürücü/UNC kimliği case-insensitive; POSIX exact. Windows hedefinin özgün harfleri korunur. |
| 490-09 | Kök sınırı ham metin prefix'iyle denetlendiğinden old/../outside içeride sayılıyor, göreli hedef de kabul ediliyordu. | Nokta bileşenleri normalize edilir; mutlak kök/varsa mutlak hedef gerekir. Klasör girdisindeki çevre boşlukları korunmuş trim sözleşmesiyle temizlenir. |
| 490-10 | Infinity dosya boyutları güçlü mükerrer medya kanıtı sayılıyordu. | Yalnız sonlu pozitif boyut kanıt olur; iki Infinity kayıt grup oluşturmaz. |
| 490-11 | previousTime=null Number ile 0 oluyor, ilk ölçümde kısa cue bitişi otomatik pause/loop sanılıyordu. | Ölçüm yoksa doğal ilerleme kanıtı yok; ilk .6sn ölçümünde pause yok. |
| 490-12 | lead=0 falsy fallback nedeniyle .15sn oluyordu. | Açık 0 korunur; atlama tam sonraki cue başlangıcına gider. |
| 490-13 | Single-flight kuyruğunda bekleyen 0ms rerun, sonraki 100ms istek tarafından falsy kabul edilip geciktiriliyordu. | Yokluk null ile temsil edilir; minimum gecikme 0 korunur. Kontrollü timer/promise ile gerçek sıra testi. |
| 490-14 | Null GPU/RAM/disk/CPU ölçümleri Number(null)=0 ile grafikte sahte sıfır düşüşleri üretiyordu. | Eksik ölçüm null kalır ve sparkline'a katılmaz; iki null GPU örneği çizgi üretmez. |
| 490-15 | Çalışma alanında geçersiz aktif kimlik ilk sekmeye düşerken secondary eski aktif kimlikle kıyaslanıyordu; iki panel aynı sekmeye bağlanabiliyordu. | Secondary doğrulaması çözümlenmiş aktif kimlikle yapılır; fallback aktif=t ise secondary boş. |
| 490-16 | __proto__ adlı model için normal property ataması score nesnesinin prototype'ını değiştirip kaydı JSON dışında bırakıyordu. | Own data property tanımlanır; prototype değişmez, model kaydı taşınır. Bu yerel nesne davranışıdır; global prototype exploit iddiası yok. |
| 490-17 | Infinity batches olayı kayda yazılıp JSON'da null'a dönüşüyor, sonraki yüklemede kayboluyordu. | Geçersiz/safe-integer dışı iş sayacı daha girişte reddedilir. |
| 490-18 | Opsiyonel places:null bölümü ham property erişiminde TypeError ile tüm oturum export'unu kesiyordu. | Bozuk opsiyonel bölüm boş bölüm olarak normalize edilir; geçerli oturum korunur. |
| 490-19 | 500 kayıtlık intro/recap listesine yeni kayıt 501. olarak ekleniyor, sonraki normalize ilk500'ü aldığı için yeni kayıt kayboluyordu. | Dolu listede en eski kayıt çıkarılır; yeni kayıt normalizasyon/kalıcılık boyunca kalır. |
| 490-20 | Zaman haritasının izin verdiği küçük süre yuvarlaması, at() içinde stretch>=1 clamp'iyle çelişip segment sonunda sıçrama üretiyordu. | Gerçek oran kullanılır; küçük sıkışmada lineer yol süreklilik/monotonluğu korur, smooth uzatma yolu değişmez. 10→9.98sn ve .04→.01sn örnekleri. |

## Kanıt / doğrulama

`tests/report490-regressions.test.js`: 20 bağımsız davranış testi.
Ignore `tmp/report490/before` kopyası başlangıç ürün kodudur: **20 test, 0 geçti, 20 kırmızı**.
Son kod: **20/20 geçti**. Eksik require/syntax yerine gerçek assert farklarıyla kırıldılar.
Geçerli Windows kök harfleri, model base geri alma ve smooth harita monotonluğu da kontrol edildi.

Hedefli mevcut 11 dosya + yeni regresyon dosyası: Node runner 31/31 geçti.
Alanlar: session-package, subtitle-sync ve renderer, skip-segments, dub-sync-map,
translation-review-tools, queue-lifecycle, media-relink ve matcher,
job-helpers-31-35, playback-timing-fuzz.
Önceki report489 + yeni report490 + ci-determinism-ratchet: 31/31 geçti.
İzole Windows Electron bridge geçti. Değişen 10 JS + test + main/preload/renderer
syntax kontrolü ve git diff --check geçti. Yerel tam npm test tekrarlanmadı.

İlk şüphe olan çift sayıda ETA örneğinde üst medyan, mevcut testte açıkça
tanımlanmış muhafazakâr sözleşmeydi; değiştirilmedi ve bulgu sayılmadı.
Kapasite=0 resource örneği zaten boş liste üretiyordu; hata sayılmadı.

## Sınırlar

Windows CI son sonucu beklenmeden teslim ediliyor. Önceki CI'daki atomic-write-kill ve Python parallel
rescue testlerinin zamanlamaya duyarlı başarısızlığı bu turda değiştirilmedi.
Gerçek YouTube, ücretli sağlayıcı, GPU/model/DRM ve üretim profilinde start.bat
akışı çalıştırılmadı. Düzen/etiket/CSS değişmedi; görsel ürün testi yapılmadı.
POSIX/UNC sınırları Windows'ta saf yol fonksiyonlarıyla kontrol edildi;
gerçek POSIX dosya taşıma/silme yapılmadı. Yeni bağımlılık/kurulum/şema sürümü yok.
Önceki unmerged teslimler dalda korunur; master'a merge yapılmadı.

Ek çağrı noktası kontrolleri: browser-ai-context, browser-nine-features, browser-report86-regressions, library-maintenance-21-25, report474-regressions, report478-regressions ve report89-audit-regressions: 7 dosya, Node runner 25/25 geçti.

## Kullanıcının son teslim tercihi

Kullanıcı bu turda GitHub CI sonucunu beklemenin gerekliliğini sorguladı; her teslimi CI sonucuna bağlamadan, kısa hedefli yerel kontroller ve açık sınırlarla ilerleme tercihi benimsendi. [Windows koşusu](https://github.com/dorukakindev/whisper-browser/actions/runs/39385530070/job/118504430582) son kontrolümüzde çalışıyordu; nihai yeşil/kırmızı sonucu bu teslimde doğrulanmadı. Yerel 20 yeni regresyon, ilgili mevcut testler ve Electron bridge sonuçları yukarıdadır. CI kapatılmadı, test silinmedi.
