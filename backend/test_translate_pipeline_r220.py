"""R220/R221 çeviri hattı düzeltmelerinin birim testleri.

Kapsanan yardımcılar: strip_reasoning_think_blocks, route_error_is_definitive,
llm_generation_kwargs / is_reasoning_chat_model / chat_instruction_role,
normalize_reply_ids, line_keeps_source / _line_looks_turkish /
file_looks_turkish, _name_localized, TranslationTruncatedError sınıfı ve
series_memory.merge_many tek-yazım sözleşmesi.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import transcribe as T
from sentence_translation import normalize_reply_ids, _name_localized
from series_memory import SeriesMemory


class StripThinkBlocksTests(unittest.TestCase):
    def test_strips_think_before_json_pick(self):
        raw = '<think>önce {"items":{}} düşünürüm</think>{"items":{"0":"merhaba"}}'
        stripped = T.strip_reasoning_think_blocks(raw)
        self.assertNotIn('think', stripped)
        parsed = T.parse_llm_json_object(stripped)
        self.assertEqual(parsed, {'items': {'0': 'merhaba'}})

    def test_parse_skips_think_object(self):
        # Düşünme bloğundaki {...} gerçek yanıt değildir; parse ham metinde
        # bile strip uygulayıp blok sonrası nesneyi seçmeli.
        raw = '<think>{"items":{}}</think>{"items":{"0":"merhaba"}}'
        self.assertEqual(T.parse_llm_json_object(raw),
                         {'items': {'0': 'merhaba'}})

    def test_multiline_block_and_strip(self):
        self.assertNotIn('think', T.strip_reasoning_think_blocks(
            '<think>\nsatır\n</think>cevap'))
        self.assertEqual(
            T.strip_reasoning_think_blocks('  {"a":1}  '), '{"a":1}')


class _HttpError(RuntimeError):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


class DefinitiveErrorTests(unittest.TestCase):
    def test_http_400_definitive(self):
        self.assertTrue(T.route_error_is_definitive(
            _HttpError('bad request', 400)))

    def test_transient_503_not_definitive(self):
        self.assertFalse(T.route_error_is_definitive(
            _HttpError('service unavailable', 503)))

    def test_content_filter_definitive(self):
        self.assertTrue(T.route_error_is_definitive(
            RuntimeError('content_filter: output blocked')))
        self.assertTrue(T.route_error_is_definitive(
            RuntimeError('moderation flagged')))

    def test_timeout_not_definitive(self):
        self.assertFalse(T.route_error_is_definitive(
            RuntimeError('Request timed out')))


class ReasoningModelTests(unittest.TestCase):
    def test_reasoning_models_detected(self):
        for name in ('gpt-5', 'gpt-5.2', 'o3', 'o4-mini', 'openai/gpt-5',
                     'provider/o1-preview'):
            self.assertTrue(T.is_reasoning_chat_model(name), name)
        for name in ('gpt-4o', 'deepseek-r1', 'qwen3', 'gpt-4o-mini', 'm'):
            self.assertFalse(T.is_reasoning_chat_model(name), name)

    def test_generation_kwargs_no_temperature_for_reasoning(self):
        kw = T.llm_generation_kwargs('gpt-5', 0.2)
        self.assertNotIn('temperature', kw)
        self.assertIn('max_completion_tokens', kw)
        kw = T.llm_generation_kwargs('gpt-4o', 0.2)
        self.assertEqual(kw.get('temperature'), 0.2)
        self.assertNotIn('max_completion_tokens', kw)

    def test_instruction_role(self):
        self.assertEqual(T.chat_instruction_role('gpt-5'), 'developer')
        self.assertEqual(T.chat_instruction_role('gpt-4o'), 'system')


class NormalizeReplyIdsTests(unittest.TestCase):
    def test_one_indexed_shift(self):
        data = {'items': {'1': 'a', '2': 'b', '3': 'c'}}
        normalize_reply_ids(data, [0, 1, 2])
        self.assertEqual(data['items'], {'0': 'a', '1': 'b', '2': 'c'})

    def test_zero_indexed_untouched(self):
        data = {'items': {'0': 'a', '1': 'b'}}
        normalize_reply_ids(data, [0, 1])
        self.assertEqual(data['items'], {'0': 'a', '1': 'b'})

    def test_list_items_mapped_to_expected(self):
        data = {'items': ['x', 'y', 'z']}
        normalize_reply_ids(data, [4, 5, 6])
        self.assertEqual(data['items'], {'4': 'x', '5': 'y', '6': 'z'})

    def test_list_length_mismatch_untouched(self):
        data = {'items': ['x', 'y']}
        normalize_reply_ids(data, [0, 1, 2])
        self.assertEqual(data['items'], ['x', 'y'])

    def test_partial_shift_untouched(self):
        # Beklenen kümenin yalnız bir bölümü kaymışsa belirsiz — dokunulmaz.
        data = {'items': {'1': 'a', '2': 'b', '9': 'x'}}
        normalize_reply_ids(data, [0, 1, 2])
        self.assertEqual(data['items'], {'1': 'a', '2': 'b', '9': 'x'})


class KeepSourceTests(unittest.TestCase):
    def test_keep_cases(self):
        keep = ['Merhaba, nasılsın?', 'iPhone 15 Pro.', 'Ha ha ha.',
                'La la la.', 'İstanbul\'da görüşürüz.', 'Şimdi gel.',
                '123!!!', '♪♪♪', '  ']
        for line in keep:
            self.assertTrue(T.line_keeps_source(line, 'tr', 'en'), line)

    def test_translate_cases(self):
        go = ['You must come with us, Mrs. Aydın.',
              '♪ Fire on the mountain ♪',
              'Hasta la vista, baby.',
              'The Aydın report.',
              'I really think that you are right about this.']
        for line in go:
            self.assertFalse(T.line_keeps_source(line, 'tr', 'en'), line)

    def test_single_capitalized_name_not_turkish(self):
        # 'Aydın' tek başına Türkçe ad olsa da satır İngilizce kalır.
        self.assertFalse(T._line_looks_turkish('Give this to Aydın tomorrow.'))
        self.assertTrue(T._line_looks_turkish('Günaydın, nasıl geçti?'))

    def test_file_level_gate(self):
        tr_entries = [(0, i, s) for i, s in enumerate([
            'Merhaba, nasılsın?', 'Günaydın millet.',
            'Çok teşekkür ederim arkadaşlar.',
            'Yarın görüşürüz.', 'Hoşça kalın dostlarım.'])]
        self.assertTrue(T.file_looks_turkish(tr_entries))
        en_entries = [(0, i, s) for i, s in enumerate([
            'Good morning everyone.', 'How are you today?',
            'See you tomorrow at the station.', 'Bring the report.',
            'We have to leave now.'])]
        self.assertFalse(T.file_looks_turkish(en_entries))


class NameLocalizedTests(unittest.TestCase):
    def test_localized_pairs(self):
        pairs = [('Germany', 'Almanya'), ('London', 'Londra')]
        for src, tgt in pairs:
            self.assertTrue(_name_localized(src, tgt), f'{src}->{tgt}')
        self.assertFalse(_name_localized('Germany', 'Deutschland'))


class TruncatedErrorTests(unittest.TestCase):
    def test_classified(self):
        self.assertTrue(issubclass(T.TranslationTruncatedError, RuntimeError))
        err = T.TranslationTruncatedError('kesildi')
        self.assertEqual(T.classify_translation_error(err), 'truncated')


class MergeManyTests(unittest.TestCase):
    def test_single_write_and_reeval(self):
        with tempfile.TemporaryDirectory() as work:
            memory, _ = SeriesMemory.for_input(work, 'Show.S01E02.srt', 'en', 'tr')
            merged = memory.merge_many(
                [{'terms': {'First': 'İlk', 'Second': 'İkinci'}},
                 {'terms': {'Third': 'Üçüncü'}}], 1, 1)
            self.assertEqual(merged, 2)
            self.assertTrue(memory.path.exists())
            fresh, _ = SeriesMemory.for_input(work, 'Show.S01E02.srt', 'en', 'tr')
            terms = fresh.data.get('terms', {})
            self.assertEqual(terms.get('First', {}).get('target'), 'İlk')
            self.assertEqual(terms.get('Third', {}).get('target'), 'Üçüncü')

    def test_empty_and_invalid_rows(self):
        with tempfile.TemporaryDirectory() as work:
            memory, _ = SeriesMemory.for_input(work, 'Show.S01E02.srt', 'en', 'tr')
            self.assertEqual(memory.merge_many([], 1, 1), 0)
            self.assertEqual(memory.merge_many([None, 'x', 5], 1, 1), 0)
            self.assertFalse(memory.path.exists())


if __name__ == '__main__':
    unittest.main()
