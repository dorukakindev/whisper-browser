"""Çeviri kurtarma süre bütçesi regresyonları (rapor 403).

Eskiden kurtarma turlarının toplam süre sınırı yoktu: sağlayıcı aynı grubu
sürekli bozuk/zaman aşımlı döndürünce iş bir saate uzuyordu. Bu testler sahte
saat ve sahte `openai` modülüyle ağa çıkmadan bütçenin uygulandığını doğrular.
"""
import contextlib
import importlib.machinery
import io
import json
import os
import sys
import threading
import time as real_time
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_fake_openai = types.ModuleType("openai")
_fake_openai.__spec__ = importlib.machinery.ModuleSpec("openai", None)
_fake_openai.OpenAI = None
sys.modules.setdefault("openai", _fake_openai)

import transcribe as T  # noqa: E402


class Args:
    def __init__(self, **kw):
        self.__dict__.update(dict(
            translate_api_key="k", translate_base_url="https://api.example.com", translate_to="tr",
            translate_model="m", translate_workers=1, translate_register="documentary",
            translate_profanity="keep", translate_refine=False, max_cps=20, max_line_width=42,
            glossary="", translate_cache=False, cache_dir=None, language="en", max_lines=2,
            wrap_mode="sentence", formats="srt", dual_subtitle=False, dual_translation_first=False))
        self.__dict__.update(kw)


class FakeClock:
    """time modülünün yerine geçer; time() sahte ofsetle ilerler."""

    def __init__(self):
        self.offset = 0.0
        self.lock = threading.Lock()

    def advance(self, seconds):
        with self.lock:
            self.offset += seconds

    def time(self):
        with self.lock:
            return real_time.time() + self.offset

    def __getattr__(self, name):
        return getattr(real_time, name)


def install_provider(handler):
    def create(**kw):
        payload = json.loads(kw["messages"][-1]["content"])
        content = handler(payload)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=json.dumps(content, ensure_ascii=False)),
            finish_reason="stop")])
    sys.modules["openai"].OpenAI = lambda *a, **k: types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))


ENTRIES = [(0, 2, "First line."), (4, 6, "Second line."), (8, 10, "Third line."),
           (12, 14, "Fourth line."), (16, 18, "Fifth line.")]


class RecoveryBudgetTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self._saved_time = T.time
        T.time = self.clock

    def tearDown(self):
        T.time = self._saved_time

    def run_broken_provider(self, seconds_per_call, **args):
        calls = []

        def handler(payload):
            calls.append(len(payload["items"]))
            self.clock.advance(seconds_per_call)
            return {}   # her grup eksik → yapısal ret, kurtarma tetiklenir

        install_provider(handler)
        status = {}
        with contextlib.redirect_stdout(io.StringIO()):
            T.llm_translate(ENTRIES, Args(**args), [], source_lang="en", status_out=status)
        return calls, status

    def test_budget_stops_new_recovery_requests(self):
        unbounded_calls, _ = self.run_broken_provider(0.0)
        bounded_calls, status = self.run_broken_provider(400.0)
        self.assertLess(len(bounded_calls), len(unbounded_calls),
                        "bütçe dolunca yeni kurtarma isteği açılmamalı")
        reasons = set(status.get("failedReasons", {}).values())
        self.assertIn("recovery_timeout", reasons)

    def test_budget_is_not_hit_on_fast_provider(self):
        _, status = self.run_broken_provider(0.0)
        reasons = set(status.get("failedReasons", {}).values())
        self.assertNotIn("recovery_timeout", reasons)

    def test_budget_warning_reaches_warn_list(self):
        install_provider(lambda payload: (self.clock.advance(400.0), {})[1])
        warnings = []
        with contextlib.redirect_stdout(io.StringIO()):
            T.llm_translate(ENTRIES, Args(), warnings, source_lang="en", status_out={})
        self.assertTrue(any("kurtarma süresi" in w for w in warnings), warnings)

    def test_fallback_requests_use_two_attempts(self):
        original = T.call_api_with_retry

        def wrapper(operation, attempts=3, base_delay=0.75):
            attempts_list.append(attempts)
            return original(operation, attempts=attempts, base_delay=0)

        attempts_list = []
        T.call_api_with_retry = wrapper
        try:
            self.run_broken_provider(0.0)
        finally:
            T.call_api_with_retry = original
        self.assertEqual(attempts_list[0], 3, "toplu istek 3 deneme")
        self.assertIn(2, attempts_list[1:], "kurtarma istekleri 2 deneme")
        self.assertNotIn(3, attempts_list[1:])


if __name__ == "__main__":
    unittest.main()
