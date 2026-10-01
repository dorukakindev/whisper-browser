# -*- coding: utf-8 -*-
"""R323-3 — çeviri paket-bölme invariant property testi.

sentence_groups (cue → cümle grubu bölümlemesi) ve pack_sentence_groups
(grupları istek sınırına paketleme) saf fonksiyonlar; doğrudan fuzz'lanır.
Yanlış bölümleme = model bir satırın çevirisini başka satıra yazar
(reply_id_range_issue'un engellediği kayma); yanlış paketleme = istek
sınırı aşımı veya cümle ortasında kesim.

Invariant'lar bağımsız oracle olarak yeniden hesaplanır — fonksiyonun
kendi mantığı yeniden yazılmaz, sonucun fizik kuralları denetlenir.
"""
import math
import random
import sys
import unittest

sys.path.insert(0, 'backend')
from sentence_translation import (_BOUNDARY, normalized_text, pack_sentence_groups,
                                  sentence_ended, sentence_groups)


def _protected(entry):
    """sentence_groups içindeki protected() ölçütünün bağımsız kopyası."""
    start, end, text = entry
    try:
        start, end = float(start), float(end)
    except (TypeError, ValueError):
        return True
    return (not math.isfinite(start) or not math.isfinite(end)
            or end <= start or not normalized_text(text)
            or bool(_BOUNDARY.search(str(text).strip())))


class SentenceGroupsFuzz(unittest.TestCase):
    def _gen_entries(self, rnd, n):
        """Hostile cue dizisi: örtüşme, sıfır-süre, NaN, sınır işaretleri."""
        entries, t = [], rnd.uniform(0, 5)
        for i in range(n):
            r = rnd.random()
            if r < 0.05:
                start, end = t, t  # sıfır süre
            elif r < 0.10:
                start, end = t, t - rnd.uniform(0, 1)  # ters süre
            elif r < 0.15:
                start, end = float('nan'), t + 1.0  # NaN zaman
            elif r < 0.25:
                start, end = t - rnd.uniform(0, 0.5), t + rnd.uniform(0.2, 2)  # örtüşme
            else:
                start = t
                end = t + rnd.uniform(0.3, 4)
            text_roll = rnd.random()
            if text_roll < 0.06:
                text = "- Konuşmacı işaretli replik" if rnd.random() < 0.5 else "NAME: sınır metni"
            elif text_roll < 0.10:
                text = "   "  # boş metin
            elif text_roll < 0.45:
                text = f"cümle sonu tamam {i}."
            elif text_roll < 0.7:
                text = f"devam eden parça {i} ve"
            else:
                text = f"soru soruyor musun {i}?"
            entries.append((start, end, text))
            t = max(end, start) + rnd.uniform(-0.2, 2.5)
        return entries

    def test_partition_and_protected_singletons(self):
        rnd = random.Random(20260930)
        MAX_GAP, MAX_CHARS, MAX_DUR, MAX_PARTS = 1.2, 280, 12, 6
        for trial in range(600):
            n = rnd.randrange(0, 40)
            entries = self._gen_entries(rnd, n)
            speakers = ({i: f"S{i % 3}" for i in rnd.sample(range(n), min(n, rnd.randrange(n + 1)))}
                        if n else None)
            groups = sentence_groups(entries, MAX_GAP, MAX_CHARS, MAX_DUR, MAX_PARTS,
                                     speakers=speakers)
            flat = [i for g in groups for i in g]
            # 1) Tam bölümleme + artan sıra
            self.assertEqual(flat, list(range(n)), f"trial {trial}: bölümleme bozuk")
            for group in groups:
                self.assertTrue(group)
                entry_protected = [_protected(entries[i]) for i in group]
                # 2) Korumalı cue yalnız kalır
                if any(entry_protected):
                    self.assertEqual(len(group), 1,
                                     f"trial {trial}: korumalı {group} tek başına değil")
                    continue
                # 3) Çoklu grup limitleri
                self.assertLessEqual(len(group), MAX_PARTS)
                chars = sum(len(normalized_text(entries[i][2])) for i in group) + len(group) - 1
                self.assertLessEqual(chars, MAX_CHARS,
                                     f"trial {trial}: karakter aşımı {chars}>{MAX_CHARS}")
                self.assertLessEqual(float(entries[group[-1]][1]) - float(entries[group[0]][0]),
                                     MAX_DUR + 1e-9)
                for prev, cur in zip(group, group[1:]):
                    ps, pe, ptxt = entries[prev]
                    cs, ce, _ = entries[cur]
                    # 4) Aralık kuralı: grup içinde gap [-0.05, MAX_GAP]
                    gap = float(cs) - float(pe)
                    self.assertGreaterEqual(gap, -0.05 - 1e-9, f"trial {trial}: negatif gap")
                    self.assertLessEqual(gap, MAX_GAP + 1e-9, f"trial {trial}: gap {gap}")
                    # 5) Grup içindeki önceki cue cümleyle bitmez (bitseydi grup kapanırdı)
                    self.assertFalse(sentence_ended(ptxt),
                                     f"trial {trial}: cümle-sonu iç bölünmüş {ptxt!r}")
                    # 6) Konuşmacı değişimi grup içinde olmaz
                    if speakers and speakers.get(prev) and speakers.get(cur):
                        self.assertEqual(speakers[prev], speakers[cur])

    def test_determinism(self):
        rnd = random.Random(5)
        entries = self._gen_entries(rnd, 30)
        self.assertEqual(sentence_groups(entries), sentence_groups(entries))


