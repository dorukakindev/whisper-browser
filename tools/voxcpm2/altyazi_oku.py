"""SRT altyazi -> VoxCPM2 dublaj.

Devam eden altyazi satirlarini cumle gruplari halinde nano-vLLM ile uretir.
Sesi grup penceresine yerlestirir; hafif tempo duzeltmesi yapar. Konusma
tasmalari varsayilan olarak kirpar ve raporlar; nihai WAV uretilir. Cikti video uzunluguna
esit tek WAV; --video verilirse ayrica dublajli MP4 uretir.

Parca onbellegi: ciktilar/<srt>_altyazi/<ayar-ozeti>/cue_XXXX.wav — yarim kalan
is kaldigi yerden surer.
"""
import argparse
import asyncio
import hashlib
import math
import multiprocessing
import os
import json
import re
import subprocess
import sys
import time
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
ENGINE_ROOT = Path(os.environ.get("VOXCPM_ROOT", ROOT))
if not (ENGINE_ROOT / "kitap_ortak.py").is_file():
    raise SystemExit("VoxCPM2 motoru bulunamadi. VOXCPM_ROOT ile motor klasorunu belirtin.")
sys.path.insert(0, str(ENGINE_ROOT))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from dub_timing import sentence_plan, available_window, placement_window, quality_retry, TimingOverflow
from dub_timing import fit_to_window as fit_audio

from kitap_ortak import (  # noqa: E402
    MODEL_ID, MODEL_REVISION, NO_WINDOW, OUTPUT_ROOT, apply_durak, assess_chunk,
    ensure_utf8_stdio, file_sha256, loudnorm_audio, prepare_audio,
    voice_label_for, write_manifest)
from kitap_ortak import _install_with_fallback  # noqa: E402

ensure_utf8_stdio()

try:
    import torch._inductor.config as _inductor_config
    _inductor_config.use_static_cuda_launcher = False
except Exception:
    pass

# Windows reader compatibility: avoid the mmap loader's native access violations.
# This process-local adapter also runs in the spawned worker; no package files change.
if sys.platform == 'win32':
    from safetensors.torch import load_file as _load_safetensors
    from nanovllm_voxcpm.utils import loader as _weight_loader

    class _PreadWeights:
        def __init__(self, filename, framework, device):
            self.filename = filename
            if framework != 'pt' or device != 'cpu':
                raise ValueError('Pread adapter only supports CPU torch weights')

        def __enter__(self):
            self.weights = _load_safetensors(self.filename, device='cpu', backend='pread')
            return self

        def keys(self):
            return self.weights.keys()

        def get_tensor(self, name):
            return self.weights[name]

        def __exit__(self, *args):
            self.weights.clear()

    _weight_loader.safe_open = _PreadWeights

SAMPLE_RATE = 48000
TAG_RE = re.compile(r"<[^>]+>|\{[^}]*\}")
TIME_RE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*"
    r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})")


def parse_srt(path):
    """SRT -> [(start_ms, end_ms, temiz_metin)]."""
    text = Path(path).read_text(encoding="utf-8-sig", errors="replace")
    cues = []
    for match in TIME_RE.finditer(text):
        fields = match.groups()
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (
            int(g.ljust(3, '0')) if i in (3, 7) else int(g) for i, g in enumerate(fields))
        start = ((h1 * 60 + m1) * 60 + s1) * 1000 + ms1
        end = ((h2 * 60 + m2) * 60 + s2) * 1000 + ms2
        line_end = text.find("\n", match.end())
        block_end = text.find("\n\n", match.end())
        if line_end < 0:
            line_end = len(text)
        if block_end < 0:
            block_end = len(text)
        body = text[line_end:block_end]
        body = TAG_RE.sub(" ", body)
        body = re.sub(r"\s+", " ", body).strip()
        if body and end > start:
            cues.append((start, end, body))
    return cues


def atempo_filters(ratio):
    """atempo 0.5-100 araliginda; >2 icin zincirleme."""
    parts, r = [], ratio
    while r > 2.0:
        parts.append("atempo=2.0")
        r /= 2.0
    parts.append(f"atempo={r:.4f}")
    return ",".join(parts)


def video_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, creationflags=NO_WINDOW)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return None


