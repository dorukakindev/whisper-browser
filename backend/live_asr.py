"""Kullanıcı onaylı sistem sesi parçalarını tek yüklü Whisper modeliyle işler.

stdin NDJSON: {"type":"chunk","path":"...","offset":12.0} veya {"type":"stop"}
stdout NDJSON: ready, segment, chunk_done, error
"""
import argparse
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def emit(event_type, **payload):
    print(json.dumps({"type": event_type, **payload}, ensure_ascii=False), flush=True)


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

    for raw in sys.stdin:
        try:
            command = json.loads(raw)
        except Exception:
            continue
        if command.get("type") == "stop":
            break
        if command.get("type") != "chunk":
            continue
        file_path = str(command.get("path") or "")
        offset = max(0.0, float(command.get("offset") or 0))
        try:
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
                if not text:
                    continue
                emit("segment", start=offset + float(segment.start),
                     end=offset + float(segment.end), text=text,
                     language=getattr(info, "language", "") or "")
                count += 1
            emit("chunk_done", path=file_path, count=count)
        except Exception as error:
            emit("chunk_done", path=file_path, count=0, error=str(error))
    emit("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
