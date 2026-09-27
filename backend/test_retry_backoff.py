# R158: çeviri scheduler retry/backoff stres — toplam-bekleme tavanı,
# üstel cap, attempts coercion, Retry-After kenarları.
import sys, types
from unittest.mock import patch
sys.path.insert(0, 'backend')
import transcribe as T


class ApiError(Exception):
    def __init__(self, status=None, headers=None, message=''):
        super().__init__(message or str(status))
        if status is not None:
            self.status_code = status
        self.response = types.SimpleNamespace(headers=headers or {})


def flaky(error, succeed_at):
    calls = []
    def op():
        calls.append(1)
        if len(calls) < succeed_at:
            raise error
        return 'ok'
    return op, calls


def waits(flaky_op):
    with patch.object(T.time, 'sleep') as sleep:
        try:
            result = flaky_op()
            return result, [c.args[0] for c in sleep.call_args_list], None
        except Exception as e:
            return None, [c.args[0] for c in sleep.call_args_list], e


n = 0
def ok(cond, msg):
    global n
    n += 1
    assert cond, msg

# --- attempts coercion ---
op, calls = flaky(ApiError(503), 99)
res, _, err = waits(lambda: T.call_api_with_retry(op, attempts=0))
ok(err is not None and len(calls) == 1, 'attempts=0 → tek deneme')
op, calls = flaky(ApiError(503), 99)
res, _, err = waits(lambda: T.call_api_with_retry(op, attempts=-5))
ok(len(calls) == 1, 'attempts negatif → tek deneme')

# --- toplam-bekleme tavanı (waited+delay>120 → uyku yerine raise) ---
op, calls = flaky(ApiError(503, {'Retry-After': '80'}), 99)
_, ws, err = waits(lambda: T.call_api_with_retry(op, attempts=4, base_delay=0))
ok(err is not None and len(calls) == 2, '80+80>120 → ikinci hatada raise, 3. deneme yok')
ok(abs(sum(ws) - 80) < 1e-6, 'tek 80s bekleme sonra bırak')

# Sınır: 60+60=120 tam sınırda — kural >120, o yüzden 2. bekleme yapılır
op, calls = flaky(ApiError(503, {'Retry-After': '60'}), 99)
_, ws, err = waits(lambda: T.call_api_with_retry(op, attempts=4, base_delay=0))
ok(len(calls) == 3 and err is not None, '60+60=120 tam sınırda beklenir, sonra deneme biter')
ok(abs(sum(ws) - 120) < 1e-6, 'toplam 120s')

# --- üstel cap: attempt derinleşince 30s'de doyurulur ---
op, calls = flaky(ApiError(500), 6)
res, ws, err = waits(lambda: T.call_api_with_retry(op, attempts=6, base_delay=8))
ok(res == 'ok' and err is None, '6 denemede başarı')
# 8,16,30,30,30 bekler (8*2^a, cap 30)
expected = [8, 16, 30, 30, 30]
ok(abs(sum(ws) - sum(expected)) < 1e-6, f'üstel backoff 30s cap — {sum(ws):.0f}')

# --- 429 kotası backoff: 5*2^a, 30 cap ---
op, calls = flaky(ApiError(429), 4)
_, ws, _ = waits(lambda: T.call_api_with_retry(op, attempts=4, base_delay=0))
ok(abs(sum(ws) - (5 + 10 + 20)) < 1e-6, '429 backoff 5/10/20')

# --- Retry-After http-date geçmişte → 0'a kenetlenir ---
assert_val = T.api_retry_after_seconds(
    ApiError(503, {'Retry-After': 'Thu, 01 Jan 1970 00:00:01 GMT'}), now=1_000_000)
ok(assert_val == 0, 'geçmiş http-date → 0 (negatif kenetlenir)')

# --- status'suz "429" metni retryable DEĞİL (request-id yanlış-pozitif koruması) ---
ok(not T.retryable_api_error(RuntimeError('HTTP 429 request-id=99429')), 'durumsuz 429 metni → retry yok')
ok(T.retryable_api_error(RuntimeError('connection reset by peer')), 'connection reset metni → retry')
ok(T.retryable_api_error(RuntimeError('timed out')), 'timeout metni → retry')
ok(not T.retryable_api_error(RuntimeError('invalid api key')), 'auth metni → retry yok')

# --- api_error_status kenarlıkları ---
ok(T.api_error_status(ApiError(None)) is None, 'durumsuz → None')
weird = types.SimpleNamespace(response=types.SimpleNamespace(status='503'))
ok(T.api_error_status(weird) == 503, 'string status okunur')
weird2 = types.SimpleNamespace(status_code=Exception())
ok(T.api_error_status(weird2) is None, 'bozuk status_code → None (atlamaz)')

# --- kurtarma yolunda son-denemede raise ---
op, calls = flaky(ApiError(503), 99)
_, ws, err = waits(lambda: T.call_api_with_retry(op, attempts=3, base_delay=0))
ok(err is not None and len(calls) == 3 and sum(ws) < 1e-9, 'base_delay=0 → sleep yok, 3 deneme')

print(f'test_retry_backoff: {n} kontrol geçti')
