"""live_asr.py kalite regresyonları (2026-10 browser canlı Whisper denetimi).

Gerçek model gerekmez; faster_whisper sahte modülle değiştirilir.
- LanguageGate: kısa parçadaki düşük güvenli yanlış dil tespiti oturum diliyle
  yeniden çözülür; gerçek dil değişimi (art arda yüksek güven) yine geçer.
- Halüsinasyon süzgeci canlı yolda da çalışır ("Altyazı M.K." gibi imzalar
  altyazıya düşmez, chunk_done.skipped sayar).
- chunk_done gerçek zaman oranı (rtf) ve ses süresini taşır.
- Türkçe karakterli parça yolu stdin üzerinden bozulmadan geçer.
"""
import io
import json
import os
import sys
import tempfile
import types
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

fake = types.ModuleType("faster_whisper")


class _Seg:
    def __init__(self, text, avg_logprob=-0.2, no_speech_prob=0.05):
        self.start, self.end, self.text = 0.0, 1.0, text
        self.avg_logprob, self.no_speech_prob = avg_logprob, no_speech_prob


class _Info:
    def __init__(self, language, probability):
        self.language, self.language_probability = language, probability


SCRIPT = {}


class FakeModel:
    def __init__(self, *args, **kwargs):
        self.calls = []

    def transcribe(self, path, **kwargs):
        forced = kwargs.get("language")
        self.calls.append((path, forced))
        row = SCRIPT[os.path.basename(path)]
        if forced:
            return iter([_Seg(f"{forced}:{row['text']}")]), _Info(forced, 1.0)
        return iter([_Seg(row["text"], **row.get("seg", {}))]), _Info(row["lang"], row["prob"])


fake.WhisperModel = FakeModel
sys.modules["faster_whisper"] = fake

import live_asr  # noqa: E402


def run(paths):
    feed = "".join(json.dumps({"type": "chunk", "path": p, "offset": i * 4.0}) + "\n"
                   for i, p in enumerate(paths)) + json.dumps({"type": "stop"}) + "\n"
    old_in, old_out = sys.stdin, sys.stdout
    sys.stdin, sys.stdout = io.StringIO(feed), io.StringIO()
    try:
        rc = live_asr.main()
        out = sys.stdout.getvalue()
    finally:
        sys.stdin, sys.stdout = old_in, old_out
    return rc, [json.loads(line) for line in out.splitlines() if line.strip()]


def write_wav(path, seconds=2.0):
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(16000)
        handle.writeframes(b"\0\0" * int(16000 * seconds))


def test_language_gate_unit():
    gate = live_asr.LanguageGate("")
    assert gate.decide("tr", 0.95) is None and gate.session == "tr"
    # Tek düşük güvenli sapma: oturum diliyle yeniden çöz.
    assert gate.decide("az", 0.41) == "tr"
    # Tek yüksek güvenli sapma: o parça kendi diliyle yazılır, oturum değişmez.
    assert gate.decide("en", 0.93) is None and gate.session == "tr"
    # Art arda ikinci yüksek güvenli tespit: oturum dili değişir.
    assert gate.decide("en", 0.91) is None and gate.session == "en"
    assert gate.decide("tr", 0.30) == "en"
    # Sabit dil seçiliyse kapı hiç müdahale etmez.
    fixed = live_asr.LanguageGate("tr")
    assert fixed.decide("en", 0.2) is None
    # Güvensiz ilk tespit oturumu kilitlemez.
    fresh = live_asr.LanguageGate("")
    assert fresh.decide("cy", 0.30) is None and fresh.session is None


def test_pipeline_language_hallucination_rtf_and_unicode_path():
    tmp = tempfile.mkdtemp(prefix="canlı-ğşıöüç-")
    names = ["a.wav", "b.wav", "c.wav"]
    for name in names:
        write_wav(os.path.join(tmp, name))
    SCRIPT.clear()
    SCRIPT.update({
        "a.wav": {"lang": "tr", "prob": 0.97, "text": "Merhaba dünya."},
        "b.wav": {"lang": "az", "prob": 0.38, "text": "Salam."},
        "c.wav": {"lang": "tr", "prob": 0.96, "text": "Altyazı M.K.",
                  "seg": {"avg_logprob": -0.1, "no_speech_prob": 0.02}},
    })
    rc, events = run([os.path.join(tmp, n) for n in names])
    assert rc == 0
    segments = [e for e in events if e["type"] == "segment"]
    done = [e for e in events if e["type"] == "chunk_done"]
    assert [s["text"] for s in segments] == ["Merhaba dünya.", "tr:Salam."], segments
    assert segments[1]["language"] == "tr", segments[1]
    assert done[2]["count"] == 0 and done[2]["skipped"] == 1, done[2]
    for row in done:
        assert row["audio_seconds"] == 2.0, row
        assert isinstance(row["rtf"], float) and row["rtf"] >= 0, row
        assert "ğşıöüç" in row["path"], row
        assert "error" not in row, row


def test_stdin_is_utf8_on_real_process_streams():
    encoding = getattr(sys.__stdin__, "encoding", "") or ""
    if hasattr(sys.__stdin__, "reconfigure"):
        assert encoding.replace("-", "").lower() == "utf8", encoding


if __name__ == "__main__":
    test_language_gate_unit()
    test_pipeline_language_hallucination_rtf_and_unicode_path()
    test_stdin_is_utf8_on_real_process_streams()
    print("test_live_asr_quality: ok — dil kapısı, halüsinasyon süzgeci, RTF ve UTF-8 yol doğrulandı")
