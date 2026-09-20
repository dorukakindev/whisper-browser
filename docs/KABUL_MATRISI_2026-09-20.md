# Kabul Matrisi — 2026-09-20 (F20)

Tarayıcı/altyazı için **sürüm kapısı**: etiketli sürüm ancak aşağıdaki
kontroller o tarihli koşuda geçerse çıkar. Her satır: kimlik, kapsam,
geçme ölçütü ve son koşu kaydı. Otomasyonu olanlar test dosyasıyla,
gerçek-site/cihaz gerektirenler manuel koşuyla kanıtlanır.

## S. Gerçek-site / servis koşusu (manuel, tarihli)

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| S-1 | İçerik servisi A (YouTube): video aç, caption edin, çevir | Adaptör yanıtları servis bağlamında tutulur; caption edinme merdiveni hazır izi bulur; overlay'de çeviri görünür | bekliyor |
| S-2 | İçerik servisi B (Netflix/Disney+/Max'ten hesaplı biri): giriş + caption | Kullanıcı hesabıyla oynatma; manifest/timedtext yakalama; iki iz | bekliyor |
| S-3 | İçerik servisi C (Invidious/YouTube dışı açık servis, ör. Vimeo): | Aynı ölçütler; bölgesel kısıt nota yazılır | bekliyor |
| S-4 | SPA geçişi: aynı serviste sayfa-içi gezinme 3 kez | Yeni medya kimliği, eski iş/katman sızıntısı yok (`browser-background-navigation` testleri davranışsal taban) | CI ✓ + gerçek site bekliyor |
| S-5 | Seek fırtınası: 30 sn'de 30+ seek | Yalnız son seek işlenir; eski sonuçlar düşer; UI takılmaz | CI ✓ (scheduler testleri) + gerçek site bekliyor |

## P. Performans ve dayanıklılık

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| P-1 | 30 dk / 10 sekme soak | `resource-soak` bütçeleri: listener/timer/dosya sızıntısı yok, kuyruk sınırlı | CI ✓ (`tests/resource-soak.test.js`); uzun gerçek koşu bekliyor |
| P-2 | 20k cue kütüphane | Arama ve scroll akıcı; `watch-library-subtitle-performance` eşikleri | CI ✓ (10k kayıt, warm < 3 ms) |
| P-3 | Önbellek sıcak/soğuk: ilk açılış vs ikinci açılış | Soğuk açılışta kilitlenme yok; sıcakta arama belirgin hızlı | CI ✓ (perf metrikleri) |
| P-4 | Bellek: 10 sekme + 1 saat oynatma | Renderer heap büyümesi sınırlı; sekme kapatınca düşer | bekliyor |
| P-5 | Benchmark: `models:benchmark` 30–120 sn klip | Aynı kaynakta kullanıcı-seçimli başlangıç/süre, NDJSON sözleşmesi, RTF/speedX, süreç/GPU-delta VRAM, timeout | CI ✓ (`test_model_benchmark.py`); CUDA tiny/small 40 sn sentetik kaynakta 5–35 sn aynı klip koşusu ✓ |
| P-6 | Windows paketleme ve açılış smoke | Üretilen uygulama 6 sn boyunca sağlıklı kalır; üretim bağımlılık ağacında yasaklı copyleft yok | yerel ✓ (`package:win`, `smoke:package:win`, `audit:licenses`); yeni makinede Python/GPU kurulumu `install.bat` gerektirir |

## Ç. Çeviri kalite/güvenilirlik

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| Ç-1 | Cümle çeviri boru hattı | Anlam kapısı + kaynak-yankısı ret + kurtarma yolu | CI ✓ (192 çeviri testi) |
| Ç-2 | Canlı zamanlayıcı | Oynatma kafası önünde cümle-bazlı plan; seek/revision güvenli | CI ✓ (`browser-translation-scheduler`) |
| Ç-3 | Aynı klip A/B ASR (F17) | İki model aynı clipHash'te; bire-bir zamansal cue eşleştirmesi, eşleşmeyen cue ve metin farkı raporlanır | CI ✓ (`test_model_benchmark.py`); CUDA model yükleme/ölçüm ✓, sesli referansla kalite kıyası bekliyor |

## V. Veri güvenliği / redaction

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| V-1 | Teşhis paketi redaction | İmzalı URL/token/userinfo sızıntısı yok | CI ✓ (`browser-adapters.test.js` tanı paketi maddeleri) |
| V-2 | Secret sentinel hijyeni | Anahtar argv/görünür sonuçta yok; yalnız child env | CI ✓ (`settings-security` R51-43) |
| V-3 | IPC yetki taraması | 201 kanal × 3 yetkisiz gönderici yan etkisiz ret | CI ✓ (`adversarial-ipc.test.js`) |
| V-4 | Yetkili dosya sınırları | `authorizeLocalMediaPath` kapsamı dışı okuma ret; ADS/symlink reddi | CI ✓ (adversarial-ipc altyazı/dosya maddeleri) |
| V-5 | Secret store göçü | safeStorage yedekli; eski düz anahtar taşınır/maskelenir | CI ✓ (`settings-security` persistence maddeleri) |

## Erişilebilirlik (ek kapı)

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| E-1 | axe-core ana ekran | Yeni kural ihlali 0; region borcu ≤ baseline (36) | CI ✓ (`accessibility.test.js`) |
| E-2 | Klavye tam turu | Tüm ana eylemler fare olmadan | bekliyor (manuel) |
| E-3 | Pencere/ölçek matrisi | Menü, çekmece, reader ve video üstü kontrol viewport dışına taşmaz; reader kapanınca sayfa overflow'u geri gelir | Electron ✓: 1280×820@100%, 1024×720@125%, 760×700@150% (`electron-ui-scale-matrix.smoke.js`) |

## Kamu deposu / tedarik zinciri

| No | Kontrol | Geçme ölçütü | Son koşu |
| --- | --- | --- | --- |
| K-1 | Tam Git geçmişi gizlilik taraması | Gerçek anahtar/kimlik bilgisi bulgusu 0; uyarılar tek tek sınıflanır | ✓ `audit:public-history`; 0 secret, 5 belgeli yol uyarısı |
| K-2 | Üretim lisans kapısı | Paket ağacındaki lisanslar izin verilen kümede; prod lock copyleft bulgusu 0 | ✓ 80 paket; Apache-2.0/BSD-2-Clause/ISC/MIT/MPL-2.0 |
| K-3 | CI platform matrisi | Ubuntu ve Windows `npm test` + syntax adımları yeşil | ✓ [run 35531298678](https://github.com/dorukakindev/whisper-browser/actions/runs/35531298678), iki iş de başarılı |

## Kullanım

- Sürüm etiketi öncesi bu dosya kopyalanır, satırlar o koşunun tarih +
  commit'iyle doldurulur: `docs/KABUL_MATRISI_<YYYY-MM-DD>.md`.
- "bekliyor" kalan satır sürümü engellemez ama notta açıkça listelenir;
  S-1..S-3 ve E-2 en az bir kez gerçek ortamda koşulmadan "tam destek"
  ilanı yapılmaz.
- Ölçüt değişirse yeni satır eklenir; eski matrisler silinmez.
