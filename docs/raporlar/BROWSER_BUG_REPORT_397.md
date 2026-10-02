# BROWSER_BUG_REPORT_397 — YouTube indirme 403: ham yt-dlp metni arayüze düşüyordu

Tarih: 2026-10-02 · Raporlayan: kullanıcı (canlı Windows günlüğü) · İşleyen: Devin

## Bulgu

Kullanıcının Windows makinesinde (`D:\Whisper Local`) "Whisper altyazı + çeviri" işi
`https://www.youtube.com/watch?v=FdTzBABTYF0` indirmesinde başarısız oldu:

```
14:12:07 YouTube'dan indiriliyor: https://www.youtube.com/watch?v=FdTzBABTYF0
14:12:10 ERROR: unable to download video data: HTTP Error 403: Forbidden
14:12:10 Altyazı oluşturulamadı: ERROR: unable to download video data: HTTP Error 403: Forbidden
```

Ham yt-dlp hata metni kullanıcıya olduğu gibi düştü — eylemlenebilir rehber yoktu.

## Kök neden analizi

- `backend/transcribe.py` `download_youtube()` yalnız bot-doğrulaması ve cookie-kilidi
  hatalarını Türkçe'ye çeviriyordu; diğer her şey (403 dahil) `raise` ile ham taşınıyordu.
- `backend/media.py` aynı ikisini + OSError errno dallarını ayrı bir inline zincirde
  tutuyordu — iki yüzey, iki farklı sözleşme.
- `backend/io_errors.py` `classify_ytdlp_error()` kapsamlı TR sınıflandırıcı olarak
  **üretim kodunda hiç çağrılmıyordu** (ölü kod; yalnız testler kullanıyordu) ve 403
  metni zayıftı ("oturum/cookie doğrulayın" — ana neden olan eski sürümü söylemiyordu).
- `src/renderer/renderer.js` `friendlyYoutubeError()` içinde 403 haritası yoktu;
  renderer ham metni 240 karaktere kırpıp gösteriyordu.
- Repoda pin `yt-dlp>=2026.7.4` idi (7+ hafta eski). YouTube tarafındaki bot/istemci
  kontrolleri eski yt-dlp sürümlerinde 403 üretir — klasik sinyal.

## Düzeltme

1. `io_errors.classify_ytdlp_error` 403 metni eylemlenebilir rehbere çevrildi:
   "yt-dlp güncellemesini çalıştırın (Ayarlar > Bakım) + oturumlu tarayıcı seçin".
2. `transcribe.py` indirme hatası artık `RuntimeError(classify_ytdlp_error(exc))` —
   bot/cookie özel dalları korunarak tek sınıflandırıcıya birleşti.
3. `media.py` aynı birleşime geçti; ENOSPC/EACCES dalları sınıflandırıcının
   disk/izin regex'lerince kapsanıyor (davranış eşdeğer, tek çatı).
4. `renderer.js` `friendlyYoutubeError` 403 haritası eklendi; backend'in ürettiği
   sınıflandırılmış metni tekrar ezmeyen koruyucu eşleşme.
5. Pin güncelleme: `requirements.txt` `>=2026.8.19`, `requirements-ci.txt`
   `==2026.8.19` (PyPI güncel sürüm). Mevcut kurulumlar Ayarlar > Bakım >
   "yt-dlp güncelle" akışıyla tazelenir.

## Güvenlik notu

Bilinmeyen hatalar ham olarak arayüze TAŞINMAZ — `classify_ytdlp_error`'ın genel
düşüşü imzalı indirme URL'lerindeki tokenları sızdırmamak için kasıtlı
(`test_unknown_ytdlp_error_does_not_echo_signed_url`). `test_ytdlp_deadzones`
sözleşmesi bu doğrultuda güncellendi: tanınmayan hata artık genel Türkçe mesaja
düşer, ham metin kullanıcıya gitmez.

## Test

- `test_ytdlp_deadzones.py`: 23 kontrol — bot/cookie/403/bilinmeyen-hata/boş-info yolları.
- `test_io_errors.py`: 5/5 — sınıflandırıcı sözleşmesi (403↔429 ayrımı, URL sızmama).
- `test_ytdlp_update.py`: 24/24.
- `py_compile` üç dosya + `node --check renderer.js` temiz.

## Doğrulanamayan sınırlar

- Gerçek YouTube indirmesi Linux ortamında koşturulamadı (bot kontrolü/coğrafi
  durum belirsiz); 403 üretimi deterministik fixture ile doğrulandı.
- Kullanıcının makinesindeki venv hâlâ eski sürümde olabilir — çözüm Ayarlar >
  Bakım'daki mevcut güncelleyici veya `install.bat` yeniden koşusu.
