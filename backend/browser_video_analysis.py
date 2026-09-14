"""Seçili video kare OCR ve tekrar eden ses bölümü analizi (tek JSON/stdin)."""
import json
import math
import sys
from pathlib import Path


def ocr_range(request):
    try:
        import numpy as np
        from PIL import Image
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise RuntimeError("OCR bağımlılığı eksik. install-browser-tools.bat çalıştırın.") from exc
    paths = request.get("frames", [])
    start, end, interval = (float(request[key]) for key in ("start", "end", "interval"))
    crop = request.get("crop")
    if not isinstance(paths, list) or len(paths) > 120 or not 0 <= start < end <= start + 60 or not 0.5 <= interval <= 5:
        raise ValueError("OCR aralığı veya kare sayısı geçersiz.")
    engine = RapidOCR()
    reads = []
    for i, file in enumerate(paths):
        with Image.open(file) as image:
            image = image.convert("RGB")
            if crop:
                x, y, w, h = (float(crop[key]) for key in ("x", "y", "width", "height"))
                if not (0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 - x and 0 < h <= 1 - y):
                    raise ValueError("OCR bölgesi geçersiz.")
                left, top = int(x * image.width), int(y * image.height)
                right, bottom = int((x + w) * image.width), int((y + h) * image.height)
                image = image.crop((left, top, right, bottom))
            result, _ = engine(np.asarray(image))
        text = " ".join(str(row[1]).strip() for row in (result or []) if float(row[2]) >= 0.5).strip()
        reads.append((min(end, start + i * interval), text))
    cues = []
    active = None
    for time, text in reads:
        if active and active["text"] == text:
            active["end"] = min(end, time + interval)
        else:
            if active and active["text"]:
                cues.append(active)
            active = {"start": time, "end": min(end, time + interval), "text": text}
    if active and active["text"]:
        cues.append(active)
    return {"cues": cues, "diagnostics": {"frames": len(paths), "recognizedFrames": sum(bool(text) for _, text in reads), "method": "RapidOCR 1.4.4"}}


def _audio_features(file):
    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import stft
    rate, samples = wavfile.read(file)
    if rate != 8000 or samples.ndim != 1 or len(samples) > 8000 * 120:
        raise ValueError("Intro ses örneği geçersiz.")
    audio = samples.astype(np.float32) / 32768
    _, times, spectrum = stft(audio, fs=rate, nperseg=2048, noverlap=0, boundary=None)
    magnitude = np.abs(spectrum)
    frequencies = np.linspace(0, rate / 2, magnitude.shape[0])
    bins = np.geomspace(100, 3200, 25)
    bands = np.stack([magnitude[(frequencies >= bins[i]) & (frequencies < bins[i + 1])].mean(axis=0) for i in range(24)], axis=1)
    # 0.512 saniyelik bloklarda müzik/ses spektrumu; sessizlik eşleşme sayılmaz.
    block = 2
    bands = bands[:len(bands) // block * block].reshape(-1, block, 24).mean(axis=1)
    energy = np.linalg.norm(bands, axis=1)
    bands = np.log1p(bands * 1000)
    bands = bands - bands.mean(axis=1, keepdims=True)
    bands /= np.maximum(np.linalg.norm(bands, axis=1, keepdims=True), 1e-7)
    bands[energy < 0.0005] = 0
    return bands


def detect_intro(request):
    import numpy as np
    files = request.get("audioFiles", [])
    if not isinstance(files, list) or not 2 <= len(files) <= 4:
        raise ValueError("Intro önerisi için iki ila dört ayrı video gerekir.")
    features = [_audio_features(file) for file in files]
    current = features[0]
    candidates = []
    window = 16  # 8.192 saniye
    for reference in features[1:]:
        if min(len(current), len(reference)) < window:
            continue
        similarity = current @ reference.T
        best = None
        for i in range(len(current) - window + 1):
            for j in range(len(reference) - window + 1):
                diagonal = similarity[i:i + window, j:j + window].diagonal()
                score = float(np.mean(diagonal))
                if score >= 0.78 and (best is None or score > best[0]):
                    best = (score, i, j)
        if best:
            score, i, j = best
            original_i = i
            while i > 0 and j > 0 and similarity[i - 1, j - 1] >= 0.7:
                i -= 1; j -= 1
            length = window + original_i - i
            while i + length < len(current) and j + length < len(reference) and similarity[i + length, j + length] >= 0.7:
                length += 1
            seconds = 0.512
            candidates.append({"start": round(i * seconds, 2), "end": round((i + length) * seconds, 2),
                               "referenceStart": round(j * seconds, 2), "referenceEnd": round((j + length) * seconds, 2),
                               "score": round(score, 3)})
    candidates.sort(key=lambda row: -row["score"])
    return {"candidates": candidates, "diagnostics": {"referenceCount": len(files) - 1, "method": "Yerel spektral ses eşleştirme", "suggestOnly": True, "autoSkip": False}}


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(1024 * 1024))
        operation = request.get("operation")
        if operation == "ocrRange":
            result = ocr_range(request)
        elif operation == "detectIntro":
            result = detect_intro(request)
        else:
            raise ValueError("Bilinmeyen video analiz işlemi.")
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
