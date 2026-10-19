"""Local CUDA voice-clone comparison; private audio stays in the output folder."""
import argparse
import json
import os
import time
from pathlib import Path

os.environ.setdefault('HF_HUB_DISABLE_XET', '1')

DEFAULT_TEXT = ('Bu denemede kendi sesimle Türkçe konuşuyorum. Amacımız, videodaki süreye '
                'uyarken kelimeleri kesmeden doğal ve anlaşılır bir ses üretmek.')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--reference', type=Path, required=True)
    p.add_argument('--transcript', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--text-file', type=Path)
    p.add_argument('--steps', type=int, default=32)
    args = p.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA kullanilamiyor.')
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output / 'normal.wav').exists():
        raise FileExistsError('Yeni bir deneme cikti klasoru secin.')
    text = args.text_file.read_text(encoding='utf-8-sig').strip() if args.text_file else DEFAULT_TEXT
    transcript = args.transcript.read_text(encoding='utf-8-sig').strip()
    if not text or not transcript:
        raise ValueError('Metin ve referans dokumu bos olamaz.')
    began = time.perf_counter()
    model = OmniVoice.from_pretrained(str(args.model), device_map='cuda:0', dtype=torch.float16,
                                     attn_implementation='sdpa', load_asr=False)
    torch.cuda.synchronize()
    load_seconds = time.perf_counter() - began
    began = time.perf_counter()
    prompt = model.create_voice_clone_prompt(ref_audio=str(args.reference), ref_text=transcript)
    torch.cuda.synchronize()
    reference_seconds = time.perf_counter() - began
    results = []
    report = {'load_seconds': load_seconds, 'reference_seconds': reference_seconds,
              'gpu': torch.cuda.get_device_name(), 'reference_duration': sf.info(args.reference).duration,
              'steps': args.steps, 'expected_text': text, 'cases': results}
    for name, target in [('normal', None), ('hedef10', 10.0), ('hedef6', 6.0)]:
        torch.manual_seed(42)
        torch.cuda.reset_peak_memory_stats()
        began = time.perf_counter()
        with torch.inference_mode():
            audio = model.generate(text=text, language='tr', voice_clone_prompt=prompt,
                                   num_step=args.steps, duration=target,
                                   postprocess_output=False, pad_duration=0.0)
        torch.cuda.synchronize()
        elapsed = time.perf_counter() - began
        wav = np.asarray(audio[0], dtype=np.float32).reshape(-1)
        if not len(wav) or not np.isfinite(wav).all() or not np.any(wav):
            raise ValueError('Model gecersiz ses uretti.')
        destination = args.output / f'{name}.wav'
        sf.write(destination, wav, model.sampling_rate, subtype='PCM_16')
        record = {'name': name, 'target_seconds': target, 'audio_seconds': len(wav) / model.sampling_rate,
                  'sample_rate': model.sampling_rate, 'generation_seconds': elapsed,
                  'rtf': elapsed / (len(wav) / model.sampling_rate),
                  'peak_allocated_mib': torch.cuda.max_memory_allocated() / 1048576,
                  'peak_reserved_mib': torch.cuda.max_memory_reserved() / 1048576,
                  'peak_amplitude': float(np.abs(wav).max())}
        results.append(record)
        (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(record), flush=True)
    print('Tamamlandi', flush=True)


if __name__ == '__main__':
    main()
