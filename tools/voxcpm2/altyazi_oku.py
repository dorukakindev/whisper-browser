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
    ensure_utf8_stdio, file_sha256, prepare_audio,
    voice_label_for, write_manifest)
from dub_normalize import loudnorm_audio
from dub_timeline_storage import DiskTimeline, limit_peak, write_audio, manifest_segments, check_storage

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
from dub_plan import parse_srt, apply_edits, make_groups, read_source_bytes, shift_cues
from dub_finish import spoken_text, finish_audio, active_ranges, SPOKEN_TEXT_VERSION
from dub_quality import chunk_key, duration_identity, valid_audio, matches_recorded_duration, representative_groups, reference_quality, speech_check, cached_record, audio_identity, matches_recorded_audio, generation_status, apply_timing_quality


class SpeechVerifier:
    def __init__(self, python):
        self.python, self.proc, self.unavailable = python, None, False
        self.lock = asyncio.Lock()

    async def check(self, path, text, numeric_reference=None):
        if not self.python or self.unavailable:
            return {'status': 'unavailable'}
        async with self.lock:
            if self.unavailable:
                return {'status': 'unavailable'}
            try:
                if self.proc is None:
                    self.proc = await asyncio.create_subprocess_exec(str(self.python),
                        str(ROOT.parents[1] / 'backend' / 'dub_verify.py'),
                        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                        creationflags=NO_WINDOW)
                async def exchange():
                    from dub_quality import verification_request
                    self.proc.stdin.write((json.dumps(verification_request(path,text)) + '\n').encode())
                    await self.proc.stdin.drain()
                    return await self.proc.stdout.readline()
                from contextlib import nullcontext
                print('DUB_ACTIVITY '+json.dumps({'stage':'verification'}),flush=True)
                with self.phases.measure('verification') if getattr(self,'phases',None) else nullcontext():
                    response = json.loads(await asyncio.wait_for(exchange(), 120))
                if (not isinstance(response, dict) or 'error' in response
                        or not isinstance(response.get('text'), str)):
                    raise ValueError('unavailable')
                result = speech_check(text, response['text'], numeric_reference)
                from dub_quality import verification_request
                language=verification_request(path,text).get('language')
                evidence={}
                if language:
                    evidence['requestedLanguage']=language
                if isinstance(response.get('language'),str) and response['language'].isalpha() and 2<=len(response['language'])<=3:
                    evidence['recognizedLanguage']=response['language']
                return {'status': 'review' if result['review'] else 'passed', **result, **evidence}
            except (OSError, ValueError, asyncio.TimeoutError, KeyError, BrokenPipeError):
                self.unavailable = True
                print('DUB_WARNING verification_unavailable', flush=True)
                return {'status': 'unavailable'}

    async def close(self):
        if self.proc and self.proc.returncode is None:
            try:
                self.proc.terminate()
            except ProcessLookupError:
                return
            try:
                await asyncio.wait_for(self.proc.wait(), 3)
            except asyncio.TimeoutError:
                try:
                    self.proc.kill()
                except ProcessLookupError:
                    return
                await asyncio.wait_for(self.proc.wait(), 3)


async def rewrite_for_window(args, i, text, seconds, before='', after='', mode='fit', measured=None):
    if not args.rewrite_dir or (mode == 'fit' and not args.auto_fit) or (mode == 'natural' and not getattr(args, 'natural_speech', False)):
        return text
    if len(text) > 1000:
        return text
    request_id = uuid.uuid4().hex
    response_path = args.rewrite_dir / (request_id + '.json')
    rewrite_started=time.monotonic()
    print('DUB_REWRITE ' + json.dumps({'id': request_id, 'group': i + 1,
        'key':getattr(args,'group_keys',[])[i] if i<len(getattr(args,'group_keys',[])) else '',
        'sourceHash':getattr(args,'source_hash',''),
        'text': text, 'seconds': min(35, seconds), 'mode':mode, 'measured':measured, 'before':before[-1500:], 'after':after[:1500]}), flush=True)
    async def wait_for_reply():
        # The editor may perform one source-meaning review after its rewrite.
        # Both provider requests have their own deadlines; this wait is bounded.
        for _ in range(900):
            if response_path.is_file():
                response = json.loads(response_path.read_text(encoding='utf-8'))
                if not isinstance(response, dict):
                    return text
                statuses=getattr(args,'speech_edit_status',None)
                if statuses is not None:
                    status=response.get('status')
                    statuses.setdefault(i,{})[mode]=status if status in ('unchanged','source_reviewed','source_unavailable','editor_unavailable','editor_failed') else 'unavailable'
                proposed = response.get('text')
                if proposed!=text and response.get('status')!='source_reviewed':
                    return text
                if isinstance(proposed, str) and 0 < len(proposed) <= (min(1000, max(len(text), round(len(text)*1.25))) if mode == 'natural' else len(text)):
                    return proposed
                return text
            await asyncio.sleep(.1)
        return text
    try:
        from dub_activity import observe
        return await observe(wait_for_reply(), group=i+1, attempt=1, limit=90, stage='text_edit')
    except (OSError, ValueError, TypeError):
        # Optional editing failure must never turn otherwise valid speech into silence.
        return text
    finally:
        if getattr(args,'phases',None):
            args.phases.seconds['text_edit']=args.phases.seconds.get('text_edit',0)+time.monotonic()-rewrite_started
        try:
            response_path.unlink(missing_ok=True)
        except OSError:
            pass


def atempo_filters(ratio):
    """atempo 0.5-100 araliginda; >2 icin zincirleme."""
    parts, r = [], ratio
    while r > 2.0:
        parts.append("atempo=2.0")
        r /= 2.0
    parts.append(f"atempo={r:.4f}")
    return ",".join(parts)


def video_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, encoding='utf-8', errors='replace',
            timeout=30, creationflags=NO_WINDOW)
        duration = float(out.stdout.strip())
        return duration if out.returncode == 0 and math.isfinite(duration) and duration > 0 else None
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return None


