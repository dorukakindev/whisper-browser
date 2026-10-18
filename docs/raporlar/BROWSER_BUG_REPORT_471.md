# Rapor471 — Anlamsal arama yardımcı süreç yanıtları

2026-10-19. Kullanıcı önceki taramaya devam edilmesini istedi.
Başlangıç HEAD: `bf8b7d0805a8e7d8e324581f8acc55972301463f`.
Kod commit'i: `f157ceb9f944c938065db403ef0ded20b08de87a`.
Mevcut master tabanlı PR453 / `codex/subtitle-quality-audit470` devamıdır.

## 471-01 / Yüksek — JSON null ana süreç callback'ini düşürüyor

`src/browser-media-tools.js::ensureWorker` JSON.parse başarılı olduktan
sonra her değerde result.ok okuyordu. `null\n` geçerli JSON olduğu için
parse hatasına girmez; akış callback'inde TypeError fırlatır. Bu callback
Electron ana süreçte çalışır ve bekleyen arama çözülmeden kalabilir.

Düzeltme: yanıt non-null nesne, array olmayan ve boolean ok alanı taşıyan
zarf olmalıdır. Uymayan değer kontrollü geçersiz-yanıt hatasına çevrilir.
Sonraki FIFO yanıtı ve arama çalışmaya devam eder. Yeni metin eklenmedi;
var olan yerelleştirilmiş hata kullanıldı.

## 471-02 / Orta — Persistent worker stdout sınırı yok

Tek seferlik run() çıktısında 5 MiB sınırı varken persistent semantic
worker state.buffer'ı satır sonu gelene kadar sınırsız büyüyordu. Çok büyük
tam satır da sınırsız JSON.parse işlemine giriyordu.

Düzeltme: hem tek tam satır hem kalan satırsız buffer UTF-8 byte boyutuyla
5 MiB sınırındadır. Aşımda worker kapatılır, bekleyen bütün istekler hata
alır, sonraki arama yeni worker kurar. Önceki worker'ın geç data/close
olayları yeni worker'a karışmaz. Sınır istek boyutunu değiştirmez.

## Kanıt

Yeni tests/report471-regressions.test.js eski kodda iki testte kırmızı:
callback TypeError ve child.killed undefined. Son halinde üç test:
null zarf, satırsız taşma/iki bekleyen istek/yeniden açılış/geç eski olay,
tam satır taşması. Üçü geçti. Gerçek modül VM'de mock subprocess akışıyla
koşulur; gerçek model kalitesi veya bellekte yük testi iddia edilmez.

Node dosyaları report471-regressions, browser-feature-services,
browser-translation-quality-loop, ci-determinism-ratchet, package-integrity
geçti. Ürün JS syntax ve git diff kontrolü geçti. Backend/model/UI/CSS
değişmedi; yeni bağımlılık/şema yok. Tam yerel paket, gerçek YouTube/GPU,
start.bat ve model çalıştırılmadı. Güncel PR head Windows CI ayrıca beklenir.
