"""LLM sağlayıcı varyant matrisi (R329-4).

Üç yüzeyin model/endpoint permütasyonlarını tek tabloda kilitler:

1. Reasoning-model taksonomisi — `is_reasoning_chat_model` + üretim
   parametreleri (`llm_generation_kwargs`, `chat_generation_kwargs`,
   `chat_instruction_role`) her varyantta aynı kararı vermeli:
   reasoning ailelerine (gpt-5*/o[1-9]*) temperature GÖNDERİLMEZ ve
   rol 'developer'; diğerlerine temperature + 'system'.
   Sınır vakalar: 'gpt-50', 'o10' (rakam soneki) eşleşmez; 'anthropic-o1'
   (tire öneki, slashsız) eşleşmez; 'OpenAI/GPT-5' (büyük harf) eşleşir.

2. Endpoint rota matrisi — `_SHUAI_HOSTS` üyeleri 4 rotaya açılır
   (verilen ilk sırada); akraba-olmayan host tek rota kalır; spoof
   'api.shuaiapi.com.evil.com' asla fan-out yapmaz (SSRF bekçisi).

3. Kural sözlüğü erişilebilirliği — REGISTER_RULES ve PROFANITY_RULES'un
   her anahtarı build_translate_prompt çıktısında gerçekten görünür
   (ulaşılmayan kalıp tanımlanmışsa test düşer).
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402


REASONING = [
    'gpt-5', 'gpt-5.2', 'gpt-5-turbo', 'GPT-5', 'openai/gpt-5',
    'azure/gpt-5.1', 'o1', 'o3', 'o4-mini', 'openai/o1-preview',
    'provider/O3-MINI',
]
NORMAL = [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'deepseek-r1', 'qwen3',
    'gemini-3.8-flash', 'claude-sonnet', 'llama-3.1',
]
BOUNDARY_NOT_REASONING = [
    'gpt-50',   # 'gpt-5' ardından rakam: model ailesi değil
    'o10',      # 'o1' ardından rakam
    'anthropic-o1',  # slashsız tire öneki — desen ^ veya / ister
    'ao1',
]


class TestReasoningTaxonomy(unittest.TestCase):
    def test_reasoning_models_get_no_temperature_anywhere(self):
        for name in REASONING:
            with self.subTest(model=name):
                self.assertTrue(T.is_reasoning_chat_model(name))
                llm = T.llm_generation_kwargs(name, 0.2)
                chat = T.chat_generation_kwargs(name)
                self.assertNotIn('temperature', llm)
                self.assertNotIn('temperature', chat)
                self.assertIn('max_completion_tokens', llm)
                self.assertIn('max_completion_tokens', chat)
                self.assertEqual(T.chat_instruction_role(name), 'developer')

    def test_normal_models_get_temperature_and_system(self):
        for name in NORMAL + BOUNDARY_NOT_REASONING:
            with self.subTest(model=name):
                self.assertFalse(T.is_reasoning_chat_model(name))
                llm = T.llm_generation_kwargs(name, 0.2)
                chat = T.chat_generation_kwargs(name)
                self.assertEqual(llm.get('temperature'), 0.2)
                self.assertNotIn('max_completion_tokens', llm)
                self.assertEqual(chat.get('temperature'), 0.4)
                self.assertNotIn('max_completion_tokens', chat)
                self.assertEqual(T.chat_instruction_role(name), 'system')

    def test_reasoning_verdict_consistent_between_paths(self):
        # chat_generation_kwargs ve llm_generation_kwargs aynı modelde
        # aynı kararı vermeli — biri güncellenip diğeri unutulursa yakalar.
        for name in REASONING + NORMAL + BOUNDARY_NOT_REASONING:
            with self.subTest(model=name):
                chat_has_temp = 'temperature' in T.chat_generation_kwargs(name)
                llm_has_temp = 'temperature' in T.llm_generation_kwargs(name, 0.2)
                self.assertEqual(chat_has_temp, llm_has_temp, name)


class TestRouteMatrix(unittest.TestCase):
    SHUAI = [
        'https://api.shuaiapi.com/v1', 'https://oai.sb/v1',
        'https://api.oai.sb/v1', 'https://cdn.shuaiapi.com/v1',
        'oai.sb/v1',          # schemesiz
        'https://OAI.SB/v1',  # büyük harf host
    ]
    NON_SHUAI = [
        'https://api.deepseek.com', 'https://api.openai.com/v1',
        'https://api.shuaiapi.com.evil.com',   # subdomain spoof — fan-out YOK
        'https://not-shuaiapi.com',
        'oai.sb.evil.com',
        'https://api.shuaiapi.com.',           # sondaki nokta host'u değiştirir
    ]

    def test_shuai_hosts_fan_out_to_four_routes_first_given(self):
        for url in self.SHUAI:
            with self.subTest(base_url=url):
                routes = T.resolve_translate_routes(url)
                self.assertEqual(len(routes), 4, url)
                self.assertEqual(routes[0], url.rstrip('/'))

    def test_non_shuai_hosts_stay_single_route(self):
        for url in self.NON_SHUAI:
            with self.subTest(base_url=url):
                self.assertEqual(T.resolve_translate_routes(url), [url.rstrip('/')])

    def test_empty_and_junk_base_url_fall_back_to_default(self):
        self.assertEqual(T.resolve_translate_routes(''), [T.SHUAI_ROUTES[0][1]])
        self.assertEqual(T.resolve_translate_routes('   '), [T.SHUAI_ROUTES[0][1]])
        # ayrıştırılamayan ham metin tek rota kalır (çökme yok)
        self.assertEqual(T.resolve_translate_routes('not a url at all'),
                         ['not a url at all'])


class TestRuleCoverage(unittest.TestCase):
    def test_every_register_key_reaches_the_prompt(self):
        for key in T.REGISTER_RULES:
            with self.subTest(register=key):
                prompt = T.build_translate_prompt('tr', 'en', [], register=key)
                expected = [ln for ln in T.REGISTER_RULES[key] if ln.strip()]
                self.assertTrue(any(ln in prompt for ln in expected),
                                f"register '{key}' kuralı prompt'a düşmedi")

    def test_every_profanity_key_reaches_the_prompt(self):
        for key in T.PROFANITY_RULES:
            with self.subTest(profanity=key):
                prompt = T.build_translate_prompt('tr', 'en', [], profanity=key)
                expected = [ln for ln in T.PROFANITY_RULES[key] if ln.strip()]
                self.assertTrue(any(ln in prompt for ln in expected),
                                f"profanity '{key}' kuralı prompt'a düşmedi")

    def test_unknown_keys_fall_back_to_defaults(self):
        prompt = T.build_translate_prompt('tr', 'en', [], register='yok', profanity='yok')
        default_reg = [ln for ln in T.REGISTER_RULES['general'] if ln.strip()]
        default_prof = [ln for ln in T.PROFANITY_RULES['medium'] if ln.strip()]
        self.assertTrue(any(ln in prompt for ln in default_reg))
        self.assertTrue(any(ln in prompt for ln in default_prof))


if __name__ == '__main__':
    unittest.main()
