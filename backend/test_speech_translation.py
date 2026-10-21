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
        self.assertNotIn('karakter/saniye).',speech)
        self.assertNotIn('Parcalari sure/max butcesine',speech)
        self.assertIn('karakter/saniye).',ordinary)
        self.assertIn('telgraf diline',speech)
        self.assertNotIn('Yuklemi veya kalan anlami sonraki ID', speech)
        self.assertIn('nesneyi yuklemden sonra yetim', speech)

    def test_speech_groups_keep_long_thought_but_respect_scene_and_speaker(self):
        entries = [(0, 11, 'We originally believed that ' + 'the evidence ' * 11),
                   (11.1, 21, 'would support this conclusion ' + 'in every case ' * 9),
                   (21.1, 26, 'but it did not.')]
        original = list(entries)
        speech = F._TrArgs(translate_for_speech=True)
        self.assertEqual(T.translation_sentence_groups(entries, speech), [[0, 1, 2]])
        self.assertGreater(len(T.translation_sentence_groups(entries, F._TrArgs())), 1)
        self.assertEqual(T.translation_sentence_groups(entries, speech, {0:'A',1:'B',2:'B'}), [[0],[1,2]])
        gap = [entries[0], (14, 21, entries[1][2]), entries[2]]
        self.assertEqual(T.translation_sentence_groups(gap, speech), [[0],[1,2]])
        self.assertEqual(entries, original)
        # An unpunctuated monologue remains bounded; never consume the file.
        long = [(i*3, i*3+2.9, 'a phrase without punctuation') for i in range(40)]
        groups = T.translation_sentence_groups(long, speech)
        self.assertTrue(all(len(g) <= 12 for g in groups))
        self.assertEqual([i for g in groups for i in g], list(range(40)))

    def test_speech_topic_context_is_bounded_read_only_and_part_of_cache(self):
        args = F._TrArgs(translate_for_speech=True, translate_cache=False)
        _, seen, _, _ = F._sentence_translate(F._SENTENCE_SOURCE, args)
        self.assertEqual(seen[0][0]['document_context'], ' '.join(e[2] for e in F._SENTENCE_SOURCE))
        _, ordinary, _, _ = F._sentence_translate(F._SENTENCE_SOURCE, F._TrArgs(translate_cache=False))
        self.assertNotIn('document_context', ordinary[0][0])
        first=T.translate_cache_key('A phrase.',args,'tr','en',document_context='brain science')
        self.assertNotEqual(first,T.translate_cache_key('A phrase.',args,'tr','en',document_context='parliament'))
        long=[(i*2,i*2+1.9,'a long introduction '*100) for i in range(2)]
        _, bounded, _, _=F._sentence_translate(long,args)
        self.assertTrue(all(len(p[0]['document_context'])<=1200 for p in bounded))

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
        self.assertTrue(all('max' not in item for item in seen[0][0]['items']))

    def test_old_speech_prompt_does_not_share_the_new_cache(self):
        args=F._TrArgs(translate_for_speech=True)
        current=T.translate_cache_key('Example.',args,'tr','en')
        with patch.object(T,'SPEECH_TRANSLATION_PROTOCOL','speech-v2-duration'):
            self.assertNotEqual(current,T.translate_cache_key('Example.',args,'tr','en'))

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
            metadata=Path(str(speech)+'.meta.json')
            value=json.loads(metadata.read_text(encoding='utf-8'))
            self.assertTrue(value['forSpeech'])
            self.assertEqual(value['speechProtocol'],T.SPEECH_TRANSLATION_PROTOCOL)
            value['speechProtocol']='speech-v2-duration'
            metadata.write_text(json.dumps(value),encoding='utf-8')
            with patch.object(T,'llm_translate',side_effect=translate),patch.object(T,'emit'),patch.object(T,'log'):
                T.translate_existing_subtitle(args(True,str(speech)))
            self.assertEqual(seen[-1][1],{},'old speech metadata bypassed the new quality protocol')


if __name__ == '__main__':
    unittest.main()
