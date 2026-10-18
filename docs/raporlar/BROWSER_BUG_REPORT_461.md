# Rapor461 — Rapor459 bulgularının bağımsız doğrulaması

2026-10-18. Başlangıç HEAD `f9f7983c7cefac12b76129ee57a5ed84584654e6`.
Kaynak kod, gerçek modül çağrıları ve kontrollü fixture'lar incelendi.
Rapor459'daki etiketler otomatik olarak hata kabul edilmedi.

## Y-1 — Gerçek kütüphane anahtarı için iddia çürütüldü

Rapor `canonicalBrowserUrl('browser:HTTPS://X.com/a')` çağırmış. Bu yardımcı
ham URL bekler; `browser:` ise kütüphane anahtarı sarmalayıcısıdır. Gerçek
`canonicalWatchKey()` önce sarmalayıcıyı çıkarır, sonra URL'yi normalleştirir.

`canonicalWatchKey('browser:HTTPS://X.com/a')` ile
`canonicalWatchKey('browser:https://x.com/a')` zaten aynı sonucu verir:
`browser:https://x.com/a`. Yeni davranış testi bunu ve `/A` ile `/a`
yollarının farklı kalmasını korur. Tüm URL'yi lowercase yapmak yol bilgisini
bozardı; ürün kodu değiştirilmedi.

## Y-2 — Davranış farkı gerçek; önerilen düzeltme uygulanmadı

`browser-subtitles.normalizeCues` akış ayrıştırma sırasında eksik/geçersiz
bitişleri kestirir. `browser-asset-store.normalizeCues` ise kalıcı çıktı için
pozitif, milisaniyede temsil edilebilir aralık ister. Bu kontrol Rapor456'daki
sıfır süreli SRT ve placeholder çevirisi hatalarını düzeltmiştir.

İki farklı katmanın aynı girdide farklı sonuç vermesi tek başına veri kaybı
hatasını kanıtlamaz. Geçerli cue'nun asset içinde kaybolduğu gösterilmedi.
Başlangıç/bitişi eşit veya ters olan girdilere hayali üç saniye eklemek
önceki düzeltmeyi zayıflatır. Yeni koruma testi ve Rapor456'nın altı mevcut
regresyonu geçti; strict çıktı davranışı korundu.

## Y-3 — Kuyruk sanitizasyon boşluğu doğrulandı ve düzeltildi

`clonePublicOptions` üst seviyede ve iç içe nesnelerde `passwordHash`,
`apiKeyPotpourri`, `serverKey` alanlarını koruyordu. Disk roundtrip testi
bu alanların kalıcı kuyrukta da kaldığını gösterdi. Aynı adlar URL sorgusunda
da temizlenmiyordu. Örnek değerlerin hepsi kontrollü fixture; gerçek anahtar
aranmadı veya okunmadı. Mevcut üretim seçeneklerinin bu üç alanı gerçekten
taşıdığı ya da geçmişte gerçek bir sırrın sızdığı iddia edilmiyor.

`src/queue-persistence.js` anahtar adlarını CamelCase/akronim sınırlarından
ayırarak `api_key`, `password_hash`, `server_key` ifadelerini tanır. Bu
ifadeler uzun adların içinde de temizlenir. URL sorguları aynı filtreden
geçer. Her `key` veya `token` içeren alanı silen genel bir kural eklenmedi:
`mediaKey`, `sourceKey`, `keyboard`, `maxTokens`, `tokenBudget`, `tokenCeiling`
korunur. Endpoint yolunun harf büyüklüğü ve sır olmayan sorgular korunur.

Üç test eski kodda başarısızdı: recursive seçenek temizliği, URL sorgusu
ve disk roundtrip. Düzeltmeden sonra beşi de geçti; diğer iki test Y-1/Y-2
mevcut davranışlarını korur. Yeni filtre sonraki kayıt/normalizasyonlarda
uygulanır; geçmiş yedekler veya Git geçmişi taranıp temizlenmedi.

## Y-4 — buildOptsFromUI dışındaki atamalar hata sayılmaz

Kaynakta ayrı iş akışları bulundu: `reexportJson` click handler'ı
`opts.reexport = true`; senkronlama handler'ları `opts.syncSubs = true`;
browser çeviri akışı `opts.translateOnly = true` ve `opts.translateExisting`
atar. Kuyruk `opts.queueItemId`, çıktı akışları `opts.outputNameSuffix` atar.
Raporun yalnız nesne-literal alanı araması bu atamaları kaçırmış.
`syncMaxShift` için görünür renderer kontrolü bulunmadı; backend isteğe bağlı
argümanı destekler ve varsayılanı 60 saniyedir. Üretilmeyen opsiyonel alan,
tek başına bozuk kullanıcı akışı değildir. Gerçek UI uçtan uca doğrulanmadı.

## Y-5 — ranges[] dışında olmak işleyici olmadığı anlamına gelmiyor

`browserRangeOutputs` manga workers/font scale, overlay ölçek/opaklık/
konum/genişlik ve video parlaklık/kontrast etiketlerini günceller; overlay
ve video ayarlarının senkronlamasını tetikler. Gap/maxLines için ayrıca
change handler vardır; maxLines HTML'de range değil number kontrolüdür.
`browser-dub-ui.js` iki ses düzeyi için input handler kullanır.
`bindSubtitleStyleControls` subSize/bg/outline etiketlerini ve stili
günceller. subSize/subOffset ayrıca ranges listesinde zaten mevcuttur;
subOffset'in ayrı senkron önizleme handler'ı da vardır.

Bu statik iddia kullanılabilirlik hatası kanıtlamıyor; arayüz bu tur
değiştirilmedi. Bütün kaydırıcıların görsel QA'sı yapıldı denmiyor.

## Y-6/Y-7 — Hata doğrulanmadı

Python saf çağrıları `format_srt_time(360000.125)` için `100:00:00,125`,
`format_vtt_time` için `100:00:00.125` verdi. Saati iki haneye kırpmak
zaman bilgisini kaybettirir; somut oynatıcı bozulması gösterilmedi.
`clean_text` docstring'i genel temizlik tanımlar; İngilizce örnek
`Word , Word .` → `Word, Word.` üretir. Bu sonuçta hatalı diyalog anlamı
veya noktalama gösterilmedi. Dil kuralları yeniden tasarlanmadı.

## Doğrulama / sınırlar

12 Node dosyası geçti: report461-regressions (5 test), queue-persistence,
queue-opts-roundtrip, queue-state-corruption, queue-writer-interleave,
queue-ordering-invariants, report452-regressions, report456-regressions,
watch-library, watch-library-migration, watch-index-assets,
ci-determinism-ratchet. Python Y-6/Y-7 doğrudan assert'leri geçti.

Değişen modül ve main/preload/renderer `node --check`, transcribe.py
py_compile ve diff kontrolü geçti. Windows terminalinde çalışıldı.
Tam npm test, Electron GUI/start.bat açılışı, gerçek sağlayıcı, YouTube,
GPU ve uzak Windows CI doğrulaması yapılmadı. Yeni bağımlılık/şema/UI yok.
