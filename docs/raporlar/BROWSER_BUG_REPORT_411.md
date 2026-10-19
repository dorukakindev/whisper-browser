# Rapor 411 — Dublajın kısa satırlarda doğallığı ve kesilme sayacı

2026-10-14. Salt okunur inceleme: yerel VoxCPM2 `altyazi_oku.py` ve
`nanovllm_oku.py`; ses dinleme/üretim deneyi yapılmadı, dış araç değiştirilmedi.

## Doğrulanmış bug

`fit_to_window` önce sınırlı atempo uygular, hâlâ pencereye sığmayan WAV'ı
`wav[:frames]` ile kırpar ve 40ms fade uygular. Ancak `build_timeline` yalnız
fonksiyondan dönen son uzunluğu kontrol eder: kısaldıysa ve pencereye sığdıysa
`sigdirildi` artırılır; aksi durumda `kirpildi` artırılır. Kırpılmış ses de zaten
pencereye sığdığından kırpma “hızlandırıldı” sayılır. `kirpildi` dalı normal
akışta gerçek kırpmaları yakalayamaz. Bu yüzden “0 satır kesildi” raporu sesin
kesilmediğini kanıtlamaz. Eski kişisel çıktıda gerçekten kaç satır kesildiği
ölçülmedi; sayı tahmin edilmiyor.

Önerilen düzeltme: fit işlemi sesle birlikte uygulanan tempo, önce/sonra süre
ve kesilen örnek sayısını döndürmeli; hızlandırma ve kırpma ayrı sayılmalı.
Yumuşak fade kelime kaybını önlemez. Sessiz kırpma yerine uyarı ve yalnız
problemli grup için yeniden üretim/uygun zaman boşluğu kullanımı tercih edilmeli.

## Doğallık için öneri (henüz uygulanmadı)

İki araç aynı reference/prompt ve sentez parametrelerini kullanıyor; altyazı
aracı her cue metnini bağımsız üretirken kitap aracı daha uzun parçalar üretir.
Bu fark ton/ritim değişiminin olası açıklaması; dinleme veya kontrollü A/B
olmadan gerçek ses bozukluğu nedeni kesinleştirilmedi.

- TTS girdisini görsel SRT bloklarından ayır: devam eden cümleleri küçük doğal
  gruplarda birlikte üret. Başlangıç denemesi için yaklaşık 120–250 karakter ve
  6–12sn grup penceresi; bunlar model şartı değil, ayarlanacak tasarım hedefleri.
- Tam cümle sonu, belirgin duraklama, konuşmacı/sahne değişimi sınırlarını koru.
  Her satırı birleştirme; her parçayı kitap gibi 600 karaktere de zorlama.
- Grubun sesi ilk cue başlangıcı/son cue bitişi ve güvenli boşluklarına
  yerleştirilsin. Ekrandaki SRT bölünmesi değişmek zorunda değil. Grup içinde
  cümle/sözcük zamanını daha hassas korumak için üretilmiş sese hizalama gerekir;
  ses eşit uzunlukta keyfî parçalara bölünmemeli.
- Önce mevcut ses reference + transcript ve cfg/temp/step değerleri sabit
  tutulmalı; böylece parçalama etkisi ayrılır. Gerekiyorsa parametre A/B sonraki adım.
- 1.10–1.15 gibi hafif tempo sınırı başlangıç denemesi olabilir; doğal duyulacağı
  garanti edilmez. Fazla uzun grup körlemesine 1.30'a zorlanıp kırpılmamalı.
- Kısa bir bölümde mevcut satır üretimi ve cümle grubu üretimi dinlenerek
  kıyaslanmalı; ilk aşamada tüm 22dk dosyası yeniden üretilmemeli.

Resmî kaynak referans ses+tam transcript ile klonlama ve metin bağlamına duyarlı
sentezi açıklar; buradaki grup boyutu önerisini garanti etmez:
https://github.com/OpenBMB/VoxCPM/blob/main/README.md

Ürün/kullanıcı ses dosyası değişmedi, yeni bağımlılık kurulmadı. Yalnız belge
diff/içerik kontrolü; ürün testleri koşulmadı. Gruplama, sayaç onarımı ve otomatik
SRT→TTS entegrasyonu açık işlerdir; browser'a hazır ses ekleme önceki teslimde hazır.
