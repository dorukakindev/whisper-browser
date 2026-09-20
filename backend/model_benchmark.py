"""Kullanıcının seçtiği kısa bir yerel klipte faster-whisper hız ölçümü."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import wave
from difflib import SequenceMatcher
from ndjson_utils import json_dumps_finite

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def emit(payload):
    print(json_dumps_finite(payload), flush=True)


def wav_duration(path):
    with wave.open(path, "rb") as handle:
        return handle.getnframes() / max(1, handle.getframerate())


def query_process_vram_mib(pid=None, runner=subprocess.run):
    """Return this process' NVIDIA compute memory, or None when unavailable.

    faster-whisper allocates through CTranslate2/CUDA, not PyTorch. PyTorch's
    allocator counters therefore cannot measure it. nvidia-smi observes the
    owning OS process without adding another Python dependency.
    """
    pid = int(pid or os.getpid())
    try:
        result = runner(
            ["nvidia-smi", "--query-compute-apps=pid,used_memory",
             "--format=csv,noheader,nounits"],
            check=True, capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    total = 0.0
    found = False
    for raw in (result.stdout or "").splitlines():
        columns = [part.strip() for part in raw.split(",")]
        if len(columns) < 2:
            continue
        try:
            if int(columns[0]) != pid:
                continue
            total += float(columns[1])
            found = True
        except ValueError:
            continue
    return round(total, 1) if found else None


def query_gpu_vram_used_mib(runner=subprocess.run):
    """Return total used memory of the first visible NVIDIA GPU.

    Windows WDDM commonly exposes compute PIDs while reporting their
    ``used_memory`` as ``[N/A]``. A before/after GPU-total delta is a labelled
    fallback; it is less isolated than the per-process value but still measures
    CTranslate2 allocations instead of PyTorch's unrelated allocator.
    """
    try:
        result = runner(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            check=True, capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    for raw in (result.stdout or "").splitlines():
        try:
            return round(float(raw.strip()), 1)
        except ValueError:
            continue
    return None


class VramSampler:
    def __init__(self, query=query_process_vram_mib,
                 global_query=query_gpu_vram_used_mib, interval=0.1):
        self.query = query
        self.global_query = global_query
        self.interval = interval
        self.peak = None
        self.scope = "unavailable"
        self._baseline = self.global_query()
        self._stop = threading.Event()
        self._thread = None

    def _sample_once(self):
        value = self.query()
        scope = "process"
        if value is None:
            global_used = self.global_query()
            value = None if self._baseline is None or global_used is None else max(0.0, global_used - self._baseline)
            scope = "gpu-delta"
        if value is not None:
            self.peak = value if self.peak is None else max(self.peak, value)
            if self.scope != "process" or scope == "process":
                self.scope = scope

    def start(self):
        def sample():
            while not self._stop.is_set():
                self._sample_once()
                self._stop.wait(self.interval)
        self._thread = threading.Thread(target=sample, name="benchmark-vram", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        # Çok hızlı modeller ilk arka plan örneği tamamlanmadan bitebilir.
        # Model hâlâ bellekteyken son bir eşzamanlı örnek al; aksi halde gerçek
        # CUDA kullanımı yanlış biçimde "ölçülemedi" görünebilir.
        self._sample_once()
        return self.peak


def align_segment_starts(primary, other, tolerance=5.0):
    """One-to-one temporal matching without assuming equal segmentation."""
    candidates = []
    for left_index, left in enumerate(primary):
        for right_index, right in enumerate(other):
            distance = abs(float(left["start"]) - float(right["start"]))
            if distance <= tolerance:
                candidates.append((distance, left_index, right_index))
    used_left, used_right, matches = set(), set(), []
    for distance, left_index, right_index in sorted(candidates):
        if left_index in used_left or right_index in used_right:
            continue
        used_left.add(left_index)
        used_right.add(right_index)
        matches.append(distance)
    return matches, len(primary) - len(used_left), len(other) - len(used_right)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cuda")
    parser.add_argument("--compute-type", choices=(
        "auto", "int8", "int8_float16", "int8_float32", "int16",
        "float16", "float32", "bfloat16",
    ), default="float16")
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--language", default="")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    # F17: ikinci ayar — aynı çıkarılan wav üzerinde A/B karşılaştırması
    parser.add_argument("--compare-model", default="")
    parser.add_argument("--compare-device", choices=("cpu", "cuda"), default="")
    parser.add_argument("--compare-compute-type", default="")
    args = parser.parse_args()

    source = os.path.abspath(args.input)
    if not os.path.isfile(source):
        raise FileNotFoundError("Benchmark dosyası bulunamadı.")
    seconds = max(30.0, min(120.0, args.seconds))
    start = max(0.0, args.start)

    with tempfile.TemporaryDirectory(prefix="whisper-model-benchmark-") as tmp:
        wav_path = os.path.join(tmp, "sample.wav")
        command = [args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", str(start), "-i", source,
                   "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav_path]
        try:
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("FFmpeg ölçüm sesi hazırlığı 180 saniyeyi aştığı için durduruldu.") from exc
        audio_seconds = wav_duration(wav_path)
        if audio_seconds < 1:
            raise RuntimeError("Seçilen dosyada ölçülebilir ses bulunamadı.")

        # F17: aynı wav üzerinde iki ayar — klip kimliği wav içeriğinin
        # sha256'sıdır (kaynak kapsayıcıdan bağımsız, tekrarlanabilir).
        with open(wav_path, "rb") as clip_file:
            clip_hash = hashlib.sha256(clip_file.read()).hexdigest()

        def measure(model_name, device, compute_type):
            from faster_whisper import WhisperModel
            sampler = VramSampler() if device == "cuda" else None
            if sampler:
                sampler.start()
            load_started = time.perf_counter()
            try:
                model = WhisperModel(model_name, device=device, compute_type=compute_type)
                load_seconds = time.perf_counter() - load_started
                transcribe_started = time.perf_counter()
                segments, info = model.transcribe(
                    wav_path,
                    language=args.language or None,
                    vad_filter=True,
                    beam_size=5,
                )
                seg_list = [{"start": round(s.start, 3), "end": round(s.end, 3),
                             "text": s.text} for s in segments]
                transcribe_seconds = time.perf_counter() - transcribe_started
            finally:
                vram_mb = sampler.stop() if sampler else None
                vram_scope = sampler.scope if sampler else "not-applicable"
                if "model" in locals():
                    del model
            return {
                "model": model_name, "device": device, "computeType": compute_type,
                "loadSeconds": round(load_seconds, 3),
                "transcribeSeconds": round(transcribe_seconds, 3),
                "realtimeFactor": round(transcribe_seconds / audio_seconds, 4),
                "speedX": round(audio_seconds / max(0.001, transcribe_seconds), 2),
                "segmentCount": len(seg_list),
                "vramMb": vram_mb,
                "vramMeasurement": vram_scope,
                "language": getattr(info, "language", "") or "",
                "segments": seg_list,
            }

        def diff(primary, other):
            drifts, primary_unmatched, compare_unmatched = align_segment_starts(
                primary["segments"], other["segments"])
            text_a = " ".join(s["text"] for s in primary["segments"])
            text_b = " ".join(s["text"] for s in other["segments"])
            ratio = SequenceMatcher(None, text_a, text_b).ratio()
            return {
                "cueStartDriftAvgMs": round(1000 * sum(drifts) / len(drifts), 1) if drifts else 0,
                "cueStartDriftMaxMs": round(1000 * max(drifts), 1) if drifts else 0,
                "matchedCueCount": len(drifts),
                "primaryUnmatchedCueCount": primary_unmatched,
                "compareUnmatchedCueCount": compare_unmatched,
                "textDeviation": round(1 - ratio, 4),
            }

        primary = measure(args.model, args.device, args.compute_type)
        result = {
            "ok": True,
            "model": args.model,
            "device": args.device,
            "computeType": args.compute_type,
            "audioSeconds": round(audio_seconds, 3),
            "clipStartSeconds": round(start, 3),
            "clipHash": clip_hash,
            **{k: primary[k] for k in (
                "loadSeconds", "transcribeSeconds", "realtimeFactor",
                "speedX", "segmentCount", "language")},
            "vramMb": primary["vramMb"],
            "vramMeasurement": primary["vramMeasurement"],
        }
        if args.compare_model:
            other = measure(args.compare_model,
                            args.compare_device or args.device,
                            args.compare_compute_type or args.compute_type)
            result["diff"] = diff(primary, other)
            other.pop("segments", None)
            result["compare"] = other
        emit(result)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or b"").decode("utf-8", errors="replace").strip()
        emit({"ok": False, "error": detail or "ffmpeg örnek sesi hazırlayamadı."})
        sys.exit(1)
    except Exception as error:
        emit({"ok": False, "error": str(error)})
        sys.exit(1)
