"""Reproducible, opt-in GPU comparison; outputs stay local, no automatic winner.

Run with the installed VoxCPM2 Python and VOXCPM_ROOT set. The original engine
files are never modified. Audio metrics cannot measure human naturalness.
"""
import argparse
import asyncio
import hashlib
import html
import json
import multiprocessing
from pathlib import Path
import time

import numpy as np
import soundfile as sf


def metrics(wav, sr):
    frames = max(1, round(sr * .02))
    rms = np.array([np.sqrt(np.mean(wav[i:i+frames] ** 2)) for i in range(0, len(wav), frames)])
    return {'duration_seconds': round(len(wav)/sr, 3),
            'peak': round(float(np.max(np.abs(wav))), 5),
            'clipped_fraction': round(float(np.mean(np.abs(wav) >= .999)), 6),
            'quiet_fraction': round(float(np.mean(rms < .002)), 4)}


def reference_pair(args):
    """Keep paired reference experiments separate from grouping experiments."""
    alternate = getattr(args, 'alternate_reference', None)
    transcript = getattr(args, 'alternate_transcript', None)
    if bool(alternate) != bool(transcript):
        raise ValueError('Both alternate reference and exact transcript are required.')
    if alternate and args.only != 'single-context':
        raise ValueError('Paired references require --only single-context to keep grouping fixed.')
    return alternate, transcript


def comparison_steps(args):
    steps = getattr(args, 'steps', 15)
    if type(steps) is not int or steps not in (10, 15):
        raise ValueError('Compare the production presets: 10 or 15 steps.')
    return steps


