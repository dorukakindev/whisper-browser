"""Sahne bağlamı motoru — sınır saptama + pencere kısıtlama + ölçüm korpusu."""

import sys
import time
sys.path.insert(0, 'backend')

# Türkçe Windows konsolu (cp1254) '→' gibi karakterleri kodlayamaz; okunabilir
# kalsın diye kodlanamayanlar '?' olur (open() tarafı zaten utf-8 sabitli).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='replace')

from sentence_translation import detect_scene_boundaries, scene_context_bounds


def check(name, condition):
    if not condition:
        print('FAIL', name)
        raise SystemExit(1)
    print('PASS', name)


def entries_from(times, texts=None):
    return [(s, e, (texts[i] if texts else f'cue {i}')) for i, (s, e) in enumerate(times)]


# --- detect_scene_boundaries ---------------------------------------------

b = detect_scene_boundaries(entries_from([(0, 5), (6, 9), (10, 13)]))
check('sürekli diyalog sınır üretmez', b == frozenset())

b = detect_scene_boundaries(entries_from([(0, 5), (20, 24), (25, 28)]))
check('15sn sessizlik sahne sınırı', b == frozenset({1}))

b = detect_scene_boundaries(entries_from([(0, 5), (6, 9)], texts=['x', 'INT. KITCHEN — NIGHT']))
check('INT. işareti sahne sınırı', b == frozenset({1}))

b = detect_scene_boundaries(entries_from([(0, 5), (6, 9)], texts=['x', 'EXT. STREET']))
check('EXT. işareti sahne sınırı', b == frozenset({1}))

b = detect_scene_boundaries(entries_from([(0, 5), (30, 34)]), gap_threshold=0)
check('gap_threshold=0 kapalı', b == frozenset())

b = detect_scene_boundaries(entries_from([(0, 5), (30, 34)]), gap_threshold=40)
check('eşik üstü sessizlik sınır değil', b == frozenset())

b = detect_scene_boundaries(entries_from([(0, 5), (12, 'x'), ('y', 14)]))
check('bozuk zamanlı cue sinyal üretmez', b == frozenset())

b = detect_scene_boundaries(entries_from([(0, 5), (4.5, 9), (25, 28), (26, 30)]))
check('çakışan cue (negatif boşluk) sınır değil', b == frozenset({2}))

# --- scene_context_bounds --------------------------------------------------

N = 100
breaks = frozenset({10, 50})

lo, hi = scene_context_bounds(breaks, lo=12, hi=15, max_lines=4, entry_count=N)
check('sol kelepçe sahne başında durur', lo == 10 and hi == 19)

lo, hi = scene_context_bounds(breaks, lo=46, hi=48, max_lines=4, entry_count=N)
check('sağ kelepçe sahne sınırında durur', lo == 42 and hi == 49)

lo, hi = scene_context_bounds(breaks, lo=52, hi=55, max_lines=4, entry_count=N)
check('sahne başı kelepçesi (52→50)', lo == 50 and hi == 59)

lo, hi = scene_context_bounds(breaks, lo=56, hi=60, max_lines=4, entry_count=N)
check('sahne içinde tam pencere', lo == 52 and hi == 64)

lo, hi = scene_context_bounds(breaks, lo=2, hi=5, max_lines=4, entry_count=N)
check('dosya başı 0 altına inmez', lo == 0 and hi == 9)

lo, hi = scene_context_bounds(breaks, lo=95, hi=98, max_lines=4, entry_count=N)
check('dosya sonu sınırı', lo == 91 and hi == 99)

lo, hi = scene_context_bounds(frozenset(), lo=12, hi=15, max_lines=4, entry_count=N)
check('sınır yokken klasik sabit pencere', lo == 8 and hi == 19)

# --- ölçüm korpusu: sabit pencere vs sahne-bilinçli ------------------------
# 4 sahnelik 200-cue kurgu film: sahneler 12-20sn sessizlikle ayrılır.
corpus, t = [], 0.0
scene_starts = []
for scene in range(4):
    scene_starts.append(len(corpus))
    for i in range(50):
        corpus.append((t, t + 2.4, f'sahne{scene} replik{i}'))
        t += 2.8
    t += 15.0

breaks = detect_scene_boundaries(corpus)
check('korpus 3 sahne sınırı buldu', breaks == frozenset(scene_starts[1:]))

CONTEXT = 4
CHUNK = 20
def leak_and_cost(left, right, lo_i, hi_i):
    leaked = sum(1 for i in range(left, lo_i)
                 if any(i < b <= lo_i for b in breaks))
    leaked += sum(1 for i in range(hi_i + 1, right + 1)
                  if any(hi_i < b <= i for b in breaks))
    cost = sum(len(corpus[i][2]) for i in
               list(range(left, lo_i)) + list(range(hi_i + 1, right + 1)))
    return leaked, cost


fixed_leak = scene_leak = fixed_ctx_chars = scene_ctx_chars = 0
for start in range(0, len(corpus), CHUNK):
    lo_i, hi_i = start, min(start + CHUNK - 1, len(corpus) - 1)
    fl, fh = max(0, lo_i - CONTEXT), min(len(corpus) - 1, hi_i + CONTEXT)
    sl, sh = scene_context_bounds(breaks, lo_i, hi_i, CONTEXT, len(corpus))
    leaked, cost = leak_and_cost(fl, fh, lo_i, hi_i)
    fixed_leak += leaked
    fixed_ctx_chars += cost
    leaked, cost = leak_and_cost(sl, sh, lo_i, hi_i)
    scene_leak += leaked
    scene_ctx_chars += cost

print(f'ölçüm: sabit pencere {fixed_leak} satır sızıntı / {fixed_ctx_chars} karakter '
      f'→ sahne-bilinçli {scene_leak} satır / {scene_ctx_chars} karakter')
check('sahne-bilinçli pencere sıfır sızıntı', scene_leak == 0)
check('sabit pencere sızıntı üretir', fixed_leak > 0)
check('bağlam maliyeti düştü', scene_ctx_chars <= fixed_ctx_chars)

# --- kablo bağlantısı -------------------------------------------------------
src = open('backend/transcribe.py', encoding='utf-8').read()
check('source_context sahne kelepçesi kullanır',
      'scene_context_bounds(' in src and 'detect_scene_boundaries(' in src)
check('argparse bayrağı var', '--translate-scene-gap' in src)

print('scene-context: tüm kontroller geçti')
