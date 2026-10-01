#!/usr/bin/env python3
"""
Noktalama kurtarma değerlendirmesi (kuyruk-50 madde 12).

recover_punctuation_collapse() farklı motor/ayar senaryolarında ölçülür:
  - kurtarma noktalama oranını yükseltirken kelime doğruluğunu bozmamalıdır;
    kelime içeriği ağır değişen yeniden-transkripsiyon REDDEDİLMELİDİR.
  - aynı-kelime kurtarma kabul edilir ve noktalama kazanır.
  - whisperx uyarlaması (_WxSegment) aynı yoldan güvenle geçer.
  - ayarlar: condition_on_previous_text=False zorlanır, kullanıcı prompt'u
    korunur ve noktalama primerı sona eklenir.

Kural: ağ/GPU/ffmpeg yok; model ve _cut_wav stub'lanır.
"""
import os
import sys
import types
from collections import namedtuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402

Seg = namedtuple('Seg', 'start end text words avg_logprob no_speech_prob',
                 defaults=[None] * 6)
Wd = namedtuple('Wd', 'word start end probability', defaults=[None] * 4)

FAILS = []


def check(name, cond, detail=''):
    if cond:
        print('  PASS', name)
    else:
        FAILS.append(name)
        print('  FAIL', name, detail)


def _mk_seg(start, text, dt=0.15):
    return Seg(start=start, end=start + dt * len(text.split()) + 0.01, text=text,
               words=[Wd(word=' ' + t, start=start + i * dt,
                         end=start + i * dt + dt - 0.01, probability=0.9)
                      for i, t in enumerate(text.split())],
               avg_logprob=-0.1, no_speech_prob=0.0)


def _stub_common():
    return {'condition_on_previous_text': True, 'initial_prompt': 'kullanıcı notu: Kılıç'}


def _stub_args():
    return types.SimpleNamespace(split_mode='none', timing_gap=0.5,
                                 max_chars=84, hard_max_chars=200)


def _bad_region(n=100):
    # noktalamasız çökmüş bölge: 100 blok × 4 kelime, 0–100sn
    return [(i * 1.0, i * 1.0 + 0.9, 'kelime%d x y iki' % i) for i in range(n)]


def _word_overlap(a_text, b_text):
    a = T._norm_words_for_dedupe(a_text)
    b = T._norm_words_for_dedupe(b_text)
    if not a or not b:
        return 0.0
    counts = {}
    for w in a:
        counts[w] = counts.get(w, 0) + 1
    shared = 0
    for w in b:
        if counts.get(w):
            counts[w] -= 1
            shared += 1
    return shared / max(len(a), len(b))


def _run(entries, model, all_words=None, tmp='/tmp'):
    orig = T._cut_wav
    T._cut_wav = lambda src, dst, s, e, ff: dst
    captured = {}

    class Spy:
        def transcribe(self, piece, **kw):
            captured.update(kw)
            return model.transcribe(piece, **kw)

    try:
        out, words, fixed = T.recover_punctuation_collapse(
            list(entries), list(all_words or []), Spy(), '/tmp/x.wav', 'ffmpeg',
            _stub_common(), _stub_args(), 'en', 0.0, tmp, min_words=80)
    finally:
        T._cut_wav = orig
    return out, words, fixed, captured


# ── 1) Aynı kelimeler + noktalama → kabul, kelime doğruluğu korunur ──
def t_same_words_accepted():
    old_text = ' '.join(t for _, _, t in _bad_region())
    new_text = ' '.join(('kelime%d x y iki.' % i) for i in range(100))

    class M:
        def transcribe(self, piece, **kw):
            toks = new_text.split()
            return iter([_mk_seg(2.0, ' '.join(toks[:120])),
                         _mk_seg(20.0, ' '.join(toks[120:]))]), None

    out, _w, fixed, _kw = _run(_bad_region(), M())
    old_overlap = _word_overlap(old_text, ' '.join(t for _, _, t in out))
    check('aynı-kelime: kabul edildi', fixed == 1, fixed)
    check('aynı-kelime: noktalama kazandı',
          T.punctuation_ratio(out) > T.punctuation_ratio(_bad_region()) + 0.01)
    check('aynı-kelime: kelime doğruluğu ≥0.9', old_overlap >= 0.9, old_overlap)


