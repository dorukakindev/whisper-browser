"""R273 — sağlayıcı probu kalıcı hata verdiğinde iki kaçak kapanır.

1) `skipped` sayımı: prob durduğunda kalan parçalardaki önbellek/önceden
   çevrilmiş (done_idx) konumlar 'başarısız blok' sayısını şişirirdi —
   llm_progress failed değeri yalnız gerçekten denenecek blokları saymalı.
2) 2. geçiş (refine) kapısı: prob/orta-koşu kalıcı hata sağlayıcının öldüğünü
   kanıtlamışsa refine paketleri de aynı duvara çarpardı — artık atlanır ve
   1. geçiş sonuçları korunur.

Sahte `openai` modülüyle ağa çıkılmaz.
"""
import contextlib
import importlib.machinery
import io
import json
import os
import sys
import tempfile
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
            wrap_mode="sentence", formats="srt", dual_subtitle=False, dual_translation_first=False,
            translate_context=4))
        self.__dict__.update(kw)


def _dead_handler(kw, _url, _calls):
    raise RuntimeError("Connection error: dns resolution failed")


def _flaky_probe_handler(kw, _url, calls):
    """İlk (prob) isteği geçici 503 ile düşürür; sonrakiler geçerli yanıt verir."""
    if len(calls) == 1:
        raise RuntimeError("HTTP 503 server error on upstream")
    payload = json.loads(kw["messages"][-1]["content"])
    reply_items = {str(item["i"]): item["t"].replace("Sentence", "Cümle")
                   for item in payload["items"]}
    reply_sentences = {
        str(row["ids"][0]): " ".join(reply_items[str(i)] for i in row["ids"])
        for row in payload["sentence_groups"]
    }
    body = json.dumps({"items": reply_items, "sentences": reply_sentences},
                      ensure_ascii=False)
    return types.SimpleNamespace(choices=[types.SimpleNamespace(
        message=types.SimpleNamespace(content=body))])


def _install(handler):
    calls = []

    def client(*_a, base_url=None, **_k):
        def bound(**kw):
            calls.append(kw)
            return handler(kw, base_url, calls)
        return types.SimpleNamespace(chat=types.SimpleNamespace(
            completions=types.SimpleNamespace(create=bound)))

    sys.modules["openai"].OpenAI = client
    return calls


def _run(fn, *args, **kwargs):
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        out = fn(*args, **kwargs)
    events = []
    for line in buffer.getvalue().splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                events.append(json.loads(line))
            except ValueError:
                pass
    return out, events


class ProbeSkippedCountTests(unittest.TestCase):
    def test_skipped_counts_only_undone_indices(self):
        # 19 tek-cümle grup + [19,20] birleşik grup; 20 önceden çevrilmiş.
        entries = [(i * 3, i * 3 + 2, f"Sentence number {i + 1}.") for i in range(19)]
        entries += [(57, 59, "I think"), (59.2, 60.5, "that you are right.")]
        precompleted = {20: "haklı olduğunu düşünüyorum."}
        groups = T.sentence_groups(entries)
        assert any(g == [19, 20] for g in groups), groups
        calls = _install(_dead_handler)
        _out, events = _run(T.llm_translate, entries, Args(), [],
                            source_lang="en", status_out={},
                            precompleted=precompleted)
        self.assertTrue(calls)
        # llm_progress failed değeri: 19 probe + 1 skipped (20 done_idx'de).
        failed_values = [e["failed"] for e in events
                         if e.get("type") == "llm_progress" and "failed" in e]
        self.assertEqual(failed_values[-1], 20, failed_values)


class RefineGateTests(unittest.TestCase):
    def test_refine_skipped_when_probe_proves_provider_dead(self):
        entries = [(0, 2, "First sentence."), (30, 32, "Second sentence.")]
        args = Args(translate_refine=True, translate_cache=True, cache_dir=None)
        calls = _install(_dead_handler)
        with tempfile.TemporaryDirectory() as work:
            args.cache_dir = work
            # 'refined: false' isabeti: 1. geçiş metni hazır, refine denenecek.
            source = entries[1][2]
            budget = T.translation_char_budget(entries[1], args)
            # Girdi 28 sn boşluklu iki satır → sahne sınırı bağlamı keser;
            # üretim tarafı source_context ile aynı boş bağlamı hesaplar.
            key = T.translate_cache_key(
                source, args, "tr", "en", [], [],
                budget, group_shape=None, speaker_shape=[""],
                auto_glossary_terms=T.extract_auto_glossary(entries, source_lang="en"))
            cache_path = T.translate_cache_path(args)
            with open(cache_path, "w", encoding="utf-8") as fh:
                json.dump({key: {"text": "İkinci cümle.", "parts": ["İkinci cümle."],
                                 "refined": False}}, fh, ensure_ascii=False)
            out, _events = _run(T.llm_translate, entries, args, [],
                                source_lang="en", status_out={})
        self.assertIsNotNone(out)
        self.assertEqual(out[1][2], "İkinci cümle.")
        # Refine yanıtı 'tr' alanı taşır — tek bir refine isteği bile gitmedi.
        refine_calls = 0
        for call in calls:
            try:
                payload = json.loads(call["messages"][-1]["content"])
            except (ValueError, KeyError, TypeError):
                continue
            if any("tr" in item for item in payload.get("items", [])):
                refine_calls += 1
        self.assertEqual(refine_calls, 0)

    def test_refine_runs_when_probe_error_is_not_fatal(self):
        # Prob geçici (kalıcı-olmayan) hatayla düşerse kalan parçalar çalışır —
        # sağlayıcı yaşıyor, 2. geçiş hak edilir. `fatal_reason` her hata kodunu
        # taşıdığı için kapı kalıcı küme üyeliğini ayrıca sınamalı.
        entries = [(i * 3, i * 3 + 2, f"Sentence number {i + 1}.") for i in range(25)]
        args = Args(translate_refine=True)
        calls = _install(_flaky_probe_handler)
        out, events = _run(T.llm_translate, entries, args, [],
                           source_lang="en", status_out={})
        self.assertIsNotNone(out)
        # Prob parçası (0-19) düştü, kalan parça (20-24) çevrildi.
        self.assertTrue(any("Cümle" in str(e[2]) for e in out[20:]))
        refine_calls = 0
        for call in calls:
            try:
                payload = json.loads(call["messages"][-1]["content"])
            except (ValueError, KeyError, TypeError):
                continue
            if any("tr" in item for item in payload.get("items", [])):
                refine_calls += 1
        self.assertGreater(refine_calls, 0, "kalıcı-olmayan prob hatası 2. geçişi engellememeli")


if __name__ == "__main__":
    unittest.main(verbosity=2)
