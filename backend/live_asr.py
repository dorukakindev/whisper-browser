"""Kullanıcı onaylı sistem sesi parçalarını tek yüklü Whisper modeliyle işler.

stdin NDJSON: {"type":"chunk","path":"...","offset":12.0} veya {"type":"stop"}
stdout NDJSON: ready, segment, chunk_done, error
"""
import argparse
import json
import math
import queue
import sys
import threading
from ndjson_utils import json_dumps_finite

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def emit(event_type, **payload):
    print(json_dumps_finite({"type": event_type, **payload}), flush=True)


def read_commands(commands, stop_event):
    for raw in sys.stdin:
        try:
            command = json.loads(raw)
        except Exception as error:
            emit("error", message=f"Canlı Whisper komutu okunamadı: {error}")
            continue
        if not isinstance(command, dict):
            emit("error", message="Canlı Whisper komutu bir JSON nesnesi olmalı.")
            continue
        if command.get("type") == "stop":
            stop_event.set()
            break
        commands.put(command)
    stop_event.set()


def parse_chunk_offset(command):
    raw_offset = float(command.get("offset") or 0)
    if not math.isfinite(raw_offset):
        raise ValueError("offset sonlu bir sayı olmalı")
    return max(0.0, raw_offset)


def parse_chunk_rate(command):
    rate = float(command.get("rate", 1))
    if not math.isfinite(rate) or not 0.25 <= rate <= 4:
        raise ValueError("Oynatma hızı geçersiz")
    return rate


def segment_bounds(segment):
    try:
        start = float(segment.start)
        end = float(segment.end)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
        return None
    return start, end


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="float16")
    parser.add_argument("--language", default="")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    except Exception as error:
        emit("error", message=f"Canlı Whisper modeli yüklenemedi: {error}")
        return 2
    emit("ready", model=args.model, device=args.device)

    commands = queue.Queue()
    stop_event = threading.Event()
    reader = threading.Thread(target=read_commands, args=(commands, stop_event), daemon=True)
    reader.start()

    # stop/EOF sonrası da kuyruktaki parçalar işlenir — aksi halde son ~9 sn
    # ses transkripte hiç girmezdi. Uygulama kapanışı çocuğu yine öldürür;
    # bu döngü yalnızca nazik durdurmada drenaj sağlar.
    while not stop_event.is_set() or not commands.empty():
        try:
            command = commands.get(timeout=0.2)
        except queue.Empty:
            continue
        if command.get("type") != "chunk":
            continue
        file_path = str(command.get("path") or "")
        try:
            offset = parse_chunk_offset(command)
            rate = parse_chunk_rate(command)
            segments, info = model.transcribe(
                file_path,
                language=args.language or None,
                vad_filter=True,
                condition_on_previous_text=False,
                beam_size=1,
            )
            count = 0
            for segment in segments:
                text = str(segment.text or "").strip()
                bounds = segment_bounds(segment)
                if not text or bounds is None:
                    continue
                start, end = bounds
                emit("segment", start=offset + start * rate,
                     end=offset + end * rate, text=text,
                     language=getattr(info, "language", "") or "")
                count += 1
            emit("chunk_done", path=file_path, count=count)
        except Exception as error:
            emit("chunk_done", path=file_path, count=0, error=str(error))
    emit("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
