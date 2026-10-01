"""--explain modu kilitleri (AI modları turu).

- Açıklama kuralları hedef dilden bağımsız (eskiden sabit "Türkçe karşılık").
- Reasoning modellerine temperature gönderilmez, talimat rolü developer'dır.
- İstemci sınırlı: SDK yeniden denemesi kapalı, zaman aşımı <= 60 sn.
- Hata metni kullanıcı dostu; ham istisna metni sızmaz.
"""
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as t  # noqa: E402


def _srt(text="Hello there."):
    folder = Path(tempfile.mkdtemp())
    path = folder / "a.srt"
    path.write_text(f"1\n00:00:01,000 --> 00:00:02,000\n{text}\n", encoding="utf-8")
    return path


def _fake_openai(calls, reply):
    class _Completions:
        def create(self, **kw):
            calls.append(kw)
            msg = types.SimpleNamespace(content=reply)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg)])

    class _Client:
        def __init__(self, **kw):
            calls.append({"client": kw})
            self.chat = types.SimpleNamespace(completions=_Completions())

    return types.SimpleNamespace(OpenAI=_Client)


def _args(path, kind="sentence", model="gemini-3.8-flash"):
    return types.SimpleNamespace(
        translate_api_key="k", input=str(path), explain_index=0, explain_translation=None,
        explain_kind=kind, explain_word="", translate_base_url="https://example.invalid/v1",
        translate_to="tr", translate_model=model)


class ExplainPromptTests(unittest.TestCase):
    def test_prompt_has_no_placeholder_and_follows_target_language(self):
        for kind in ("sentence", "word", "better"):
            for lang in ("tr", "en", "de"):
                with self.subTest(kind=kind, lang=lang):
                    prompt = t.build_explain_prompt(kind, lang)
                    self.assertNotIn("{lang}", prompt)
                    self.assertNotIn("Turkce karsilik", prompt)
                    self.assertNotIn("Türkçe karşılık", prompt)
                    self.assertIn("Cevabı {} dilinde yaz.".format(t.LANG_NAMES.get(lang, lang)), prompt)

    def test_better_prompt_forbids_inventing_missing_translation(self):
        self.assertIn("mevcut_ceviri alanı boşsa", t.build_explain_prompt("better", "tr"))

    def test_unknown_kind_falls_back_to_sentence(self):
        self.assertEqual(t.build_explain_prompt("???", "tr"), t.build_explain_prompt("sentence", "tr"))

    def test_generation_kwargs_skip_temperature_for_reasoning_models(self):
        self.assertNotIn("temperature", t.explain_generation_kwargs("gpt-5-mini"))
        self.assertNotIn("temperature", t.explain_generation_kwargs("o3"))
        self.assertEqual(t.explain_generation_kwargs("gemini-3.8-flash"), {"temperature": 0.3})


class ExplainCallTests(unittest.TestCase):
    def test_reasoning_model_uses_developer_role_and_bounded_client(self):
        calls, events = [], []
        with mock.patch.dict(sys.modules, {"openai": _fake_openai(calls, "Açıklama")}), \
                mock.patch.object(t, "emit", lambda *a, **kw: events.append(a[0])):
            t.explain_subtitle(_args(_srt(), kind="better", model="gpt-5-mini"))
        client_kw = calls[0]["client"]
        self.assertEqual(client_kw["max_retries"], 0)
        self.assertLessEqual(client_kw["timeout"], 60)
        create_kw = calls[1]
        self.assertNotIn("temperature", create_kw)
        self.assertEqual(create_kw["messages"][0]["role"], "developer")
        self.assertEqual(json.loads(create_kw["messages"][1]["content"])["cumle"], "Hello there.")
        self.assertEqual(events, ["explain", "done"])

    def test_regular_model_keeps_system_role_and_temperature(self):
        calls = []
        with mock.patch.dict(sys.modules, {"openai": _fake_openai(calls, "Açıklama")}), \
                mock.patch.object(t, "emit", lambda *a, **kw: None):
            t.explain_subtitle(_args(_srt()))
        self.assertEqual(calls[1]["messages"][0]["role"], "system")
        self.assertEqual(calls[1]["temperature"], 0.3)

    def test_error_message_is_friendly(self):
        calls = []
        with mock.patch.dict(sys.modules, {"openai": _fake_openai(calls, "")}), \
                mock.patch.object(t, "emit", lambda *a, **kw: None), \
                mock.patch.object(t, "call_api_with_retry", lambda op, attempts=3: op()):
            with self.assertRaises(RuntimeError) as ctx:
                t.explain_subtitle(_args(_srt()))
        self.assertNotIn("Model bos cevap", str(ctx.exception))

    def test_chat_error_mapping_unchanged(self):
        self.assertEqual(
            t.ai_friendly_error_message(RuntimeError("boom")),
            "AI yanıtı alınamadı. Sağlayıcı ayarlarını kontrol edip yeniden deneyin.")


if __name__ == "__main__":
    unittest.main()
