# BROWSER_BUG_REPORT_149 — R150 canlı sağlayıcı doğrulaması

Tarih: 2026-09-27 · Dal: `codex/r150-live-providers-1790520116` · Kod commit: `280da5b`

## Kapsam

Gerçek sağlayıcı uçlarına karşı canlı doğrulama: Stremio OS-v3 (anahtarsız),
OpenSubtitles REST (anahtarlı), yt-dlp canlı çıkarım. Önceki turlar mock
fixture ile doğrulanmıştı — bu tur gerçek ağ kanıtı getirdi ve iki
**canlıda-bulanan gerçek bug** çıkardı.

## Canlı kanıtlar

| Uç | Sonuç |
|---|---|
| `GET https://opensubtitles-v3.strem.io/subtitles/movie/tt0137523.json` | 200 — 36 altyazı (eng/spa/pob/…) |
| `searchSubtitles(tt0137523)` anahtarsız | Stremio basamağı devreye girdi ✓ |
| `downloadSubtitle` (stremio, eng) | 143KB SRT, "People always ask me if I know Tyler Durden" — doğru film |
| `downloadSubtitle` (stremio, rus) | cp1251 **gerçek dosya** → "БОЙЦОВСКИЙ КЛУБ" — R133/R134 eski-kodlama düzeltmesi canlıda doğrulandı |
| `yt_dlp --skip-download --print title` (jNQXAC9IVRw) | "Me at the zoo" — çıkarım çalışıyor (JS-runtime uyarısı yalnız format listesi sınırlaması) |
| OpenSubtitles REST | 301 reachable; API anahtarı olmadan arama/indirme doğrulanamaz |

## Bulunan gerçek buglar (canlıda yakalandı)

### B1 — Stremio seri URL biçimi yanlış → anahtarsız dizi araması hep 404 (DÜZELTİLDİ)

`searchStremioSubtitles` `/subtitles/series/<imdb>/<s>/<e>.json` üretiyordu;
Stremio addon sözleşmesi video id'sini `imdb:s:e` biçiminde ister
(`/subtitles/series/tt0903747:1:1.json` → 200, `…/tt0903747/1/1.json` → 404).
**Etki:** API anahtarı olmayan kurulumda her dizi altyazısı araması
`PROVIDER_ERROR` ile düşüyordu — Stremio basamağı seriler için tamamen
ölüydü. Ayrıca mevcut birim testi yanlış yolu doğruluyordu (sözleşmeyi
yanlış mühürlemişti); doğru biçimle güncellendi.

### B2 — Dil filtresi ISO 639-1↔639-2 uyuşmazlığında sessizce devre dışı (DÜZELTİLDİ)

UI `bfLanguage` 2 harfli kod gönderir (`tr`, `ru`), Stremio `lang` alanı
639-2/-3 döndürür (`tur`, `rus`, `pob`). `normalized(a)===normalized(b)`
kıyaslaması `tr`≠`tur` olduğundan `hits` hep boş → istenen dil yerine
tüm karışık liste dönüyordu (canlıda `ru` isteği 36 karışık satır verdi).
Dil puanlaması (+10) da aynı sebeple hiç çalışmıyordu.

Düzeltme: `ISO_639_2_TO_1` alias tablosu (~90 dil, bibliografik+terminolojik
kodlar dahil) + `langCode()` normalizasyonu. Filtre ve skor artık
alias'lı. Canlı doğrulama: `ru`→1 `rus` satırı, `pt`→`pob`+`por` 6 satır,
`tr`→Breaking Bad'de 4 `tur` satırı.

## Doğrulanmamış sınırlar

- OpenSubtitles anahtarlı uçları (login, /subtitles, /download, kota)
  gerçek hesapla doğrulanmadı — kullanıcı ortamında API anahtarı lazım.
- yt-dlp canlıda JS-runtime uyarısı üretti (deno yok) — bazı formatlar
  eksik olabilir; `install-browser-tools` akışı Windows'ta bunu kapsar.

## Testler

- `tests/browser-subtitle-search.test.js` — +3 vaka (ISO-3 filtresi tr/pt,
  alias'lı dil puanı) + seri URL sözleşmesi düzeltmesi. Tümü geçti.
- `browser-textutil` 11/11, `node --check` temiz.
