# R323-3 — Çeviri paket-bölme invariant property testi

**Tarih:** 2026-09-30
**Dal:** `devin/1790763957-r323-3-pack-fuzz`
**Kapsam:** `sentence_groups` + `pack_sentence_groups` (backend/sentence_translation.py).

## Sonuç: temiz — bug yok

Çeviride satır kayması riskinin iki katmanı kilitlendi: cue'ların cümle gruplarına
bölümlemesi ve grupların istek sınırına paketlenmesi. Tüm invariant'lar bağımsız
oracle olarak yeniden hesaplanıp doğrulandı.

## Denetlenen invariant'lar

### `sentence_groups` (600 tohum, ~0-40 cue/hostile dizi)
1. **Tam bölümleme:** her indeks tam bir gruba aittir, sıra korunur.
2. **Korumalı tekil:** NaN/sıfır-süre/boş metin/sınır-işaretli (`- `, `NAME:`, `<v`, `♪`) cue yalnız kalır — birleşirse bağlamı kirletir ve `speaker_changed` kapısı bozulur.
3. **Gap:** grup içi ardışık çiftlerde `-0.05 ≤ gap ≤ 1.2` (negatif tolerans = hafif örtüşme).
4. **Süre/karakter/parça:** çoklu grupta ≤ 6 parça, ≤ 280 karakter (joiner dahil), ≤ 12 s pencere.
5. **İç cümle-sonu yasağı:** grup içinde önceki cue `sentence_ended` olamaz (bitseydi grup kapanırdı).
6. **Konuşmacı:** iki taraf da etiketliyse farklı speaker aynı grupta olmaz; etiketsiz cue serbest (dokümante sınır).
7. **Determinizm:** aynı girdi → aynı çıktı.

### `pack_sentence_groups` (600+400 tohum, limit 4/10/20)
1. Bölümleme: paket düzleştirmesi girdi düzleştirmesiyle birebir.
2. Her chunk ardışık-indeks koşusu (deliksiz aralık).
3. Chunk ≤ limit — yalnız tek başına aşan grup istisnası (aşan chunk tek kaynak gruba eşit).
4. Kesim noktası oracle'ı: ya ardışıksızlık (cache isabeti deliği) ya `len(cur)+len(group)>limit` — bağımsız yeniden hesap birebir eşleşti.
5. `[]` → `[]`, `[[5]]` → `[[5]]` kenarları.

## Olası etki senaryosu (kilitlenen sınıf)

- **Kesim kayması:** `group[0] != current[-1]+1` kontrolü olmasaydı cache-isabetiyle araya giren satır iki cümleyi birleştirir → `accept_sentence_reply` kimlik aralığına takılır veya yanlış eşleşme yazılır. Ardışıklık invariant'ı bunu kilitler.
- **Cümle ortası paket:** `pack` cümle grubunu asla bölmüyor — model tek istekte bütün cümleyi görür.

## Kalan sınırlar

- Fuzz girdisi sentetik; gerçek konuşmacı sözlüğü pyannote çıktısından gelir — davranışı ayrıca ele alınmadı (R320-4).
- `sentence_ended`'in kısaltma/initialism kuralları kendi testlerinde kilitli (test_sentence_distribution, 43 test).

## Testler

- `python3 backend/test_pack_sentence_fuzz.py` → 5/5 (1600+ fuzz denemesi)

## Windows etkisi

Yok.
