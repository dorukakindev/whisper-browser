# R323-1 — SRT/VTT/ASS roundtrip mega-fuzz (~100k cue)

**Tarih:** 2026-09-30
**Dal:** `devin/1790763242-r323-vtt-entities`
**Kapsam:** yazıcı→ayrıştırıcı tam-tur sadakati, 3 format × wrap modları × hostile metin.

## Bulgular

### B-323-01 — VTT okuyucu HTML entity'lerini çözmüyor (DÜZELTİLDİ)

`write_vtt` cue metnini spec gereği kaçırır: `&`→`&amp;`, `<`→`&lt;`, `-->`→`--&gt;` (`vtt_escape_cue_text`). Fakat `parse_srt(vtt=True)` geri okurken entity'leri çözmüyordu.

**Kanıt (kırmızı→yeşil):** fuzz `&amp; &lt; &gt;` içeren cue'da master'da FAIL — parse çıktısı `&amp; &lt; &gt;` düz metin kalıyor; düzeltmede `& < >` olarak döner.

**Etki:** uygulamanın kendi yazdığı VTT, re-export/`translate_existing` okuma yolunda entity'li metin olarak döner — çeviriye `&lt;` giden metin, yeniden yazımda `&amp;lt;` çift kaçışı. JS renderer yolu (`cleanCueText` → `decodeEntities`) zaten çözüyor; backend okuyucusu eşitlendi.

**Düzeltme:** `parse_srt` yalnız `vtt=True` kolunda `html.unescape(txt)` — SRT'nin entity semantiği yok, orada `&lt;` düz metin olarak kalır (doğru).

**Sözleşme notu:** yazıcı `_VTT_BARE_AMP` ile entity-benzeri girdiyi (`&amp;`, `&quot;`) zaten-kaçışlı sayar; okuyucu tek kez çözer. Kaynak metindeki literal `&amp;` → `&` olarak döner (yazıcı çıplak & ile entity'yi ayırt edemez — dokümante sınırlama).

## Mega-fuzz kapsamı (`backend/test_roundtrip_fuzz.py`)

- ~100.081 cue / 1.242 dosya, deterministic seed 20260930.
- Hostile metin havuzu: virgüller (ASS alan ayracı), `{ }` (override benzeri), `\N \h C:\yol` kaçışları, gerçek newline'lar, `{\an8}` parçası, entity'ler, RTL, emoji, >100 karakter, kenar boşlukları.
- İnvariantlar: cue sayısı korunur; zamanlar biçim çözünürlüğünde eşit (SRT/VTT ±2 ms, ASS ±12 ms); metin dokümante kaçış dönüşümleri sonrası eşit.
- Süre: ~3,7 s.

## Doğrulanmayan sınırlar

- TTML/sami/lrc yazıcı yok — roundtrip kapsamı SRT/VTT/ASS.
- `write_srt_raw` ve `parse_ass_cue_formats` (override saklama) ayrı testlerde kilitli (R276).

## Testler

- `python3 backend/test_roundtrip_fuzz.py` → 100.081 cue OK (3,7 s)
- `python3 backend/test_writer_roundtrip.py` → 8/8
- `python3 backend/test_golden_writers.py` + `test_output_reexport_all_formats.py` → OK
- `node --test tests/subtitle-parser-fuzz.test.js` → PASS

## Windows etkisi

Yok — metin işleme, platform bağımsız.
