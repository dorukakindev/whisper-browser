# Rapor 412 — VoxCPM2 cümle grupları ve doğru zamanlama raporu uygulandı

2026-10-14. R411 sonrasında kullanıcı uygulamayı istedi. Whisper'ın browser
ses seçimi değişmedi; mevcut dış VoxCPM2 altyazı aracı güncellendi.
Kaynak kopyası `tools/voxcpm2/` altında sürüm kontrolünde. Kişisel medya yok.

## Değişiklik

- Yakın cue'lar metin kaybetmeden cümle gruplarında sentezlenir. Hedef sınırlar
  250 karakter/12sn; büyük boşluk ve görünür konuşmacı değişimi korunur. Çok
  kısa bitiş cue'u uygun olduğunda önceki gruba alınır. SRT dosyası değiştirilmez;
  kaynak cue kimlikleri manifestte saklanır. `--gruplama satir` ayrı satır yolu.
- Azami tempo varsayılanı 1.30→1.15. Gerçek boşluktan en çok 1sn yararlanılır;
  sonraki grup başlangıcı/video sonu aşılmaz. Uzun aday yalnız o grupta mevcut
  retry sınırında yeniden üretilir; geçerli/sığan aday öncelikli seçilir.
- Hâlâ uzun konuşma varsayılan `--tasarsa hata` ile raporlanır, nihai WAV
  yazılmaz. `--tasarsa kirp` açık opt-in. Tempo, gerçek kesilen örnek sayısı,
  sessiz padding ve taşma ayrı metadata'dır; eski yanlış “0 kesildi” sayacı düzeldi.
- Yeni v2 önbellek anahtarı ve çıktı isimleri; önceki parça/çıktılar silinmez.
  Örnek limitli varsayılan çıktı adı ayrıca `_ornekN` içerir. UTF-8/Türkçe
  dosya yolu, SRT kesirli saniye yorumlama ve boş kaydırma sonucu kontrol edildi.
- Windows'ta yalnız bu sürece scoped pread ağırlık adaptörü; kurulu kitap/paket
  dosyası değişmez. Server hazır olmasını bekleyen API ve 120sn timeout eklendi.
  Ölen alt süreç artık kuyrukta sonsuz bekleme yerine açık hata döndürür.
- Dublajın bellek profili: paralellik 4, model/batch token sınırı 2048,
  üretim sınırı 1024. Referans/Hi-Fi yöntemi, cfg 1.65, temperature 0.8 ve
  15 adım korunur. Token/parallel sınırları CLI'dan ayarlanabilir.

## Gerçek kısa üretim kanıtı

Kullanıcının mevcut Türkçe SRT ve ham ses+eşleşen transcript'iyle yalnız ilk
11 cue işlendi; yaklaşık 43sn kaynak zaman aralığı. Son plan 7 grup.

- Gerçek nano-vLLM / VoxCPM2 / CUDA üretimi başarılı; yaklaşık 1.2 dakika.
- Nihai WAV 45.14sn; kaynak sonundan sonra 2sn sessiz pay içerir.
- 5 grup tempo düzeltmesi, 0 konuşma kırpması, 0 taşma. En yüksek gerçek
  tempo yaklaşık 1.14962. Bu sayaçlar zamanlama kesmesini ölçer; TTS modelinin
  bütün kelimeleri doğru söylediğini otomatik olarak kanıtlamaz.
- Aynı örneğin cache koşusu yeni GPU üretimi açmadan zaman çizelgesini kurdu.
- Önceki hazır tam satır çıktısından ilk 45.14sn ayrı karşılaştırma dosyasına
  alındı. Eski dosya korunuyor. Bu tam kontrollü A/B değildir: eski çıktının
  normalizasyonu/üretim koşulları yeniden ölçülmedi.
- `tmp/dub-ab/cumle.wav`, `satir-eski.wav` ve manifest/loglar Git dışında.
  Ses dinlenmedi; algısal doğallık kullanıcı dinlemesiyle değerlendirilecek.

İlk canlı denemeler hazır olma beklemesinde takıldı. Tek stack tanısı
multiprocessing kuyruk bekleyişini gösterdi; hazır olma API'si eklendiğinde
alt süreçte KV cache -78 blok hatası görünür oldu. 0.65 bellek oranı ve eski
büyük ısınma penceresi yeterli değildi. Küçük denemede 1024 model penceresi ile
varsayılan 2000 üretim tokenı da uyuşmadı; açık üretim sınırı eklendi. Son başarılı
deneme yukarıdaki dublaj varsayılanlarını kullanır. GPU RTX 4070 SUPER, 12GB.
Yalnız kendi başarısız test süreçleri sonlandırıldı; başka uygulamaya dokunulmadı.

## Kontroller / sınırlar

`tests/test_dub_timing.py` 4/4: metin/kimlik koruma, durak/speaker/boyut sınırları,
kısa bitiş bağlamı, zaman sırası/video sonu sınırı, gerçek ffmpeg tempo,
opt-in kırpma metadata'sı ve sessiz padding ayrımı. Vox venv `pip check` temiz;
Python derleme ve diff kontrolleri geçti. Deploy edilen script/helper ile repo
kopyalarının SHA256 değerleri eşleşti. Dış script eski sürümü `.bak` yedeğinde.
Yeni bağımlılık kurulmadı; paket/driver/GPU güvenlik ayarı değiştirilmedi.

Tam 22dk yeniden üretilmedi; video mux, ses dinleme, kelime hizalama ve bütün
Windows/GPU koşulları doğrulanmadı. Gruplar kendi başlangıç/zaman penceresine
oturur; grup içindeki her kelime özgün cue saniyesine ayrı hizalanmaz. SRT'den
browser düğmesiyle otomatik TTS entegrasyonu bu görevin kapsamında eklenmedi.
Whisper tam test paketi/UI testi çalıştırılmadı; uygulama kodu değişmedi.
GitHub Actions hesap engeli nedeniyle uzak Windows CI sonucu yok.