class PackSentenceGroupsFuzz(unittest.TestCase):
    def _gen_groups(self, rnd, g, n):
        """Rastgele ardışık-olmayan indeks grupları üret."""
        groups, idx = [], 0
        for _ in range(g):
            if idx >= n:
                break
            if rnd.random() < 0.2:
                idx += rnd.randrange(1, 4)  # örtüşmeyen kopyalarda delik
            size = rnd.choice([1, 1, 1, 2, 3, 25])  # 25: limiti aşan tek grup
            group = []
            for _ in range(size):
                if idx >= n:
                    break
                group.append(idx)
                idx += 1
            if group:
                groups.append(group)
        return groups

    def test_partition_contiguity_limit(self):
        rnd = random.Random(77)
        for trial in range(600):
            groups = self._gen_groups(rnd, rnd.randrange(1, 15), rnd.randrange(1, 60))
            limit = rnd.choice([4, 10, 20])
            chunks = pack_sentence_groups(groups, limit)
            flat = [i for c in chunks for i in c]
            self.assertEqual(flat, [i for g in groups for i in g],
                             f"trial {trial}: paket bölümü farklı")
            for chunk in chunks:
                self.assertTrue(chunk)
                # Ardışık indeks koşusu: sıralı indeksler deliksiz aralık
                self.assertEqual(chunk, list(range(chunk[0], chunk[0] + len(chunk))),
                                 f"trial {trial}: chunk {chunk} ardışık değil")
                # Sınır: tek başına aşan tek grup dışında chunk ≤ limit —
                # aşan chunk tek bir kaynak gruba eşit olmalı.
                if len(chunk) > limit:
                    self.assertIn(chunk, groups,
                                  f"trial {trial}: aşırı chunk {chunk} tek grup değil")

    def test_pack_boundary_justification_oracle(self):
        """Bağımsız oracle: paketin kesim noktası ya ardışıksızlık ya limit."""
        rnd = random.Random(88)
        for trial in range(400):
            groups = self._gen_groups(rnd, rnd.randrange(1, 12), rnd.randrange(1, 50))
            limit = 20
            chunks = pack_sentence_groups(groups, limit)
            # Oracle'ın beklediği chunk listesi: grupları sırayla tara.
            expected, cur = [], []
            for group in groups:
                if cur and (group[0] != cur[-1] + 1 or len(cur) + len(group) > limit):
                    expected.append(cur)
                    cur = []
                cur.extend(group)
            if cur:
                expected.append(cur)
            self.assertEqual(chunks, expected, f"trial {trial}: paket kesimi oracle'dan saptı")

    def test_empty_and_single(self):
        self.assertEqual(pack_sentence_groups([], 20), [])
        self.assertEqual(pack_sentence_groups([[5]], 20), [[5]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
