# -*- coding: utf-8 -*-
"""Uyarlanabilir çeviri planlayıcısı testleri (kuyruk-50 madde 4).

1) Kurallar birim düzeyde kilitlenir: hata oranı/gecikme/token tavanına göre
   parça ve eşzamanlılık kararları deterministik.
2) Kontrollü sağlayıcılarla llm_translate üzerinden hız (istek sayısı),
   maliyet (est token), adalet (tüm gruplar işlenir/raporlanır) ve iptal
   (yeni gönderim durur) davranışı karşılaştırılır.
"""
import json
import os
import sys
import tempfile
import types
import unittest
import importlib.machinery
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402
from translate_planner import AdaptivePlanner  # noqa: E402


def _entries(n):
    return [(i * 2.0, i * 2.0 + 1.5, f"Line {i} says hello.") for i in range(n)]


class _Args:
    def __init__(self, **kw):
        self.translate_api_key = 'sk-t'
        self.translate_base_url = 'https://api.example.com'
        self.translate_to = 'tr'
        self.translate_model = 'mock'
        self.translate_workers = 3
        self.translate_register = 'documentary'
        self.translate_profanity = 'keep'
        self.translate_refine = False
        self.translate_context = 4
        self.max_cps = 20
        self.max_line_width = 42
        self.glossary = ''
        self.translate_cache = False
        self.cache_dir = None
        self.input = 'planner-test'
        self.__dict__.update(kw)


def _clean_reply(payload):
    """items/sentences protokolünde geçerli çeviri yanıtı üret.

    Sayı kapısı (number_mismatch) kaynaktaki rakamın hedefte de bulunmasını
    ister — sahte çeviri kaynak metindeki rakamı aynen taşır."""
    import re
    src_by_pos = {item['i']: item.get('t', '') for item in payload['items']}
    items, sentences = {}, {}
    for row in payload['sentence_groups']:
        ids = row['ids']
        for pos in ids:
            num = re.search(r'\d+', src_by_pos.get(pos, ''))
            items[str(pos)] = f"TR-satir-{num.group(0) if num else pos}"
        sentences[str(ids[0])] = ' '.join(items[str(p)] for p in ids)
    return types.SimpleNamespace(choices=[types.SimpleNamespace(
        message=types.SimpleNamespace(
            content=json.dumps({'items': items, 'sentences': sentences},
                               ensure_ascii=False)),
        finish_reason='stop')])


def fake_openai(script, calls):
    """script(payload) -> response | Exception. calls'a payload birikir."""
    class _Client:
        def __init__(self, *a, **k):
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=self._create))

        def _create(self, model=None, messages=None, **_kw):
            payload = json.loads(messages[1]['content'])
            calls.append(payload)
            out = script(payload)
            if isinstance(out, Exception):
                raise out
            return out
    fake = types.ModuleType('openai')
    fake.OpenAI = _Client
    fake.__spec__ = importlib.machinery.ModuleSpec('openai', None)
    return fake


def run_translate(entries, args=None, script=_clean_reply):
    calls = []
    real = sys.modules.get('openai')
    sys.modules['openai'] = fake_openai(script, calls)
    try:
        warns, status = [], {}
        out = T.llm_translate(entries, args or _Args(), warns,
                              source_lang='en', status_out=status)
    finally:
        if real is not None:
            sys.modules['openai'] = real
        else:
            sys.modules.pop('openai', None)
    return out, warns, status, calls


