"""live_asr.py stop-drain regresyonu (R51-49).

Gerçek model olmadan çalışır: faster_whisper sahte modülle değiştirilir,
komutlar sys.stdin'e yazılır, stdout NDJSON olayları yakalanır.

Doğrulanan sözleşme:
- "stop" geldiğinde kuyruktaki parçalar DRENE edilir (eskiden düşüyordu).
- Her parça için tam bir chunk_done yayınlanır (segment döngüsü yarıda kesilmez).
- "stopped" her zaman SON olaydır.
"""
import io
import json
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# faster_whisper ağır — sahte modül.
fake = types.ModuleType("faster_whisper")


class _Seg:
    def __init__(self, text):
        self.start = 0.0
        self.end = 1.0
        self.text = text


class _Info:
    language = "tr"


class FakeModel:
    def __init__(self, *args, **kwargs):
        self.calls = []

    def transcribe(self, path, **kwargs):
        self.calls.append(path)
        return [_Seg(f"metin-{path}")], _Info()


fake.WhisperModel = FakeModel
sys.modules["faster_whisper"] = fake

import live_asr  # noqa: E402


def run_main(stdin_text):
    old_in, old_out = sys.stdin, sys.stdout
    sys.stdin = io.StringIO(stdin_text)
    out = io.StringIO()
    sys.stdout = out
    try:
        rc = live_asr.main()
    finally:
        sys.stdin, sys.stdout = old_in, old_out
    events = [json.loads(line) for line in out.getvalue().splitlines() if line.strip()]
    return rc, events


def main():
    # chunk,chunk,chunk,stop — üçü de işlenmeli
    feed = "".join(
        json.dumps({"type": "chunk", "path": f"c{i}.wav", "offset": i * 1.0}) + "\n"
        for i in range(3)
    ) + json.dumps({"type": "stop"}) + "\n"
    rc, events = run_main(feed)
    assert rc == 0, f"beklenen rc=0, gelen {rc}"
    types_ = [e["type"] for e in events]
    assert types_[0] == "ready", types_
    assert types_.count("chunk_done") == 3, f"kuyruk drenajı eksik: {types_}"
    done_paths = [e.get("path") for e in events if e["type"] == "chunk_done"]
    assert done_paths == ["c0.wav", "c1.wav", "c2.wav"], done_paths
    # her chunk_done tam sayım taşır
    for e in events:
        if e["type"] == "chunk_done":
            assert e["count"] == 1, e
    assert types_[-1] == "stopped", "stopped son olay olmalı"
    assert "segment" in types_, "segment olayları yayınlanmalı"

    # stop tek başına: hazır → stopped, chunk_done yok
    rc, events = run_main(json.dumps({"type": "stop"}) + "\n")
    assert rc == 0
    types_ = [e["type"] for e in events]
    assert types_ == ["ready", "stopped"], types_

    # EOF (stop olmadan): kuyruk drenajı + stopped
    feed = json.dumps({"type": "chunk", "path": "solo.wav", "offset": 0}) + "\n"
    rc, events = run_main(feed)
    types_ = [e["type"] for e in events]
    assert types_.count("chunk_done") == 1 and types_[-1] == "stopped", types_

    print("test_live_asr: ok — stop sonrası kuyruk drenajı ve sıralı chunk_done doğrulandı")


if __name__ == "__main__":
    main()
