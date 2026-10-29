"""Join measured 10/15-step runs into a neutral, local listening sheet.

This validates a controlled comparison; it cannot choose a naturalness winner.
No provider, model, or personal application settings are used here.
"""
import argparse
import json
from pathlib import Path
import shutil
import wave


def matched_conditions(first, second):
    if {first.get('steps'), second.get('steps')} != {10, 15}:
        raise ValueError('One 10-step and one 15-step run are required.')
    for key in ('text_sha256', 'reference_sha256', 'transcript_sha256', 'model_revision', 'temperature'):
        if not first.get(key) or first.get(key) != second.get(key):
            raise ValueError('Unmatched comparison input: ' + key)
    rows = []
    for result in (first, second):
        variants = result.get('variants', [])
        if len(variants) != 1 or variants[0].get('name') != 'single-context':
            raise ValueError('Use --only single-context to keep grouping fixed.')
        rows.append(variants[0])
    if rows[0].get('cfg') != rows[1].get('cfg') or not rows[0].get('cfg'):
        raise ValueError('CFG settings differ.')
    chunks = lambda row: [(c.get('text'), c.get('seed')) for c in row.get('chunks', [])]
    if not chunks(rows[0]) or chunks(rows[0]) != chunks(rows[1]):
        raise ValueError('Text grouping or seeds differ.')
    return rows


def write_comparison(first, second, output):
    roots = [Path(first), Path(second)]
    results = [json.loads((root / 'results.json').read_text(encoding='utf-8')) for root in roots]
    rows = matched_conditions(*results)
    # Validate source containers before making a final listening sheet.
    sources = [root / 'single-context.wav' for root in roots]
    for source in sources:
        with wave.open(str(source), 'rb') as wav:
            if not wav.getnframes() or wav.getnchannels() != 1:
                raise ValueError('Expected nonempty mono PCM audio.')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    for name, source in zip(('sample-a.wav', 'sample-b.wav'), sources):
        shutil.copyfile(source, output / name)
    evidence = {'method': 'Same text, reference, transcript, seed, grouping, CFG and finishing; different production step counts.',
                'human_preference': None, 'naturalness_winner': None,
                'samples': [{'label': label, 'steps': result['steps'], 'load_seconds': result.get('load_seconds'), **row}
                            for label, result, row in zip(('A', 'B'), results, rows)]}
    (output / 'comparison.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    cards = ''.join(f'<section><h2>Örnek {label}</h2><audio controls preload="metadata" src="sample-{label.lower()}.wav">Ses dosyası</audio></section>' for label in ('A', 'B'))
    mapping = ''.join(f'<li>Örnek {label}: {result["steps"]} adım</li>' for label, result in zip(('A', 'B'), results))
    (output / 'listen.html').write_text('''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ses karşılaştırması</title>
<style>:root{color-scheme:dark;--bg:#101216;--panel:#191c21;--line:#343942;--text:#eeeae4;--muted:#adb1b9;--accent:#d5a35c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:64px 32px}header{padding-bottom:28px;border-bottom:1px solid var(--line)}small{color:var(--accent)}h1{font-size:clamp(28px,4vw,42px);line-height:1.2;letter-spacing:-.7px;margin:14px 0}p{max-width:70ch;color:var(--muted);margin:12px 0}.samples{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:32px 0}.samples section{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px}h2{font-size:20px;margin:0 0 24px}audio{display:block;width:100%;height:48px}details{border-top:1px solid var(--line);padding-top:22px}summary{cursor:pointer;color:var(--accent);min-height:44px}summary:focus-visible{outline:2px solid var(--accent);outline-offset:6px}li{margin:8px 0}footer{margin-top:32px;font-size:13px;color:var(--muted)}@media(max-width:650px){main{padding:32px 20px}.samples{grid-template-columns:1fr}.samples section{padding:22px}}</style>
<main><header><small>VoxCPM2 · Dinleme karşılaştırması</small><h1>Aynı metin. İki üretim ayarı.</h1><p>Önce ayarları açmadan dinle. Eksik kelimeleri, cümle geçişlerini, vurguyu ve yoruculuğu karşılaştır. İki örneği aynı ses yüksekliğiyle dinle.</p></header><div class="samples">''' + cards + '''</div><details><summary>Dinledikten sonra ayarları göster</summary><ul>''' + mapping + '''</ul></details><footer>Otomatik doğal ses sıralaması yoktur. Süre ve ASR sonuçları comparison.json dosyasındadır; bunlar insan dinlemesinin yerini tutmaz. Uygulamanın varsayılanları değiştirilmedi.</footer></main></html>''', encoding='utf-8')
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('first', type=Path)
    parser.add_argument('second', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    write_comparison(args.first, args.second, args.output)
