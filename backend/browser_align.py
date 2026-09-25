"""Önizleme amaçlı referans altyazıdan parçalı zaman eşleme."""

import json
import math
import os
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def valid_cues(raw):
    if not isinstance(raw, list) or not 3 <= len(raw) <= 10000:
        raise ValueError("Senkron için 3-10000 altyazı satırı gerekli.")
    cues = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Altyazı satırı geçersiz.")
        start, end = item.get("start"), item.get("end")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            raise ValueError("Altyazı zamanları geçersiz.")
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start or end > 86400:
            raise ValueError("Altyazı zamanları geçersiz.")
        cues.append((float(start), float(end)))
    return cues


def overlap_score(reference, candidate):
    """Zaman örtüşmesi; semantik doğruluk veya gerçek model kalitesi değildir."""
    ref = sorted(reference)
    total = sum(end - start for start, end in candidate)
    if not total:
        return 0.0
    overlap = 0.0
    ref_index = 0
    for start, end in candidate:
        while ref_index < len(ref) and ref[ref_index][1] <= start:
            ref_index += 1
        index = ref_index
        while index < len(ref):
            rs, re = ref[index]
            if re <= start:
                index += 1
                continue
            if rs >= end:
                break
            overlap += max(0.0, min(end, re) - max(start, rs))
            index += 1
    return min(1.0, overlap / total)


def align(payload):
    import srt
    import ffsubsync
    from ffsubsync.ffsubsync import make_parser

    target = valid_cues(payload.get("targetCues"))
    # Ses-referansli kip: payload.audio (yerel medya yolu) verildiginde
    # ffsubsync altyaziyi dogrudan sesin VAD ritmiyle esler — fps/surum
    # uyumsuzlugunu referans altyazi olmadan duzeltir.
    audio_path = payload.get("audio") or ""
    audio_mode = bool(audio_path)
    if audio_mode:
        if not isinstance(audio_path, str) or not os.path.isfile(audio_path):
            raise ValueError("Ses referansı dosyası bulunamadı.")
        reference = None
    else:
        reference = valid_cues(payload.get("referenceCues"))
    def make_srt(cues, raw):
        from datetime import timedelta
        return srt.compose([srt.Subtitle(index=i + 1,
            start=timedelta(seconds=start), end=timedelta(seconds=end),
            content=str(raw[i].get("text") or "Altyazı")[:4000])
            for i, (start, end) in enumerate(cues)])

    with tempfile.TemporaryDirectory(prefix="whisper-browser-align-",
            dir=os.environ.get("WHISPER_ALIGN_TMPDIR")) as directory:
        input_file = Path(directory) / "target.srt"
        output_file = Path(directory) / "aligned.srt"
        if audio_mode:
            ref_arg = audio_path
        else:
            ref_file = Path(directory) / "reference.srt"
            ref_file.write_text(make_srt(reference, payload["referenceCues"]), encoding="utf-8-sig")
            ref_arg = str(ref_file)
        input_file.write_text(make_srt(target, payload["targetCues"]), encoding="utf-8-sig")
        args = make_parser().parse_args([ref_arg, "-i", str(input_file), "-o", str(output_file),
            "--split-penalty", "8"])
        result = ffsubsync.run(args)
        if not result.get("sync_was_successful") or not output_file.exists():
            raise RuntimeError("Parçalı altyazı eşlemesi güvenilir sonuç üretmedi.")
        aligned = list(srt.parse(output_file.read_text(encoding="utf-8-sig")))
    if len(aligned) != len(target):
        raise RuntimeError("Eşleme satır sayısını değiştirdi; önizleme uygulanmadı.")
    mapped = [(max(0.0, cue.start.total_seconds()), max(0.0, cue.end.total_seconds())) for cue in aligned]
    if any(end <= start or end > 86400 for start, end in mapped):
        raise RuntimeError("Eşleme geçersiz zaman üretti.")
    changed = sum(abs(start - old[0]) > .05 or abs(end - old[1]) > .05
        for (start, end), old in zip(mapped, target))
    if audio_mode:
        mean_drift = sum(abs(start - old[0]) for (start, _), old in zip(mapped, target)) / len(target)
        return {"times": mapped, "diagnostics": {"referenceCount": None,
            "targetCount": len(target), "changedCount": changed, "overlapBefore": None,
            "overlapAfter": None, "confidence": "medium" if mean_drift < 30 else "low",
            "autoApply": False, "method": "ffsubsync-audio-vad"}}
    before = overlap_score(reference, target)
    after = overlap_score(reference, mapped)
    confidence = "medium" if len(reference) >= 8 and len(target) >= 8 and after >= .45 and after > before + .08 else "low"
    return {"times": mapped, "diagnostics": {"referenceCount": len(reference),
        "targetCount": len(target), "changedCount": changed, "overlapBefore": round(before, 3),
        "overlapAfter": round(after, 3), "confidence": confidence, "autoApply": False,
        "method": "ffsubsync-piecewise-subtitle-reference"}}


def main():
    try:
        payload = json.load(sys.stdin)
        print(json.dumps({"ok": True, **align(payload)}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)[:300]}, ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
