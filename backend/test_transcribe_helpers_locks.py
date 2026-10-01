"""R334 — transcribe.py üst-seviye saf yardımcıların sözleşme kilitleri.

Nested yardımcılar (llm_translate içindeki ~25 closure, valid_cues içindeki
finite_time vb.) ait oldukları genel yolların testleriyle zaten kilitli; bu
dosya doğrudan çağrılabilen üst-seviye fonksiyonları kilitler.
"""

import math
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))

import transcribe


class NamingLocks(unittest.TestCase):
    def test_subtitle_source_id(self):
        a = SimpleNamespace(youtube='https://youtu.be/x', input='')
        b = SimpleNamespace(youtube='', input='/v/film.mp4')
        self.assertEqual(transcribe.subtitle_source_id(a, 'h'), transcribe.subtitle_source_id(a, 'h'))
        self.assertNotEqual(transcribe.subtitle_source_id(a, 'h'), transcribe.subtitle_source_id(b, 'h'))
        self.assertNotEqual(transcribe.subtitle_source_id(a, 'h1'), transcribe.subtitle_source_id(a, 'h2'))
        self.assertRegex(transcribe.subtitle_source_id(a, 'h'), r'^[0-9a-f]{64}$')

    def test_is_subtitle_language_tag(self):
        self.assertTrue(transcribe.is_subtitle_language_tag('en'))
        self.assertTrue(transcribe.is_subtitle_language_tag('en-US'))
        self.assertTrue(transcribe.is_subtitle_language_tag('pt-BR'))
        self.assertFalse(transcribe.is_subtitle_language_tag('forced'))
        self.assertFalse(transcribe.is_subtitle_language_tag('toolongname'))
        self.assertFalse(transcribe.is_subtitle_language_tag(''))
        self.assertFalse(transcribe.is_subtitle_language_tag(None))

    def test_split_subtitle_language_suffix(self):
        self.assertEqual(transcribe.split_subtitle_language_suffix('film.en.forced'), ('film', ['forced']))
        self.assertEqual(transcribe.split_subtitle_language_suffix('film.en.sdh'), ('film', ['sdh']))
        self.assertEqual(transcribe.split_subtitle_language_suffix('Dune.Part.Two'), ('Dune.Part.Two', []))
        self.assertEqual(transcribe.split_subtitle_language_suffix('a.tr'), ('a', []))
        self.assertEqual(transcribe.split_subtitle_language_suffix('film.forced'), ('film.forced', []),
                         'dil eki yoksa niteleyici başlıkta kalır')
        self.assertEqual(transcribe.split_subtitle_language_suffix('film.en.2020'), ('film.en.2020', []),
                         '2020 niteleyici değil; dil-dışı ek başlıkta kalır')

    def test_translation_artifact_path(self):
        p = transcribe.translation_artifact_path('/out', 'film', 'tr', 'srt')
        self.assertEqual(p.name, 'film.tr.srt')
        p = transcribe.translation_artifact_path('/out', 'film', 'tr', 'vtt', partial=True)
        self.assertEqual(p.name, 'film.tr.partial.vtt')
        p = transcribe.translation_artifact_path('/out', 'film', 'tr', 'srt', qualifier='yeni')
        self.assertEqual(p.name, 'film.tr.yeni.srt')
        p = transcribe.translation_artifact_path('/out', 'film', 'tr', '.srt', partial=True, qualifier='ceviri')
        self.assertEqual(p.name, 'film.tr.ceviri.partial.srt')


