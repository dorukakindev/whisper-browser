# BROWSER_BUG_REPORT_133 — R133 derin denetim: sağlayıcı indirme kodlama hatası + eski kodlama desteği

**Tarih:** 2026-09-27 · **Dal:** `codex/r133-deep-audit-1790487824` · **Temel:** master `2c56a25` (PR #62)

## Özet

R133 turu: "bugları çöz ve kusursuzlaştır derinlemesine" talimatının devamı.
~120+ modülün derin okuması ve tüm desen süpürmeleri yeniden temiz çıktı
(R132 kapsam haritası üstüne ek okumalar — aşağıda). Audit'in tek **doğrulanmış
bug**'ı sağlayıcı altyazı indirme yolunda bulundu ve düzeltildi; aynı ziyarette
indirmenin kullanıcıya asıl görünür çıktısı olan kodlama doğruluğu, bağımsız
derinlemesine iyileştirmeyle güçlendirildi.

## Doğrulanmış bug

### B133-01 (MEDIUM) — UTF-8 dışı sağlayıcı altyazı dosyaları ham TypeError ile reddediliyordu

**Kök neden:** `downloadStremioSubtitle` ve OpenSubtitles indirme yolu, yanıt
gövdesini `new TextDecoder('utf-8', { fatal: true })` ile çözüyordu. Kiril
(cp1251), Orta Avrupa (cp1250), Çin (GBK/GB18030/Big5), Japon (Shift-JIS)
arşivlerinde saklanan eski kodlamalı dosyalar fatal-decode'da **ham TypeError**
fırlatıyordu — kullanıcıya "İndirilen dosya geçerli altyazı metni değil"
yakalanmış hatası yerine genel indirme çöküşü yansıyordu. OpenSubtitles'ta
özellikle eski Rusca/Slav altyazıları cp1251 olarak yayılır; Stremio
sağlayıcısı aynı dosyaları birebir servis eder.

**Düzeltme:** iki indirme ucu da `decodeSubtitleBuffer(bytes, { language })`
üstüne kurulu `decodeDownloadedSubtitle` ortak yardımcısına geçti.
`language` sağlayıcı kaydından renderer → `feature-services` → `downloadSubtitle`
zinciriyle taşınıyor (Stremio `subtitles[].lang`, OpenSubtitles
`language` alanı). Ayrıca altyazı yapısı kapısı eklendi: metin `-->` zaman
işareti, WEBVTT başlığı ya da ASS bölümü içermiyorsa `INVALID_SUBTITLE` —
önceden altyazı olmayan düz metin sessizce `.srt` olarak kaydedilebiliyordu.

**Regresyon testleri:** `tests/browser-subtitle-search.test.js` +3 (cp1251
bayt dizisi ipuclu+ipucsuz indirme; PNG-magic ikili ve altyazısız düz metin
reddi).

## Eşlik eden iyileştirme — bağımsız eski-kodlama çözümü

`browser-textutil.js`'teki `decodeSubtitleBuffer(value)` imzası
`options = {}` alacak şekilde genişledi ve FFFD dalına gerçek bir
**bağımsız kodlama tahmini** (`pickLegacyEncoding`) bağlandı. Önceden UTF-8
dışı her dosya koşulsuz `cp1254`'e düşüyordu — Türkçe dışındaki eski
altyazılar (Kiril, Orta Avrupa, Yunan, Arap, İbrani, Tay, Baltık, CJK)
bozuk metinle içe aktarılıyordu.

Yeni akış (hepsi bağımsız, harici kütüphane yok — Node full-ICU
`TextDecoder`):

1. **Dil ipucu** (`options.language`, ISO 639-1/2 → codepage eşlemi):
   sağlayıcı kaydının taşıdığı dil varsa ve o kodlamanın çözümü tutarlıysa
   (coherence ≥ 0.6, ≥3 harf, sıfır gürültü) hızlı-kabul — beraberliklerin
   belirleyicisi.
2. **Aday havuzu:** 20 eski kodlama (windows-1250/51/52/53/55/56/57/58/874,
   iso-8859-5/7, koi8-r, ibm866, x-mac-cyrillic, gb18030, big5, shift_jis,
   euc-jp, iso-2022-jp, euc-kr) yaygınlık sırasıyla.
3. **Fatal çok-bayt kapısı:** çok-bayt adaylar `{fatal:true}` ile çözülür;
   geçersiz çift/üçlü dizisi = elenme (tek-bayt adaylar her zaman geçer,
   skor ayırır).
4. **Harf-senaryo profili** (`legacyTextProfile`): blok başına harf sayımı
   (Kiril/Yunan/İbrani/Arap/Tay/kana/hangul/CJK/Latin; ASCII a-zA-Z Latin'e
   sayılır), FFFD/C1/PUA/surrogate gürültüsü, Ω-şıklı yumuşak semboller,
   nadir Kiril harfleri (єіїјљњћџѕўґ) ve aksan-yoğunluk oranı.
5. **Skor** (`legacyDecodeScore`): dominant×4 + harf + tutarlılık bonusu
   (≥0.8 → +30, ≥0.5 → +12) + kana +45 (yanlış adaylar kana üretemez) +
   hangul +10 (gb18030 baytlarının euc-kr sahte hangul'u zayıf tutuldu) +
   kana+CJK karışımı +20 − gürültü/sembol/nadir/aksan-yükü cezaları.
6. **Güçlü çok-bayt havuzu:** herhangi bir aday "güçlü çok-bayt" geçerse
   (≥4 harf, dominant ∈ {cjk, kana, hangul}, tutarlı) tek-bayt adaylar
   yarışamaz — tek-bayt çözümleri CJK baytlarında hep akla uygun çöp
   üretir.
7. **cp1254 taban marjı:** en iyi aday baseline'ı (cp1254) +12 puan
   geçemiyorsa dosya cp1254 kalır — Türkçe davranışı korunur (mevcut 4 test
   hâlâ yeşil).

### Doğrulanan kodlama matrisi (bayt fixture'ları, ipucsuz)

| Girdi | Sonuç |
|---|---|
| cp1251 "Привет мир, как дела?" | windows-1251 ✓ |
| cp1250 "Zażółć gęślą jaźń" | windows-1250 ✓ |
| gb18030 "你好，世界" (kısa + uzun) | gb18030 ✓ |
| shift_jis "こんにちは世界" | shift_jis ✓ |
| cp1254 "Çok güzel bir gün" | cp1254 ✓ (taban korundu) |
| big5 geleneksel Çince | big5 ✓ |
| euc-kr "안녕하세요 세계" | euc-kr ✓ |

**Belgelenmiş sınırlar (çözülmez çok-anlamlılık):** aynı bayt dizisi birden
çok tek-bayt kodlamada tutarlı metin üretebilir (cp1253↔cp1251, cp1256↔cp1251
beraberliği yaygınlık sırasıyla kırılır); 4 harflik İbranice kenar durumu
euc-jp'ye kayabilir. Tümü `language` ipucuyla (sağlayıcı yolu) veya elle
kodlama seçiciyle (yerel dosyalar) çözülür — `subtitle-encoding-preview.js`
listesi 20 eski kodlamaya genişletildi.

## Bu turda temiz çıkan süpürmeler (R132 haritasına ek)

- `browser-textutil.js` eski okuma + yeni akış — BOM/UTF-16/BOM'suz UTF-8
  yolları ve cp1254 dar-alan sezgisi korunur.
- `browser-subtitle-search.js` — arama ladder'ı, allowlist, redirect döngüsü
  (R128), yeni yapı kapısı.
- `browser-feature-services.js` `subtitle-download` şeması + `language`
  alanı zinciri.
- `tests/fixtures/css-hardcoded-color-baseline.txt` sınırı bozulmadı.

## Testler

- `tests/browser-textutil.test.js` 9/9 (5 yeni: cp1251, cp1250, gb18030,
  sjis, el-ipucu beraberliği)
- `tests/browser-subtitle-search.test.js` — fixture testleri geçti (3 yeni
  vaka yukarıda)
- `tests/browser-subtitles.test.js` 80/80, `browser-subtitle-files` 5/5,
  `browser-subtitle-output`, `subtitle-export-validation`,
  `browser-subtitle-standards`, `browser-subtitle-menu`, `player-ui` 151/151
- `node --check` değişen 4 dosya temiz

## Windows etkisi ve doğrulanmamış sınırlar

- Windows etkisi yok — yalnız bayt→metin çözüm mantığı; `start.bat`,
  dosya seçici, GPU akışları dokunulmadı.
- Doğrulanmadı: gerçek OpenSubtitles/Stremio uçundan cp1251/GBK dosya
  indirmesi (mock fixture'la doğrulandı; gerçek sağlayıcı kaydı `lang`
  alanı döndürüyor, Windows'ta el kontrolü önerilir).
- Yerel dosya içe aktarımı (`browser-subtitles.js:1847`) dil ipucu olmadan
  çalışır; yanlış tahmin halinde ayarlar → altyazı kodlama seçiciyle elle
  düzeltilebilir (liste genişletildi).
