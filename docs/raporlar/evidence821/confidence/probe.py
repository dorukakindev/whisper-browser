import ast
import json
import os
import sys
import types
import wave
from pathlib import Path
from unittest.mock import patch

WORK = Path(os.environ.get('AUDIT821_OUT', str(Path(__file__).resolve().parents[4] / '.uiprev/audit821-confidence')))
WORK.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[4]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'backend'))
import transcribe as T

tree = ast.parse((ROOT / 'backend/transcribe.py').read_text(encoding='utf-8'))
main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
prefix = []
for node in main.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'args' for t in node.targets):
        break
    prefix.append(node)
env = dict(T.__dict__)
exec(compile(ast.Module(body=prefix, type_ignores=[]), 'actual-parser', 'exec'), env)
args = env['parser'].parse_args(['--input', str(WORK / 'source.wav'), '--output-dir', str(WORK / 'out'),
    '--cache-dir', str(WORK / 'cache'), '--device', 'cpu', '--compute-type', 'int8', '--formats', 'json',
    '--fix-timings', 'false', '--snap-to-speech', 'false', '--split-mode', 'none', '--resume', 'false',
    '--fix-common-errors', 'false', '--drop-repeated-hallucinations', 'false', '--confidence-report', 'true'])
args.scene_context = None

def audio(path):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000)
        f.writeframes(b'\0\0' * 16000 * 4)
audio(args.input)
probability = .2
class Model:
    def __init__(self, *_, **__): pass
    def transcribe(self, *_, **__):
        word = types.SimpleNamespace(start=0., end=1.5, word=' Kapı', probability=probability)
        segment = types.SimpleNamespace(start=0., end=2., text='Kapı burada.', words=[word], avg_logprob=-.1, no_speech_prob=.01, compression_ratio=1.)
        return iter([segment]), types.SimpleNamespace(language='tr', language_probability=1., duration=4.)
fake = types.ModuleType('faster_whisper'); fake.WhisperModel = Model
events = []
with patch.dict(sys.modules, {'faster_whisper':fake}), patch.dict(os.environ, {'WHISPER_JOB_TEMP_DIR':str(WORK / 'owned')}), \
     patch.object(T, 'find_ffmpeg', return_value='fixture'), patch.object(T, 'extract_audio', side_effect=lambda _, dest, *a, **kw: audio(dest)), \
     patch.object(T, 'check_vram_budget'), patch.object(T, 'emit', side_effect=lambda kind, **v: events.append(dict(type=kind, **v))), patch.object(T, 'log'):
    T.transcribe(args)
    done1 = [e for e in events if e['type']=='done'][-1]
    report = next(Path(p) for p in done1['files'] if p.endswith('.dusuk-guven.txt'))
    old_report = report.read_bytes()
    probability = .99
    T.transcribe(args)
    done2 = [e for e in events if e['type']=='done'][-1]
    new_json = next(Path(p) for p in done2['files'] if p.endswith('.json'))
    payload = json.loads(new_json.read_text(encoding='utf-8'))
    assert payload['segments'][0]['words'][0]['probability'] == .99
    assert report.exists() and report.read_bytes()==old_report
    assert str(report) not in done2['files']
    result = dict(first_files=done1['files'], second_files=done2['files'], second_warnings=done2.get('warnings'),
        stale_report_unchanged=True, stale_report_text=old_report.decode('utf-8-sig'),
        current_word_probability=payload['segments'][0]['words'][0]['probability'])
(WORK / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