async def uret(args, cues, paths, prompt_text):
    from huggingface_hub import snapshot_download
    from nanovllm_voxcpm import VoxCPM

    model_path = snapshot_download(MODEL_ID, revision=MODEL_REVISION,
                                   local_files_only=True)
    print("nano-vLLM sunucusu aciliyor...", flush=True)
    began = time.monotonic()
    server = VoxCPM.from_pretrained(
        model_path, devices=[0], inference_timesteps=args.steps,
        max_num_seqs=max(args.eszamanli, 1), max_num_batched_tokens=args.batch_tokens,
        max_model_len=args.max_model_len, gpu_memory_utilization=args.gpu_mem,
        enforce_eager=False)
    try:
        await asyncio.wait_for(server.wait_for_ready(), timeout=120)
        load_seconds = time.monotonic() - began
        reference_began = time.monotonic()
        wav_bytes = Path(args.reference).read_bytes()
        ref_lat = await server.encode_latents(wav_bytes, "wav")
        prompt_id = None
        if prompt_text:
            prompt_id = await server.add_prompt(wav_bytes, "wav", prompt_text)
        sr = int(getattr(server, "sample_rate", SAMPLE_RATE) or SAMPLE_RATE)
        print("Referans hazir; uretim basliyor.", flush=True)
        reference_seconds = time.monotonic() - reference_began
        generation_began = time.monotonic()

        sem = asyncio.Semaphore(args.eszamanli)
        total = len(cues)
        done = sum(1 for p in paths if p.is_file())
        if done:
            print(f"[{done}/{total}] Kayitli satirlar kullaniliyor.", flush=True)
        cached = done
        results = []

        async def sentez(chunk, seed):
            pieces = []
            async for part in server.generate(
                    chunk, prompt_id=prompt_id,
                    ref_audio_latents=ref_lat,
                    temperature=args.temperature,
                    cfg_value=args.cfg, seed=seed,
                    max_generate_length=args.max_generate_length):
                pieces.append(np.asarray(part, dtype=np.float32).reshape(-1))
            return np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)

        async def gen(i, text, path):
            nonlocal done
            async with sem:
                tick = time.monotonic()
                best, metric = await quality_retry(lambda seed: sentez(text, seed),
                    lambda raw: assess_chunk(raw, sr, text)[0], args.seed + i,
                    args.retry, args.request_timeout)
                metric.update(group=i + 1, seconds=time.monotonic() - tick)
                results.append(metric)
                if metric['quality_score'] > 0:
                    print(f"UYARI: Grup {i + 1} kalite puani {metric['quality_score']:.2f}; en iyi deneme kullanildi.", flush=True)
                wav = prepare_audio(best, sr)
                temporary = path.with_suffix(".tmp.wav")
                sf.write(str(temporary), wav, sr, subtype="PCM_16")
                temporary.replace(path)
                done += 1
                print(f"[{done}/{total}] {text[:60]}", flush=True)

        tasks = [asyncio.ensure_future(gen(i, t, p))
                 for i, ((s, e, t), p) in enumerate(zip(cues, paths))
                 if not p.is_file()]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        metrics = {'load_seconds': load_seconds, 'reference_seconds': reference_seconds,
                   'generation_seconds': time.monotonic() - generation_began,
                   'attempts': sum(r['attempts'] for r in results),
                   'retries': sum(r['retries'] for r in results), 'cached_groups': cached,
                   'generated_groups': len(results), 'steps': args.steps,
                   'concurrency': args.eszamanli, 'groups': sorted(results, key=lambda r: r['group'])}
        paths[0].parent.joinpath('generation_report.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
        print('DUB_METRICS ' + json.dumps({k: v for k, v in metrics.items() if k != 'groups'}), flush=True)
        return sr
    finally:
        await server.stop()


def build_timeline(cues, paths, sr, total_s, max_hiz, tmp_dir, log=print,
                   overflow="kirp", extra_ms=2000, end_limit_ms=None, lead_ms=300):
    """Uretilmis satir seslerini zaman cizelgesine yerlestirir."""
    total_frames = int(math.ceil(total_s * sr))
    timeline = np.zeros(total_frames, dtype=np.float32)
    sigdirildi = kirpildi = 0
    reports, overflows = [], []
    previous_end_s = 0
    for i, ((start_ms, end_ms, text), path) in enumerate(zip(cues, paths)):
        wav, cue_sr = sf.read(str(path), dtype="float32")
        if cue_sr != sr:
            frames = int(len(wav) * sr / cue_sr)
            wav = np.interp(np.linspace(0, len(wav) - 1, frames),
                            np.arange(len(wav)), wav).astype(np.float32)
        actual_start, stop = placement_window(cues, i, len(wav) / sr, previous_end_s,
            max_hiz, extra_ms, lead_ms, end_limit_ms if end_limit_ms is not None else total_s * 1000)
        window_s = stop - actual_start
        try:
            wav, report = fit_audio(wav, sr, window_s, max_hiz, tmp_dir, f"{i:04d}", overflow)
        except TimingOverflow as error:
            report = error.report
            report['group'] = i + 1
            reports.append(report); overflows.append(report)
            sigdirildi += int(report['tempo'] > 1.0)
            log(f"UYARI: Grup {i + 1}, {report['overrun_seconds']:.2f} sn tasiyor; konusma kesilmedi.")
            continue
        report['group'] = i + 1
        report['start_seconds'] = actual_start
        report['start_shift_seconds'] = actual_start - start_ms / 1000
        reports.append(report)
        sigdirildi += int(report['tempo'] > 1.0)
        kirpildi += int(report['cut_frames'] > 0)
        if report['cut_frames'] > 0:
            log(f"UYARI: Grup {i + 1}, {report['cut_frames'] / sr:.2f} sn kirpildi; WAV uretimi devam ediyor.")
        offset = int(actual_start * sr)
        end = min(offset + len(wav), total_frames)
        timeline[offset:end] += wav[:end - offset]
        previous_end_s = end / sr
    timing = {'version': 2, 'accelerated_groups': sigdirildi, 'clipped_groups': kirpildi,
              'overflow_groups': len(overflows), 'groups': reports}
    (Path(tmp_dir) / 'timing_report.json').write_text(json.dumps(timing, indent=2), encoding='utf-8')
    log(f"Zamanlama: {sigdirildi} grup hizlandirildi, {kirpildi} grup kirpildi, {len(overflows)} grup tasiyor.")
    if overflows:
        raise ValueError(f"{len(overflows)} grup pencereye sigmadi; nihai WAV yazilmadi. "
                         f"Ayrintilar: {Path(tmp_dir) / 'timing_report.json'}")
    peak = float(np.abs(timeline).max())
    if peak > 0.98:
        timeline *= 0.98 / peak
    return timeline, timing


def mux_video(video, dub_wav, out_path, keep_original_db=None):
    out_path = Path(out_path)
    if keep_original_db is None:
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(dub_wav),
               "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
               "-b:a", "192k", "-shortest", str(out_path)]
    else:
        vol = 10 ** (keep_original_db / 20.0)
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(dub_wav),
               "-filter_complex", f"[0:a]volume={vol:.3f}[orig];[1:a][orig]amix=inputs=2[a]",
               "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
               "-b:a", "192k", "-shortest", str(out_path)]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                            errors="replace", creationflags=NO_WINDOW)
    if result.returncode != 0:
        print(f"Video gomme basarisiz: {result.stderr[-400:]}", flush=True)
        return None
    return out_path


