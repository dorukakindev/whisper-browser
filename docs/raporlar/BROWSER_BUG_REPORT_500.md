# Rapor500 — Yerel referans seçimi ve bağımsız metin ses stüdyosu

2026-10-21. Dal: `codex/broad-bugs499` (önceki teslim ve bu takip işi birlikte korunuyor).
HEAD: `bd10e8f3a4436fe071cf81470db8754724da3fa5`.
Bu rapordaki ürün değişiklikleri henüz commit/push edilmedi.

## Doğrulanan mevcut durum ve değişiklik

1. Yerel WAV seçimi yalnız kapalı “Ses ve motor ayarları” içinde `dubChooseVoice`
   üzerinden erişilebiliyordu. Görünür referans hazırlama paneli yalnız video
   bağlamıyla çalışıyordu. Yeni **Yerel ses seç** düğmesi native seçiciyle
   WAV/MP3/FLAC/M4A/OGG/OPUS/AAC/WMA kaynağı seçer. Aralık başlangıcı 0 olur;
   3–30 saniye seçilip mevcut ffmpeg/Whisper hazırlama ve kalite hattı kullanılır.
   Açık video gerekmez. Döküm kontrolünden sonra **Bu sesi kullan** mevcut kalıcı
   referans ayarını etkinleştirir. **Açık videoyu kullan** ile kaynak geri çevrilir.
   Seçici önce/sonra üretim kilidini kontrol eder ve yalnız seçilen dosyayı grant eder.
2. Metin/TXT düğmesi dış motor klasörünün eski `arayuz.py` dosyasını başlatıyordu.
   Bu dosyanın neden bozuk olduğu incelenip onarıldı iddiası yok; kullanıcı o
   arayüzü değiştirmemeyi istedi. Düğme artık repo içindeki `text_studio.py`
   arayüzünü mevcut motor/reference/config/storage parametreleriyle açar.
3. Repo kökündeki **ses-studyosu.bat** aynı stüdyoyu Electron açmadan çalıştırır.
   Standart Python Tkinter, mevcut nano-vLLM okuyucusu ve VoxCPM2 venv/modeli
   kullanılır; dış kaynaklar değiştirilmez, yeni motor veya model indirilmez.

## Stüdyo

- Metin yazma/TXT açma, referans WAV ve yanındaki TXT dökümünü yükleme/düzenleme.
- Adım 15, paralellik 4, CFG 1.65, temperature 0.8, durak 0.25 s varsayılanları;
  kullanıcı değiştirebilir. Hi-Fi dökümlü klonlama kullanılır.
- Üretim, parça ilerlemesi, durdurma, dosyayı varsayılan oynatıcıda dinleme,
  Sesler klasörünü açma. Windows iptali taskkill /T ile alt süreç ağacını hedefler.
- Her üretim benzersiz iş klasörü ve çıktı adı alır. Metin, referans dökümü,
  ayarlar, events.log ve job.json `Downloads/Sesler/Girdi/Metin/<iş>/` altında;
  WAV `Downloads/Sesler/Çıktı/` altında. Motorun kendi parça cache'i mevcut
  okuyucunun kendi cache politikasına tabidir.
- Sayısal tercihler ayrı `text-studio-settings.json` içine yazılır. Ana
  dub-settings.json ve kaynak referans dosyaları değiştirilmez.

## Doğrulama

- `node tests/voice-reference-ui.test.js`: video bağlamı yokken yerel MP3 seçimi,
  0–10 aralığının aktarılması, hazırlanmış sesi kullanma ve videoya dönüş geçti.
  Mevcut preview/draft/iptal/hata/listesi sıralama senaryoları korundu.
- `node tests/voice-reference.test.js`: native picker iptali, seçilen dosyanın
  grant edilmesi ve üretimde kilit; mevcut hazırlama/iptal/temizlik kontrolleri geçti.
- `node tests/dub-service.test.js`: yeni repo stüdyosu yolu, config/motor aktarımı,
  stüdyo üretim kilidi ve geç import hatası bildirimi geçti. Eski arayüzü açma
  beklentisi yeni davranışa göre değiştirildi, kilit beklentileri korunur.
- dub-generator-ui, ui-locale, ui-locale-dedupe, preload-sandbox,
  preload-usage-ratchet ve browser-preload-ratchet hedefli kontrolleri geçti.
- `python backend/test_text_studio.py`: Türkçe/boşluklu yol argv'si, Hi-Fi/paralellik
  aktarımı, bozuk/NaN/sonsuz ayar ve eksik referans reddi geçti.
- Değişen JS `node --check`, Python `py_compile`, `git diff --check` geçti.
- Mevcut VoxCPM2 venv'inde Tkinter 8.6 import'u doğrulandı.

## Sınırlar ve teslim engeli

Gerçek GUI görsel incelemesi, GPU/TTS üretimi, gerçek yerel MP3->Whisper referans
çıkarımı ve bat dosyasını çift tıklamayla açma bu turda yapılmadı. Mock/argv
kontrolleri gerçek ses kalitesi veya tüm Windows kurulumları için kanıt değildir.
Mevcut SRT üretim motoru ve kalite ayarları değiştirilmedi. Bağımsız stüdyo ayrı
süreçtir: Electron içinden açıldığında uygulama üretim kilidi geçerlidir; bat ile
açıldığında başka bir GPU üretimiyle aynı anda çalıştırılmamalıdır.

Önceki 499 belgeleme commit/push komutu otomatik onay incelemesi kullanım
sınırına takıldı ve hiç çalıştırılmadı. Güvensizlik kararı değildi. İncelemeyi
atlamak için başka Git/HTTP yolu denenmedi. Bu takip işinin kodu/belgeleri
çalışma ağacında; yeni PR veya başarılı push yok. Ana Windows master'a
merge/kurulum yapılmadı. CI sonucu iddia edilmez.
