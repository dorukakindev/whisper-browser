"""
R267 — diarization (pyannote) hattı birim testleri.

`_load_pcm_waveform_for_pyannote` gerçek WAV fixture'larıyla,
`run_diarization` sahte pyannote/torch modülleriyle test edilir.
Çalıştırma: backend/venv/bin/python backend/test_diarization.py
"""

import inspect
import io
import os
import struct
import sys
import tempfile
import types
import wave
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def _write_wav(path, channels=1, rate=16000, sampwidth=2, frames=160):
    # 8-bit PCM işaretsizdir — sessizlik 0x80; diğer genişliklerde 0x00.
    payload = bytes([0x80] * frames * channels) if sampwidth == 1 \
        else bytes(frames * channels * sampwidth)
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setframerate(rate)
        w.setsampwidth(sampwidth)
        w.writeframes(payload)


class _FakeTorch:
    """numpy sarmalayan minimal torch sahtesi — from_numpy + cuda yok."""

    def __init__(self, cuda_available=False):
        self.cuda = types.SimpleNamespace(
            is_available=lambda: cuda_available,
            empty_cache=lambda: None,
        )

    @staticmethod
    def device(name):
        return name

    @staticmethod
    def from_numpy(arr):
        return arr


def _wav_test(body):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "a.wav")
        body(path)


def test_pcm_waveform_all_sample_widths():
    for width in (1, 2, 3, 4):
        def body(path, width=width):
            _write_wav(path, channels=2, rate=8000, sampwidth=width, frames=64)
            out = T._load_pcm_waveform_for_pyannote(path, _FakeTorch())
            assert out["sample_rate"] == 8000
            assert out["waveform"].shape == (2, 64), (width, out["waveform"].shape)
            # Sessizlik → tümü ~0 (8-bit bias düzeltilmiş).
            assert abs(float(out["waveform"].max())) <= 0.01
        _wav_test(body)


def test_pcm_waveform_known_values_16bit():
    def body(path):
        import numpy as np
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setframerate(16000)
            w.setsampwidth(2)
            w.writeframes(struct.pack("<4h", 0, 16384, -16384, 32767))
        out = T._load_pcm_waveform_for_pyannote(path, _FakeTorch())
        wf = out["waveform"]
        assert wf.shape == (1, 4)
        assert np.isclose(wf[0, 1], 0.5, atol=1e-4)
        assert np.isclose(wf[0, 2], -0.5, atol=1e-4)
    _wav_test(body)


def test_pcm_waveform_rejects_bad_headers():
    class BadWav:
        def __init__(self, **kw):
            self.kw = dict(comptype="NONE", channels=1, rate=16000,
                           width=2, frames=10)
            self.kw.update(kw)
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def getcomptype(self):
            return self.kw["comptype"]
        def getnchannels(self):
            return self.kw["channels"]
        def getframerate(self):
            return self.kw["rate"]
        def getsampwidth(self):
            return self.kw["width"]
        def getnframes(self):
            return self.kw["frames"]
        def readframes(self, n):
            return b"\x00" * n * self.kw["channels"] * self.kw["width"]

    cases = [
        (dict(comptype="ULAW"), "sıkıştırılmamış"),
        (dict(channels=0), "kanal"),
        (dict(rate=0), "kanal"),
        (dict(frames=0), "kanal"),
        (dict(width=5), "genişliği"),
    ]
    for overrides, needle in cases:
        with mock.patch.object(T.wave, "open", return_value=BadWav(**overrides)):
            try:
                T._load_pcm_waveform_for_pyannote("x.wav", _FakeTorch())
                raise AssertionError(f"{overrides} reddedilmedi")
            except RuntimeError as error:
                assert needle in str(error), (overrides, error)


def test_pcm_waveform_rejects_truncated_read():
    class TruncWav:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        getcomptype = lambda self: "NONE"  # noqa: E731
        getnchannels = lambda self: 1  # noqa: E731
        getframerate = lambda self: 16000  # noqa: E731
        getsampwidth = lambda self: 2  # noqa: E731
        getnframes = lambda self: 1000  # noqa: E731
        def readframes(self, n):
            return b"\x00"  # söz verilen karelerin çok altı
    with mock.patch.object(T.wave, "open", return_value=TruncWav()):
        try:
            T._load_pcm_waveform_for_pyannote("x.wav", _FakeTorch())
            raise AssertionError("kesik okuma reddedilmedi")
        except RuntimeError as error:
            assert "kanal verisi" in str(error)


