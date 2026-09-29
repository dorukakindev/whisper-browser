# R276 — ASS/SSA override etiketi roundtrip sadakati

**Tarih:** 2026-09-30 · Dal: `fix/r276-ass-override` → `master` · **Sonuç: temiz — bug yok**

## Kapsam

ASS/SSA dosyası çevirisi/yeniden-yazımı sırasında biçimlendirme etiketlerinin kaderi:
`parse_ass` metindeki tüm `{...}` override bloklarını temizler; `parse_ass_cue_formats`
aynı indeks hizasında korunacak bilgiyi çıkarır; `cue_format_decorations` her çıktı
biçimine uygun ön/son ek üretir (`write_ass` kaçış sonrası ekler — metin asla komut olamaz).

## Doğrulanan sözleşme (kasıtlı kürasyon)

| Etiket | ASS çıktı | SRT | VTT | Gerekçe |
|---|---|---|---|---|
| `{\an7-9}` (üst) | `{\anN}` | `{\anN}` | — | tabela üstte kalsın |
| `{\an1-6}` (alt/orta) | `{\anN}` | — | — | konum bilgisi |
| `\pos(x,y)` | `{\pos(x,y)}` | — | — | sabit konum |
| `\i1` (tüm satır) | `{\i1}` | `<i>…</i>` | `<i>…</i>` | iç ses/şarkı |
| `\k \kf \ko` karaoke | düşer | düşer | düşer | hece zamanlaması kaynağa bağlı |
| `\fad \fade \move \t` | düşer | düşer | düşer | kaynak zaman eksenine bağlı |
| `\fn \fs \c \b \frz \p` | düşer | düşer | düşer | stillendirme politikası |
| satır-içi `\i1` | düşer | düşer | düşer | tam kapsama değil — yanlış yerleşim olur |

## İndeks-güvenliği kilitleri

- Boş-cue süzgeci (`drop_empty_entries`) formats listesini aynı indeksle süzer —
  `{\\fad(0,200)}`-yalnız satır düşerken sonraki `{\\an8}` satıra kaymaz.
- `parse_ass` ve `parse_ass_cue_formats` aynı zaman-parse kapısını kullanır;
  bozuk zamanlı Dialogue iki tarafta da atılır → eşleme kaymaz.
- SSA `Marked=` alanlı Format satırı desteklenir; `\\pos(abc,def)` regex
  geçmez → decorations'a sızmaz.
- `merge_continuation` ve `dedupe_cues` indeks eşlemesini bozduğunda formats
  tamamen sıfırlanır (yanlış satıra etiket taşınmaz) — mevcut davranış, test kilitli.

## Testler

`backend/test_ass_override_roundtrip.py` — 8 senaryo: leading üç etiketin ASS
roundtrip'i, SRT/Vtt ayrımı, karaoke/fade/move/font/renk düşüşü, satır-içi italik
reddi, boş-cue eşleme, SSA/Format varyasyonu, bozuk zaman eşleme.
`backend/venv/bin/python backend/test_ass_override_roundtrip.py` → 8/8 PASS.
