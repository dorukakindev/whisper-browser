# BROWSER_BUG_REPORT_402 — Rolling-window kaynak tekilleştirme (çeviri girişi)

Tarih: 2026-10-02 · Durum: DÜZELTİLDİ · Önceki tur: rapor 401 (anlam kapıları FP turu)

## Tetikleyici

Rapor 401'in sınıflandırmasında dominant ret sınıfı model echo'suydu: hedef
metin kaynak İngilizce'nin aynen kopyası. Kapılar bunları doğru reddediyordu
ama kök neden model değil kaynaktı — YouTube rolling-window altyazılarında her
cue bir öncekinin metnini taşır; modele büyüyen/tekrarlayan metin verilince
echo ve bozuk-parça üretimi şişiyor, ret→kurtarma döngüsü hem istek sayısını
hem de kalan-İngilizce-blok sayısını katlıyordu.

Kullanıcı onayıyla kök-neden düzeltmesi: çeviri girişinde kaynak dedup.

## Bulgular — kaynak yapısı (120-cue gerçek korpus, Border Security Australia)

- 60 cue = önceki metnin uzantısı (aynı metin + yeni kuyruk)
- 51 cue = önceki metnin saf kuyruk tekrarı (kayan pencerenin üst satırı)
- 8 cue = bağımsız metin

Yani korpusun ~%93'ü yapısal tekrar taşıyordu; modele giden her paket fiilen
aynı cümleleri 2-3 kez çevirtiyordu.

## Değişiklik

`backend/transcribe.py`:

- Yeni `dedupe_rolling_window_cues(entries, max_gap=2.0)`:
  - **Uzantı**: cue önceki KAYNAK metinle başlıyorsa ön ek atılır
    (kelime sınırı korumalı; önceki metin >=12 karakter).
  - **Saf tekrar**: cue önceki metnin kuyruk parçasıysa (boşluk sınırında,
    >=5 karakter) cue kaldırılır ve bitiş süresi önceki cue'ya katlanır —
    metin ekranda aynı süre kalır, tekrar yok.
  - Zincir karşılaştırması her zaman ham kaynak metne göre (düşen cue
    zinciri kırmaz).
- `translate_existing_subtitle`: dedup `drop_empty_entries` sonrası,
  `merge_continuation` öncesi uygulanır; ASS `cue_formats` indeksleri kaydığı
  için biçim taşıması güvenle devre dışı bırakılır (merge_continuation ile
  aynı politika). Kaynak dosya değişmez; çıktı altyazısı karaoke ritminde
  kalır.

## Canlı korpus ölçümü

Aynı 120-cue korpus, aynı sağlayıcı/model (codecraftapi + gemini-3.7-flash),
üç koşu:

| Metrik | Kapılar eski | Kapılar yeni | Yeni + dedup |
|--------|-------------|--------------|--------------|
| Modele giden blok | 120 | 120 | **71** (-41%) |
| `translation_failed` | 95 | 85 | **45** (-47%) |
| `translation_meaning_hard_rejected` | 14 | 13 | **4** (-69%) |
| Tamamlanan blok | 25/120 (21%) | 35/120 (29%) | **26/71 (37%)** |
| Çıktı cue sayısı | 120 (kayan tekrarlı) | 120 | **71 (tekrarsız)** |

Aynı korpusta dedup'lı koşu 26/71 blok (%37) tamamladı — blok başına başarı
oranının yükselmesinin yanında çıktı dosyası artık kayan-pencere tekrarları
olmadan 71 temiz cue içeriyor. Echo (anlam) ret'leri 13'ten 4'e indi; kalan
4 ret elle incelendi, hepsi gerçek kusur (modal/negation kayması).

Kalan başarısızlıkların dominant sınıfı artık `part_kapisi_*` — özel ad
bozulması/kaydı, tarih kayması, erken cümle sonu (model çıktısındaki gerçek
kusurlar; echo değil). Bu kapılar gerçek hataları yakalamaya devam ediyor;
kurtarma 7 bloku toparladı.

Birim güvenlik testleri: kelime-ortası tekrar eşleşmesi reddi
("comedian"/"ian"), <5 karakter tekrar koruması, <12 karakter önceki-metin
sınırı, uzak-boşluk dokunmazlığı.

## Testler

- `test_transcribe.py`: 2 yeni test —
  `test_dedupe_rolling_window_cues_youtube_pattern` (zincir + zaman katlaması)
  ve `test_dedupe_rolling_window_cues_safety_guards` (4 ret gardı).
  Toplam 224/224 yeşil.

## Windows etkisi

Yalnız backend; çıktı dosyası daha az ve daha temiz cue içerir (tekrar
satırlar yok, karaoke ritmi korunur). `start.bat` akışı etkilenmez. Kullanıcı
etkisi: aynı video için daha az API isteği, daha az ret, daha kısa çeviri
süresi, çıktıda İngilizce kalan blokların belirgin azalması.

## Sınırlar

- Dedup yalnız `translate-only` hattında (mevcut altyazı çevirisi); Whisper
  transkripsiyon hattı kendi `strip_repeated_prefix` + dedupe yolunu
  kullanmaya devam eder (ayrı genişletme değerlendirilebilir).
- Saf-tekrar katlaması önceki cue'nun ekran süresini uzatır — kaynakta
  üst satır zaten o içeriği gösteriyordu; bilgi kaybı yok.
- Çok kısa tekrarlar (<5 karakter) ve kısa zincir başlangıçları (<12
  karakter) bilerek dışarıda bırakıldı — gerçek kısa replikler korunur.
