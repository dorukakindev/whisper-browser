"""Anlam kaybı değerlendirme koşucusu — korpus üzerinde kalite kapısı ölçümü.

Kullanım:  python3 backend/eval_meaning_loss.py [--verbose] [--csv PATH]

Her vaka için iki seviye ölçülür:
  * blocking  : translation_blocking_issues — gerçek ret üreten kapı
  * meaning   : translation_meaning_issues  — tanısal işaretler (ret değil)

Metrikler:
  false_accept_blocking : expected=reject iken blocking temiz (anlam kaybı geçti)
  false_accept_meaning  : expected=reject iken hiç tanısal işaret yok (kör nokta)
  false_reject          : expected=accept iken blocking işaret üretti
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sentence_translation import (translation_meaning_issues,
                                  translation_blocking_issues)

CORPUS = os.path.join(os.path.dirname(__file__),
                      'eval_data', 'meaning_loss_corpus.json')


def evaluate(corpus_path=CORPUS, verbose=False):
    data = json.load(open(corpus_path, encoding='utf-8'))
    rows = []
    for case in data['cases']:
        src, cand = case['src'], case['cand']
        blocking = translation_blocking_issues(src, cand, 'tr')
        meaning = translation_meaning_issues(src, cand, 'tr')
        row = dict(case, blocking=blocking, meaning=meaning)
        rows.append(row)
        if verbose:
            mark = {'accept': 'ACC', 'reject': 'REJ'}[case['expected']]
            print(f"[{mark}] {case['id']:16s} block={blocking or '-'} "
                  f"mean={meaning or '-'} | {src} → {cand}")
    return rows


def report(rows):
    cats = sorted({r['cat'] for r in rows})
    out = {'total': len(rows), 'per_cat': {}, 'totals': {}}
    for scope in cats + ['ALL']:
        sel = rows if scope == 'ALL' else [r for r in rows if r['cat'] == scope]
        rej = [r for r in sel if r['expected'] == 'reject']
        acc = [r for r in sel if r['expected'] == 'accept']
        gatable_rej = [r for r in rej if r.get('gatable')]
        m = {
            'accept_n': len(acc),
            'reject_n': len(rej),
            'reject_gatable': len(gatable_rej),
            'false_accept_blocking': sum(1 for r in rej if not r['blocking']),
            'false_accept_blocking_gatable': sum(
                1 for r in gatable_rej if not r['blocking']),
            'false_accept_meaning': sum(1 for r in rej if not r['meaning']),
            'false_reject': sum(1 for r in acc if r['blocking']),
            'accept_flagged_meaning': sum(1 for r in acc if r['meaning']),
        }
        out['per_cat' if scope != 'ALL' else 'totals'][scope if scope != 'ALL'
                                                     else 'ALL'] = m
    return out


def main():
    verbose = '--verbose' in sys.argv
    rows = evaluate(verbose=verbose)
    rep = report(rows)
    print('\n=== Anlam kaybı korpus ölçümü ===')
    for cat, m in sorted(rep['per_cat'].items()):
        print(f"{cat:12s} acc={m['accept_n']:2d} rej={m['reject_n']:2d} "
              f"(yakalanabilir {m['reject_gatable']:2d}) | "
              f"FA-block {m['false_accept_blocking']:2d} "
              f"FA-gatable {m['false_accept_blocking_gatable']:2d} "
              f"FA-meaning {m['false_accept_meaning']:2d} "
              f"FR {m['false_reject']:2d} acc-flag {m['accept_flagged_meaning']:2d}")
    m = rep['totals']['ALL']
    print(f"{'ALL':12s} acc={m['accept_n']:2d} rej={m['reject_n']:2d} "
          f"(yakalanabilir {m['reject_gatable']:2d}) | "
          f"FA-block {m['false_accept_blocking']:2d} "
          f"FA-gatable {m['false_accept_blocking_gatable']:2d} "
          f"FA-meaning {m['false_accept_meaning']:2d} "
          f"FR {m['false_reject']:2d} acc-flag {m['accept_flagged_meaning']:2d}")
    return rep


if __name__ == '__main__':
    main()