def test_pcm_waveform_rejects_oversized_audio():
    class HugeWav:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        getcomptype = lambda self: "NONE"  # noqa: E731
        getnchannels = lambda self: 2  # noqa: E731
        getframerate = lambda self: 16000  # noqa: E731
        getsampwidth = lambda self: 2  # noqa: E731
        def getnframes(self):  # 2ch × N kare × 4B > 512MB
            return (T.PYANNOTE_MAX_WAVEFORM_BYTES // 8) + 1
        def readframes(self, n):
            return b""
    with mock.patch.object(T.wave, "open", return_value=HugeWav()):
        try:
            T._load_pcm_waveform_for_pyannote("x.wav", _FakeTorch())
            raise AssertionError("512MB üstü ses reddedilmedi")
        except RuntimeError as error:
            assert "512 MB" in str(error)


def _install_fake_pyannote(record, spans, fail=None, legacy=False):
    """Sahte pyannote.audio kurulumu; auth parametresi imzadan okunur.

    legacy=True → eski pyannote imzası (token yok, use_auth_token var).
    """
    params = {"use_auth_token": None} if legacy else {"token": None}

    class FakePipeline:
        @classmethod
        def from_pretrained(cls, model, token=None, use_auth_token=None, **kwargs):
            record["model"] = model
            record["auth"] = {k: v for k, v in (("token", token),
                                              ("use_auth_token", use_auth_token))
                              if v is not None}
            return cls()
        def to(self, device):
            record.setdefault("to", []).append(device)
        def __call__(self, audio, **kwargs):
            record["call_kwargs"] = kwargs
            record["calls"] = record.get("calls", 0) + 1
            pending = fail.pop(0) if isinstance(fail, list) and fail else (
                None if isinstance(fail, list) else fail)
            if pending:
                raise pending
            class Ann:
                def itertracks(self, yield_label=True):
                    turns = [(types.SimpleNamespace(start=s, end=e), None, sp)
                             for s, e, sp in spans]
                    return iter(turns)
            return types.SimpleNamespace(speaker_diarization=Ann())

    if not legacy:
        return mock.patch.dict(sys.modules, {
            "pyannote": types.ModuleType("pyannote"),
            "pyannote.audio": types.SimpleNamespace(Pipeline=FakePipeline),
        }), mock.patch.object(T.inspect, "signature", inspect.signature)
    # Eski imza: kodun gördüğü signature'dan "token" parametresini düşür.
    orig = inspect.signature
    def patched(fn):
        # classmethod erişimi her seferinde yeni bound-method üretir;
        # kimlik yerine alttaki işlevi karşılaştır.
        if getattr(fn, "__func__", fn) is FakePipeline.from_pretrained.__func__:
            sig = orig(fn)
            kept = [p for p in sig.parameters.values()
                    if p.name in ("model", "use_auth_token")]
            return sig.replace(parameters=kept)
        return orig(fn)
    return mock.patch.dict(sys.modules, {
        "pyannote": types.ModuleType("pyannote"),
        "pyannote.audio": types.SimpleNamespace(Pipeline=FakePipeline),
    }), mock.patch.object(T.inspect, "signature", patched)


def test_run_diarization_success_path_and_kwargs():
    record = {}
    spans = [(0.0, 1.5, "SPEAKER_00"), (1.5, 3.0, "SPEAKER_01")]
    m1, _ = _install_fake_pyannote(record, spans)
    wav_holder = {}
    def fake_load(path, torch_mod):
        wav_holder["audio"] = {"waveform": "W", "sample_rate": 16000}
        return wav_holder["audio"]
    with m1, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch(cuda_available=False)}), \
         mock.patch.object(T, "_load_pcm_waveform_for_pyannote", side_effect=fake_load):
        out = T.run_diarization("a.wav", "hf-x", min_speakers=2, max_speakers=4)
    assert out == spans
    assert record["model"] == "pyannote/speaker-diarization-3.1"
    assert record["auth"] == {"token": "hf-x"}
    assert record["call_kwargs"] == {"min_speakers": 2, "max_speakers": 4}
    assert "to" not in record  # CUDA yok → .to() çağrılmaz


def test_run_diarization_error_paths():
    # pyannote yok
    with mock.patch.dict(sys.modules, {"pyannote": None, "pyannote.audio": None}):
        try:
            T.run_diarization("a.wav", "hf-x")
            raise AssertionError
        except RuntimeError as error:
            assert "pyannote.audio yüklü değil" in str(error)
    # HF token yok
    with mock.patch.dict(sys.modules, {
        "pyannote.audio": types.SimpleNamespace(Pipeline=object), "torch": _FakeTorch(),
    }):
        try:
            T.run_diarization("a.wav", "")
            raise AssertionError
        except RuntimeError as error:
            assert "HuggingFace token" in str(error)
    # torch yok
    with mock.patch.dict(sys.modules, {
        "pyannote.audio": types.SimpleNamespace(Pipeline=object), "torch": None,
    }):
        try:
            T.run_diarization("a.wav", "hf-x")
            raise AssertionError
        except RuntimeError as error:
            assert "PyTorch" in str(error)