def parse_args(argv=None):
    from kitap_voxcpm import DEFAULT_REFERENCE
    p = argparse.ArgumentParser(description="VoxCPM2 SRT altyazi dublaj araci")
    p.add_argument("srt", type=Path)
    p.add_argument("reference", nargs="?", type=Path, default=DEFAULT_REFERENCE)
    p.add_argument("--transcript", type=Path)
    p.add_argument("--mode", choices=("auto", "hifi", "clone"), default="auto")
    p.add_argument("--video", type=Path, help="Dublajin gomulecegi video (opsiyonel)")
    p.add_argument("--steps", type=int, default=15)
    p.add_argument("--cfg", type=float, default=1.65)
    p.add_argument("--temperature", type=float, default=0.8)
    p.add_argument("--max-hiz", type=float, default=1.25,
                   help="Satirin sesi pencereye sigmazsa en fazla bu kadar hizlandir")
    p.add_argument("--kaydir", type=int, default=0,
                   help="Tum zaman damgalarini kaydir (ms, dublaj erken/gec gelirse)")
    p.add_argument("--ozel-ses", type=float, default=None, metavar="dB",
                   help="Orijinal sesi bu dB'de altta tut (orn. -18); yoksa silinir")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--eszamanli", type=int, default=4)
    p.add_argument("--retry", type=int, default=2)
    p.add_argument("--request-timeout", type=int, default=180)
    p.add_argument("--gpu-mem", type=float, default=0.8)
    p.add_argument("--max-model-len", type=int, default=2048)
    p.add_argument("--batch-tokens", type=int, default=2048)
    p.add_argument("--max-generate-length", type=int, default=1024)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--output", type=Path)
    p.add_argument("--no-norm", action="store_true")
    p.add_argument("--gruplama", choices=("cumle", "satir"), default="cumle")
    p.add_argument("--grup-max-sn", type=float, default=12)
    p.add_argument("--grup-max-karakter", type=int, default=250)
    p.add_argument("--grup-bosluk-ms", type=int, default=600)
    p.add_argument("--bosluk-pay-ms", type=int, default=2000)
    p.add_argument("--erken-pay-ms", type=int, default=300)
    p.add_argument("--tasarsa", choices=("hata", "kirp"), default="kirp")
    p.add_argument("--plan", action="store_true", help="Gruplari goster; GPU/ses uretimi baslatma")
    args = p.parse_args(argv)
    if not args.srt.is_file() or not args.reference.is_file():
        p.error("SRT veya referans ses dosyasi bulunamadi.")
    if args.video and not args.video.is_file():
        p.error("Video dosyasi bulunamadi.")
    if args.max_hiz < 1.0 or args.max_hiz > 2.5:
        p.error("--max-hiz 1.0-2.5 arasi olmali.")
    if not (1 <= args.grup_max_sn <= 30 and 40 <= args.grup_max_karakter <= 1000
            and 0 <= args.grup_bosluk_ms <= 3000 and 0 <= args.bosluk_pay_ms <= 3000
            and 0 <= args.erken_pay_ms <= 500 and 30 <= args.request_timeout <= 600
            and args.limit >= 0):
        p.error("Gruplama/sure/limit secenekleri gecersiz.")
    if (args.eszamanli < 1 or args.max_model_len < 512 or args.batch_tokens < args.max_model_len
            or not 64 <= args.max_generate_length < args.max_model_len
            or not 4 <= args.steps <= 30 or not 0 <= args.retry <= 4):
        p.error("Paralellik/model token sinirlari gecersiz.")
    return args


