"""Kullanıcının seçtiği kısa bir yerel klipte faster-whisper hız ölçümü."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import wave


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


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
    args = parser.parse_args()

    source = os.path.abspath(args.input)
    if not os.path.isfile(source):
        raise FileNotFoundError("Benchmark dosyası bulunamadı.")
    seconds = max(5.0, min(90.0, args.seconds))

    with tempfile.TemporaryDirectory(prefix="whisper-model-benchmark-") as tmp:
        wav_path = os.path.join(tmp, "sample.wav")
        command = [args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source,
                   "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav_path]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        audio_seconds = wav_duration(wav_path)
        if audio_seconds < 1:
            raise RuntimeError("Seçilen dosyada ölçülebilir ses bulunamadı.")

        from faster_whisper import WhisperModel

        load_started = time.perf_counter()
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        load_seconds = time.perf_counter() - load_started
        transcribe_started = time.perf_counter()
        segments, info = model.transcribe(
            wav_path,
            language=args.language or None,
            vad_filter=True,
            beam_size=5,
        )
        segment_count = sum(1 for _ in segments)
        transcribe_seconds = time.perf_counter() - transcribe_started
        emit({
            "ok": True,
            "model": args.model,
            "device": args.device,
            "computeType": args.compute_type,
            "audioSeconds": round(audio_seconds, 3),
            "loadSeconds": round(load_seconds, 3),
            "transcribeSeconds": round(transcribe_seconds, 3),
            "realtimeFactor": round(transcribe_seconds / audio_seconds, 4),
            "speedX": round(audio_seconds / max(0.001, transcribe_seconds), 2),
            "segmentCount": segment_count,
            "language": getattr(info, "language", "") or "",
        })


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
