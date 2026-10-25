"""Build a local, read-only scene audition from two existing dubbing outputs.

No GPU, provider or naturalness scoring. Audio and private paths stay local.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from sentence_translation import translation_blocking_issues
from dub_plan import parse_srt


def load(path):
    if path.stat().st_size > 16_000_000:
        raise ValueError('Review sidecar is too large')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def inspect(wave, source):
    import numpy as np
    import soundfile as sf
    quality = load(wave.with_suffix('.quality.json'))
    sync = load(wave.with_suffix('.sync.json'))
    subprocess.run(['node', '-e', "const fs=require('node:fs');require(process.argv[1]).validate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')))",
                    str(ROOT / 'src/renderer/dub-sync-map.js'), str(wave.with_suffix('.sync.json'))],
                   check=True, timeout=15, capture_output=True)
    if not isinstance(quality.get('groups'), list) or not 0 < len(quality['groups']) <= 5000:
        raise ValueError('Invalid review groups')
    rows = parse_srt(source)
    source_text = dict(zip(rows.source_ids, (row[2] for row in rows)))
    with sf.SoundFile(wave) as file:
        rate, frames = file.samplerate, len(file)
        if frames / rate > 600:
            raise ValueError('Choose a scene of at most ten minutes')
        audio = file.read(dtype='float32')
    if audio.ndim != 1 or not np.isfinite(audio).all() or not audio.size:
        raise ValueError('Invalid audio waveform')
    if abs(sync['audioDuration'] - frames / rate) > .1:
        raise ValueError('Sync map does not describe this waveform')
    groups = []
    previous = None
    for row in quality['groups']:
        start, end = row.get('audioStart'), row.get('audioEnd')
        if (not all(isinstance(n, (int, float)) and math.isfinite(n) for n in (start, end))
                or start < 0 or end <= start or end > frames / rate + .05):
            raise ValueError('Group falls outside the waveform')
        ids = [int(n) for n in row['key'].split(',')]
        original = ' '.join(source_text[n] for n in ids)
        text = row.get('displayText') or row.get('text', '')
        segment = audio[round(start * rate):round(end * rate)]
        active = segment[np.abs(segment) > .003]
        db = float(20 * np.log10(max(float(np.sqrt(np.mean(active**2))), 1e-9))) if active.size else None
        jump = abs(db - previous) if db is not None and previous is not None else None
        previous = db
        groups.append({'key':row['key'], 'source':original, 'translation':text,
                       'blocking':translation_blocking_issues(original, text, 'tr'),
                       'status':row['status'], 'audioStart':start, 'audioEnd':end,
                       'level_db':db, 'adjacent_level_jump_db':jump,
                       'listen_for_level_change':jump is not None and jump > 6})
    return {'seconds':frames / rate, 'peak':float(np.max(np.abs(audio))),
            'clipped_fraction':float(np.mean(np.abs(audio) >= .999)),
            'sync':sync, 'groups':groups}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=('en', 'tr'), default='en')
    for name in ('before', 'after', 'video', 'source-srt', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args(argv)
    report = {key:inspect(getattr(args, key), args.source_srt) for key in ('before', 'after')}
    if set(row['key'] for row in report['before']['groups']) != set(row['key'] for row in report['after']['groups']):
        raise ValueError('Comparison requires the same source groups')
    args.output.mkdir(parents=True, exist_ok=False)
    for key in ('before', 'after'):
        shutil.copyfile(getattr(args, key), args.output / (key + '.wav'))
    shutil.copyfile(args.video, args.output / ('source' + args.video.suffix))
    report['video'] = 'source' + args.video.suffix
    (args.output / 'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    data = json.dumps(report,ensure_ascii=False).replace('<', '\\u003c')
    (args.output / 'index.html').write_text('''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sahne karşılaştırması</title><link rel="stylesheet" href="scene-review.css"><main><h1>Sahne karşılaştırması</h1><p>Eski ve yeni grubu aynı kaynak aralığında dinleyin. Otomatik kontroller doğallık veya duygu puanı değildir. Kaynak videonun sesi kapalıdır.</p><video id="video" muted playsinline></video><label for="group">Cümle grubu</label><select id="group"></select><div class="actions"><button id="before">Önceki grubu dinle</button><button id="after">Yeni grubu dinle</button><button id="stop">Durdur</button></div><p id="status" role="status"></p><section><h2>Kaynak</h2><p id="source"></p><h2>Türkçe</h2><p id="translation"></p><p id="checks"></p></section><audio id="audio" controls></audio></main><script id="data" type="application/json">''' + data + '''</script><script src="dub-sync-map.js"></script><script src="scene-review.js"></script></html>''',encoding='utf-8')
    for file in ('scene-review.js', 'scene-review.css'):
        shutil.copyfile(Path(__file__).with_name(file), args.output / file)
    page = args.output / 'index.html'
    page.write_text(page.read_text(encoding='utf-8').replace('<html lang="tr">', '<html lang="' + args.language + '">', 1), encoding='utf-8')
    shutil.copyfile(ROOT / 'src/renderer/dub-sync-map.js', args.output / 'dub-sync-map.js')
    print(json.dumps({'output':str(args.output),'groups':len(report['after']['groups']),
                      'translation_blocked':sum(bool(row['blocking']) for row in report['after']['groups']),
                      'new_gpu_generation':False}))


if __name__ == '__main__': main()
