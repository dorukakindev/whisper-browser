# R397 (kuyruk-g10): ağ kesintisi — uzun Retry-After/backoff beklemesi sırasında
# kullanıcı iptalinin ~0.1 sn içinde geçmesi (tek parça sleep'e hapsolmamak).
import os, sys, tempfile, types
from unittest.mock import patch
sys.path.insert(0, 'backend')
import transcribe as T
from pipeline_control import CancellationController, PipelineCancelled


class ApiError(Exception):
    def __init__(self, status=None, headers=None, message=''):
        super().__init__(message or str(status))
        if status is not None:
            self.status_code = status
        self.response = types.SimpleNamespace(headers=headers or {})


n = 0
def ok(cond, msg):
    global n
    n += 1
    assert cond, msg


marker = os.path.join(tempfile.mkdtemp(), 'cancel.marker')
controller = CancellationController(marker)

# 1) 30s Retry-After sırasında marker 3. uyku diliminde düşer: döngü bir sonraki
#    checkpoint'te kırılmalı; tek parça 30s uyuyan sürümde 300 dilim gerekirdi.
calls = []
def op_fail():
    calls.append(1)
    raise ApiError(503, {'Retry-After': '30'})
sleeps = []
def fake_sleep(s):
    sleeps.append(s)
    if len(sleeps) == 3:
        open(marker, 'w').close()
with patch.object(T, 'cancellation_checkpoint', controller.checkpoint), \
     patch.object(T.time, 'sleep', fake_sleep):
    try:
        T.call_api_with_retry(op_fail, attempts=5, base_delay=0)
        ok(False, 'iptal PipelineCancelled fırlatmalıydı')
    except PipelineCancelled as e:
        ok(e.stage == 'llm' and e.point == 'during', 'iptal llm/during noktasından')
        ok(len(sleeps) <= 4, f'uzun bekleme kırıldı ({len(sleeps)} dilim ≤4)')
        ok(len(calls) == 1, 'iptalde ek deneme yapılmadı')

# 2) Marker baştan var: hiç uyumadan, tek denemeden sonra fırlar.
calls2 = []
def op_fail2():
    calls2.append(1)
    raise ApiError(429)
sleeps2 = []
with patch.object(T, 'cancellation_checkpoint', controller.checkpoint), \
     patch.object(T.time, 'sleep', lambda s: sleeps2.append(s)):
    try:
        T.call_api_with_retry(op_fail2, attempts=4, base_delay=0)
        ok(False, 'marker varken iptal fırlatmalıydı')
    except PipelineCancelled:
        ok(len(calls2) == 1, 'marker varken tek deneme')
        ok(len(sleeps2) == 0, 'marker varken hiç uyumadı')

# 3) Kesinti sınıflandırması kullanıcıya doğru kodu taşır (yapısal status).
ok(T.classify_translation_error(ApiError(429)) == 'rate_limit', '429 → rate_limit')
ok(T.classify_translation_error(ApiError(503)) == 'server_error', '503 → server_error')
ok(T.classify_translation_error(ApiError(429, message='insufficient_quota exceeded your current quota')) == 'quota',
   '429+kota tükenmesi → quota')
ok(T.classify_translation_error(RuntimeError('read timed out')) == 'timeout', 'timeout → timeout')
ok(T.classify_translation_error(RuntimeError('connection reset by peer')) == 'network_error',
   'connection → network_error')

# 4) timeout/5xx/429 retryable; kalıcılar değil.
for err, want in ((ApiError(408), True), (ApiError(429), True), (ApiError(500), True),
                  (ApiError(503), True), (ApiError(401), False), (ApiError(403), False),
                  (ApiError(400), False), (RuntimeError('timed out'), True)):
    ok(T.retryable_api_error(err) == want, f'retryable {err}')

print(f'test_retry_cancel: {n} kontrol geçti')
