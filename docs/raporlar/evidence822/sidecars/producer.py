from pathlib import Path
import sys, json, os
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'backend'))
from transcribe import write_srt, write_json
root = Path(os.environ.get('AUDIT822_OUT', str(Path(__file__).resolve().parents[4] / '.uiprev/audit822-sidecars')))
root.mkdir(parents=True, exist_ok=True)
for name, gap in [('touching', 0), ('near', .04), ('separated', .20)]:
    entries = [(0, 1, 'Merhaba.'), (1+gap, 2+gap, 'Dünya.')]
    words = [dict(word=' Merhaba.', start=0.1, end=1, probability=.9),
             dict(word=' Dünya.', start=1+gap, end=1.8+gap, probability=.9)]
    write_srt(entries, str(root / (name+'.srt')))
    write_json(entries, str(root / (name+'.json')), all_words=words)
print(json.dumps({'ok': True, 'producer': 'real write_srt/write_json', 'cases':3}))
