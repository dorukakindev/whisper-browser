# VoxCPM2 altyazı dublaj aracı

Bu dosyalar Whisper uygulamasına TTS bağımlılığı eklemez. Mevcut VoxCPM2
ortamının `altyazi_oku.py` güncellemesidir; `dub_timing.py` aynı klasöre konur.
Çalışan kitap motoru ve kişisel ses referansları değiştirilmez.

Motor klasöründen mevcut venv ile:

```powershell
.\.venv\Scripts\python.exe altyazi_oku.py ceviri.srt referans.wav --transcript referans.txt --mode hifi
```

Repo içindeki kaynak kopyasını doğrudan çalıştırmak için `VOXCPM_ROOT` mevcut
motor klasörünü göstermelidir. `kitap_ortak.py`, `kitap_voxcpm.py` ve nano-vLLM
bağımlılıkları o ortamdan alınır; bu klasör bağımsız motor kurulumu değildir.

Varsayılan `--gruplama cumle`: yakın devam satırları cümle gruplarına alınır.
Grup hedefleri 250 karakter, 12sn üst sınır; 600ms'den büyük boşluk ve görünür
konuşmacı değişimleri birleştirilmez. Uzun tek cue bölünmez; orijinal SRT
değişmez. Her grupta kaynak cue kimlikleri manifestte korunur. Bu grup saati
hizalamasıdır; grup içindeki her kelimeye özgün cue zamanı garanti edilmez.

- `--gruplama satir`: ayrı satır üretimi.
- `--plan`: GPU üretmeden grup planı. `--limit 11`: ilk 11 kaynak cue ile örnek.
- `--max-hiz 1.15`: varsayılan azami tempo. Süre yetmediğinde üretim yalnız
  o grup için farklı seed ile mevcut `--retry` sınırında tekrar denenir.
- `--tasarsa hata`: varsayılan; konuşma hâlâ sığmıyorsa timing raporu yazılır,
  nihai WAV yazılmaz. Mevcut çıktılar silinmez. Bu durumda ses kalitesinin
  korunması için metin/süre veya ilgili grup ayrıca incelenmelidir.
- `--tasarsa kirp`: açıkça izin verilen kırpma; sayısı ve kesilen örnek sayısı
  raporda saklanır. Sessiz padding temizliği konuşma kesilmesinden ayrı sayılır.
- `--bosluk-pay-ms 1000`: grubun ardından kullanılabilecek en çok boşluk;
  sonraki grubun başlangıcı ve varsa video sonu aşılmaz.
- `--grup-max-sn`, `--grup-max-karakter`, `--grup-bosluk-ms`: plan sınırları.

Model ayarları korunur: 15 adım, cfg 1.65, temperature 0.8. Yeni planlar v2
önbellek anahtarı kullanır; eski cue önbellekleri silinmez. Varsayılan çıktı
adında `cumle`/`satir` yer alır; eski ses dosyası ezilmez. `timing_report.json`
parça önbelleğinde, ayrıntılı zamanlama ve kaynak kimlikleri nihai manifestte.
Üretilen kişisel ses/manifest/transcript dosyalarını Git'e koymayın.

Windows dublaj profilinde paralellik 4, model/batch token sınırı 2048, üretim
token sınırı 1024. `--eszamanli`, `--max-model-len`, `--batch-tokens`,
`--max-generate-length` ile değiştirilebilir. Bunlar modelin ses referansı veya
cfg/temperature/adım ayarını değiştirmez. Küçük token penceresinde referans ve
hedef metin + üretim bütçesi pencereye sığmalıdır. Windows'ta yalnız bu süreçte
pread ağırlık yükleme kullanılır; kurulu paket dosyaları değiştirilmez. Motor
hazırlığı 120sn ile sınırlanır ve ölen alt süreç için hata açıkça bildirilir.