async def uret(args, cues, paths, prompt_text):
    from dub_quality import audio_identity
    from dub_lifecycle import bounded_call, EngineStalled, stop_server
    from dub_recovery import recover_long_speech
    from dub_runtime import measured, reference_call
    from huggingface_hub import snapshot_download
    from nanovllm_voxcpm import VoxCPM

    model_path = snapshot_download(MODEL_ID, revision=MODEL_REVISION,
                                   local_files_only=True)
    print("nano-vLLM sunucusu aciliyor...", flush=True)
    began = time.monotonic()
    runtime=getattr(args,'runtime',None)
    server=None
    successful=False
    try:
        with measured(args,'model_load'):
            if runtime:
                server=await runtime.acquire(args,model_path,VoxCPM.from_pretrained,None,None)
            else:
                from dub_runtime import choose_capacity
                budget=args.gpu_mem
                if getattr(args,'auto_capacity',False): _,budget=choose_capacity(args)
                server = VoxCPM.from_pretrained(model_path, devices=[0], inference_timesteps=args.steps,
                    max_num_seqs=max(args.eszamanli,1),max_num_batched_tokens=args.batch_tokens,
                    max_model_len=args.max_model_len,gpu_memory_utilization=budget,enforce_eager=False)
                await bounded_call(server.wait_for_ready(),args.ready_timeout)
        load_seconds = time.monotonic() - began
        reference_began = time.monotonic()
        automatic_delivery = bool(getattr(args,'prosody_plan',None))
        with measured(args,'reference'):
            wav_bytes = getattr(args,'reference_bytes',None)
            if wav_bytes is None: wav_bytes=Path(args.reference).read_bytes()
            reference_prompt=prompt_text if getattr(args,'expression','reference')=='reference' and not automatic_delivery else None
            if runtime:
                ref_lat,prompt_id=await runtime.prepare_reference(args,wav_bytes,reference_prompt)
            else:
                ref_lat=await reference_call(args,'reference_encode',server.encode_latents(wav_bytes,'wav'))
                prompt_id=await reference_call(args,'reference_prompt',server.add_prompt(wav_bytes,'wav',reference_prompt)) if reference_prompt else None
        sr = int(getattr(server, "sample_rate", SAMPLE_RATE) or SAMPLE_RATE)
        print("Referans hazir; uretim basliyor.", flush=True)
        reference_seconds = time.monotonic() - reference_began
        generation_began = time.monotonic()

        # Recover completed pieces after OOM with a fresh, smaller server.
        sem = asyncio.Semaphore(args.eszamanli)
        verifier = await runtime.get_verifier(args.verify_python,SpeechVerifier) if runtime else SpeechVerifier(args.verify_python)
        verifier.phases=getattr(args,'phases',None)
        total = len(cues)
        done = sum(1 for i, p in enumerate(paths) if p.is_file() and args.group_keys[i] not in args.force_groups)
        if total:
            print(f"[{done}/{total}]" + (" Kayitli satirlar kullaniliyor." if done else ""), flush=True)
        cached = done
        results = []

        from dub_pronunciation import render as render_pronunciation
        dictionary = getattr(args, 'pronunciations', [])
        async def verify_pronunciation(audio_path, text, numeric_reference=None):
            return await verifier.check(audio_path, text, numeric_reference=numeric_reference)

        async def sentez(chunk, seed, delivery=None, isolated=False, context=None):
            from dub_expression import synthesis_text
            from dub_delivery import synthesis_instruction, conditioning_context
            pieces = []
            instruction = synthesis_instruction(delivery, conditioning_context(context,chunk))
            with measured(args,'synthesis'):
                async for part in server.generate(
                        instruction + chunk if instruction else synthesis_text(chunk, getattr(args, 'expression', 'reference')),
                        prompt_id=None if isolated or instruction or automatic_delivery else prompt_id,
                        ref_audio_latents=ref_lat,
                        temperature=args.temperature,
                        cfg_value=args.cfg, seed=seed,
                        max_generate_length=args.max_generate_length):
                    pieces.append(np.asarray(part, dtype=np.float32).reshape(-1))
            return np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)

        def finish_generated(audio):
            prepared=prepare_audio(audio,sr)
            return (finish_audio(prepared,sr,preserve_dynamics=True) if automatic_delivery
                    else finish_audio(prepared,sr))

        async def gen(i, text, path):
            nonlocal done
            async with sem:
                tick = time.monotonic()
                seed = args.group_seeds[i]
                if args.group_keys[i] in args.force_groups:
                    seed = (seed + getattr(args, 'regeneration_seed', 0)) % 2147483647
                original_text = text
                delivery = getattr(args,'group_delivery',[])
                delivery = delivery[i] if i < len(delivery) else None
                contexts=getattr(args,'group_context',[])
                context=contexts[i] if i<len(contexts) else None
                from dub_delivery import synthesis_instruction, conditioning_context
                continuation_active=bool(prompt_id and not automatic_delivery and not synthesis_instruction(delivery,context))
                raw_scores = {}
                synthesis_attempt = 0
                verification_attempt = 0
                async def verify_group(audio_path, expected, numeric_reference=None):
                    nonlocal verification_attempt
                    from dub_activity import observe
                    verification_attempt += 1
                    return await observe(verify_pronunciation(audio_path, expected, numeric_reference),
                        group=i+1, attempt=verification_attempt, limit=120, stage='verification')
                async def synthesize(chunk, seed, isolated=False):
                    nonlocal synthesis_attempt
                    from dub_activity import observe
                    from dub_utterance import synthesize_utterance
                    synthesis_attempt += 1
                    raw, score = await observe(synthesize_utterance(chunk, seed, sr,
                        lambda part, value: sentez(part, value, delivery, isolated, context),
                        lambda raw, rate, part: assess_chunk(raw, rate, part)[0]),
                        group=i+1, attempt=synthesis_attempt, limit=args.request_timeout)
                    raw_scores[id(raw)] = score
                    return raw
                def assess_generated(raw, chunk):
                    return max(raw_scores.get(id(raw), 0), assess_chunk(raw, sr, chunk)[0])
                window = available_window(cues, i, args.bosluk_pay_ms, args.end_limit_ms)
                temporary = path.with_suffix('.tmp.wav')
                previous_metric = {}
                if valid_audio(path, sf):
                    try:
                        previous_metric = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
                        if not isinstance(previous_metric, dict):
                            previous_metric = {}
                    except (OSError, ValueError):
                        pass
                metric, check = {}, {'status': 'not_checked'}
                display_speech = spoken_text(text)
                try:
                    if getattr(args, 'natural_speech', False) and args.group_keys[i] not in getattr(args, 'manual_groups', set()):
                        text = await rewrite_for_window(args, i, text, window,
                            cues[i-1][2] if i else '', cues[i+1][2] if i+1 < len(cues) else '', mode='natural')
                    editable_text = text
                    display_speech = spoken_text(text)
                    text = render_pronunciation(text, dictionary)
                    continuation_active=bool(prompt_id and not automatic_delivery and not synthesis_instruction(delivery,conditioning_context(context,text)))
                    def retain_before_retry(raw, quality):
                        candidate, finishing = finish_generated(raw)
                        sf.write(str(temporary), candidate, sr, subtype='PCM_16')
                        metric.update(quality, finishing=finishing,
                            naturalEdited=editable_text != original_text, rewritten=False,
                            numericReference=editable_text,
                            referenceMode='continuation' if continuation_active else 'isolated',
                            recoveryReason='acoustic_retry_interrupted')
                    best, metric = await quality_retry(lambda n: synthesize(text, n),
                        lambda raw: assess_generated(raw, text), seed,
                        args.retry, args.request_timeout, before_retry=retain_before_retry)
                    metric['referenceMode'] = 'continuation' if continuation_active else 'isolated'
                    wav = prepare_audio(best, sr)
                    metric['naturalEdited'] = editable_text != original_text
                    metric['rewritten'] = False
                    wav, finishing = (finish_audio(wav,sr,preserve_dynamics=True) if automatic_delivery
                                      else finish_audio(wav,sr))
                    metric['finishing'] = finishing
                    metric['measured_seconds'] = len(wav)/sr
                    accepted_fit_check=None
                    # One bounded, duration-informed edit. Preserve the original
                    # and accept the candidate only if it is valid and shorter.
                    if (getattr(args, 'auto_fit', False)
                            and len(wav) / sr > window * 1.15 and len(text) > 25
                            and args.group_keys[i] not in getattr(args, 'manual_groups', set())):
                        # The duration edit starts another engine request before
                        # the normal cache commit. Preserve the complete first
                        # take so a stalled/OOM fit cannot turn it into silence.
                        sf.write(str(temporary), wav, sr, subtype='PCM_16')
                        metric['recoveryReason'] = 'duration_fit_interrupted'
                        proposed = await rewrite_for_window(args, i, editable_text, window,
                            cues[i - 1][2] if i else '', cues[i + 1][2] if i + 1 < len(cues) else '', measured=len(wav)/sr)
                        proposed_display = spoken_text(proposed)
                        proposed = render_pronunciation(proposed, dictionary)
                        if proposed != text:
                            try:
                                candidate, extra = await quality_retry(lambda n: synthesize(proposed, n),
                                    lambda raw: assess_generated(raw, proposed), seed + 17,
                                    1, args.request_timeout)
                                candidate, candidate_finishing = finish_generated(candidate)
                                metric['attempts'] += extra['attempts']
                                metric['retries'] += extra['attempts']
                                # Faster speech is useful only if the complete,
                                # source-reviewed alternative was actually read.
                                fitted_check={'status':'not_checked'}
                                if extra['quality_score']<=metric['quality_score'] and len(candidate)<len(wav):
                                    fit_file=temporary.with_name(temporary.stem+'-fit.wav')
                                    try:
                                        sf.write(str(fit_file),candidate,sr,subtype='PCM_16')
                                        fitted_check=await verify_group(fit_file,proposed,numeric_reference=proposed_display)
                                    finally:
                                        fit_file.unlink(missing_ok=True)
                                metric['durationCandidateVerification']=fitted_check
                                if (extra['quality_score'] <= metric['quality_score'] and len(candidate) < len(wav)
                                        and fitted_check.get('status')=='passed' and not fitted_check.get('review',True)):
                                    wav, text = candidate, proposed
                                    editable_text=proposed_display
                                    accepted_fit_check=fitted_check
                                    display_speech = proposed_display
                                    metric['finishing'] = candidate_finishing
                                    metric['rewritten'] = True
                            except (ValueError, asyncio.TimeoutError):
                                pass
                        metric.pop('recoveryReason', None)
                    sf.write(str(temporary), wav, sr, subtype='PCM_16')
                    check = accepted_fit_check or {'status': 'not_checked'}
                    if not accepted_fit_check and (args.verification == 'detailed' or (args.verification == 'balanced' and
                            (metric['quality_score'] > 0 or len(wav) / sr > window * 1.15))):
                        check = await verify_group(temporary, text, numeric_reference=editable_text)
                        if check['status'] == 'review':
                            # A continuation prompt can transfer the reference
                            # language/accent too strongly. Spend the EXISTING
                            # retry on isolated voice cloning, keeping reference
                            # latents, text and all semantic/acoustic gates.
                            # This override is request-local: parallel groups
                            # must never mutate the shared prompt/cache.
                            isolated_retry = continuation_active
                            metric['verificationRetryMode'] = 'isolated' if isolated_retry else 'isolated-seed'
                            second = temporary.with_name(temporary.stem + '-verify.wav')
                            try:
                                # Change conditioning alone when a prompt exists;
                                # otherwise retain the existing alternate seed.
                                retry_seed = seed if isolated_retry else seed + 200003
                                candidate_raw = await bounded_call(synthesize(text, retry_seed, isolated=isolated_retry), args.request_timeout)
                                candidate_score = assess_generated(candidate_raw, text)
                                candidate, candidate_finishing = finish_generated(candidate_raw)
                                if len(candidate) and candidate_score <= metric['quality_score']:
                                    sf.write(str(second), candidate, sr, subtype='PCM_16')
                                    checked = await verify_group(second, text, numeric_reference=editable_text)
                                    metric['verificationRetry'] = checked
                                    # The shared verifier owns all semantic gates.
                                    # A passed retry beats a rejected candidate even
                                    # when its raw token similarity is slightly lower.
                                    if checked.get('status') == 'passed' and not checked.get('review', False):
                                        # Promote the already written, checked WAV
                                        # before changing its in-memory metadata.
                                        second.replace(temporary)
                                        wav, check = candidate, checked
                                        metric['finishing'] = candidate_finishing
                                        metric['referenceMode'] = 'isolated'
                            except (ValueError, OSError, asyncio.TimeoutError) as retry_error:
                                # A failed optional retry must not erase the first
                                # usable waveform. It remains explicitly for review.
                                metric['verification_retry_error'] = type(retry_error).__name__
                            finally:
                                second.unlink(missing_ok=True)
                            metric['attempts'] += 1; metric['retries'] += 1
                        if check['status'] == 'review':
                            # Large one-pass requests can end early despite valid
                            # audio. Repair content with bounded, verified blocks.
                            def recovery_attempt():
                                metric['attempts'] += 1
                                metric['retries'] += 1
                            recovered = await recover_long_speech(text, editable_text, seed, sr,
                                synthesize, lambda raw, rate: finish_generated(raw),
                                verify_group, temporary, args.request_timeout, recovery_attempt,
                                assess=lambda raw, rate, part: assess_chunk(raw, rate, part)[0])
                            if recovered is not None:
                                wav, check, recovery = recovered
                                metric['recovery'] = recovery
                                metric['finishing'] = {'parts': recovery['finishing']}
                                sf.write(str(temporary), wav, sr, subtype='PCM_16')
                    # A single optional alternate for objective rhythm risks.
                    # Full ASR and measurable improvement are mandatory; this is
                    # deliberately not an automatic "human naturalness" score.
                    if (getattr(args,'natural_speech',False) and args.verification=='detailed'
                            and check.get('status')=='passed' and metric['quality_score']==0):
                        from dub_candidate import retry_reasons, measure_samples, prefer_candidate
                        risks=retry_reasons(wav,sr,text,window)
                        metric['rhythmRisks']=risks
                        if risks:
                            alternate=temporary.with_name(temporary.stem+'-rhythm.wav')
                            try:
                                raw=await bounded_call(synthesize(text,seed+400009,isolated=True),args.request_timeout)
                                score=assess_generated(raw,text)
                                candidate,candidate_finishing=finish_generated(raw)
                                decision={'accepted':False,'reason':'acoustic-quality-regressed'}
                                if score<=metric['quality_score'] and len(candidate):
                                    sf.write(str(alternate),candidate,sr,subtype='PCM_16')
                                    checked=await verify_group(alternate,text,numeric_reference=editable_text)
                                    decision=prefer_candidate(measure_samples(wav,sr,text),measure_samples(candidate,sr,text),check,checked,window)
                                    if decision['accepted']:
                                        alternate.replace(temporary)
                                        wav,check=candidate,checked
                                        metric['finishing']=candidate_finishing
                                        metric['referenceMode']='isolated'
                                metric['rhythmCandidate']=decision
                            except (ValueError,OSError,asyncio.TimeoutError) as error:
                                metric['rhythmCandidate']={'accepted':False,'reason':type(error).__name__}
                            finally:
                                alternate.unlink(missing_ok=True)
                                metric['attempts']+=1;metric['retries']+=1
                    metric.update(verification=check, text=display_speech, pronunciationText=text, numericReference=editable_text,
                                  speechEditing=getattr(args,'speech_edit_status',{}).get(i,{}),
                                  deliveryContext=conditioning_context(context,text),
                                  delivery=delivery, final_seconds=len(wav)/sr,
                                  status=generation_status(metric['quality_score'], check))
                    sidecar = path.with_suffix('.json')
                    # Eski kayıt yeni dalga biçimine ait değildir: önce geçersiz kıl, WAV'ı yerleştir, kaydı atomik yaz.
                    # Kayıt yazılamazsa cached_record fail-closed (review) döner; eski 'ready' kaydı yeni sese yapışmaz.
                    sidecar.unlink(missing_ok=True)
                    temporary.replace(path)
                    staged = sidecar.with_name(sidecar.name + '.tmp')
                    try:
                        staged.write_text(json.dumps({**metric,'audioIdentity':audio_identity(path)}), encoding='utf-8')
                        staged.replace(sidecar)
                    finally:
                        staged.unlink(missing_ok=True)
                    args.force_groups.discard(args.group_keys[i])
                except (Exception, asyncio.CancelledError) as exc:
                    if (isinstance(exc, (EngineStalled, asyncio.CancelledError))
                            or 'out of memory' in str(exc).lower() or 'cuda error' in str(exc).lower()):
                        # A later optional verification/recovery can stall after
                        # the first usable candidate was written. Keep that real
                        # speech before restarting/cancelling the engine; never
                        # label an interrupted candidate ready. Force a fresh
                        # attempt on restart, with this WAV as the last resort.
                        if temporary.is_file() and valid_audio(temporary, sf):
                            try:
                                metric.update(status='review', verification=check, text=display_speech, pronunciationText=text, numericReference=editable_text,
                                              recoveryReason=metric.get('recoveryReason', 'verification_interrupted'),
                                              final_seconds=sf.info(temporary).frames/sr)
                                # Invalidate any earlier ready record before
                                # replacing its waveform. If metadata I/O fails,
                                # cached_record must fail closed to review.
                                path.with_suffix('.json').unlink(missing_ok=True)
                                temporary.replace(path)
                                args.force_groups.add(args.group_keys[i])
                                path.with_suffix('.json').write_text(json.dumps({**metric,'audioIdentity':audio_identity(path)}), encoding='utf-8')
                            except (OSError, ValueError):
                                pass  # Preserve the original engine failure.
                        raise
                    # A failed piece is explicit and remains retryable. Keep
                    # other successful pieces and still render a usable WAV.
                    metric = {'attempts': args.retry + 1, 'retries': args.retry,
                              'quality_score': None, 'status': 'failed', 'text': text,
                              'verification': {'status': 'unavailable'}}
                    if temporary.is_file() and valid_audio(temporary, sf):
                        temporary.replace(path)
                        metric['status'] = 'review'
                    elif valid_audio(path, sf):
                        metric.update(previous_metric)
                        metric['text'] = previous_metric.get('text', original_text)
                        metric['status'] = 'review'
                        metric['regenerationFailed'] = True
                    else:
                        fallback = args.report_dir / f'failed_{i:04d}.wav'
                        sf.write(str(fallback), np.zeros(max(1, round(window * sr)), dtype=np.float32), sr)
                        paths[i] = fallback
                    if metric['status'] == 'review':
                        path.with_suffix('.json').write_text(json.dumps({**metric,'audioIdentity':audio_identity(path)}), encoding='utf-8')
                finally:
                    temporary.unlink(missing_ok=True)
                metric.update(seed=seed,group=i + 1, key=args.group_keys[i], seconds=time.monotonic() - tick)
                results.append(metric)
                print('DUB_GROUP ' + json.dumps({k: metric[k] for k in
                    ('group', 'key', 'status', 'verification', 'rewritten', 'naturalEdited', 'referenceMode', 'verificationRetryMode') if k in metric}), flush=True)
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
            if not runtime: await verifier.close()
        args.group_results = results
        metrics = {'load_seconds': load_seconds, 'reference_seconds': reference_seconds,
                   'generation_seconds': time.monotonic() - generation_began,
                   'attempts': sum(r['attempts'] for r in results),
                   'retries': sum(r['retries'] for r in results), 'cached_groups': cached,
                   'generated_groups': len(results), 'steps': args.steps,
                   'concurrency': args.eszamanli, 'groups': sorted(results, key=lambda r: r['group'])}
        paths[0].parent.joinpath('generation_report.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
        print('DUB_METRICS ' + json.dumps({k: v for k, v in metrics.items() if k != 'groups'}), flush=True)
        successful=True
        return sr
    finally:
        if runtime:
            if not successful:
                try: await runtime.reset()
                except Exception as reset_error:   # reset hatası özgün (örn. EngineStalled) hatayı maskelememeli
                    print('DUB_WARNING engine_reset_failed '+type(reset_error).__name__,flush=True)
        elif server is not None:
            await stop_server(server)


def generate_with_fallback(args, cues, paths, prompt_text, generate=None):
    import json
    from dub_lifecycle import EngineStalled
    from dub_resume import recover_completed
    generate = generate or uret
    restarts = 0
    while True:
        original_paths = list(paths)
        try:
            runtime=getattr(args,'runtime',None)
            return runtime.run(generate(args,cues,paths,prompt_text)) if runtime else asyncio.run(generate(args, cues, paths, prompt_text))
        except Exception as exc:
            print('DUB_FAILURE '+json.dumps({'kind':type(exc).__name__,'message':str(exc)[-1500:]}),flush=True)
            if isinstance(exc, EngineStalled) and restarts < 1:
                restarts += 1
                args.eszamanli = max(1, args.eszamanli // 2)
                args.requested_concurrency=args.eszamanli
                args.configured_concurrency=args.eszamanli
                if hasattr(args,'group_seeds'):
                    args.group_seeds=[(seed+100003)%2147483647 for seed in args.group_seeds]
                paths[:] = original_paths
                print('DUB_WARNING engine_restart', flush=True)
                print('DUB_CONCURRENCY ' + str(args.eszamanli), flush=True)
                continue
            memory_error = any(term in str(exc).lower() for term in ('out of memory', 'cuda error', 'kv cache calculation', 'no safe memory budget', 'gpu memory busy'))
            if isinstance(exc, EngineStalled) or (args.eszamanli <= 1 and memory_error):
                paths[:] = original_paths
                rate = recover_completed(args, cues, paths)
                if rate is not None:
                    return rate
            if args.eszamanli <= 1 or not memory_error:
                raise
            args.eszamanli = max(1, args.eszamanli // 2)
            args.requested_concurrency=args.eszamanli
            args.configured_concurrency=args.eszamanli
            paths[:] = original_paths
            print('DUB_CONCURRENCY ' + str(args.eszamanli), flush=True)


def build_timeline(cues, paths, sr, total_s, max_hiz, tmp_dir, log=print,
                   overflow="kirp", extra_ms=2000, end_limit_ms=None, lead_ms=300):
    from dub_timing import build_fixed_timeline
    return build_fixed_timeline(cues, paths, sr, total_s, max_hiz, tmp_dir, log,
                                overflow, extra_ms, end_limit_ms, lead_ms)



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
    p.add_argument('--expression', choices=('reference','calm','warm','lively'), default='reference')
    p.add_argument('--prosody-plan',type=Path)
    p.add_argument('--pronunciations',type=Path)
    p.add_argument("--video", type=Path, help="Dublajin gomulecegi video (opsiyonel)")
    p.add_argument('--source-duration', type=float, help='Known source video duration for browser/player synchronization; no video muxing')
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
    p.add_argument('--natural-speech', action='store_true')
    p.add_argument('--rewrite-dir', type=Path)
    p.add_argument('--editor-identity', default='')
    p.add_argument('--force-groups', default='')
    p.add_argument('--force-groups-file', type=Path)
    p.add_argument('--take-selections-file', type=Path)
    p.add_argument('--force-all', action='store_true')
    p.add_argument("--output", type=Path)
    p.add_argument("--no-norm", action="store_true")
    p.add_argument("--gruplama", choices=("cumle", "satir", "akici", "anlatim"), default="cumle")
    p.add_argument("--grup-max-sn", type=float, default=12)
    p.add_argument("--grup-max-karakter", type=int, default=250)
    p.add_argument("--grup-bosluk-ms", type=int, default=600)
    p.add_argument("--bosluk-pay-ms", type=int, default=2000)
    p.add_argument("--erken-pay-ms", type=int, default=300)
    p.add_argument("--tasarsa", choices=("hata", "kirp"), default="kirp")
    p.add_argument("--range-start", type=float)
    p.add_argument("--timing-mode", choices=('clip', 'video'), default='clip')
    p.add_argument("--narration", action="store_true")
    p.add_argument("--range-end", type=float)
    p.add_argument("--dub-text", type=Path, help="Ayri, gozden gecirilmis dublaj metni JSON")
    p.add_argument("--plan", action="store_true", help="Gruplari goster; GPU/ses uretimi baslatma")
    args = p.parse_args(argv)
    if args.source_duration is not None and (not math.isfinite(args.source_duration) or not 0 < args.source_duration <= 86400):
        p.error('Source video duration must be finite and between zero and 86400 seconds.')
    from dub_pronunciation import load
    args.pronunciations = load(args.pronunciations)
    from dub_regeneration import load_keys
    try:
        args.force_groups=load_keys(args.force_groups,args.force_groups_file)
        if args.force_all and (not args.narration or args.force_groups):
            raise ValueError('Whole-plan regeneration requires narration and no individual groups.')
    except (OSError,ValueError) as error:
        p.error(str(error))
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


def main(argv=None, runtime=None):
    from kitap_voxcpm import resolve_prompt_text

    args = parse_args(argv)
    from dub_runtime import Phases, measured
    args.phases=Phases()
    args.auto_capacity=True
    args.runtime=runtime
    args.reference_bytes=args.reference.read_bytes()
    args.requested_concurrency=args.eszamanli
    args.configured_concurrency=args.eszamanli
    try:
        prompt_text = resolve_prompt_text(args.reference, args.mode, args.transcript)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Referans dokumu okunamadi: {exc}")

    source_bytes = read_source_bytes(args.srt)
    cues = parse_srt(args.srt, source_bytes)
    if not cues:
        raise SystemExit("SRT'de okunabilir satir yok.")
    if args.kaydir:
        cues = shift_cues(cues, args.kaydir)
    if not cues:
        raise SystemExit("Kaydirma sonrasinda okunabilir satir kalmadi.")
    source_cues = cues
    args.source_hash=hashlib.sha256(source_bytes).hexdigest()
    args.speech_edit_status={}
    groups = make_groups(cues, args.range_start, args.range_end, 0 if args.representative_preview else args.limit, args.gruplama,
                         args.grup_max_karakter, args.grup_max_sn, args.grup_bosluk_ms)
    if args.dub_text:
        apply_edits(groups, json.loads(args.dub_text.read_text(encoding='utf-8')), hashlib.sha256(source_bytes).hexdigest())
    if args.representative_preview:
        groups = representative_groups(groups)
        args.range_start = args.range_end = None
    from dub_prosody import load_plan, VERSION as DELIVERY_VERSION
    args.group_delivery = load_plan(args.prosody_plan,hashlib.sha256(source_bytes).hexdigest(),groups)
    from dub_delivery import delivery_contexts, VERSION as CONTEXT_VERSION
    args.group_context=delivery_contexts(groups) if args.natural_speech else [None for _ in groups]
    args.group_keys = [','.join(map(str, g['source_ids'])) for g in groups]
    from dub_regeneration import select_keys
    args.force_groups=select_keys(args.force_groups,args.group_keys,args.force_all)
    args.group_seeds = [args.seed + int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 1000000000
                       for key in args.group_keys]
    args.regeneration_seed = uuid.uuid4().int % 1000000000 + 1 if args.force_groups else 0
    args.group_results = []
    args.manual_groups = {','.join(map(str,g['source_ids'])) for g in groups if 'original_text' in g}
    cues = [(g['start'], g['end'], g['text']) for g in groups]
    print(f"Plan: {len(source_cues)} altyazi satiri -> {len(groups)} {args.gruplama} grubu.", flush=True)
    if args.plan:
        print(json.dumps([{'group': i + 1, 'source_ids': g['source_ids'],
                          'start': g['start'] / 1000, 'end': g['end'] / 1000,
                          'chars': len(g['text'])} for i, g in enumerate(groups)], indent=2))
        return 0
    print(f"{len(cues)} altyazi satiri; ilk satir {cues[0][0] / 1000:.1f} sn, "
          f"son satir {cues[-1][1] / 1000:.1f} sn.", flush=True)
    duration = video_duration(args.video) if args.video else args.source_duration
    if (args.video or args.source_duration is not None) and (duration is None or max(e for _, e, _ in cues) / 1000 > duration):
        raise SystemExit("Video suresi okunamadi veya altyazi videodan uzun; ses kesilmedi.")
    if duration is not None and args.range_end is not None and args.range_end > duration:
        raise SystemExit('Selected range exceeds source video duration; no speech was generated.')
    args.end_limit_ms = duration * 1000 if duration is not None else (
        args.range_end * 1000 if args.range_end is not None else None)
    # Check windows before loading the GPU model.
    for i in range(len(cues)):
        available_window(cues, i, args.bosluk_pay_ms, args.end_limit_ms)

    ref_hash = hashlib.sha256(args.reference_bytes).hexdigest()
    # Audio identity excludes timing and batch capacity; changing tempo reuses speech.
    settings = ("dublaj-ses-v15-signed-quantities", args.auto_fit, args.timing_mode == 'video', args.natural_speech, args.editor_identity, MODEL_REVISION, ref_hash, args.steps, args.cfg,
                args.temperature, prompt_text or args.mode, args.max_generate_length,
                args.verification, args.expression, SPOKEN_TEXT_VERSION)
    if args.natural_speech:
        from dub_candidate import VERSION as CANDIDATE_VERSION
        settings+=('source-reviewed-editor-v1',CONTEXT_VERSION,CANDIDATE_VERSION)
    if args.auto_fit:settings+=('verified-duration-candidate-v2',)
    # Do not reuse a previously rejected continuation candidate under the new
    # recovery policy. Unverified/isolated jobs retain their existing cache.
    if prompt_text and args.verification != 'fast' and args.expression == 'reference' and not args.prosody_plan:
        settings += ('isolated-verification-same-seed-v1',)
    from dub_utterance import utterance_blocks, MAX_CHARS, VERSION as UTTERANCE_VERSION
    bounded_groups = [len(utterance_blocks(text)) > 1
                      or (args.natural_speech and len(text) > MAX_CHARS / 1.25)
                      for _, _, text in cues]
    # Keep old reports as well as old speech when the long-cue method changes.
    run_identity = (settings, args.group_delivery,args.group_context) + ((UTTERANCE_VERSION,) if any(bounded_groups) else ())
    run_hash = hashlib.sha256(repr(run_identity).encode("utf-8")).hexdigest()[:16]
    parts_dir = OUTPUT_ROOT / f"{args.srt.stem}_altyazi" / run_hash
    parts_dir.mkdir(parents=True, exist_ok=True)
    check_storage((args.range_end - args.range_start) if args.range_start is not None else (duration or max(e for _,e,_ in cues) / 1000 + 2), 48000, parts_dir)
    args.report_dir = parts_dir
    cache_dir = OUTPUT_ROOT / '_dub_chunks_v4'
    cache_dir.mkdir(parents=True, exist_ok=True)
    def group_settings(i):
        delivery=args.group_delivery[i]
        identity = settings + (UTTERANCE_VERSION,) if bounded_groups[i] else settings
        from dub_pronunciation import cache_identity
        identity = cache_identity(identity, cues[i][2], getattr(args, 'pronunciations', []))
        if args.natural_speech:identity+=(CONTEXT_VERSION,repr(args.group_context[i]),)
        if args.prosody_plan:
            return identity + (DELIVERY_VERSION,'reference-only-preserve-dynamics-v1',
                               repr(sorted(delivery.items())) if delivery else 'no-extra-guidance')
        return identity
    paths = [cache_dir / (chunk_key(group_settings(i), text, seed) + '.wav')
             for i,((_, _, text), seed) in enumerate(zip(cues, args.group_seeds))]
    if args.auto_fit or args.natural_speech:
        # A compact rewrite depends on available time, unlike ordinary speech.
        paths = [cache_dir / (chunk_key(group_settings(i), duration_identity(cues, i, available_window(cues, i,
            args.bosluk_pay_ms, args.end_limit_ms), args.group_keys[i] in args.manual_groups), seed) + '.wav')
            for i, ((_, _, text), seed) in enumerate(zip(cues, args.group_seeds))]
    for p in paths:
        if p.exists() and not (valid_audio(p, sf) and matches_recorded_duration(p, sf) and matches_recorded_audio(p)):
            p.unlink()
    cache_keys = [file.stem for file in paths]
    from dub_take_selection import selected_paths
    paths, selected_records = selected_paths(args.take_selections_file, paths, args.group_keys,
        args.force_groups, args.output, lambda file: valid_audio(file, sf))
    eksik = sum(1 for i, p in enumerate(paths) if not p.is_file() or args.group_keys[i] in args.force_groups)
    import io
    reference_audio, reference_rate = sf.read(io.BytesIO(args.reference_bytes), dtype='float32')
    print('DUB_REFERENCE ' + json.dumps(reference_quality(reference_audio, reference_rate)), flush=True)

    start = time.time()
    if eksik:
        args.eszamanli=min(args.eszamanli,eksik)
        args.requested_concurrency=args.eszamanli
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA kullanilamiyor.")
        sr = generate_with_fallback(args, cues, paths, prompt_text)
    else:
        sr = sf.info(str(paths[0])).samplerate
        print("Tum satirlar hazir; zaman cizelgesi kuruluyor.", flush=True)
        print(f"[{len(paths)}/{len(paths)}] Kayitli satirlar kullaniliyor.", flush=True)
        print('DUB_METRICS ' + json.dumps({'attempts': 0, 'retries': 0,
              'cached_groups': len(paths), 'generated_groups': 0,
              'steps': args.steps, 'concurrency': args.eszamanli}), flush=True)

    group_results = []
    failed = {r['group']: r for r in args.group_results if r['status'] in ('failed','review')}
    for i, p in enumerate(paths):
        record = selected_records.get(args.group_keys[i]) or failed.get(i + 1) or cached_record(p)
        record.update(group=i + 1, key=args.group_keys[i])
        group_results.append(record)
    cues = [(s, e, record.get('text', text)) for (s, e, text), record in zip(cues, group_results)]
    public_groups = [{k: r[k] for k in ('group', 'key', 'status', 'verification', 'rewritten', 'naturalEdited', 'delivery',
                                      'speechEditing','deliveryContext','rhythmRisks','rhythmCandidate','durationCandidateVerification',
                                      'referenceMode', 'verificationRetryMode', 'verificationRetry') if k in r}
                     for r in group_results]
    for row,record in zip(public_groups,group_results):
        spoken=record.get('pronunciationText')
        if isinstance(spoken,str) and spoken != record.get('text'):
            row['pronunciationText']=spoken
    for row in public_groups:
        print('DUB_GROUP ' + json.dumps(row), flush=True)
    timeline_cues = cues
    total_s = duration or (max(e for _, e, _ in cues) + 2000) / 1000.0
    if args.range_start is not None:
        offset_ms = round(args.range_start * 1000)
        timeline_cues = [(s - offset_ms, e - offset_ms, t) for s, e, t in cues]
        total_s = args.range_end - args.range_start
        args.end_limit_ms = total_s * 1000
    sync = None
    print('DUB_ACTIVITY '+json.dumps({'stage':'placement'}),flush=True)
    placement_began=time.monotonic()
    from dub_continuity import prepare as prepare_continuity
    with prepare_continuity(paths,[text for _,_,text in cues],enabled=args.natural_speech,directory=parts_dir,groups=groups) as (render_paths,continuity):
        if args.narration:
            from dub_timing import build_narration_timeline
            timeline, timing = build_narration_timeline(timeline_cues, render_paths, sr, parts_dir)
        elif args.timing_mode == 'video':
            timeline, timing, sync = build_adaptive_timeline(timeline_cues, render_paths, sr, total_s,
                args.max_hiz, parts_dir, args.bosluk_pay_ms)
            (parts_dir / 'timing_report.json').write_text(json.dumps(timing, indent=2), encoding='utf-8')
            print(f"Zamanlama: {timing['accelerated_groups']} grup hizlandirildi, 0 grup kirpildi, 0 grup tasiyor.", flush=True)
        else:
            timeline, timing = build_timeline(timeline_cues, render_paths, sr, total_s, args.max_hiz, parts_dir,
                                             overflow=args.tasarsa, extra_ms=args.bosluk_pay_ms,
                                             end_limit_ms=args.end_limit_ms, lead_ms=args.erken_pay_ms)
    for row,metrics in zip(public_groups,continuity):
        row['continuity']=metrics

    args.phases.seconds['placement']=time.monotonic()-placement_began
    # Explicit video/audio coordinates make saved projects and review independent
    # of the engine cache and of any current browser tab.
    offset = args.range_start or 0
    for i, row in enumerate(public_groups):
        timing_row = timing['groups'][i]
        apply_timing_quality(row, timing_row)
        source = groups[i]
        begin = timing_row['start_seconds']
        row.update(displayText=source.get('original_text', source['text']),
                   speechRanges=active_ranges(timeline[round(begin*sr):round((begin+timing_row['after_seconds'])*sr)], sr, begin),
                   text=cues[i][2], sourceStart=source.get('source_start', source['start']) / 1000,
                   sourceEnd=source.get('source_end', source['end']) / 1000,
                   audioStart=timing_row['start_seconds'],
                   audioEnd=timing_row['start_seconds'] + timing_row['after_seconds'],
                   stretch=timing_row.get('stretch', 1))

    stem = args.srt.stem
    sample_suffix = '_ornek_temsili' if args.representative_preview else (f"_ornek{args.limit}" if args.limit else "")
    wav_path = args.output or (OUTPUT_ROOT / f"{stem}_altyazi" /
                               f"{stem}_dublaj_{args.gruplama}_{voice_label_for(args.reference)}{sample_suffix}.wav")
    wav_path = Path(wav_path)
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    from dub_output import staged_output
    with staged_output(wav_path) as staged_wav:
        print('DUB_ACTIVITY '+json.dumps({'stage':'file_write'}),flush=True)
        write_began=time.monotonic()
        write_audio(staged_wav, timeline, sr)
        audio_write_seconds=time.monotonic()-write_began
        if not args.no_norm:
            print('DUB_ACTIVITY '+json.dumps({'stage':'normalization'}),flush=True)
            with measured(args, 'normalization'):
                if not loudnorm_audio(staged_wav):
                    print('DUB_WARNING normalization_unavailable',flush=True)
        write_began=time.monotonic()
        if sync:
            staged_wav.with_suffix('.sync.json').write_text(json.dumps(sync), encoding='utf-8')
        staged_wav.with_suffix('.quality.json').write_text(json.dumps({'version': 1,
            'verification': args.verification, 'groups': public_groups,
            'preview': args.representative_preview,
            'excerpts': [{'key': key, 'start': g.get('source_start', g['start']) / 1000,
                          'end': g.get('source_end', g['end']) / 1000}
                         for key, g in zip(args.group_keys, groups)]}), encoding='utf-8')

        # An earlier production must not point into a cache overwritten by retries.
        # Immutable raw takes live beside the final output, outside staging.
        from dub_take_cache import capture
        takes = capture(paths, wav_path.parent / '_dub_takes_v1', lambda file: valid_audio(file, sf))
        for take, key in zip(takes, cache_keys):
            take['cache_key'] = key
        manifest = {"version": 2, "wav": wav_path.name, "sample_rate": sr,
                    "video_offset_seconds": args.range_start or 0,
                    "grouping": args.gruplama, "timing": timing,
                    "duration": float(len(timeline) / sr),
                    "text": "\n".join(t for _, _, t in cues),
                    "original_text": "\n".join(g.get('original_text', g['text']) for g in groups),
                    "segments": manifest_segments(cues, takes, groups, timing)}
        write_manifest(staged_wav, manifest)
        args.phases.seconds['file_write']=audio_write_seconds+time.monotonic()-write_began
        phase_report=args.phases.snapshot()
        staged_wav.with_suffix('.performance.json').write_text(json.dumps(phase_report,indent=2),encoding='utf-8')
    print(f"Dublaj WAV: {wav_path}", flush=True)
    print('DUB_PHASES '+json.dumps(phase_report),flush=True)

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