def main(argv=None):
    from kitap_voxcpm import resolve_prompt_text

    args = parse_args(argv)
    try:
        prompt_text = resolve_prompt_text(args.reference, args.mode, args.transcript)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Referans dokumu okunamadi: {exc}")

    cues = parse_srt(args.srt)
    if not cues:
        raise SystemExit("SRT'de okunabilir satir yok.")
    if args.kaydir:
        cues = [(s + args.kaydir, e + args.kaydir, t) for s, e, t in cues]
        cues = [c for c in cues if c[0] >= 0]
    if args.limit:
        cues = cues[:args.limit]
    if not cues:
        raise SystemExit("Kaydirma sonrasinda okunabilir satir kalmadi.")
    source_cues = cues
    groups = sentence_plan(cues, args.gruplama, args.grup_max_karakter,
                           args.grup_max_sn, args.grup_bosluk_ms)
    cues = [(g['start'], g['end'], g['text']) for g in groups]
    print(f"Plan: {len(source_cues)} altyazi satiri -> {len(groups)} {args.gruplama} grubu.", flush=True)
    if args.plan:
        print(json.dumps([{'group': i + 1, 'source_ids': g['source_ids'],
                          'start': g['start'] / 1000, 'end': g['end'] / 1000,
                          'chars': len(g['text'])} for i, g in enumerate(groups)], indent=2))
        return 0
    print(f"{len(cues)} altyazi satiri; ilk satir {cues[0][0] / 1000:.1f} sn, "
          f"son satir {cues[-1][1] / 1000:.1f} sn.", flush=True)
    duration = video_duration(args.video) if args.video else None
    if args.video and (duration is None or cues[-1][1] / 1000 > duration):
        raise SystemExit("Video suresi okunamadi veya altyazi videodan uzun; ses kesilmedi.")
    args.end_limit_ms = duration * 1000 if duration is not None else None

    ref_hash = file_sha256(args.reference)
    legacy_settings = ("dublaj-cumle-v2", MODEL_REVISION, ref_hash, args.steps, args.cfg,
                args.seed, args.temperature, prompt_text or args.mode,
                args.gruplama, args.max_hiz, args.bosluk_pay_ms, args.end_limit_ms,
                args.max_model_len, args.batch_tokens, args.max_generate_length, cues)
    # Audio identity excludes timing and batch capacity; changing tempo reuses speech.
    settings = ("dublaj-ses-v3", MODEL_REVISION, ref_hash, args.steps, args.cfg,
                args.seed, args.temperature, prompt_text or args.mode,
                args.retry, args.max_generate_length, [text for _, _, text in cues])
    run_hash = hashlib.sha256(repr(settings).encode("utf-8")).hexdigest()[:16]
    parts_dir = OUTPUT_ROOT / f"{args.srt.stem}_altyazi" / run_hash
    parts_dir.mkdir(parents=True, exist_ok=True)
    paths = [parts_dir / f"cue_{i:04d}.wav" for i in range(1, len(cues) + 1)]
    legacy_variants = [legacy_settings]
    old_defaults = list(legacy_settings); old_defaults[9:12] = [1.15, 1000, args.end_limit_ms]
    legacy_variants.append(tuple(old_defaults))
    for old in legacy_variants:
        old_hash = hashlib.sha256(repr(old).encode('utf-8')).hexdigest()[:16]
        old_dir = parts_dir.parent / old_hash
        for dest in paths:
            src = old_dir / dest.name
            if not dest.exists() and src.is_file():
                info = sf.info(str(src))
                if info.frames > 0: shutil.copy2(src, dest)
    eksik = sum(1 for p in paths if not p.is_file())

    start = time.time()
    if eksik:
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA kullanilamiyor.")
        sr = asyncio.run(uret(args, cues, paths, prompt_text))
    else:
        sr = sf.info(str(paths[0])).samplerate
        print("Tum satirlar hazir; zaman cizelgesi kuruluyor.", flush=True)
        print('DUB_METRICS ' + json.dumps({'attempts': 0, 'retries': 0,
              'cached_groups': len(paths), 'generated_groups': 0,
              'steps': args.steps, 'concurrency': args.eszamanli}), flush=True)

    total_s = duration or (cues[-1][1] + 2000) / 1000.0
    timeline, timing = build_timeline(cues, paths, sr, total_s, args.max_hiz, parts_dir,
                                     overflow=args.tasarsa, extra_ms=args.bosluk_pay_ms,
                                     end_limit_ms=args.end_limit_ms, lead_ms=args.erken_pay_ms)

    stem = args.srt.stem
    sample_suffix = f"_ornek{args.limit}" if args.limit else ""
    wav_path = args.output or (OUTPUT_ROOT / f"{stem}_altyazi" /
                               f"{stem}_dublaj_{args.gruplama}_{voice_label_for(args.reference)}{sample_suffix}.wav")
    wav_path = Path(wav_path)
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = wav_path.with_suffix(".tmp.wav")
    sf.write(str(tmp), timeline, sr, subtype="PCM_16")
    wav_path = _install_with_fallback(tmp, wav_path)
    if not args.no_norm:
        normed = loudnorm_audio(wav_path)
        if normed:
            wav_path = Path(normed)
    print(f"Dublaj WAV: {wav_path}", flush=True)

    manifest = {"version": 2, "wav": wav_path.name, "sample_rate": sr,
                "grouping": args.gruplama, "timing": timing,
                "duration": float(len(timeline) / sr),
                "text": "\n".join(t for _, _, t in cues),
                "segments": [
                    {"i": i, "text": t, "start": timing['groups'][i]['start_seconds'],
                     "end": timing['groups'][i]['start_seconds'] + timing['groups'][i]['after_seconds'],
                     "file": str(paths[i]), "pause_ms": 0, "source_ids": groups[i]['source_ids']}
                    for i, (s, e, t) in enumerate(cues)]}
    write_manifest(wav_path, manifest)

    if args.video:
        mp4 = wav_path.with_name(wav_path.stem + "_dublajli.mp4")
        out = mux_video(args.video, wav_path, mp4, args.ozel_ses)
        if out:
            print(f"Dublajli video: {out}", flush=True)
    print(f"Tamamlandi: {wav_path}", flush=True)
    print(f"Ses: {len(timeline) / sr / 60:.1f} dk | Islem: "
          f"{(time.time() - start) / 60:.1f} dk", flush=True)
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
