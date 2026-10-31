import os
import contextlib
import io
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'backend'))
sys.dont_write_bytecode = True
import transcribe as T

WORK = Path(os.environ.get('AUDIT821_OUT', str(ROOT / '.uiprev/audit821-fidelity')))
WORK.mkdir(parents=True, exist_ok=True)
ENTRIES = [(0.25, 2.0, 'İstanbul burada.'), (2.5, 4.75, 'İkinci satır.')]
METRICS = [dict(avg_logprob=-1.7, no_speech_prob=0.8, compression_ratio=2.9),
           dict(avg_logprob=-0.1, no_speech_prob=0.02, compression_ratio=1.1)]
WORDS = [[dict(word=' İstanbul', start=.25, end=.9, probability=.3)],
         [dict(word=' İkinci', start=2.5, end=3.0, probability=.99)]]
source = WORK / 'input.tr.json'
T.write_json(ENTRIES, source, info=types.SimpleNamespace(language='tr', language_probability=.98, duration=5),
             speakers={0:'A',1:'B'}, segment_metrics=METRICS, segment_words=WORDS)
before = source.read_bytes()
args = types.SimpleNamespace(input=str(source), output_dir=str(WORK / 'output'), formats='json,txt,ass',
    lang_suffix=False, max_line_width=120, max_lines=3, wrap_mode='none', label_speakers=True, youtube='')
with contextlib.redirect_stdout(io.StringIO()) as captured:
    T.reexport_from_json(args)
events = [json.loads(line) for line in captured.getvalue().splitlines() if line.strip()]
done = [e for e in events if e.get('type') == 'done'][-1]
original = json.loads(before)
rebuilt_path = next(Path(p) for p in done['files'] if p.endswith('.json'))
rebuilt = json.loads(rebuilt_path.read_text(encoding='utf-8'))
metric_keys = set(METRICS[0])
assert all(metric_keys <= set(s) for s in original['segments'])
assert all(not metric_keys.intersection(s) for s in rebuilt['segments'])
assert source.read_bytes() == before
assert [(s['start'], s['end'], s['text'], s['speaker'], s['words']) for s in original['segments']] == [
    (s['start'], s['end'], s['text'], s['speaker'], s['words']) for s in rebuilt['segments']]
result = dict(candidate='reexport_json_segment_metrics_lost', source_metrics=[{k:s[k] for k in METRICS[0]} for s in original['segments']],
    output_metric_keys=[sorted(metric_keys.intersection(s)) for s in rebuilt['segments']],
    controls=dict(source_unchanged=True, timing_text_speaker_words_preserved=True, successful_done=True),
    original_quality=T.compute_quality_report(ENTRIES, segment_metrics=original['segments']),
    rebuilt_quality=T.compute_quality_report(ENTRIES, segment_metrics=rebuilt['segments']),
    done=done)
(WORK / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
