"""Çeviri döngü kesicileri: tek satırlık hata onlarca paketlik deneme döngüsüne dönüşmemeli.

Eski davranış: sağlayıcı/protokol baştan sona bozuksa ana paket döngüsü kalan
tüm paketleri tek tek gönderiyordu (400 cue ≈ 109 istek), kurtarma yalnız süre
bütçesiyle sınırlıydı (sayaç yoktu) ve kalite kapısı redleri hiçbir kesiciyi
beslemiyordu. Bu testler ağa çıkmadan sahte `openai` modülüyle üç sözleşmeyi
doğrular:

1. Sistematik bozuk sağlayıcı → ana döngü birkaç denemeden sonra durur.
2. Tek bozuk satır → yalnız o grup kurtarılır, diğer paketler etkilenmez.
3. Kurtarma istekleri işe yaramıyorsa → verim kesicisi kalan gruplar için
   yeni istek açmaz (satırlar kaynak metinle kalır, iş biter).
"""
import contextlib
import importlib.machinery
import io
import json
import os
import sys
import types
import unittest
from unittest.mock import patch
import concurrent.futures
import time

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


def install_provider(handler):
    calls = []

    def create(**kw):
        payload = json.loads(kw["messages"][-1]["content"])
        calls.append(payload)
        content = handler(payload)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=json.dumps(content, ensure_ascii=False)),
            finish_reason="stop")])

    sys.modules["openai"].OpenAI = lambda *a, **k: types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
    return calls


def entries_for(count, bad=()):
    rows = []
    for i in range(count):
        word = "bad" if i in bad else "good"
        rows.append((i * 4, i * 4 + 2, f"This is {word} spoken sentence number {i}."))
    return rows


def good_reply(payload, *, skip=lambda source: False):
    """Her tek-kimlikli cümle grubuna geçerli bir Türkçe karşılık üretir."""
    items = {}
    for row in payload["sentence_groups"]:
        if skip(row["source"]):
            continue
        number = row["source"].rsplit(" ", 1)[-1].rstrip(".")
        for position in row["ids"]:
            items[str(position)] = f"Bu {number} numaralı konuşma cümlesidir."
    return {"items": items}


def run(entries, **args):
    status, warnings = {}, []
    with contextlib.redirect_stdout(io.StringIO()):
        T.llm_translate(entries, Args(**args), warnings, source_lang="en", status_out=status)
    return status, warnings


class LoopBreakerTests(unittest.TestCase):
    def test_slow_provider_reports_wait_without_extra_requests(self):
        def slow_reply(payload):
            time.sleep(0.06)
            return good_reply(payload)

        calls = install_provider(slow_reply)
        events = []
        real_wait = concurrent.futures.wait

        def short_wait(futures, timeout=None, **kw):
            return real_wait(futures, timeout=0.01 if timeout else timeout, **kw)

        with patch.object(T, "emit", side_effect=lambda kind, **kw: events.append((kind, kw))), \
                patch.object(concurrent.futures, "wait", side_effect=short_wait):
            status, _ = run(entries_for(60), translate_workers=2)
        waiting = [e for kind, e in events if kind == "llm_progress" and e.get("waiting")]
        self.assertGreater(len(waiting), 2)
        self.assertEqual(waiting[0]["done"], 0)
        self.assertEqual(waiting[0]["percent"], 0)
        self.assertTrue(any(e["done"] > 0 for e in waiting), "parallel batches never emitted heartbeat")
        self.assertTrue(all(e["total"] == 60 and e["elapsed"] >= 0 for e in waiting))
        self.assertEqual(len(calls), 3, "heartbeat created additional provider calls")
        self.assertEqual(len(status["completed"]), 60)

    def test_systemic_failure_stops_main_packet_loop(self):
        calls = install_provider(lambda payload: {})   # her paket geçersiz
        status, warnings = run(entries_for(400))
        self.assertLessEqual(len(calls), 24,
                             f"bozuk sağlayıcıya {len(calls)} istek gitti; ana döngü kesilmeli")
        self.assertTrue(any("yeni istek açılmadı" in w for w in warnings), warnings)
        reasons = set(status.get("failedReasons", {}).values())
        self.assertTrue(reasons & {"invalid_response", "recovery_limit"}, reasons)

    def test_single_bad_line_costs_only_its_own_group(self):
        # Satır 17 ilk turda eksik döner; kurtarma isteğinde düzgün gelir.
        state = {"served_bad": 0}

        def handler(payload):
            def skip(source):
                if "bad spoken" in source and state["served_bad"] == 0:
                    return True
                return False
            reply = good_reply(payload, skip=skip)
            if any("bad spoken" in row["source"] for row in payload["sentence_groups"]):
                state["served_bad"] += 1
            return reply

        calls = install_provider(handler)
        status, warnings = run(entries_for(120, bad={17}))
        self.assertEqual(status.get("failed"), [], status)
        self.assertEqual(len(status.get("completed", [])), 120)
        # Paket sayısı + tek grup için en fazla 2 kurtarma isteği; yüzlerce değil.
        batch_only = install_provider(lambda payload: good_reply(payload))
        run(entries_for(120))
        self.assertLessEqual(len(calls), len(batch_only) + 2,
                             f"tek bozuk satır {len(calls) - len(batch_only)} ek istek yaktı")
        self.assertFalse(any("yeni istek açılmadı" in w for w in warnings), warnings)

    def test_unproductive_rescue_is_cut_by_yield_breaker(self):
        # 40 cue sürekli eksik dönüyor (kapı/model uyumsuzluğu): kurtarma tekrarı sonuç vermez.
        bad = set(range(0, 120, 3))
        calls = install_provider(lambda payload: good_reply(
            payload, skip=lambda source: "bad spoken" in source))
        status, warnings = run(entries_for(120, bad=bad))
        # 80 cue çevrildi; 40 cue kaynak kaldı ama iş yüzlerce istek açmadan bitti.
        naive_worst_case = len(bad) * 3
        self.assertLess(len(calls), naive_worst_case // 2,
                        f"{len(calls)} istek: kurtarma verim kesicisi çalışmadı")
        reasons = set(status.get("failedReasons", {}).values())
        self.assertTrue(reasons & {"recovery_limit", "invalid_response"}, reasons)
        self.assertTrue(any("sonuç vermiyor" in w or "istek sınırına" in w for w in warnings), warnings)


if __name__ == "__main__":
    unittest.main()
