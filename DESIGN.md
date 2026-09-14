---
version: alpha
name: Whisper Browser
description: Türkçe video, altyazı ve çeviri çalışma istasyonu.
colors:
  background: '#0a0c0f'
  surface: '#101419'
  raised: '#151b22'
  border: '#27313b'
  text: '#edf1f3'
  muted: '#84929c'
  primary: '#d5a35c'
  danger: '#d06b63'
typography:
  sans:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, Consolas, monospace"
rounded:
  DEFAULT: 8px
  sm: 6px
  md: 8px
spacing:
  control-gap: 8px
  section-gap: 12px
components:
  button: {}
  input: {}
  disclosure: {}
  status: {}
---

# Whisper Browser tasarım kaydı

## Overview

Ses çalışma istasyonu: video merkezde, yoğun ama ikincil ayarlar kenarda. Ürün yönü ve Türkçe metin gereksinimi AGENTS.md tarafından tanımlanır. Kullanım Windows masaüstü; İngilizce öğrenme, pazarlama sayfası veya yeni bir marka tasarımı değildir. Hedef pazar hakkında dil dışında ayrı kanıt yoktur.

Bu dosya mevcut tasarımı kaydeder; token üretmez. Kanonik çalışma zamanı sahibi `src/renderer/styles.css` içindeki `:root` ve açık tema değişkenleridir. Ön yüz bu değerleri `var(--bg-0)`, `var(--bg-1)`, `var(--bg-2)`, `var(--text)`, `var(--border)` ve `var(--accent)` ile tüketir. Ürün davranışının sahibi AGENTS.md ve aşağıdaki iş akışı sözleşmesidir.

## Colors

Mürekkep/grafit katmanlar, sıcak amber etkileşim vurgusu. Hata, seçim ve pasif metin ayrı semantik token kullanır. Yeni panel açık temada da çalışma zamanı değişkenlerini izler. Dekoratif parıltı ve eski sabit mavi kullanılmaz.

## Typography

Mevcut sans serif yığını Türkçe metinleri taşır. Kod, süre ve teknik değerler için mevcut mono yığın kullanılabilir. Yeni bağımlı font veya CDN yüklenmez. Açıklamalar kısa, eylemler fiille başlayan Türkçedir.

## Layout

Video alanı ile yan panel ayrı kaydırma sahipleridir. Video araçları açılabilir panelde gruplanır; kapalı panel izlemeyi daraltmaz. Formlar dar genişlikte kırılır, sonuç listeleri sınırlı yükseklikte kayar. Native video WebContentsView, küçük oynatıcıya aynı örnek olarak taşınır. Pencere yakalaması çocuk video yüzeyini içermediğinden ayrıca video yakalanarak doğrulanır.

## Elevation & Depth

Hiyerarşi ince sınırlar ve yüzey tonlarıyla kurulur. Mini oynatıcı işletim sisteminin üstte tutulan ayrı penceresidir. Altyazı canvas'ı video üstündedir; ana uygulamanın eylem alanını kaplamaz.

## Shapes

Kontroller ve gruplarda mevcut 6–8 px köşe ailesi korunur. Eylemi açıklamayan ikon veya emoji eklenmez.

## Components

Native select ve Electron dosya seçicisi bu mevcut Windows uygulamasının kabul edilen sahipleridir; popup geometrisi işletim sistemine aittir. Metin alanları görünür etiket, düğmeler klavye odağı taşır. İşlem beklerken aynı eylem tekrar başlatılmaz; durum alanı hata ve boş sonucu bildirir. Sonuç metni HTML olarak çalıştırılmaz.

### İş akışı sözleşmesi

- Medya araçları etkin sekme, gezinme nesli ve medya kimliğine bağlıdır. Gecikmiş sonuçlar farklı videoya uygulanmaz.
- Sessizlikte hızlanma, ses profili ve otomatik jenerik/özet atlama varsayılan kapalıdır. Kaydedilen açık tercih kullanıcı kararıdır.
- Altyazı aday puanı sürüm metadatası eşleşmesidir; zaman senkronunun garantisi veya yüzde güven değildir.
- OCR seçilen video karesindeki bölgeyi okur. Sahne şeridi kullanıcının seçtiği yerel video dosyasından çıkarılır. Anlamsal arama yüklü altyazıda yerel çokdilli model kullanır.
- OpenSubtitles alanları maskeli, oturumluk girişlerdir. API anahtarı argv, log, devir notu veya normal ayar dosyasına yazılmaz.
- Jenerik/özet aralıkları video veya açıkça seçilen dizi kapsamında saklanır. Video değişimi atlama durumunu sıfırlar; geriye sarma tekrarlı otomatik atlamayı bastırır.

## Verification

Değişen akışlar ayrı Electron test profillerinde sınanır. ASS, küçük oynatıcı ve ürün entegrasyonu için `tests/electron-browser-*.smoke.js` dosyaları; ses, tercih ve kayıt kararları için ilgili hedefli testler kullanılır. Canlı OpenSubtitles hesabı, tüm siteler ve DRM başarısı kontrollü testlerden çıkarılmaz.
