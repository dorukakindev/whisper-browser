# Kaynağa özel telaffuz ve dublaj sonu — 1 Kasım 2026

Başlangıç `228e7b8cbeee0cdbdc75d186a0f255e944cbe894`; ürün commit'i `f95621302825cf66e286d25403c34833332cd438`.
Dal `codex/dub-pronunciation-repair`. Önceki [gerçek kalite kabulünün](DUB_REAL_QUALITY_2026-11-01.md) devamıdır; aynı yedi özel ad uyarısı yedi yeni bug olarak sayılmaz.

## Uygulananlar

- Telaffuz sözlüğünde kaynak/genel kapsamı. Bilinen video kimliği kullanılır; bağımsız SRT'de dosya içeriği hash'i kullanılır. Kaynak kuralı eşleşen genel kuralı geçersiz kılar; diğer genel kurallar miras alınır. SRT ve genel ayar dosyası kaynak kaydıyla değiştirilmez.
- Kalite kartındaki özel ad uyarısından gelişmiş telaffuz alanına geçiş. Sonuç özetindeki inceleme eylemi ilk sorunlu grubu seçer. Tahmini okunuş otomatik kaydedilmez.
- Gerçek video süresi browser/oynatıcı → renderer isteği → main doğrulaması → Python `--source-duration` üzerinden aktarılır. SRT-only tahmini kaynak sonu yerine gerçek süre kullanılır; video gömme başlatılmaz. Bilinmeyen süre eski SRT davranışını korur.
- Doğal video sonunda zaten çalan, senkron haritasına yakın ve en fazla350 ms kalan ses tamamlanır.500 ms duvar saati sınırı vardır. Manuel duraklatma, kaynak değişimi, reklam ve büyük ses farkı devamı engeller; bitiş olayı yeni ses başlatmaz.
- Önceki grubu seçme/A-B dinleme akışı yeniden doğrulandı. Bu özellik zaten vardı; bu tur yeni icat edilmiş gibi sunulmaz.

## Hedefli kontroller

Yerel kanıtlar `tmp/dub-pronunciation-repair/` altında, Git dışında tutuldu.

| Kontrol | Sonuç / sınır |
| --- | --- |
| Altı mevcut Node dosyası: dub-service, warm-start, pronunciation, browser audio, mute ownership, sync-map | Her biri ayrı süreçte exit0 |
| Source pronunciation store, bounded ended tail, natural result |9 Node testi,0 kırmızı |
| Source duration parser, timing, generation quality |1+21+27 Python testi geçti |
| Değişen JS/Python syntax ve git diff --check |12 kontrol,0 hata |
| Windows dub-natural |13 görüntü; kaynak/genel sözlük geçişi, özel ad eylemi, TR/EN, dar ekran. Son çıktı `.uiprev/dub-natural-1793501725110`; kaynak sözlüğü ekranı gözle incelendi |
| Windows browser-dub-mute | Gerçek main/preload/webContents mute ve kaynak değişimi geçti; sentetik yerel çapraz kaynak iframe, canlı YouTube hesabı değil |
| Gerçek GPU grup A/B | İlk üretim, yalnız ikinci grubun yeniden üretimi, eski gruba dönüş geçti. Public A/B düğmeleriyle konum farkı<300ms, tek ses. Geri dönen tam WAV ilk üretimle SHA256 aynı;2 cache / 0 yeni grup. Son çıktı `.uiprev/take785-1793502210041-35036`; EN açık tema%125 görüntüsü gözle incelendi |

Regresyon testleri: kalıcı kaynak ayrımı, yerel kural önceliği, boş kayıtla mirasa dönüş, bozuk koleksiyonu koruma, birleşik100 kural sınırını yazmadan reddetme; iptal/reklam/kaynak değişiminde bitiş sesi; geçersiz süreleri üretim başlamadan reddetme. Sözlük koleksiyonu200 kaynak/1 MBile sınırlıdır. Yeni bağımlılık yok.

### Gerçek kaynak video sonu

Önceden indirilmiş kamuya açık `Me at the zoo` videosu kullanıldı; gerçek ffprobe süresi19.014 s. Eski SRT-only harita20.881 s varsayıyordu. Gerçek süreyle yalnız son grubun ham önbelleği değişti; ilk iki grup aynı hash ile korundu. Ardından konuşmayı tam koruyan1xazami ses hızıyla zamanlama, üç ham grubu da yeniden üretmeden yapıldı.

Gerçek Windows video/WAV decode ve üretim controller'ıyla seek/play/pause/sona kadar oynatma geçti. Üç örnekte haritaya göre fark yaklaşık6/18/127 ms; son bölümde video hızı~0.928x. Düzeltmeden önce ses18.993682 s'de duruyordu; sonra19.101063 s ile haritadaki19.1010625 s ses sonuna ulaştı. Kaynak video19.014 s'de son kareyi tuttu. `playback-result.json` ve `real-video.png` yereldir. Oynatma sessiz sınandı; insan kulağıyla doğallık kanıtı değildir. Canlı YouTube ağı/reklamları bu örnekle doğrulanmış sayılmaz.

### Yedi özel ad uyarısı

Önceki2 dakikalık Saturn çıktısının7 review grubunun tamamında özel ad eşleşmesi uyarısı vardı. Deneme sözlüğünde Cronus→Kronos, Gaia→Gaya, Saturn→Satürn, Uranus→Uranos kullanıldı; kişisel sözlüğe kaydedilmedi. Kısa kesitte bir grup ready oldu, diğeri Kronos/Kronus ASR farkıyla review kaldı. Bu, tüm özel adların doğru okunduğunu veya uyarıların tamamının sahte olduğunu kanıtlamaz. İnsan dinlemesi gerekir; doğrulama eşiği düşürülmedi.

## Ara başarısızlıklar ve doğrulanmayanlar

İlk GPU A/B koşusu ikinci üretimden sonra açıklamasız renderer rejection ile başarısız oldu (`take785-1793501732840-35460`). Neden kesinleştirilemedi. Sonraki testte reddedilen komutun bağlamını koruyan hata raporu eklendi; tanı koşusu ve asıl kullanıcı düğmeleriyle son koşu geçti. İlk başarısızlık silinmedi veya kesin olarak test düzeneği hatası ilan edilmedi.

İlk karma Node runner'ı eski asenkron dub-service dosyasında geç assertion'ı güvenilir raporlamadı. Dosya tek başına tekrar çalıştırıldı; aynı kaynağın artık özel sözlüğü kullanması gerektiği beklentisi düzeltildi ve genel dosyanın değişmediği ayrıca doğrulandı. Son standalone koşu geçti.

Tam npm test, CI sonucu, start.bat açılışı, uzun gerçek YouTube/hesap akışı ve insan kulağıyla kalite kazananı bu tur doğrulanmadı. API çağrısı yapılmadı; mevcut çeviri artefaktı kullanıldı. Uzun CI beklenmez. Kişisel uygulama kapatılmadı; ham ses/profil ve kişisel OFFLINE-MANIFEST teslim dışında.