def test_run_diarization_legacy_use_auth_token_signature():
    record = {}
    spans = [(0.0, 1.0, "SPEAKER_00")]
    m1, sig_patch = _install_fake_pyannote(record, spans, legacy=True)
    fake_load = mock.MagicMock(return_value={})
    with m1, sig_patch, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch()}), \
         mock.patch.object(T, "_load_pcm_waveform_for_pyannote", fake_load):
        out = T.run_diarization("a.wav", "hf-x")
    assert out == spans
    assert record["auth"] == {"use_auth_token": "hf-x"}, record


def test_assign_speakers_majority_vote():
    spans = [(0.0, 2.0, "A"), (1.0, 3.0, "B")]
    # 0.5–2.5 bloğu: A ile 1.5s, B ile 1.5s → ilk bulunan/eşit davranış net değil,
    # çoğunluk tarafı kazanır:
    entries = [(0.5, 2.4, "x")]  # A:1.5, B:1.4 → A
    assert T.assign_speakers(entries, spans) == {0: "A"}
    entries = [(0.6, 2.5, "x")]  # A:1.4, B:1.5 → B
    assert T.assign_speakers(entries, spans) == {0: "B"}
    # Örtüşme yok → atama yok
    assert T.assign_speakers([(9.0, 9.5, "y")], spans) == {}
    assert T.assign_speakers(entries, []) == {}
    assert T.assign_speakers(entries, None) == {}


def test_offset_diarization_spans_edge_inputs():
    assert T.offset_diarization_spans(None, 5.0) == []
    assert T.offset_diarization_spans([(1, 2, "A")], 0) == [(1.0, 2.0, "A")]
    assert T.offset_diarization_spans([(1, 2, "A")], -0.5) == [(0.5, 1.5, "A")]


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} geçti, {failed} başarısız ({len(tests)} test)")
    return failed == 0




def _fake_load_once():
    return mock.patch.object(
        T, "_load_pcm_waveform_for_pyannote",
        side_effect=lambda path, torch_mod: {"waveform": "W", "sample_rate": 16000})


def test_run_diarization_oom_falls_back_to_cpu():
    """CUDA OOM: pipeline CPU'ya taşınır, cache boşaltılır, bir kez yeniden denenir."""
    record = {}
    spans = [(0.0, 2.0, "SPEAKER_00")]
    m1, _ = _install_fake_pyannote(record, spans, fail=[RuntimeError("CUDA out of memory")])
    with m1, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch(cuda_available=True)}), \
         _fake_load_once():
        out = T.run_diarization("a.wav", "hf-x")
    assert out == spans
    assert record["calls"] == 2          # OOM + CPU retry
    assert record["to"] == ["cuda", "cpu"]  # önce CUDA'ya, sonra CPU'ya


def test_run_diarization_oom_class_name_detection():
    """Tip adında 'oom' geçen özel hata (torch.cuda.OutOfMemoryError sahtesi) de yakalanır."""
    class FakeOutOfMemoryError(RuntimeError):
        pass
    record = {}
    spans = [(0.0, 1.0, "SPEAKER_00")]
    m1, _ = _install_fake_pyannote(record, spans, fail=[FakeOutOfMemoryError("alloc")])
    with m1, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch(cuda_available=True)}), \
         _fake_load_once():
        out = T.run_diarization("a.wav", "hf-x")
    assert out == spans and record["calls"] == 2


def test_run_diarization_non_oom_not_retried():
    """OOM olmayan hata yeniden denenmez — tek çağrıyla yukarı fırlatılır."""
    record = {}
    m1, _ = _install_fake_pyannote(record, [], fail=[RuntimeError("model 404")])
    with m1, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch(cuda_available=True)}), \
         _fake_load_once():
        try:
            T.run_diarization("a.wav", "hf-x")
            assert False, "yükselmeliydi"
        except RuntimeError as e:
            assert "model 404" in str(e)
    assert record["calls"] == 1


def test_run_diarization_second_oom_propagates():
    """CPU yedeği de OOM verirse hata korunarak yukarı taşınır (sonsuz döngü yok)."""
    record = {}
    m1, _ = _install_fake_pyannote(
        record, [], fail=[RuntimeError("CUDA out of memory"), RuntimeError("CPU out of memory")])
    with m1, \
         mock.patch.dict(sys.modules, {"torch": _FakeTorch(cuda_available=True)}), \
         _fake_load_once():
        try:
            T.run_diarization("a.wav", "hf-x")
            assert False, "yükselmeliydi"
        except RuntimeError as e:
            assert "out of memory" in str(e)
    assert record["calls"] == 2

if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
