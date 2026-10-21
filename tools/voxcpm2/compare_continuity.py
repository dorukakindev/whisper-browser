"""Opt-in fixed-continuation experiment; keeps the original voice reference.

This is an audition tool, not a production default or a naturalness score.
Anchor audio must have a matching transcript and pass local ASR first.
"""
import argparse
import asyncio
import html
import json
import multiprocessing
from pathlib import Path
import time

import numpy as np
import soundfile as sf

from compare_prosody import metrics


async def compare(args):
    import altyazi_oku as runtime
    from huggingface_hub import snapshot_download
    from nanovllm_voxcpm import VoxCPM

    cases = json.loads(args.cases.read_text(encoding='utf-8-sig'))
    if (not isinstance(cases, list) or not 1 <= len(cases) <= 8
            or any(not isinstance(c, str) or not c.strip() or len(c) > 300 for c in cases)):
        raise ValueError('Supply 1–8 nonempty passages of at most 300 characters each.')
    anchor_text = args.anchor_text.read_text(encoding='utf-8-sig').strip()
    original_text = args.transcript.read_text(encoding='utf-8-sig').strip()
    info = sf.info(args.anchor_audio)
    if not anchor_text or not original_text or info.channels != 1 or not 3 <= info.duration <= 20:
        raise ValueError('Anchor must be 3–20 seconds, mono, with exact nonempty transcripts.')
    args.output.mkdir(parents=True, exist_ok=False)
    verifier = runtime.SpeechVerifier(args.verify_python)
    server = None
    results = {'version': 1, 'steps': 15, 'cfg': 1.65, 'temperature': .8,
               'method': 'fixed verified generated prompt + unchanged original reference',
               'limits': 'ASR/acoustic diagnostics do not establish perceptual superiority.', 'cases': []}
    try:
        anchor_check = await verifier.check(args.anchor_audio, anchor_text)
        results['anchor_verification'] = anchor_check
        if anchor_check.get('status') != 'passed':
            raise ValueError('The anchor did not pass local speech verification.')
        model = snapshot_download(runtime.MODEL_ID, revision=runtime.MODEL_REVISION, local_files_only=True)
        server = VoxCPM.from_pretrained(model, devices=[0], inference_timesteps=15,
            max_num_seqs=1, max_num_batched_tokens=4096, max_model_len=4096,
            gpu_memory_utilization=.75, enforce_eager=False)
        await asyncio.wait_for(server.wait_for_ready(), 180)
        original = args.reference.read_bytes()
        reference = await server.encode_latents(original, 'wav')
        prompts = {'original': await server.add_prompt(original, 'wav', original_text),
                   'fixed-context': await server.add_prompt(args.anchor_audio.read_bytes(), 'wav', anchor_text)}
        sr = int(getattr(server, 'sample_rate', 48000) or 48000)
        for i, text in enumerate(cases):
            row = {'text': text, 'variants': []}
            for name, prompt_id in prompts.items():
                began, pieces = time.monotonic(), []
                async def generate():
                    async for part in server.generate(text, prompt_id=prompt_id,
                            ref_audio_latents=reference, temperature=.8, cfg_value=1.65,
                            seed=42, max_generate_length=2000):
                        pieces.append(np.asarray(part, dtype=np.float32).reshape(-1))
                await asyncio.wait_for(generate(), 180)
                raw = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
                wav, finishing = runtime.finish_audio(runtime.prepare_audio(raw, sr), sr)
                file = args.output/f'{i+1}-{name}.wav'
                sf.write(file, wav, sr, subtype='PCM_16')
                generation_seconds = time.monotonic()-began
                check = await verifier.check(file, text)
                row['variants'].append({'name': name, 'file': file.name, **metrics(wav, sr),
                    'generation_seconds': round(generation_seconds, 3), 'verification': check, 'finishing': finishing})
                print(f'{i+1} {name}: {check["status"]}, {len(wav)/sr:.2f}s', flush=True)
            results['cases'].append(row)
            (args.output/'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    finally:
        await verifier.close()
        if server is not None:
            await server.stop()
    body = ''.join('<section><p>'+html.escape(c['text'])+'</p>'+''.join(
        f'<p>Örnek {j+1}</p><audio controls src="{v["file"]}"></audio>' for j,v in enumerate(c['variants']))+'</section>'
        for c in results['cases'])
    (args.output/'listen.html').write_text('<!doctype html><meta charset="utf-8"><title>Sabit bağlam denemesi</title>'
        '<h1>Sabit anlatım bağlamı karşılaştırması</h1><p>Kimlik, doğal vurgu, cümle başlangıcı ve kelime bütünlüğünü karşılaştırın. Otomatik kazanan yoktur.</p>'+body, encoding='utf-8')


if __name__ == '__main__':
    multiprocessing.freeze_support()
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('cases', 'anchor-audio', 'anchor-text', 'reference', 'transcript', 'output', 'verify-python'):
        p.add_argument('--'+name, type=Path, required=True)
    asyncio.run(compare(p.parse_args()))
