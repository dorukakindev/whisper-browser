# Rapor462 — Kısa örnekte arka plan kapsamı ve ses kaydırma göstergesi

2026-10-18. Önceki raporlardan bağımsız olarak dublaj UI'sı ve servis/
arka plan hattı incelendi. İki hata doğrulandı ve düzeltildi.

## 462-01 — Kısa ses örneği için tam videonun arka planı ayrılıyor

TTS `sample: true` için `--limit 11` alıyordu. Background servisine ise
örnek sınırı aktarılmıyor; `prepare_background.py` bütün SRT'nin sonuna
veya seçilen uzun zaman aralığının sonuna kadar ayırma yapıyordu. Böylece
ilk 11 satırlık deneme gereksiz uzun bir ayırma işlemini bekliyordu.

Servis artık doğrulanmış `s.sample` değerinden `limit: 11` veya `0` üretir.
Node adapter sınırı Python CLI'ye geçirir. Python, TTS ile aynı sırada önce
zaman aralığıyla kesişen cue'ları seçer, sonra ilk 11 cue'yu alır. Son
seçili cue bitişine iki saniye kuyruk ekler; kullanıcının seçtiği bitişi
geçmez. Başlangıç değişmez, sesin orijinal videoyla hizası korunur. Tam
üretim `limit: 0` ile eski kapsamını korur. Cache anahtarı etkin bitişi
içerdiğinden kısa örnekle tam üretim yanlış önbelleği paylaşmaz.

Kanıt: servis/adapter regresyonları eski kodda sınırın aktarılmadığını
gösterdi. Python fixture'ında 20 cue'nun tamamı 41 saniyeye uzanırken ilk
11 cue için 23 saniye ayrılır. 10–38 saniye seçiminde örnek 10–33 saniye
olur; 10–30 seçiminde kuyruk 30'da kesilir. Altyazısız örnek aralığı
ayırmadan önce reddedilir. Dört yeni Python testi geçti.

Sınır: bu değişiklik kaynak ayırma/FFmpeg extraction süresini kısaltır.
YouTube kaynak sesinin indirilmesi hâlâ tüm dosyayı indirebilir. Gerçek
GPU performansı veya dakika bazında hız kazancı ölçülmedi.

## 462-02 — Yeni sesin sıfır kaydırması ekranda eski değerle gösteriliyor

`BrowserDubAudio.attach` yeni ses için içeride `offset = 0` yapıyordu.
Manuel dosya ekleme UI'ı kontrolü de sıfırlarken `attachGenerated` bunu
yapmıyordu. Kullanıcı önceki ses için 10 saniye seçip yeni üretilen sesi
bağladığında ses sıfır kaydırmayla oynarken kutu hâlâ 10 gösteriyordu.

Başarılı generated attach sonrasında aynı `browserDubOffset` kontrolü
sıfırlanır. Başarısız/stale attach'te mevcut değere dokunulmaz. Gerçek
controller + JSDOM testinde önce 40. saniyedeki video/30. saniyedeki ses,
sonra yeni attach'te 40. saniyedeki ses ve ekranda 0 doğrulandı. Eski
kodda gösterge `10 !== 0` ile başarısızdı. Yeni metin/CSS veya düzen yok.

## Doğrulama

11 Node dosyası geçti: dub-service, dub-background, player-dub-ui,
browser-dub-audio, dub-generator-ui, report460-regressions,
report454-regressions, report453-regressions, ipc-parity,
ci-determinism-ratchet, coverage-map.

`tests/test_background_cache_regressions.py`: 14 test geçti (4 yeni).
Mevcut gerçek FFmpeg çıkarma/cache tekrar kullanımı testi de dahil.
JS syntax, Python py_compile ve diff kontrolleri geçti.

Windows terminali ve Türkçe dosya fixture'ları kullanıldı. Yeni bağımlılık,
kalıcı ayar veya şema yok. Gerçek Electron görsel doğrulaması/start.bat,
GPU/YouTube/model üretimi, tam npm test ve uzak Windows CI yapılmadı.
Kontrolün görünen sayısal değeri DOM testinde doğrulandı; piksel/görsel
doğrulama yapıldığı iddia edilmiyor. Kullanıcı uygulaması kapatılmadı.
