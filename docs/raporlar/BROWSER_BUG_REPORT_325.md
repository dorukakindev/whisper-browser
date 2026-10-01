# BROWSER_BUG_REPORT_325 — Kuyruk görevi 13: transkripsiyon kaldığı yerden devam (checkpoint denetimi)

- Tarih: 2026-10-01 (UTC)
- Dal: `devin/1790881620-item13-resume-audit` (taban `bc3897f`)
- Kapsam: `backend/transcribe.py` checkpoint/resume makinesi + `src/main.js`/`preload` bağlantısı

## Görev metni (kuyruk 13/50)

"Transkripsiyon kaldığı yerden devam: Tamamlanmış ses parçalarını güvenli checkpoint'lerle sakla.
Yeniden başlatmada kaynak, model ve ayar kimliğini doğrula; uyumsuz checkpoint'i kullanmadan
kalan parçaları işle."

## Mevcut uygulamanın gereksinim karşılığı (denetim sonucu)

| Gereksinim | Durum | Kanıt noktası |
|---|---|---|
| Tamamlanmış parçaları güvenli checkpoint'le sakla | VAR | `write_checkpoint`: atomik `.tmp`→`fsync`→`os.replace`, `allow_nan=False`, yol başına tek uyarı; segment döngüsünde `CKPT_INTERVAL=20s` periyoduyla snapshot (`merge_resumed_*` ile önceki durum korunur) |
| Kaynak kimliğini doğrula | VAR | `checkpoint_input_identity`: normalize realpath + boyut + `mtime_ns`; imza içinde |
| Model/ayar kimliğini doğrula | VAR | `job_signature` v3: ~30 alan (model, engine, dil, görev, split/decode/vad/preprocess, kelime-gereksinimi); imza uyuşmazsa checkpoint reddedilip temiz başlanır |
| Uyumsuz checkpoint'i kullanmadan kalanı işle | VAR | `read_checkpoint` (sürüm 1–3 + imza + strict entry/words doğrulaması) → `checkpoint_resume_from` sınır geri-çekilmesi → `merge_resumed_entries/words` sınır-kesimli birleşim → `clip_start`/`time_offset = resume_from` |
| Ek sözleşmeler | VAR | İş bitince checkpoint+legacy dosya silinir (stale kalmaz); `detected_language` v3'te saklanıp otomatik-dil işlerinde korunur; `--resume` GUI'den `options.resume` ile gelir (varsayılan açık); clip'li/YouTube işleri bilinçli dışarıda (ckpt_path=None) |

## Düzeltilen kusur — B-325-01: checkpoint `detected_language` normalize edilmiyordu

`read_checkpoint` dil kodunu regex ile doğruluyordu fakat **büyük harfli değeri ham bırakıyordu**
(`"TR"` → `"TR"` olarak dönüyordu). Resume akışı bu değeri modele dil ipucu olarak geçirir;
whisper tarafı küçük-harf kod bekler ve `language == "tr"` karşılaştırmaları büyük harfle
uyuşmazdı. Artık regex eşleşmesi sonrası `strip().lower()` uygulanır.

## Eklenen kanıt kilidi

`test_checkpoint_hostile_read` (yeni): 16 bozuk gövde → reddedilir
(boş/bozuk JSON, dict-olmayan kök, bilinmeyen sürüm, imza uyuşmazlığı,
sayısal-olmayan/negatif/NaN `last_time`, liste-olmayan/boş `entries`,
tipi/zamanı/metni bozuk entry, dict-item, kısa tuple).
Kelime listesi sözleşmesi kilitlendi: dict-olmayan öğe atlanır, bozuk zamanlı
dict öğesi tüm checkpoint'i reddeder; dil enjeksiyon-güvenli
(`"tr'; DROP TABLE--"` → `None`).

## Test kanıtı

- `./venv/bin/python -c` ile checkpoint test alt-kümesi (9 test): **PASS**
- `test_transcribe.py` tam koşu: 216/216 → 1 düşüş yalnız yeni testin varsayımıydı
  (dil normalize bekliyordu, mevcut kod ham bırakıyordu); düzeltme + güncel
  beklentiyle **yeşil**.

## Bilinen sınırlar (kasıtlı dışarıda bırakılanlar)

- YouTube ve kullanıcı-clip'li işlerde checkpoint kapalı (girdi kimliği anlamlı değil).
- Aynı anda aynı dosya için iki eşzamanlı iş checkpoint'i paylaşır; imza uyuşmazlığı
  yanlış-kullanıma değil temiz-başa düşer (güvenli başarısızlık).
- Dosya içeriği birebir değiştirilip aynı boyut+mtime korunursa kimlik yakalayamaz
  (içerik hash'i büyük dosyada kasıtlı alınmaz).

## Windows etkisi

Yok — salt-Python doğrulama + okuma normalizasyonu; Windows'ta yalnız `read_checkpoint`
yolundaki 3 satır değişiklik koşar. `start.bat`/`install.bat` etkilenmez.
