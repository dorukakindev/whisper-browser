"""Manual, local-only real GPU acceptance. Never part of the normal test suite.

Default: readiness only. --run requires an idle GPU and explicit own reference.
Artifacts, including private engine logs, stay in a new ignored tmp directory.
This is ASR evidence plus a listening candidate, not an automatic quality rating.
"""
import argparse
import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SRT = """1
00:00:00,000 --> 00:00:12,000
Bugün on iki kişi kütüphanede buluştu. Bu bir yarış değil; kimseyi geride bırakmak istemiyoruz.

2
00:00:14,000 --> 00:00:28,000
Peki, yarın ne yapacağız? Önce kitabın son bölümünü okuyacağız, ardından düşüncelerimizi sakin bir sesle paylaşacağız.
"""


def readiness(xml):
    gpu = ET.fromstring(xml).find("gpu")
    if gpu is None:
        raise ValueError("No GPU reported")
    memory = gpu.find("fb_memory_usage")
    free = int(memory.findtext("free").split()[0])
    total = int(memory.findtext("total").split()[0])
    processes = gpu.findall("processes/process_info")
    process_inventory = gpu.find("processes") is not None
    # WDDM lists desktop applications as C+G. Pure C jobs include TTS/training.
    # This advisory cannot reserve VRAM or exclude a new concurrent job.
    compute = [int(p.findtext("pid")) for p in processes
               if p.findtext("type", "").strip() == "C"]
    known_types = {"C", "G", "C+G"}
    unknown = any(p.findtext("type", "").strip() not in known_types for p in processes)
    return {"gpu": gpu.findtext("product_name"), "free_mib": free,
            "total_mib": total, "compute_jobs": len(compute),
            "unknown_process_type": unknown, "process_inventory": process_inventory,
            "ready": free >= 8192 and not compute and not unknown and process_inventory}


def inspect_gpu():
    result = subprocess.run(["nvidia-smi", "-q", "-x"], capture_output=True,
                            timeout=10, check=True,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return readiness(result.stdout)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--run", action="store_true")
    p.add_argument("--engine", type=Path)
    p.add_argument("--reference", type=Path)
    p.add_argument("--transcript", type=Path)
    p.add_argument("--verify-python", type=Path)
    args = p.parse_args(argv)
    state = inspect_gpu()
    if not args.run or not state["ready"]:
        print(json.dumps({"status": "ready_not_run" if state["ready"] else "blocked_gpu",
                          **state}, ensure_ascii=True))
        return 0 if state["ready"] else 2
    for name in ("engine", "reference", "transcript", "verify_python"):
        value = getattr(args, name)
        if value is None or not value.exists():
            p.error("--run requires existing --engine, --reference, --transcript and --verify-python")
    if not (args.engine / "kitap_ortak.py").is_file():
        p.error("Invalid engine directory")
    if not args.reference.is_file() or not args.transcript.is_file() or not args.verify_python.is_file():
        p.error("Reference, transcript and verifier must be files")
    # No package install or model download. Use the installed engine interpreter.
    os.environ.update(VOXCPM_ROOT=str(args.engine.resolve()), HF_HUB_OFFLINE="1",
                      TRANSFORMERS_OFFLINE="1")
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    (ROOT / "tmp").mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="real-dub-accept-", dir=ROOT / "tmp"))
    source = output / "acceptance.srt"
    source.write_text(SRT, encoding="utf-8-sig")
    wav = output / "acceptance.wav"
    began = time.monotonic()
    with (output / "private-engine.log").open("w", encoding="utf-8") as log:
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            import altyazi_oku as reader
            # Isolate all speech caches/reports from the user's engine outputs.
            reader.OUTPUT_ROOT = output / "engine-output"
            code = reader.main([str(source), str(args.reference.resolve()),
                "--transcript", str(args.transcript.resolve()), "--mode", "hifi",
                "--output", str(wav), "--steps", "15", "--cfg", "1.65",
                "--temperature", "0.8", "--seed", "42", "--eszamanli", "2",
                "--retry", "1", "--gruplama", "akici", "--grup-max-sn", "18",
                "--grup-max-karakter", "280", "--timing-mode", "video",
                "--verification", "detailed", "--verify-python", str(args.verify_python.resolve())])
    if code not in (0, None) or not wav.is_file():
        raise RuntimeError("No completed WAV; inspect the private run directory")
    import soundfile as sf
    info = sf.info(wav)
    quality = json.loads(wav.with_suffix(".quality.json").read_text(encoding="utf-8"))
    phases = json.loads(wav.with_suffix(".performance.json").read_text(encoding="utf-8"))
    groups = quality.get("groups", [])
    checks = [g.get("verification", {}).get("status") for g in groups]
    result = {"status": "produced_needs_listening", "run_directory": str(output),
              "wall_seconds": round(time.monotonic()-began, 3),
              "wav_seconds": info.duration, "sample_rate": info.samplerate,
              "frames": info.frames, "group_count": len(groups),
              "verification": checks, "phases": phases,
              "integrity_evidence_passed": len(groups) == 2 and info.frames > 0
                  and all(x == "passed" for x in checks)
                  and all(g.get("status") == "ready" for g in groups)}
    (output / "acceptance.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result["integrity_evidence_passed"] else 3


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    raise SystemExit(main())
