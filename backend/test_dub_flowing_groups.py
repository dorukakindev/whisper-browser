"""Speech block boundaries, source IDs and plan/generation agreement."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))
from dub_plan import make_groups, grouping_options


class FlowingGroups(unittest.TestCase):
    def test_short_complete_sentences_share_natural_context(self):
        cues = [(0, 2000, 'Bugün hava oldukça güzel.'),
                (2100, 4000, 'Birlikte dışarıya çıkabiliriz.'),
                (4100, 6000, 'Sahilde biraz yürümek iyi olur.')]
        old = make_groups(cues)
        flowing = make_groups(cues, **grouping_options('akici'))
        self.assertEqual(len(old), 3); self.assertEqual(len(flowing), 1)
        self.assertEqual(flowing[0]['source_ids'], [1, 2, 3])
        self.assertEqual(flowing[0]['text'], ' '.join(cue[2] for cue in cues))
        self.assertEqual((flowing[0]['start'], flowing[0]['end']), (0, 6000))

    def test_pauses_speakers_and_limits_are_boundaries(self):
        for cues in [
            [(0, 1000, 'Merhaba.'), (2000, 3000, 'Bugün nasılsın?')],
            [(0, 1000, 'Merhaba.'), (1100, 2000, '- Başka konuşmacı.')],
            [(0, 1000, '- İlk konuşmacı.'), (1100, 2000, 'Başka konuşma.')],
            [(0, 1000, 'x' * 400), (1100, 2000, 'y' * 200)],
            [(0, 15000, 'İlk cümlenin devamı'), (15100, 30000, 'burada sona eriyor.')]]:
            self.assertEqual(len(make_groups(cues, **grouping_options('akici'))), 2)

    def test_range_keeps_original_identity_and_never_reads_outside_cues(self):
        cues = [(0, 1000, 'Önce.'), (2000, 4000, 'Seçilen.'), (4100, 6000, 'Devam.'), (7000, 9000, 'Sonra.')]
        groups = make_groups(cues, 2, 6, **grouping_options('akici'))
        self.assertEqual(groups[0]['source_ids'], [2, 3])
        self.assertEqual(groups[0]['text'], 'Seçilen. Devam.')
        self.assertEqual((groups[0]['start'], groups[0]['end']), (2000, 6000))
        self.assertEqual(len(make_groups(cues, **grouping_options('satir'))), 4)


if __name__ == '__main__': unittest.main()