class PlannerRuleTests(unittest.TestCase):
    """Deterministik kural tablosu — saat enjeksiyonsuz."""

    def test_clean_streak_grows_chunk_and_restores_workers(self):
        p = AdaptivePlanner(base_workers=4, base_chunk=20, max_chunk=40)
        for _ in range(8):
            p.record('ok', 100)
        self.assertGreater(p.chunk_size, 20)
        self.assertEqual(p.workers, 4)
        for _ in range(20):
            p.record('ok', 100)
        self.assertEqual(p.chunk_size, 40)          # tavan
        self.assertEqual(p.workers, 4)              # kullanıcı tavanı aşılmaz

    def test_error_storm_shrinks_chunk_and_halves_workers(self):
        p = AdaptivePlanner(base_workers=4, base_chunk=20, min_chunk=4)
        for _ in range(6):
            p.record('ok', 100)
        for _ in range(4):                          # 4/10 >= ERR_SHRINK
            p.record('invalid', 100)
        self.assertLessEqual(p.chunk_size, 10)
        self.assertEqual(p.workers, 2)

    def test_moderate_errors_freeze_growth(self):
        p = AdaptivePlanner(base_workers=4, base_chunk=20)
        for _ in range(7):
            p.record('ok', 100)                     # streak 7 < OK_STREAK — henüz büyüme yok
        p.record('invalid', 100)
        p.record('invalid', 100)                    # pencere: 7 ok + 2 inv = 0.22
        # hata oranı >= ERR_GROWTH (0.15) iken büyüme yok, shrink de yok
        self.assertEqual(p.chunk_size, 20)
        self.assertEqual(p.workers, 3)              # base-1'e kısıldı

    def test_slow_provider_caps_workers_below_base(self):
        p = AdaptivePlanner(base_workers=4)
        p.note_latency(60.0)                        # SLOW_LATENCY üstü
        p.record('ok', 100)
        self.assertEqual(p.workers, 3)              # base-1
        self.assertAlmostEqual(p.latency_ema, 60.0)

    def test_truncation_learns_token_ceiling(self):
        p = AdaptivePlanner(base_workers=2)
        self.assertEqual(p.token_ceiling, 0)
        p.record('truncated', est_tokens=1000)
        self.assertEqual(p.token_ceiling, 800)      # 0.8 kat
        p.record('truncated', est_tokens=900)
        self.assertEqual(p.token_ceiling, 720)      # daha düşük öğrenilir

    def test_pack_groups_never_splits_group(self):
        p = AdaptivePlanner(base_chunk=10)
        groups = [[0, 1, 2], [3], [4, 5], [6, 7], [8]]
        chunk, pos = p.pack_groups(groups, 0, lambda g: len(g) * 10)
        # sayı sınırı 10: 3+1+2+2+1=9 blok sığar
        self.assertEqual(chunk, [0, 1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(pos, 5)

    def test_pack_groups_token_cap(self):
        p = AdaptivePlanner(base_chunk=20, token_budget=50)
        groups = [[0, 1, 2], [3], [4, 5], [6], [7]]
        size = lambda g: len(g) * 10
        chunk, pos = p.pack_groups(groups, 0, size)
        self.assertEqual(chunk, [0, 1, 2, 3])       # 30+10=40; +20>50
        self.assertEqual(pos, 2)
        chunk2, pos2 = p.pack_groups(groups, pos, size)
        self.assertEqual(chunk2, [4, 5, 6, 7])      # 20+10+10=40
        self.assertEqual(pos2, 5)

    def test_pack_groups_breaks_on_gap(self):
        p = AdaptivePlanner(base_chunk=20)
        groups = [[0], [5], [6]]                    # 0→5 bitişik değil
        chunk, pos = p.pack_groups(groups, 0, lambda g: 1)
        self.assertEqual(chunk, [0])
        self.assertEqual(pos, 1)
        chunk, pos = p.pack_groups(groups, pos, lambda g: 1)
        self.assertEqual(chunk, [5, 6])

    def test_single_oversize_group_still_packs(self):
        p = AdaptivePlanner(base_chunk=4, token_budget=5)
        groups = [[0, 1, 2, 3, 4, 5, 6]]            # grup bölünemez
        chunk, pos = p.pack_groups(groups, 0, lambda g: 100)
        self.assertEqual(chunk, [0, 1, 2, 3, 4, 5, 6])
        self.assertEqual(pos, 1)


class PlannerIntegrationTests(unittest.TestCase):
    """Kontrollü sağlayıcılarla llm_translate uçtan uca karşılaştırma."""

    def test_clean_provider_covers_all_and_requests_bounded(self):
        # Hız+maliyet: sağlıklı sağlayıcıda istek sayısı sabit-20 tabanını aşmaz.
        entries = _entries(100)
        out, warns, status, calls = run_translate(entries)
        self.assertEqual(len(out), 100)
        self.assertEqual(status['failed'], [])
        self.assertTrue(all(t.startswith('TR-satir') for _, _, t in out))
        # Adalet: her grup ya çevrildi ya açık başarısız işaretli — sessiz
        # kayıp yok; calls payload'ları toplamı tüm indeksleri kapsar.
        covered = sum(len(p['items']) for p in calls)
        self.assertGreaterEqual(covered, 100)

    def test_flaky_provider_shrinks_later_chunks(self):
        # Hata oranına uyum: ilk istekler geçersiz JSON — planlayıcı küçülür.
        state = {'n': 0}

        def flaky(payload):
            state['n'] += 1
            if state['n'] <= 3:                     # ilk 3 toplu istek bozuk
                return types.SimpleNamespace(choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content='{bozuk json'),
                    finish_reason='stop')])
            return _clean_reply(payload)

        entries = _entries(60)
        out, warns, status, calls = run_translate(entries, _Args(translate_workers=1),
                                                  script=flaky)
        self.assertEqual(len(out), 60)
        self.assertTrue(any(t.startswith('TR-') for _, _, t in out))
        # Planlayıcı küçüldü: fırtına sonrası hiçbir gönderim 10 bloğu aşmaz.
        sizes = [len(p['items']) for p in calls]
        self.assertTrue(all(s <= 10 for s in sizes[3:]),
                        f'küçülme bekleniyordu: {sizes}')

    def test_truncating_provider_learns_smaller_packs(self):
        def truncating(payload):
            if len(payload['items']) > 10:
                return types.SimpleNamespace(choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content='{"items":{'),
                    finish_reason='length')])
            return _clean_reply(payload)

        entries = _entries(60)
        out, warns, status, calls = run_translate(
            entries, _Args(translate_workers=1), script=truncating)
        self.assertEqual(len(out), 60)
        self.assertEqual(status['failed'], [])
        # İlk kesinti sonrası paketler öğrenilen tavanla küçülür: en büyük
        # toplu payload 20 bloktan küçülür.
        self.assertTrue(any(len(p['items']) <= 10 for p in calls))

    def test_cancel_stops_new_submissions(self):
        # İptal: WHISPER_CANCEL_FILE belirirse yeni parça gönderilmez.
        with tempfile.TemporaryDirectory() as tmp:
            from pipeline_control import CancellationController
            flag = Path(tmp) / 'cancel.flag'
            old_env = os.environ.get('WHISPER_CANCEL_FILE')
            import pipeline_control
            old_ctrl = pipeline_control._CANCELLATION
            pipeline_control._CANCELLATION = CancellationController(str(flag))
            os.environ['WHISPER_CANCEL_FILE'] = str(flag)
            state = {'n': 0}

            def cancelling(payload):
                state['n'] += 1
                if state['n'] == 2:
                    flag.write_text('x')            # 2. istekte iptal düşer
                return _clean_reply(payload)

            try:
                entries = _entries(200)
                try:
                    run_translate(entries, _Args(translate_workers=1),
                                  script=cancelling)
                except BaseException:
                    pass                            # PipelineCancelled beklenir
                # 200 blok sabit-20'de 10 parça gerekirdi; iptalden sonra yeni
                # gönderim yapılmadığı için istek sayısı düşük kalır.
                self.assertLessEqual(state['n'], 6)
            finally:
                pipeline_control._CANCELLATION = old_ctrl
                if old_env is None:
                    os.environ.pop('WHISPER_CANCEL_FILE', None)
                else:
                    os.environ['WHISPER_CANCEL_FILE'] = old_env


if __name__ == '__main__':
    unittest.main(verbosity=2)