async def compare(args):
    steps = comparison_steps(args)
    # Import the application's Windows safe-weight-loader compatibility too.
    import altyazi_oku as runtime
    from huggingface_hub import snapshot_download
    from nanovllm_voxcpm import VoxCPM
    from dub_plan import make_groups, grouping_options

    alternate, alternate_transcript = reference_pair(args)
    text = args.text.read_text(encoding='utf-8-sig')
    sentences = [line.strip() for line in text.splitlines() if line.strip()]
    if not sentences or len(text) > 800:
        raise ValueError('Use 1–800 characters, one complete sentence per line.')
    cues = [(i*4500, i*4500+4400, line) for i, line in enumerate(sentences)]
    grouped = [g['text'] for g in make_groups(cues, **grouping_options('akici'))]
    variants = [('sentence', sentences, False, 1.65),
                ('flowing', grouped, False, 1.65),
                ('fixed-seed', grouped, True, 1.65),
                ('cfg2-fixed', grouped, True, 2.0),
                ('single-context', [' '.join(sentences)], True, 1.65)]
    if args.only:
        variants = [v for v in variants if v[0] == args.only]
    if alternate:
        variants = [('reference-a', [' '.join(sentences)], True, 1.65),
                    ('reference-b', [' '.join(sentences)], True, 1.65)]
    args.output.mkdir(parents=True, exist_ok=False)
    model = snapshot_download(runtime.MODEL_ID, revision=runtime.MODEL_REVISION, local_files_only=True)
    started = time.monotonic()
    server = VoxCPM.from_pretrained(model, devices=[0], inference_timesteps=steps,
        max_num_seqs=1, max_num_batched_tokens=4096, max_model_len=4096,
        gpu_memory_utilization=.75, enforce_eager=False)
    result = {'version': 2, 'steps': steps, 'temperature': .8, 'model_revision': runtime.MODEL_REVISION,
              'text_sha256': hashlib.sha256(text.encode()).hexdigest(),
              'limits': 'No objective naturalness or speaker-similarity claim. Listen blind before choosing.',
              'variants': []}
    try:
        await asyncio.wait_for(server.wait_for_ready(), 180)
        result['load_seconds'] = round(time.monotonic()-started, 3)
        reference = args.reference.read_bytes()
        ref_lat = await server.encode_latents(reference, 'wav')
        prompt = args.transcript.read_text(encoding='utf-8-sig').strip()
        if not prompt:
            raise ValueError('An exact nonempty reference transcript is required.')
        result['reference_sha256'] = hashlib.sha256(reference).hexdigest()
        result['transcript_sha256'] = hashlib.sha256(prompt.encode()).hexdigest()
        prompt_id = await server.add_prompt(reference, 'wav', prompt)
        anchors = {'reference-a': (ref_lat, prompt_id)}
        if alternate:
            second = alternate.read_bytes()
            second_text = alternate_transcript.read_text(encoding='utf-8-sig').strip()
            if not second_text:
                raise ValueError('An exact nonempty alternate transcript is required.')
            anchors['reference-b'] = (await server.encode_latents(second, 'wav'),
                                      await server.add_prompt(second, 'wav', second_text))
            result['reference_sha256'] = [hashlib.sha256(reference).hexdigest(), hashlib.sha256(second).hexdigest()]
            result['method'] = 'Paired references; identical text, grouping, seed, settings and finishing. Reference voice/language differ together; not an isolated language causal test.'
        sr = int(getattr(server, 'sample_rate', 48000) or 48000)
        for name, chunks, fixed, cfg in variants:
            began = time.monotonic()
            current_lat, current_prompt = anchors.get(name, (ref_lat, prompt_id))
            waves, records = [], []
            for i, chunk in enumerate(chunks):
                # Same source anchor in every request; never feed generated errors back.
                seed = 42 if fixed else 42 + i
                pieces = []
                async def generate():
                    async for part in server.generate(chunk, prompt_id=current_prompt,
                            ref_audio_latents=current_lat, temperature=.8, cfg_value=cfg,
                            seed=seed, max_generate_length=2000):
                        pieces.append(np.asarray(part, dtype=np.float32).reshape(-1))
                await asyncio.wait_for(generate(), 180)
                raw = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
                if not len(raw) or not np.isfinite(raw).all():
                    raise ValueError('Invalid generation: ' + name)
                # Identical finishing and 180 ms join in all conditions.
                wav, finishing = runtime.finish_audio(runtime.prepare_audio(raw, sr), sr)
                sf.write(args.output/f'{name}-{i+1}.wav', wav, sr)
                records.append({'text': chunk, 'seed': seed, **metrics(wav, sr), 'finishing': finishing})
                if waves:
                    waves.append(np.zeros(round(.18*sr), dtype=np.float32))
                waves.append(wav)
            audio = np.concatenate(waves)
            sf.write(args.output/f'{name}.wav', audio, sr)
            result['variants'].append({'name': name, 'cfg': cfg, 'chunks': records,
                'generation_seconds': round(time.monotonic()-began, 3), **metrics(audio, sr)})
            (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'{name}: {len(chunks)} blocks, {len(audio)/sr:.1f}s audio', flush=True)
    finally:
        await server.stop()
    if args.verify_python:
        verifier = runtime.SpeechVerifier(args.verify_python)
        try:
            for variant in result['variants']:
                expected = ' '.join(c['text'] for c in variant['chunks'])
                variant['verification'] = await verifier.check(args.output/(variant['name']+'.wav'), expected)
        finally:
            await verifier.close()
        (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    # Neutral labels make the first listening less suggestive; mapping stays in JSON.
    rows = ''.join(f'<section><h2>Örnek {i+1}</h2><audio controls src="{html.escape(v["name"])}.wav"></audio></section>'
                   for i, v in enumerate(result['variants']))
    (args.output/'listen.html').write_text('<!doctype html><meta charset="utf-8"><title>Ses karşılaştırma</title>'
        '<h1>Ton ve akıcılık karşılaştırması</h1><p>Aynı ses düzeyinde dinleyin. Ton devamlılığı, eksik kelime, '
        'duraklar ve yoruculuğu karşılaştırın. Otomatik kalite sıralaması yoktur.</p>'+rows, encoding='utf-8')


if __name__ == '__main__':
    multiprocessing.freeze_support()
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('text', 'reference', 'transcript', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--steps', type=int, choices=(10, 15), default=15)
    p.add_argument('--only', choices=('sentence', 'flowing', 'fixed-seed', 'cfg2-fixed', 'single-context'))
    p.add_argument('--alternate-reference', type=Path, help='Opt-in paired voice experiment; requires --only single-context')
    p.add_argument('--alternate-transcript', type=Path)
    p.add_argument('--verify-python', type=Path, help='Application backend Python with the cached small Whisper model')
    asyncio.run(compare(p.parse_args()))
