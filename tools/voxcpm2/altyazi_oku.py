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
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
ENGINE_ROOT = Path(os.environ.get("VOXCPM_ROOT", ROOT))
if not (ENGINE_ROOT / "kitap_ortak.py").is_file():
    raise SystemExit("VoxCPM2 motoru bulunamadi. VOXCPM_ROOT ile motor klasorunu belirtin.")
# Running this file as a script already leaves ROOT on sys.path but never at
# index 0, so an unconditional ENGINE_ROOT insert let the engine folder's
# older dub_plan.py shadow the copy in this folder. Keep ROOT first.
for _module_root in (str(ROOT), str(ENGINE_ROOT)):
    while _module_root in sys.path:
        sys.path.remove(_module_root)
sys.path.insert(0, str(ENGINE_ROOT))
sys.path.insert(0, str(ROOT))
from dub_timing import available_window, placement_window, quality_retry, TimingOverflow
from dub_timing import fit_to_window as fit_audio
from dub_timing import build_adaptive_timeline

from kitap_ortak import (  # noqa: E402
    MODEL_ID, MODEL_REVISION, NO_WINDOW, OUTPUT_ROOT, assess_chunk,
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
from dub_plan import parse_srt, apply_edits, make_groups, read_source_bytes
from dub_quality import chunk_key, valid_audio, representative_groups, reference_quality, speech_check


class SpeechVerifier:
    def __init__(self, python):
        self.python, self.proc, self.unavailable = python, None, False
        self.lock = asyncio.Lock()

    async def check(self, path, text):
        if not self.python or self.unavailable:
            return {'status': 'unavailable'}
        async with self.lock:
            try:
                if self.proc is None:
                    self.proc = await asyncio.create_subprocess_exec(str(self.python),
                        str(ROOT.parents[1] / 'backend' / 'dub_verify.py'),
                        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                        creationflags=NO_WINDOW)
                self.proc.stdin.write((json.dumps({'path': str(path)}) + '\n').encode())
                await self.proc.stdin.drain()
                response = json.loads(await asyncio.wait_for(self.proc.stdout.readline(), 120))
                if 'error' in response:
                    raise ValueError('unavailable')
                result = speech_check(text, response['text'])
                return {'status': 'review' if result['review'] else 'passed', **result}
            except (OSError, ValueError, asyncio.TimeoutError, KeyError, BrokenPipeError):
                self.unavailable = True
                print('DUB_WARNING verification_unavailable', flush=True)
                return {'status': 'unavailable'}

    async def close(self):
        if self.proc and self.proc.returncode is None:
            self.proc.terminate()
            await self.proc.wait()


async def rewrite_for_window(args, i, text, seconds, before='', after=''):
    if not args.auto_fit or not args.rewrite_dir:
        return text
    request_id = uuid.uuid4().hex
    response_path = args.rewrite_dir / (request_id + '.json')
    print('DUB_REWRITE ' + json.dumps({'id': request_id, 'group': i + 1,
        'text': text, 'seconds': min(30, seconds), 'before':before[-1500:], 'after':after[:1500]}), flush=True)
    try:
        for _ in range(500):
            if response_path.is_file():
                response = json.loads(response_path.read_text(encoding='utf-8'))
                proposed = response.get('text')
                if isinstance(proposed, str) and 0 < len(proposed) <= len(text):
                    return proposed
                return text
            await asyncio.sleep(.1)
        return text
    finally:
        response_path.unlink(missing_ok=True)


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
        try:
            await asyncio.wait_for(server.wait_for_ready(), timeout=args.ready_timeout)
        except asyncio.TimeoutError as exc:
            raise RuntimeError(f"nano-vLLM sunucusu {args.ready_timeout} saniyede hazir olmadi; --ready-timeout ile beklemeyi artirin.") from exc
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

        # Recover completed pieces after OOM with a fresh, smaller server.
        sem = asyncio.Semaphore(args.eszamanli)
        verifier = SpeechVerifier(args.verify_python)
        total = len(cues)
        done = sum(1 for i, p in enumerate(paths) if p.is_file() and args.group_keys[i] not in args.force_groups)
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
                seed = args.group_seeds[i]
                window = available_window(cues, i, args.bosluk_pay_ms, args.end_limit_ms)
                temporary = path.with_suffix('.tmp.wav')
                try:
                    best, metric = await quality_retry(lambda n: sentez(text, n),
                        lambda raw: assess_chunk(raw, sr, text)[0], seed,
                        args.retry, args.request_timeout)
                    wav = prepare_audio(best, sr)
                    metric['rewritten'] = False
                    # One bounded, duration-informed edit. Preserve the original
                    # and accept the candidate only if it is valid and shorter.
                    if len(wav) / sr > window * 1.15 and len(text) > 25:
                        proposed = await rewrite_for_window(args, i, text, window,
                            cues[i - 1][2] if i else '', cues[i + 1][2] if i + 1 < len(cues) else '')
                        if proposed != text:
                            try:
                                candidate, extra = await quality_retry(lambda n: sentez(proposed, n),
                                    lambda raw: assess_chunk(raw, sr, proposed)[0], seed + 17,
                                    1, args.request_timeout)
                                candidate = prepare_audio(candidate, sr)
                                metric['attempts'] += extra['attempts']
                                metric['retries'] += extra['attempts']
                                if extra['quality_score'] <= metric['quality_score'] and len(candidate) < len(wav):
                                    wav, text = candidate, proposed
                                    metric['rewritten'] = True
                            except (ValueError, asyncio.TimeoutError):
                                pass
                    sf.write(str(temporary), wav, sr, subtype='PCM_16')
                    check = {'status': 'not_checked'}
                    if args.verification == 'detailed' or (args.verification == 'balanced' and
                            (metric['quality_score'] > 0 or len(wav) / sr > window * 1.15)):
                        check = await verifier.check(temporary, text)
                        if check['status'] == 'review':
                            # Re-read with a different seed; never edit meaning
                            # from an uncertain automatic transcript.
                            candidate = prepare_audio(await asyncio.wait_for(sentez(text, seed + 200003), args.request_timeout), sr)
                            if len(candidate) and assess_chunk(candidate, sr, text)[0] <= metric['quality_score']:
                                second = temporary.with_name(temporary.stem + '-verify.wav')
                                try:
                                    sf.write(str(second), candidate, sr, subtype='PCM_16')
                                    checked = await verifier.check(second, text)
                                    if checked.get('similarity', 0) > check.get('similarity', 0) and not checked.get('missing_numbers'):
                                        wav, check = candidate, checked
                                        sf.write(str(temporary), wav, sr, subtype='PCM_16')
                                finally:
                                    second.unlink(missing_ok=True)
                            metric['attempts'] += 1; metric['retries'] += 1
                    temporary.replace(path)
                    metric.update(verification=check, text=text, status='review' if
                        metric['quality_score'] > 0 or check['status'] == 'review' else 'ready')
                    path.with_suffix('.json').write_text(json.dumps(metric), encoding='utf-8')
                    args.force_groups.discard(args.group_keys[i])
                except Exception as exc:
                    if 'out of memory' in str(exc).lower() or 'cuda error' in str(exc).lower():
                        raise
                    # A failed piece is explicit and remains retryable. Keep
                    # other successful pieces and still render a usable WAV.
                    metric = {'attempts': args.retry + 1, 'retries': args.retry,
                              'quality_score': None, 'status': 'failed', 'text': text,
                              'verification': {'status': 'unavailable'}}
                    if valid_audio(path, sf):
                        metric['status'] = 'review'
                    elif temporary.is_file() and valid_audio(temporary, sf):
                        temporary.replace(path)
                        metric['status'] = 'review'
                    else:
                        fallback = args.report_dir / f'failed_{i:04d}.wav'
                        sf.write(str(fallback), np.zeros(max(1, round(window * sr)), dtype=np.float32), sr)
                        paths[i] = fallback
                    if metric['status'] == 'review':
                        path.with_suffix('.json').write_text(json.dumps(metric), encoding='utf-8')
                finally:
                    temporary.unlink(missing_ok=True)
                metric.update(group=i + 1, key=args.group_keys[i], seconds=time.monotonic() - tick)
                results.append(metric)
                print('DUB_GROUP ' + json.dumps({k: metric[k] for k in
                    ('group', 'key', 'status', 'verification', 'rewritten') if k in metric}), flush=True)
                done += 1
                print(f"[{done}/{total}]", flush=True)

        tasks = [asyncio.ensure_future(gen(i, t, p))
                 for i, ((s, e, t), p) in enumerate(zip(cues, paths))
                 if not p.is_file() or args.group_keys[i] in args.force_groups]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        finally:
            await verifier.close()
        args.group_results = results
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


def generate_with_fallback(args, cues, paths, prompt_text, generate=None):
    generate = generate or uret
    while True:
        original_paths = list(paths)
        try:
            return asyncio.run(generate(args, cues, paths, prompt_text))
        except Exception as exc:
            if args.eszamanli <= 1 or not any(term in str(exc).lower() for term in ('out of memory', 'cuda error')):
                raise
            args.eszamanli = max(1, args.eszamanli // 2)
            paths[:] = original_paths
            print('DUB_CONCURRENCY ' + str(args.eszamanli), flush=True)


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
    p.add_argument("--ready-timeout", "--hazir-timeout", type=int, default=300)
    p.add_argument("--gpu-mem", type=float, default=0.8)
    p.add_argument("--max-model-len", type=int, default=2048)
    p.add_argument("--batch-tokens", type=int, default=2048)
    p.add_argument("--max-generate-length", type=int, default=1024)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument('--representative-preview', action='store_true')
    p.add_argument('--verification', choices=('fast', 'balanced', 'detailed'), default='balanced')
    p.add_argument('--verify-python', type=Path)
    p.add_argument('--auto-fit', action='store_true')
    p.add_argument('--rewrite-dir', type=Path)
    p.add_argument('--force-groups', default='')
    p.add_argument("--output", type=Path)
    p.add_argument("--no-norm", action="store_true")
    p.add_argument("--gruplama", choices=("cumle", "satir"), default="cumle")
    p.add_argument("--grup-max-sn", type=float, default=12)
    p.add_argument("--grup-max-karakter", type=int, default=250)
    p.add_argument("--grup-bosluk-ms", type=int, default=600)
    p.add_argument("--bosluk-pay-ms", type=int, default=2000)
    p.add_argument("--erken-pay-ms", type=int, default=300)
    p.add_argument("--tasarsa", choices=("hata", "kirp"), default="kirp")
    p.add_argument("--range-start", type=float)
    p.add_argument("--timing-mode", choices=('clip', 'video'), default='clip')
    p.add_argument("--range-end", type=float)
    p.add_argument("--dub-text", type=Path, help="Ayri, gozden gecirilmis dublaj metni JSON")
    p.add_argument("--plan", action="store_true", help="Gruplari goster; GPU/ses uretimi baslatma")
    args = p.parse_args(argv)
    args.force_groups = set(filter(None, args.force_groups.split(';')))
    if any(not re.fullmatch(r'\d+(?:,\d+)*', key) for key in args.force_groups):
        p.error('Invalid group key.')
    if (args.range_start is None) != (args.range_end is None):
        p.error('Baslangic ve bitis birlikte gerekli.')
    if args.range_start is not None and args.video:
        p.error('Aralik dublajini browser oynaticisinda kullanin; video gommesi desteklenmiyor.')
    if args.timing_mode == 'video' and args.video:
        p.error('Uyarlamali dublaji browser oynaticisinda kullanin.')
    if not args.srt.is_file() or not args.reference.is_file():
        p.error("SRT veya referans ses dosyasi bulunamadi.")
    if args.video and not args.video.is_file():
        p.error("Video dosyasi bulunamadi.")
    if args.max_hiz < 1.0 or args.max_hiz > 2.5:
        p.error("--max-hiz 1.0-2.5 arasi olmali.")
    if not (1 <= args.grup_max_sn <= 30 and 40 <= args.grup_max_karakter <= 1000
            and 0 <= args.grup_bosluk_ms <= 3000 and 0 <= args.bosluk_pay_ms <= 3000
            and 0 <= args.erken_pay_ms <= 500 and 30 <= args.request_timeout <= 600
            and 30 <= args.ready_timeout <= 900 and args.limit >= 0):
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

    source_bytes = read_source_bytes(args.srt)
    cues = parse_srt(args.srt, source_bytes)
    if not cues:
        raise SystemExit("SRT'de okunabilir satir yok.")
    if args.kaydir:
        cues = [(s + args.kaydir, e + args.kaydir, t) for s, e, t in cues]
        cues = [c for c in cues if c[0] >= 0]
    if not cues:
        raise SystemExit("Kaydirma sonrasinda okunabilir satir kalmadi.")
    source_cues = cues
    groups = make_groups(cues, args.range_start, args.range_end, 0 if args.representative_preview else args.limit, args.gruplama,
                         args.grup_max_karakter, args.grup_max_sn, args.grup_bosluk_ms)
    if args.dub_text:
        apply_edits(groups, json.loads(args.dub_text.read_text(encoding='utf-8')), hashlib.sha256(source_bytes).hexdigest())
    if args.representative_preview:
        groups = representative_groups(groups)
        args.range_start = args.range_end = None
    args.group_keys = [','.join(map(str, g['source_ids'])) for g in groups]
    if args.force_groups - set(args.group_keys):
        raise ValueError('Selected group is outside the current plan.')
    args.group_seeds = [args.seed + int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 1000000000
                       for key in args.group_keys]
    args.group_results = []
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
    args.end_limit_ms = duration * 1000 if duration is not None else (
        args.range_end * 1000 if args.range_end is not None else None)
    # Check windows before loading the GPU model.
    for i in range(len(cues)):
        available_window(cues, i, args.bosluk_pay_ms, args.end_limit_ms)

    ref_hash = file_sha256(args.reference)
    # Audio identity excludes timing and batch capacity; changing tempo reuses speech.
    settings = ("dublaj-ses-v4", MODEL_REVISION, ref_hash, args.steps, args.cfg,
                args.temperature, prompt_text or args.mode, args.max_generate_length,
                args.verification)
    # Run reports are separate from independently addressed speech pieces.
    run_hash = hashlib.sha256(repr(settings).encode("utf-8")).hexdigest()[:16]
    parts_dir = OUTPUT_ROOT / f"{args.srt.stem}_altyazi" / run_hash
    parts_dir.mkdir(parents=True, exist_ok=True)
    args.report_dir = parts_dir
    cache_dir = OUTPUT_ROOT / '_dub_chunks_v4'
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths = [cache_dir / (chunk_key(settings, text, seed) + '.wav')
             for (_, _, text), seed in zip(cues, args.group_seeds)]
    if args.auto_fit:
        # A compact rewrite depends on available time, unlike ordinary speech.
        paths = [cache_dir / (chunk_key(settings, [text, available_window(cues, i,
            args.bosluk_pay_ms, args.end_limit_ms)], seed) + '.wav')
            for i, ((_, _, text), seed) in enumerate(zip(cues, args.group_seeds))]
    for p in paths:
        if p.exists() and not valid_audio(p, sf):
            p.unlink()
    eksik = sum(1 for i, p in enumerate(paths) if not p.is_file() or args.group_keys[i] in args.force_groups)
    reference_audio, reference_rate = sf.read(str(args.reference), dtype='float32')
    print('DUB_REFERENCE ' + json.dumps(reference_quality(reference_audio, reference_rate)), flush=True)

    start = time.time()
    if eksik:
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA kullanilamiyor.")
        sr = generate_with_fallback(args, cues, paths, prompt_text)
    else:
        sr = sf.info(str(paths[0])).samplerate
        print("Tum satirlar hazir; zaman cizelgesi kuruluyor.", flush=True)
        print('DUB_METRICS ' + json.dumps({'attempts': 0, 'retries': 0,
              'cached_groups': len(paths), 'generated_groups': 0,
              'steps': args.steps, 'concurrency': args.eszamanli}), flush=True)

    group_results = []
    failed = {r['group']: r for r in args.group_results if r['status'] in ('failed','review')}
    for i, p in enumerate(paths):
        try:
            record = failed.get(i + 1) or json.loads(p.with_suffix('.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            record = {'status': 'ready', 'verification': {'status': 'not_checked'}}
        record.update(group=i + 1, key=args.group_keys[i])
        group_results.append(record)
    cues = [(s, e, record.get('text', text)) for (s, e, text), record in zip(cues, group_results)]
    public_groups = [{k: r[k] for k in ('group', 'key', 'status', 'verification', 'rewritten') if k in r}
                     for r in group_results]
    for row in public_groups:
        print('DUB_GROUP ' + json.dumps(row), flush=True)
    timeline_cues = cues
    total_s = duration or (cues[-1][1] + 2000) / 1000.0
    if args.range_start is not None:
        offset_ms = round(args.range_start * 1000)
        timeline_cues = [(s - offset_ms, e - offset_ms, t) for s, e, t in cues]
        total_s = args.range_end - args.range_start
        args.end_limit_ms = total_s * 1000
    sync = None
    if args.timing_mode == 'video':
        timeline, timing, sync = build_adaptive_timeline(timeline_cues, paths, sr, total_s,
            args.max_hiz, parts_dir, args.bosluk_pay_ms)
        (parts_dir / 'timing_report.json').write_text(json.dumps(timing, indent=2), encoding='utf-8')
        print(f"Zamanlama: {timing['accelerated_groups']} grup hizlandirildi, 0 grup kirpildi, 0 grup tasiyor.", flush=True)
    else:
        timeline, timing = build_timeline(timeline_cues, paths, sr, total_s, args.max_hiz, parts_dir,
                                         overflow=args.tasarsa, extra_ms=args.bosluk_pay_ms,
                                         end_limit_ms=args.end_limit_ms, lead_ms=args.erken_pay_ms)

    stem = args.srt.stem
    sample_suffix = '_ornek_temsili' if args.representative_preview else (f"_ornek{args.limit}" if args.limit else "")
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
    if sync:
        wav_path.with_suffix('.sync.json').write_text(json.dumps(sync), encoding='utf-8')
    wav_path.with_suffix('.quality.json').write_text(json.dumps({'version': 1,
        'verification': args.verification, 'groups': public_groups,
        'preview': args.representative_preview,
        'excerpts': [{'key': key, 'start': g.get('source_start', g['start']) / 1000,
                      'end': g.get('source_end', g['end']) / 1000}
                     for key, g in zip(args.group_keys, groups)]}), encoding='utf-8')

    manifest = {"version": 2, "wav": wav_path.name, "sample_rate": sr,
                "video_offset_seconds": args.range_start or 0,
                "grouping": args.gruplama, "timing": timing,
                "duration": float(len(timeline) / sr),
                "text": "\n".join(t for _, _, t in cues),
                "original_text": "\n".join(g.get('original_text', g['text']) for g in groups),
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
