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
import time
import wave
from ndjson_utils import json_dumps_finite

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
# Komut satırları (parça yolları) Node'dan UTF-8 gelir. Windows'ta borudan okunan
# stdin varsayılan olarak ANSI kod sayfasıyla (Türkçe sistemde cp1254) çözülür;
# kullanıcı adında ğ/ş/ı/ö/ü/ç olan bir %TEMP% yolu bozulup HER parça "dosya
# bulunamadı" ile düşüyordu — canlı Whisper hiç altyazı üretmiyordu.
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="strict")
except (AttributeError, ValueError):
    pass

# Kısa (4–8 sn) parçalarda otomatik dil tespiti kararsızdır: Türkçe bir parça
# Azerice/Türkmence, İngilizce bir parça Galce sanılıp transliterasyon çöpü
# üretebilir. Oturum dili güvenle oturduktan sonra düşük güvenli farklı bir
# tespit, oturum diliyle yeniden çözülür. Gerçek dil değişimi (yüksek güvenle
# art arda görülür) yine geçer — main.js'teki iz bölme mantığı bunu izler.
LANGUAGE_LOCK_PROBABILITY = 0.70
LANGUAGE_SWITCH_PROBABILITY = 0.85
LANGUAGE_SWITCH_CONSECUTIVE = 2


class LanguageGate:
    """Otomatik dil modunda parça başına tespiti oturum diliyle dengeler."""

    def __init__(self, fixed_language=""):
        self.fixed = str(fixed_language or "").strip().lower() or None
        self.session = self.fixed
        self.candidate = None
        self.candidate_count = 0

    def decide(self, detected, probability):
        """Tespit edilen dil kabul edilirse None, aksi halde zorlanacak dili döndürür."""
        if self.fixed:
            return None
        detected = str(detected or "").strip().lower()
        try:
            probability = float(probability)
        except (TypeError, ValueError):
            probability = 0.0
        if not math.isfinite(probability):
            probability = 0.0
        if not detected:
            return self.session
        if self.session is None:
            if probability >= LANGUAGE_LOCK_PROBABILITY:
                self.session = detected
            return None
        if detected == self.session:
            self.candidate, self.candidate_count = None, 0
            return None
        if probability >= LANGUAGE_SWITCH_PROBABILITY:
            if detected == self.candidate:
                self.candidate_count += 1
            else:
                self.candidate, self.candidate_count = detected, 1
            if self.candidate_count >= LANGUAGE_SWITCH_CONSECUTIVE:
                self.session = detected
                self.candidate, self.candidate_count = None, 0
            # Güvenli tespit tek başına iz bölmez ama metni zorla yanlış dile
            # çevirmek de olmaz: bu parça tespit edilen dille yazılır.
            return None
        return self.session


def _load_text_filters():
    """transcribe.py'deki halüsinasyon/tekrar süzgeçlerini paylaş (tek kaynak)."""
    try:
        from transcribe import collapse_repetition, should_skip_hallucination
        return should_skip_hallucination, collapse_repetition
    except Exception:  # pragma: no cover - paket eksikse filtresiz çalış
        return (lambda text, avg_logprob=None, no_speech_prob=None: False), (lambda text: text)


# Modül yüklenirken bir kez çözülür: transcribe.py içe aktarımı stdout'u yeniden
# yapılandırır; bunu main() içinde yapmak test/gömülü akışlarda süzgeci sessizce
# devre dışı bırakıyordu.
TEXT_FILTERS = _load_text_filters()


def _finite_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def wav_duration(file_path):
    try:
        with wave.open(file_path, "rb") as handle:
            rate = handle.getframerate()
            return handle.getnframes() / rate if rate > 0 else 0.0
    except Exception:
        return 0.0


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
    if not math.isfinite(rate) or not 0.0625 <= rate <= 16:
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
    gate = LanguageGate(args.language)
    should_skip, collapse = TEXT_FILTERS
    while not stop_event.is_set() or not commands.empty():
        try:
            command = commands.get(timeout=0.2)
        except queue.Empty:
            continue
        if command.get("type") != "chunk":
            continue
        file_path = str(command.get("path") or "")
        started = time.monotonic()
        try:
            offset = parse_chunk_offset(command)
            rate = parse_chunk_rate(command)
            options = dict(vad_filter=True, condition_on_previous_text=False, beam_size=1)
            segments, info = model.transcribe(file_path, language=args.language or None, **options)
            forced = gate.decide(getattr(info, "language", ""),
                                 getattr(info, "language_probability", None))
            detected = str(getattr(info, "language", "") or "")
            if forced and forced != detected.lower():
                # Üreteç tembeldir: ilk sonuç hiç tüketilmeden atılır, yani
                # çözümleme maliyeti yalnız zorlanan dilde ödenir.
                segments, info = model.transcribe(file_path, language=forced, **options)
                detected = forced
            count = 0
            skipped = 0
            for segment in segments:
                text = str(segment.text or "").strip()
                bounds = segment_bounds(segment)
                if not text or bounds is None:
                    continue
                if should_skip(text, _finite_or_none(getattr(segment, "avg_logprob", None)),
                               _finite_or_none(getattr(segment, "no_speech_prob", None))):
                    skipped += 1
                    continue
                text = collapse(text).strip()
                if not text:
                    continue
                start, end = bounds
                emit("segment", path=file_path, start=offset + start * rate,
                     end=offset + end * rate, text=text,
                     language=detected or getattr(info, "language", "") or "")
                count += 1
            duration = wav_duration(file_path)
            elapsed = time.monotonic() - started
            rtf = round(elapsed / duration, 3) if duration > 0 else None
            emit("chunk_done", path=file_path, count=count, skipped=skipped, rtf=rtf,
                 audio_seconds=round(duration, 3))
        except Exception as error:
            emit("chunk_done", path=file_path, count=0, error=str(error))
    emit("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
