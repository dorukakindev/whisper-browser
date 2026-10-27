"""Bounded, CPU-only audio measurements. No semantic mood/instrument inference."""
import argparse
import json
import wave
import numpy as np

VERSION = "music-dsp-1"


def analyze(samples, sr):
    x = np.asarray(samples, dtype=np.float32)
    if x.ndim != 1 or not np.all(np.isfinite(x)) or len(x) < sr:
        raise ValueError("At least one second of valid audio is required.")
    duration = len(x) / sr
    if duration > 1800.1:
        raise ValueError("Select at most 30 minutes.")
    n, hop = 2048, 512
    frequencies = np.fft.rfftfreq(n, 1 / sr)
    window = np.hanning(n)
    rows, envelope, chroma = [], [], np.zeros(12)
    previous = None
    # Only one FFT frame is held at a time, including for long selections.
    for start in range(0, len(x) - n + 1, hop):
        frame = x[start:start + n]
        power = np.abs(np.fft.rfft(frame * window)) ** 2
        total = float(power.sum())
        fractions = [float(power[mask].sum() / total) if total > 1e-12 else 0.0
                     for mask in [frequencies < 250, (frequencies >= 250) & (frequencies < 2000), frequencies >= 2000]]
        rms = float(np.sqrt(np.mean(frame ** 2)))
        centroid = float(np.dot(frequencies, power) / total) if total > 1e-12 else 0
        spectrum = np.sqrt(power)
        flux = float(np.maximum(spectrum - previous, 0).sum()) if previous is not None else 0
        previous = spectrum
        envelope.append(flux)
        rows.append([start / sr, max(-96, 20 * np.log10(max(rms, 1e-8))), centroid, *fractions])
        mask = (frequencies >= 65) & (frequencies <= 2100)
        pitches = np.rint(69 + 12 * np.log2(frequencies[mask] / 440)).astype(int) % 12
        chroma += np.bincount(pitches, weights=power[mask], minlength=12)
    data = np.asarray(rows)
    stride = max(1, int(np.ceil(len(data) / 600)))
    points = []
    for start in range(0, len(data), stride):
        block = data[start:start + stride]
        points.append(dict(zip(["time", "db", "centroid", "low", "mid", "high"], np.round(block.mean(axis=0), 5).tolist())))
    wave_bins = []
    for part in np.array_split(x, min(900, len(x))):
        wave_bins.append([round(float(part.min()), 5), round(float(part.max()), 5)])
    rms = float(np.sqrt(np.mean(x ** 2)))
    bpm = None
    if rms > 1e-4 and len(envelope) > 80:
        onset = np.asarray(envelope)
        onset = np.maximum(onset - np.mean(onset), 0)
        rate = sr / hop
        lags = np.arange(max(1, int(rate * 60 / 210)), int(rate * 60 / 45) + 1)
        scores = np.array([np.dot(onset[:-lag], onset[lag:]) / max(1, len(onset) - lag) for lag in lags])
        baseline = float(np.mean(onset ** 2))
        best = int(np.argmax(scores))
        confidence = float(scores[best] / baseline) if baseline > 1e-12 else 0
        if confidence >= .12:
            bpm = {"value": round(60 * rate / int(lags[best]), 1), "confidence": round(min(1, confidence), 3), "method": "onset-autocorrelation"}
    chroma = chroma / chroma.sum() if chroma.sum() else chroma
    return {"version": VERSION, "duration": round(duration, 5), "sampleRate": sr,
            "rmsDb": round(max(-96, 20 * np.log10(max(rms, 1e-8))), 2),
            "peakDb": round(max(-96, 20 * np.log10(max(float(np.max(np.abs(x))), 1e-8))), 2),
            "silent": rms < 1e-4, "tempo": bpm, "chroma": np.round(chroma, 6).tolist(),
            "waveform": wave_bins, "points": points,
            "capabilities": {"spectralBands": True, "mood": False, "instruments": False, "vocal": False, "key": False}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    with wave.open(args.input, "rb") as reader:
        if reader.getnchannels() != 1 or reader.getsampwidth() != 2 or reader.getnframes() > reader.getframerate() * 1801:
            raise ValueError("Expected bounded mono PCM16 audio.")
        samples = np.frombuffer(reader.readframes(reader.getnframes()), dtype="<i2").astype(np.float32) / 32768
        result = analyze(samples, reader.getframerate())
    print(json.dumps(result, allow_nan=False))