class CleanupLocks(unittest.TestCase):
    def _file(self, path, text='x'):
        path.write_text(text, encoding='utf-8')

    def test_cleanup_owned_partials(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            # boş hash → dokunmaz
            self._file(root / 'f.tr.partial.srt')
            self.assertEqual(transcribe.cleanup_owned_partial_translation_artifacts(root, 'f', 'tr', ''), [])
            # meta hash uyuşuyor → artifact + meta silinir
            self._file(root / 'a.tr.partial.srt')
            self._file(root / 'a.tr.partial.srt.meta.json',
                       '{"sourceHash":"H","targetLanguage":"tr"}')
            removed = transcribe.cleanup_owned_partial_translation_artifacts(root, 'a', 'tr', 'H')
            self.assertEqual(len(removed), 2)
            self.assertFalse((root / 'a.tr.partial.srt').exists())
            # hash uyuşmaz → korunur
            self._file(root / 'b.tr.partial.srt')
            self._file(root / 'b.tr.partial.srt.meta.json',
                       '{"sourceHash":"X","targetLanguage":"tr"}')
            removed = transcribe.cleanup_owned_partial_translation_artifacts(root, 'b', 'tr', 'H')
            self.assertEqual(removed, [])
            self.assertTrue((root / 'b.tr.partial.srt').exists())
            # nitelikli ad + sourceId uyuşmazlığı
            self._file(root / 'c.tr.ceviri.partial.srt')
            self._file(root / 'c.tr.ceviri.partial.srt.meta.json',
                       '{"sourceHash":"H","targetLanguage":"tr","sourceId":"S1"}')
            removed = transcribe.cleanup_owned_partial_translation_artifacts(root, 'c', 'tr', 'H', source_id='S2')
            self.assertEqual(removed, [], 'sourceId uyuşmazlığı → korunur')
            removed = transcribe.cleanup_owned_partial_translation_artifacts(root, 'c', 'tr', 'H', source_id='S1')
            self.assertEqual(len(removed), 2)


class TextUtilityLocks(unittest.TestCase):
    def test_strip_continuation(self):
        self.assertEqual(transcribe.strip_continuation('...devam...'), '...devam',
                         'varsayılan yalnız sondan siler')
        self.assertEqual(transcribe.strip_continuation('...devam...', at_start=True), 'devam...')
        self.assertEqual(transcribe.strip_continuation('devam…'), 'devam')
        self.assertEqual(transcribe.strip_continuation('…orta', at_start=True), 'orta')
        self.assertEqual(transcribe.strip_continuation('temiz'), 'temiz')
        self.assertEqual(transcribe.strip_continuation(None), '')

    def test_vtt_escape(self):
        out = transcribe.vtt_escape_cue_text('I <3 you & me')
        self.assertIn('&lt;3', out)
        self.assertIn('&amp;', out)
        self.assertEqual(transcribe.vtt_escape_cue_text('<i>korunur</i>'), '<i>korunur</i>')
        self.assertIn('--&gt;', transcribe.vtt_escape_cue_text('a --> b'))
        self.assertNotIn('\n\n', transcribe.vtt_escape_cue_text('satır1\n\n\nsatır2'))

    def test_balanced_two_line_break(self):
        self.assertEqual(transcribe.balanced_two_line_break(''), '')
        self.assertEqual(transcribe.balanced_two_line_break('kısa'), 'kısa')
        out = transcribe.balanced_two_line_break('Bu bir uzun cümledir ve iki satıra bölünmelidir.', 40)
        self.assertIsNotNone(out)
        lines = out.split('\n')
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(len(l) <= 40 for l in lines))
        # 2*genişlik sınırını aşan → None (çağıran wrap_text'e düşer)
        self.assertIsNone(transcribe.balanced_two_line_break('x ' * 100, 10))

    def test_translation_context(self):
        entries = [(i, i + 1, f'c{i}') for i in range(10)]
        before, after = transcribe.translation_context(entries, 5, 2)
        self.assertEqual(before, ['c3', 'c4'])
        self.assertEqual(after, ['c6', 'c7'])
        before, after = transcribe.translation_context(entries, 0, 3)
        self.assertEqual(before, [])
        self.assertEqual(after, ['c1', 'c2', 'c3'])
        self.assertEqual(transcribe.translation_context(entries, 5, 0), ([], []))

    def test_build_chat_prompt(self):
        tr = transcribe.build_chat_prompt('tr')
        self.assertIn('Turkce', tr)
        self.assertIn('GUVENLIK', tr)
        en = transcribe.build_chat_prompt('en')
        self.assertNotEqual(tr, en, 'hedef dile göre yanıt dili değişir')
        self.assertIn('[S1]', tr)
        self.assertIn('[T1]', tr)


class TimingLocks(unittest.TestCase):
    def test_clamp_nonpositive_durations(self):
        out = transcribe.clamp_nonpositive_durations([(1.0, 1.0, 'a'), (5.0, 5.0, 'b'), (7.0, 8.0, 'c')])
        self.assertEqual(len(out), 3)
        # sıfır süreli 'a': sonraki başlangıç (5s) altında ≥1ms
        self.assertGreater(out[0][1], out[0][0])
        self.assertLessEqual(out[0][1], 2.0)
        self.assertLessEqual(out[0][1], 5.0)
        # 'b' son cue değil ama sonraki 7.0 → max +1s
        self.assertGreater(out[1][1], out[1][0])
        self.assertLessEqual(out[1][1], 6.0)
        # sağlam cue dokunulmaz
        self.assertEqual(out[2], (7.0, 8.0, 'c'))
        # son cue: +1s tavan (sonraki cue yok)
        last = transcribe.clamp_nonpositive_durations([(10.0, 10.0, 'son')])[0]
        self.assertAlmostEqual(last[1], 11.0, places=3)
        self.assertEqual(transcribe.clamp_nonpositive_durations([]), [])
        self.assertEqual(transcribe.clamp_nonpositive_durations(None), [])

    def test_requires_word_timestamps(self):
        base = dict(formats='srt', split_mode='none', confidence_report=False, drop_repeated_hallucinations=False)
        self.assertFalse(transcribe.requires_word_timestamps(SimpleNamespace(**base)))
        self.assertTrue(transcribe.requires_word_timestamps(SimpleNamespace(**{**base, 'formats': 'srt,json'})))
        self.assertTrue(transcribe.requires_word_timestamps(SimpleNamespace(**{**base, 'split_mode': 'sentence'})))
        self.assertTrue(transcribe.requires_word_timestamps(SimpleNamespace(**{**base, 'confidence_report': True})))

    def test_preflight_output_dir(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / 'yeni' / 'derin'
            out = transcribe.preflight_output_dir(str(target))
            self.assertTrue(target.is_dir())
            self.assertEqual(out, target)
            # sonda probe dosyası kalmamalı
            self.assertFalse(list(target.glob('.whisper-write-probe-*')))
            # yol yerine dosya → RuntimeError
            file_path = Path(td) / 'dosya'
            file_path.write_text('x')
            with self.assertRaises(RuntimeError):
                transcribe.preflight_output_dir(str(file_path / 'alt'))

    def test_best_offset_scored(self):
        import numpy as np
        hz = 100
        rng = np.linspace(0, 4 * math.pi, 4 * hz)
        ref = np.sin(rng) + np.sin(rng * 3.7) * 0.4
        shift = int(1.2 * hz)
        sub = np.concatenate([np.zeros(shift), ref[: len(ref) - shift]])
        offset, score = transcribe.best_offset_scored(ref, sub, hz, max_shift_sec=5.0)
        self.assertAlmostEqual(offset, -1.2, delta=0.05)
        self.assertGreater(score, 0.5)
        offset, score = transcribe.best_offset_scored([], [1.0], hz)
        self.assertEqual((offset, score), (0.0, 0.0))


if __name__ == '__main__':
    unittest.main(verbosity=1)
