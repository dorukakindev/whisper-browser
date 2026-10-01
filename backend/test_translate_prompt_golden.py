"""Çeviri prompt'u golden-snapshot kilidi (R283 / plan-2 madde 1).

build_translate_prompt / build_refine_prompt çıktıları ile sağlayıcı-model
parametre tablosu (is_reasoning_chat_model → role/kwargs) tam metin olarak
backend/testdata/translate_prompt_golden.json'a kilitli. Prompt'ta kasıtlı bir
değişiklik yapılıyorsa fixture'ı yeniden üretip diff'i gözden geçir.

Yanlışlıkla eklenen/silinen kural cümlesi, sıra değişimi veya model tablosu
kayması burada patlar. Kasıtlı değişiklikte fixture'ı yeniden üret:

    python3 -c "import test_translate_prompt_golden as g, json, pathlib; \
pathlib.Path(g.GOLDEN_PATH).write_text( \
json.dumps(g._build_golden(), ensure_ascii=False, indent=1, sort_keys=True), \
encoding='utf-8')"   # backend/ içinden çalıştır
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import transcribe as T  # noqa: E402

GOLDEN_PATH = Path(__file__).parent / "testdata" / "translate_prompt_golden.json"


def _build_golden():
    """Fixture'ın üretildiği tek yer — yeniden üretim buradan yapılır."""
    variants = {
        'tr_en_documentary_medium_glossary_context': T.build_translate_prompt(
            target_lang='tr', source_lang='en',
            glossary_terms=['Sanhuber', 'Osterreich'], register='documentary',
            profanity='medium', max_cps=21, max_line_width=42, use_context=True),
        'tr_auto_general_soft_nocontext': T.build_translate_prompt(
            target_lang='tr', source_lang='auto',
            glossary_terms=[], register='general', profanity='soft',
            use_context=False),
        'en_de_drama_explicit_autoglossary_series': T.build_translate_prompt(
            target_lang='en', source_lang='de',
            glossary_terms=['Vader'], register='drama', profanity='explicit',
            max_cps=17, max_line_width=36, use_context=True,
            auto_glossary_terms=['Schwarz', 'Berlin'],
            series_hint='- Dizi ipucu: Grogu icin "Minik" kullan.'),
        'tr_ja_action_explicit_wide': T.build_translate_prompt(
            target_lang='tr', source_lang='ja',
            glossary_terms=[], register='action', profanity='explicit',
            max_cps=25, max_line_width=48, use_context=False),
        'en_es_comedy_medium': T.build_translate_prompt(
            target_lang='en', source_lang='es',
            glossary_terms=[], register='comedy', profanity='medium',
            use_context=True),
    }
    refine = {
        'refine_tr_21_42': T.build_refine_prompt('tr', 21, 42),
        'refine_en_17_36': T.build_refine_prompt('en', 17, 36),
        'refine_tr_upper': T.build_refine_prompt('TR', 21, 42),
    }
    models = ['gpt-4o', 'gpt-4.1-mini', 'gpt-5', 'openai/gpt-5.1', 'o3',
              'o4-mini', 'openai/o9', 'deepseek-r1', 'qwen3-max',
              'anthropic/claude-3.7', 'moonshotai/kimi-k2']
    model_table = {m: {'reasoning': T.is_reasoning_chat_model(m),
                       'role': T.chat_instruction_role(m),
                       'kwargs': T.chat_generation_kwargs(m)}
                   for m in models}
    return {'translate': variants, 'refine': refine, 'models': model_table}


class TranslatePromptGoldenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.golden = json.loads(GOLDEN_PATH.read_text(encoding='utf-8'))

    def test_translate_variants_byte_exact(self):
        current = _build_golden()
        for name, want in sorted(self.golden['translate'].items()):
            with self.subTest(varyant=name):
                self.assertEqual(want, current['translate'][name],
                                 'prompt metni golden ile uyuşmuyor')

    def test_refine_variants_byte_exact(self):
        current = _build_golden()
        for name, want in sorted(self.golden['refine'].items()):
            with self.subTest(varyant=name):
                self.assertEqual(want, current['refine'][name])

    def test_model_provider_table_byte_exact(self):
        current = _build_golden()
        for name, want in sorted(self.golden['models'].items()):
            with self.subTest(model=name):
                self.assertEqual(want, current['models'][name])

    def test_register_matrix_distinct(self):
        """Her register anahtarı prompt'a kendi bloğunu sokar (üretici kayması)."""
        for reg, rules in T.REGISTER_RULES.items():
            p = T.build_translate_prompt('tr', 'en', [], register=reg)
            for rule in rules:
                self.assertIn(rule, p, f'{reg} kuralı promptta yok')

    def test_profanity_matrix_distinct(self):
        for prof, rules in T.PROFANITY_RULES.items():
            p = T.build_translate_prompt('tr', 'en', [], profanity=prof)
            for rule in rules:
                self.assertIn(rule, p, f'{prof} kuralı promptta yok')

    def test_unknown_register_falls_back_general(self):
        p = T.build_translate_prompt('tr', 'en', [], register='bilinmeyen-x')
        for rule in T.REGISTER_RULES['general']:
            self.assertIn(rule, p)


if __name__ == '__main__':
    unittest.main()
