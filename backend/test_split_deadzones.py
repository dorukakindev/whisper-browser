# -*- coding: utf-8 -*-
"""R334 — kapsam-haritası ölü bölgeleri birim testleri.

coverage.py haritasında hiç yürütülmeyen saf fonksiyonlar:
  - split_segment_by_timing      (noktalamasız segment → duraksama bölme)
  - split_segment_by_punctuation (split_mode='smart' eski agresif bölme)
  - find_unpunctuated_spans      (noktalama çöküşü bölge tespiti)
  - recover_punctuation_collapse (stub model + stub _cut_wav ile)

Kural: hiçbir test ağ/GPU/ffmpeg gerektirmez; model ve _cut_wav patch'lenir.
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402

W = types.SimpleNamespace


def words(seq):
    """[(metin, start, end), ...] → kelime nesneleri listesi."""
    return [W(word=t, start=s, end=e) for t, s, e in seq]


def seg(text, wds, start=0.0, end=10.0):
    return W(text=text, words=wds, start=start, end=end)


def flat(chunks):
    return [(s, e, t) for (s, e, t) in chunks]


PASS = []


def check(name, cond, detail=''):
    if cond:
        PASS.append(name)
        print('  PASS', name)
    else:
        raise AssertionError(f'{name} {detail}')


# ───────────────────────── split_segment_by_timing ─────────────────────────

def t_timing_big_pause():
    # 30+ karakter sonra ≥min_gap duraksama → böl
    wds = words([('hello', 0.0, 0.5), ('world', 0.5, 1.0), ('this', 1.0, 1.5),
                 ('is', 1.5, 1.8), ('a', 1.8, 1.9), ('fairly', 1.9, 2.4),
                 ('long', 2.4, 2.9), ('sentence', 2.9, 3.5),
                 ('second', 5.0, 5.5), ('part', 5.5, 6.0)])
    # 'sentence'→'second' arası 1.5sn ≥ min_gap=0.5 ve current_chars>30
    out = flat(T.split_segment_by_timing(seg('x ' * 20, wds), min_gap=0.5))
    check('timing: büyük duraksama böler', len(out) == 2, out)
    check('timing: sınır doğru', out[0][0] == 0.0 and out[0][1] == 3.5
          and out[1][0] == 5.0, out)


def t_timing_conjunction():
    # Bağlaç eşiği: gap ≥ 0.6*min_gap + sonraki kelime bağlaç + ≥50 karakter
    toks = [('word%d' % i, i * 0.4, i * 0.4 + 0.4) for i in range(12)]
    # 12 kelime × ~5-6 karakter = ~66 karakter; sonra 0.4sn boşluk + 'and'
    wds = words(toks + [('and', 12 * 0.4 + 0.4, 12 * 0.4 + 0.8),
                        ('more', 12 * 0.4 + 0.8, 12 * 0.4 + 1.3),
                        ('stuff', 12 * 0.4 + 1.3, 12 * 0.4 + 1.8)])
    # 'word11'→'and' gap = 0.4 ≥ 0.3 (0.6*0.5); önce ~65 karakter ≥ 50
    out = flat(T.split_segment_by_timing(seg('x', wds), min_gap=0.5))
    check('timing: bağlaç-duraksaması böler', len(out) == 2, out)


def t_timing_hard_limit():
    toks = [('abcdefghij', i * 0.5, i * 0.5 + 0.4) for i in range(25)]
    out = flat(T.split_segment_by_timing(seg('x', words(toks)),
                                         min_gap=5.0, hard_max_chars=60))
    check('timing: hard_max_chars böler', len(out) >= 3, out)
    check('timing: parçalar metni korur',
          ''.join(t for _, _, t in out).replace(' ', '')
          .startswith('abcdefghij'), out)


def t_timing_max_words():
    toks = [('ab', i * 0.3, i * 0.3 + 0.25) for i in range(50)]
    out = flat(T.split_segment_by_timing(seg('x', words(toks)), min_gap=5.0,
                                         target_chars=20, max_words=10))
    check('timing: max_words+target böler', len(out) >= 2, out)


def t_timing_passthrough():
    out = flat(T.split_segment_by_timing(seg('no words', None, 1.0, 4.0)))
    check('timing: words=None passthrough', out == [(1.0, 4.0, 'no words')], out)


def t_timing_none_times():
    # start/end None olan kelimeler: ilk/son geçerli zaman kullanılır
    wds = [W(word='a', start=None, end=None), W(word='b', start=1.0, end=None),
           W(word='c', start=None, end=2.0)] + \
          [W(word='x%d' % i, start=2.0 + i, end=3.0 + i) for i in range(40)]
    out = flat(T.split_segment_by_timing(seg('x', wds), min_gap=0.1,
                                         hard_max_chars=30))
    check('timing: None-zamanlı kelime çökmez', all(s is not None for s, _, _ in out), out)


# ───────────────────── split_segment_by_punctuation ─────────────────────

def t_punct_sentence_end():
    wds = words([('hello', 0.0, 0.5), ('world.', 0.5, 1.0),
                 ('next', 1.0, 1.5), ('one', 1.5, 2.0)])
    out = flat(T.split_segment_by_punctuation(seg('hello world. next one', wds),
                                              max_chars=10))
    check('punct: cümle sonu böler', len(out) >= 2, out)
    check('punct: ilk parça cümle sonu', out[0][2].endswith('.'), out)


def t_punct_short_passthrough():
    wds = words([('hi', 0.0, 0.5), ('there.', 0.5, 1.0)])
    out = flat(T.split_segment_by_punctuation(seg('hi there.', wds), max_chars=84))
    check('punct: kısa metin passthrough', out == [(0.0, 10.0, 'hi there.')], out)


def t_punct_soft_threshold():
    # virgülle biten kelime + ≥70% doluluk → böl
    toks = [('word%02d' % i, i * 0.4, i * 0.4 + 0.35) for i in range(12)]
    toks[-1] = ('word11,', toks[-1][1], toks[-1][2])
    toks += [('tail', toks[-1][2] + 0.1, toks[-1][2] + 0.5)]
    wds = words(toks)
    # 12×6=72 ≥ 84*0.7=58.8 → virgül tetikler
    out = flat(T.split_segment_by_punctuation(seg(' '.join(t for t, _, _ in toks), wds),
                                              max_chars=84))
    check('punct: soft-eşik virgül böler', len(out) == 2, out)


def t_punct_no_words():
    out = flat(T.split_segment_by_punctuation(seg('x' * 100, None, 0, 5), max_chars=10))
    check('punct: words=None passthrough', out == [(0, 5, 'x' * 100)], out)


# ───────────────────── find_unpunctuated_spans ─────────────────────

def t_spans_detect():
    # 100 kelime noktalama/büyük harf/virgülsüz → çöküş bölgesi
    bad = [(i * 1.0, i * 1.0 + 0.9, 'kelime%d' % i) for i in range(100)]
    spans = T.find_unpunctuated_spans(bad, min_words=80, min_dur=15.0)
    check('spans: çöküş yakalanır', len(spans) == 1 and spans[0] == (0.0, 99.9), spans)


def t_spans_healthy_commas():
    # Aynı uzunluk ama virgüllü → sağlıklı sayılır
    ok = [(i * 1.0, i * 1.0 + 0.9, 'kelime%d, x' % i) for i in range(100)]
    spans = T.find_unpunctuated_spans(ok, min_words=80, min_dur=15.0)
    check('spans: virgüllü sağlıklı', spans == [], spans)


def t_spans_healthy_caps():
    # Büyük harfli bloklar → sağlıklı sayılır
    ok = [(i * 1.0, i * 1.0 + 0.9, 'Kelime%d x' % i) for i in range(100)]
    spans = T.find_unpunctuated_spans(ok, min_words=80, min_dur=15.0)
    check('spans: büyük harfli sağlıklı', spans == [], spans)


def t_spans_short_ignored():
    bad = [(i * 0.1, i * 0.1 + 0.09, 'k%d' % i) for i in range(100)]
    spans = T.find_unpunctuated_spans(bad, min_words=80, min_dur=15.0)
    check('spans: kısa çöküş atlanır', spans == [], spans)


# ───────────────────── recover_punctuation_collapse ─────────────────────

def _stub_common():
    return {'condition_on_previous_text': True, 'initial_prompt': ''}


def _stub_args():
    return types.SimpleNamespace(split_mode='none', timing_gap=0.5,
                                 max_chars=84, hard_max_chars=200)


def _mk_punct_segment(start, text):
    return W(start=start, end=start + 0.9, text=text,
             words=[W(word=' ' + t, start=start + i * 0.15, end=start + i * 0.15 + 0.14,
                      probability=0.9) for i, t in enumerate(text.split())],
             avg_logprob=-0.1, no_speech_prob=0.0)


def t_recover_replaces_span(monkey_tmp):
    # 100 kelimelik noktalamasız bölge (0–100sn), sonrası sağlıklı
    bad = [(i * 1.0, i * 1.0 + 0.9, 'kelime%d x y z' % i) for i in range(100)]
    good = [(100.0, 100.9, 'This is punctuated.'), (101.0, 101.9, 'Another one.')]
    entries = bad + good

    class FakeModel:
        def transcribe(self, piece, **kw):
            # Yeniden çeviri AYNI kelimelerle noktalama DÖNDÜRÜYOR
            # (kelime-doğruluğu bekçisi farklı içeriği reddeder).
            text = ' '.join('kelime%d x y iki.' % i for i in range(100))
            return iter([_mk_punct_segment(2.0, text)]), None

    calls = []
    orig_cut = T._cut_wav
    orig_seg2 = T.segment_to_chunks
    T._cut_wav = lambda src, dst, s, e, ff: calls.append((s, e)) or dst
    # segment_to_chunks args.split_mode='none' → [(start,end,text)]
    try:
        new_entries, new_words, fixed = T.recover_punctuation_collapse(
            list(entries), [], FakeModel(), '/tmp/x.wav', 'ffmpeg',
            _stub_common(), _stub_args(), 'en', 0.0, str(monkey_tmp))
    finally:
        T._cut_wav = orig_cut
        T.segment_to_chunks = orig_seg2

    check('recover: bölge düzeltilir', fixed == 1, fixed)
    check('recover: kesim çağrıldı', len(calls) == 1, calls)
    # Yeni bloklar noktalamalı, eski bloklar bölgeden çıkarılmış
    inside = [t for s, e, t in new_entries if 0 <= (s + e) / 2 <= 100.0]
    check('recover: yeni metin noktalı', any(t.endswith('.') for t in inside), inside)
    check('recover: span-dışı bloklar korunur',
          any('Another one.' in t for _, _, t in new_entries), new_entries)
    # Kapanış cümlesi span sınırına çekilir — eski bloklar yerine yenileri gelir
    check('recover: eski noktalamasız bloklar atılır',
          not any(t.endswith(' iki') for s_, e_, t in new_entries
                  if 0 <= (s_ + e_) / 2 <= 100.0), new_entries[-3:])


def t_recover_no_improvement_keeps_old(monkey_tmp):
    bad = [(i * 1.0, i * 1.0 + 0.9, 'kelime%d x y z' % i) for i in range(100)]

    class SameModel:
        def transcribe(self, piece, **kw):
            return iter([_mk_punct_segment(2.0, 'kelime var burada nokta yok')]), None

    orig_cut = T._cut_wav
    T._cut_wav = lambda src, dst, s, e, ff: dst
    try:
        new_entries, _w, fixed = T.recover_punctuation_collapse(
            list(bad), [], SameModel(), '/tmp/x.wav', 'ffmpeg',
            _stub_common(), _stub_args(), 'en', 0.0, str(monkey_tmp))
    finally:
        T._cut_wav = orig_cut
    check('recover: iyileşme yoksa eski korunur', fixed == 0 and new_entries == bad,
          (fixed, len(new_entries)))


def t_recover_boundary_no_duplicate(monkey_tmp):
    # Sınır bandı [span_start-0.25, span_start): yeniden çeviri run-up'tan
    # blok üretir (PAD=2sn) — kabul penceresi eski-blok silme penceresinden
    # ±0.25sn geniş. Band'da merkezi olan eski blok hayatta kalır VE yenisi
    # eklenirse aynı saniyede iki farklı altyazı üst üste biner (mükerrer).
    # Geometri: span 50–150; eski komşu [49.4, 50.3] merkez 49.85 < 50 → hayatta;
    # yeniden çeviri parça-içi [1.5, 2.0] → orijinal [49.5, 50.0] merkez 49.75
    # → kabul bandı içinde → ÇAKIŞMA.
    bad = [(50.0 + i, 50.9 + i, 'kelime%d x y z' % i) for i in range(100)]
    neighbor = (49.4, 50.3, 'Boundary neighbor stays.')
    entries = [neighbor] + bad

    class EdgeModel:
        def transcribe(self, piece, **kw):
            return iter([_mk_punct_segment(1.5, 'Re-transcribed edge.')]), None

    orig_cut = T._cut_wav
    T._cut_wav = lambda src, dst, s, e, ff: dst
    try:
        out, _w, fixed = T.recover_punctuation_collapse(
            list(entries), [], EdgeModel(), '/tmp/x.wav', 'ffmpeg',
            _stub_common(), _stub_args(), 'en', 0.0, str(monkey_tmp),
            min_words=80)
    finally:
        T._cut_wav = orig_cut

    # Asıl kilit: yeniden çeviri hayatta kalan blokla çakışmamalı —
    # 'Re-transcribed edge.' düşürülmüş olmalı (eski metin korunur).
    band = [(s, e, t) for s, e, t in out if s < 51.0]
    check('recover: sınır bandı mükerrer üretmez',
          not any('Re-transcribed' in t for _, _, t in band), band)


if __name__ == '__main__':
    import tempfile
    tmp = tempfile.mkdtemp(prefix='splitdz_')
    fns = [v for k, v in sorted(globals().items())
           if k.startswith('t_') and callable(v)]
    fails = []
    for f in fns:
        try:
            if f.__name__.startswith('t_recover'):
                f(tmp)
            else:
                f()
        except AssertionError as e:
            fails.append((f.__name__, e))
            print('  FAIL', f.__name__, e)
    print(f'\n{len(PASS)}/{len(fns)} senaryo geçti' +
          (f' — düşenler: {[n for n, _ in fails]}' if fails else ''))
    sys.exit(1 if fails else 0)