# ── 2) Ağır kelime kayması + noktalama → RED (kelime doğruluğu korunur) ──
def t_word_drift_rejected():
    # Yeniden çeviri tamamen farklı içerik üretiyor ama noktalı —
    # eski kelimeler korunmalı (kurtarma kelime doğruluğunu düşürmemeli).
    class M:
        def transcribe(self, piece, **kw):
            words = 'tamamen farklı cümle hiç benzemiyor asla.'
            return iter([_mk_seg(2.0, (words + ' ') * 25)]), None

    bad = _bad_region()
    out, _w, fixed, _kw = _run(bad, M())
    check('kelime-drift: reddedildi', fixed == 0, fixed)
    check('kelime-drift: eski bloklar korundu', out == bad, len(out))


# ── 3) Küçük kelime düzeltmesi (~%92 aynı) → kabul ──
def t_minor_drift_accepted():
    # Aynı kelimeler, birkaçı değişik + noktalama — meşru küçük düzeltme kabul.
    base = [('kelime%d x y iki' % i) for i in range(100)]
    changed = [('KELIME%d x y iki.' % i) if i % 12 == 0 else (base[i] + '.')
               for i in range(100)]
    new_text = ' '.join(changed)

    class M:
        def transcribe(self, piece, **kw):
            return iter([_mk_seg(2.0, new_text)]), None

    out, _w, fixed, _kw = _run(_bad_region(), M())
    check('küçük-drift: kabul edildi', fixed == 1, fixed)


# ── 4) WhisperX uyarlaması (_WxSegment) aynı yoldan geçer ──
def t_whisperx_segments():
    bad = _bad_region()
    text = ' '.join('kelime%d x y iki.' % i for i in range(100))
    toks = text.split()
    wx = T._WxSegment(2.0, 2.0 + 0.1 * len(toks), text,
                      [T._WxWord(' ' + w, 2.0 + i * 0.1, 2.0 + i * 0.1 + 0.09, 0.9)
                       for i, w in enumerate(toks)])

    class M:
        def transcribe(self, piece, **kw):
            return iter([wx]), T._WxInfo('en', 0.9, 6.0)

    out, _w, fixed, _kw = _run(bad, M())
    check('whisperx: hatasız geçti', fixed == 1, fixed)


# ── 5) Ayarlar: bağlam kapalı zorlanır + prompt primerı eklenir ──
def t_settings_contract():
    class M:
        def transcribe(self, piece, **kw):
            return iter([_mk_seg(2.0, 'Bir. İki. Üç.')]), None

    _o, _w, fixed, kw = _run(_bad_region(), M())
    check('ayar: condition_on_previous_text=False', kw.get('condition_on_previous_text') is False,
          kw.get('condition_on_previous_text'))
    ip = kw.get('initial_prompt', '')
    check('ayar: kullanıcı prompt korunur', 'Kılıç' in ip, ip)
    check('ayar: noktalama primerı sona eklenir', 'properly punctuated' in ip, ip)


# ── 6) Kelime listesi de aynı bekçiden geçer ──
def t_words_guarded():
    bad = _bad_region()
    old_words = [{'word': ' kelime%d' % i, 'start': i, 'end': i + 0.1, 'probability': 0.9}
                 for i in range(100)]

    class M:
        def transcribe(self, piece, **kw):
            # noktalı metin ama kelime zaman damgaları tamamen farklı içerik
            seg = _mk_seg(2.0, 'Kelime var. Burada nokta var.')
            seg = Seg(start=seg.start, end=seg.end, text=seg.text,
                      words=[Wd(word=' alakasiz%d' % i, start=2.0 + i * 0.1,
                                end=2.0 + i * 0.1 + 0.09, probability=0.9)
                             for i in range(40)],
                      avg_logprob=-0.1, no_speech_prob=0.0)
            return iter([seg]), None

    _o, words, fixed, _kw = _run(bad, M(), all_words=old_words)
    check('kelime-listesi: eski kelimeler korundu',
          all(w['word'].strip().startswith('kelime') for w in words), words[:3])


if __name__ == '__main__':
    t_same_words_accepted()
    t_word_drift_rejected()
    t_minor_drift_accepted()
    t_whisperx_segments()
    t_settings_contract()
    t_words_guarded()
    print()
    if FAILS:
        print('%d BAŞARISIZ:' % len(FAILS), FAILS)
        sys.exit(1)
    print('Tüm değerlendirme senaryoları GEÇTİ')
