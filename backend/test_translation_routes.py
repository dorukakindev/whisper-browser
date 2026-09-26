"""Sağlayıcı rota hatası sınıflandırması ve JSON modu geri düşüşü.

Sahte bir `openai` modülü kullanılır; ağa çıkılmaz. Her test düzeltmeden önce
yanlış davranan somut bir sağlayıcı yanıtını taklit eder.
"""
import contextlib
import importlib.machinery
import io
import json
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_fake_openai = types.ModuleType("openai")
_fake_openai.__spec__ = importlib.machinery.ModuleSpec("openai", None)
_fake_openai.OpenAI = None
sys.modules.setdefault("openai", _fake_openai)

import transcribe as T  # noqa: E402


class ApiError(Exception):
    def __init__(self, message, status):
        super().__init__(message)
        self.status_code = status


class Args:
    def __init__(self, **kw):
        self.__dict__.update(dict(
            translate_api_key="k", translate_base_url="https://api.example.com", translate_to="tr",
            translate_model="m", translate_workers=1, translate_register="documentary",
            translate_profanity="keep", translate_refine=False, max_cps=20, max_line_width=42,
            glossary="", translate_cache=False, cache_dir=None, language="en", max_lines=2,
            wrap_mode="sentence", formats="srt", dual_subtitle=False, dual_translation_first=False,
            translate_context=0))
        self.__dict__.update(kw)


# 45 bağımsız cümle = 20'lik paketlerle 3 ayrı istek parçası.
TR = {f"Room {n} is ready.": f"{n} numaralı oda hazır." for n in range(1, 46)}
ENTRIES = [(i * 3, i * 3 + 2, text) for i, text in enumerate(TR)]


def install(handler):
    calls = []

    def create(**kw):
        calls.append({"url": create.url, "json": "response_format" in kw})
        return handler(kw, create.url, calls)

    def client(*_a, base_url=None, **_k):
        def bound(**kw):
            create.url = base_url
            return create(**kw)
        return types.SimpleNamespace(chat=types.SimpleNamespace(
            completions=types.SimpleNamespace(create=bound)))

    sys.modules["openai"].OpenAI = client
    return calls


def reply(kw):
    payload = json.loads(kw["messages"][-1]["content"])
    content = {str(item["i"]): TR[item["t"]] for item in payload["items"]}
    return types.SimpleNamespace(choices=[types.SimpleNamespace(
        message=types.SimpleNamespace(content=json.dumps(content, ensure_ascii=False)),
        finish_reason="stop")])


def quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)


class RouteErrorClassificationTests(unittest.TestCase):
    def test_request_id_digits_are_not_authentication(self):
        error = ApiError("502 Bad Gateway (request id: req_84031f)", 502)
        self.assertFalse(T.route_error_is_fatal(error))
        self.assertTrue(T.route_error_is_fatal(ApiError("Invalid key", 401)))
        self.assertTrue(T.route_error_is_fatal(ApiError("insufficient_quota", 429)))

    def test_json_object_wording_is_detected(self):
        self.assertTrue(T.json_mode_unsupported(
            ApiError("json_object is not supported by this model", 400)))


class TranslateJsonModeTests(unittest.TestCase):
    def test_json_mode_rejection_is_learned_once_per_job(self):
        def handler(kw, _url, _calls):
            if "response_format" in kw:
                raise ApiError("Error: json_object is not supported by this model", 400)
            return reply(kw)

        calls = install(handler)
        out = quiet(T.llm_translate, ENTRIES, Args(translate_workers=1), [], source_lang="en")
        # Önce 'json_object' ifadesi tanınmıyordu: istek rotada başarısız sayılıp
        # çeviri hiç yapılmıyordu. Şimdi tek JSON denemesinden sonra düz mod.
        self.assertEqual([t for _, _, t in out], list(TR.values()))
        self.assertEqual(sum(1 for call in calls if call["json"]), 1, calls)

    def test_transient_error_on_plain_retry_uses_next_route(self):
        def handler(kw, url, _calls):
            if "response_format" in kw:
                raise ApiError("response_format is unsupported", 400)
            if url.startswith("https://a."):
                raise ApiError("502 Bad Gateway", 502)
            return reply(kw)

        calls = install(handler)
        original = T.resolve_translate_routes
        T.resolve_translate_routes = lambda _base: ["https://a.example/v1", "https://b.example/v1"]
        try:
            out = quiet(T.llm_translate, ENTRIES, Args(), [], source_lang="en")
        finally:
            T.resolve_translate_routes = original
        self.assertEqual([t for _, _, t in out], list(TR.values()))
        self.assertTrue(any(call["url"].startswith("https://b.") for call in calls))


if __name__ == "__main__":
    unittest.main(verbosity=2)
