"""Kullanıcının seçtiği kısa bir yerel klipte faster-whisper hız ölçümü."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
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

    with tempfile.TemporaryDirectory(prefix="whisper-model-benchmark-") as tmp:
        wav_path = os.path.join(tmp, "sample.wav")
        command = [args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source,
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
            try:
                if device == "cuda":
                    import torch
                    torch.cuda.reset_peak_memory_stats()
            except Exception:
                pass
            load_started = time.perf_counter()
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
            vram_mb = None
            if device == "cuda":
                try:
                    import torch
                    vram_mb = round(torch.cuda.max_memory_allocated() / 1e6, 1)
                except Exception:
                    vram_mb = None
            del model
            return {
                "model": model_name, "device": device, "computeType": compute_type,
                "loadSeconds": round(load_seconds, 3),
                "transcribeSeconds": round(transcribe_seconds, 3),
                "realtimeFactor": round(transcribe_seconds / audio_seconds, 4),
                "speedX": round(audio_seconds / max(0.001, transcribe_seconds), 2),
                "segmentCount": len(seg_list),
                "vramMb": vram_mb,
                "language": getattr(info, "language", "") or "",
                "segments": seg_list,
            }

        def diff(primary, other):
            pairs = zip(primary["segments"], other["segments"])
            drifts = [abs(a["start"] - b["start"]) for a, b in pairs]
            text_a = " ".join(s["text"] for s in primary["segments"])
            text_b = " ".join(s["text"] for s in other["segments"])
            ratio = SequenceMatcher(None, text_a, text_b).ratio()
            return {
                "cueStartDriftAvgMs": round(1000 * sum(drifts) / len(drifts), 1) if drifts else 0,
                "cueStartDriftMaxMs": round(1000 * max(drifts), 1) if drifts else 0,
                "textDeviation": round(1 - ratio, 4),
            }

        primary = measure(args.model, args.device, args.compute_type)
        result = {
            "ok": True,
            "model": args.model,
            "device": args.device,
            "computeType": args.compute_type,
            "audioSeconds": round(audio_seconds, 3),
            "clipHash": clip_hash,
            **{k: primary[k] for k in (
                "loadSeconds", "transcribeSeconds", "realtimeFactor",
                "speedX", "segmentCount", "language")},
            "vramMb": primary["vramMb"],
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
