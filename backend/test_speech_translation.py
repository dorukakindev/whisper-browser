"""Speech translation reuses the translation pass and preserves cue ownership."""
import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

import test_transcribe as F

T = F.T


class SpeechTranslationTests(unittest.TestCase):
    def test_speech_prompt_preserves_contract_and_is_opt_in(self):
        ordinary = T.build_translate_prompt('tr', 'en', [])
        speech = T.build_translate_prompt('tr', 'en', [], for_speech=True)
        self.assertNotIn('SESLENDIRMEYE UYGUN', ordinary)
        for instruction in ('SESLENDIRMEYE UYGUN', 'ozetleme veya kisaltma',
                            'ID ekleme, silme veya birlestirme', 'Turkcede yuklem'):
            self.assertIn(instruction, speech)
        self.assertIn('GUVENILMEZ', speech)

    def test_options_disable_paid_second_pass_without_mutating_preferences(self):
        saved = F._TrArgs(translate_for_speech=True, translate_refine=True,
                          llm_postprocess=True, merge_continuation=True, dedupe_cues=True)
        effective = T.speech_translation_args(saved)
        for field in ('translate_refine', 'llm_postprocess', 'merge_continuation', 'dedupe_cues'):
            self.assertFalse(getattr(effective, field))
            self.assertTrue(getattr(saved, field))
        self.assertEqual(effective.translate_variant_label, 'speech')
        normal = F._TrArgs()
        self.assertIs(T.speech_translation_args(normal), normal)

    def test_one_translation_request_no_refine_and_exact_source_timings(self):
        args = F._TrArgs(translate_for_speech=True, translate_refine=True, translate_cache=False)
        result, seen, _events, warnings = F._sentence_translate(F._SENTENCE_SOURCE, args)
        self.assertEqual(len(seen), 1, warnings)
        self.assertIn('SESLENDIRMEYE UYGUN', seen[0][1]['messages'][0]['content'])
        self.assertIn('sentence_groups.duration', seen[0][1]['messages'][0]['content'])
        self.assertEqual([(s, e) for s, e, _ in result], [(s, e) for s, e, _ in F._SENTENCE_SOURCE])
        self.assertEqual([text for _, _, text in result], F._SENTENCE_PARTS)

    def test_cache_separates_modes_and_identical_speech_run_makes_no_request(self):
        with tempfile.TemporaryDirectory() as directory:
            args = F._TrArgs(translate_for_speech=True, translate_refine=True,
                              translate_cache=True, cache_dir=directory)
            result, first, _, _ = F._sentence_translate(F._SENTENCE_SOURCE, args)
            again, second, _, _ = F._sentence_translate(F._SENTENCE_SOURCE, args)
            normal, ordinary, _, _ = F._sentence_translate(F._SENTENCE_SOURCE,
                F._TrArgs(translate_cache=True, cache_dir=directory))
            self.assertEqual(result, again)
            self.assertEqual(len(first), 1)
            self.assertEqual(len(second), 0)
            self.assertEqual(len(ordinary), 1, 'speech cache leaked into normal translation/memory')
            key = T.translate_cache_key('Hello.', F._TrArgs(), 'tr', 'en')
            speech_key = T.translate_cache_key('Hello.', T.speech_translation_args(args), 'tr', 'en')
            self.assertNotEqual(key, speech_key)

    def test_srt_export_keeps_cues_and_does_not_resume_ordinary_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            source = folder / 'video.en.srt'
            source.write_text('1\n00:00:01,125 --> 00:00:02,250\nFirst line.\n\n'
                              '2\n00:00:03,375 --> 00:00:04,500\nSecond line.\n', encoding='utf-8-sig')
            seen = []
            def translate(entries, args, warnings, source_lang=None, status_out=None, precompleted=None):
                seen.append((list(entries), dict(precompleted or {})))
                status_out.update(completed=list(range(len(entries))), failed=[])
                return [(s, e, ['Birinci cümle.', 'İkinci cümle.'][i]) for i, (s, e, _) in enumerate(entries)]
            def args(speech, existing=''):
                return F._TrArgs(input=str(source), output_dir=directory, language='en',
                    max_lines=2, wrap_mode='sentence', formats='srt', dual_subtitle=False,
                    dual_translation_first=False, translate_for_speech=speech,
                    translate_existing=existing, translate_cache=False, merge_continuation=True)
            with patch.object(T, 'llm_translate', side_effect=translate), patch.object(T, 'emit'), patch.object(T, 'log'):
                T.translate_existing_subtitle(args(False))
                normal = folder / 'video.tr.srt'
                with patch.object(T, 'dedupe_rolling_window_cues', side_effect=AssertionError('speech must preserve original cues')):
                    T.translate_existing_subtitle(args(True, str(normal)))
            speech = folder / 'video.tr.speech.srt'
            self.assertTrue(normal.is_file())
            self.assertTrue(speech.is_file())
            self.assertEqual(seen[1][1], {}, 'ordinary completed cues were mistaken for speech output')
            expected = T.parse_subtitle_entries(source.read_text(encoding='utf-8-sig'), '.srt')
            actual = T.parse_subtitle_entries(speech.read_text(encoding='utf-8-sig'), '.srt')
            self.assertEqual([(s,e) for s,e,_ in actual], [(s,e) for s,e,_ in expected])
            self.assertTrue(json.loads(Path(str(speech)+'.meta.json').read_text(encoding='utf-8'))['forSpeech'])


if __name__ == '__main__':
    unittest.main()
