"""Altın EN→TR korpusu: kategori bazlı deterministik kalite/maliyet metriği.

Korpus (golden-corpus-tr.json) bu proje için elle yazılmış sentetik çiftlerdir;
üçüncü taraf altyazı içermez. Her kategori ayrı ölçülür: kapıya takılmadan geçen
altın çiftler (yanlış-pozitif 0 beklenir) ve bozuk çevirilerde hangi kusurun
hangi katmanda yakalandığı (bloklayan / danışman / yapısal / özel / yok).

Bu test bir sağlayıcı kalite iddiası DEĞİLDİR: mock sağlayıcı korpus cevabını
döndürür; ölçülen şey üretim hattının (llm_translate) doğru çeviriyi kabul
edip etmeyeceği ve hatalı çeviride hangi katmanın devreye girdiğidir.
"""

import json
import re
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402
from sentence_translation import (  # noqa: E402
    sentence_part_boundary_issue,
    sentence_groups,
    pack_sentence_groups,
    translation_meaning_issues,
    translation_blocking_issues,
)

CORPUS = json.loads((Path(__file__).parent / 'golden-corpus-tr.json')
                    .read_text(encoding='utf-8'))
ENTRIES_SPEC = CORPUS['entries']


class _Args:
    """llm_translate için en az ayar (test_transcribe._TrArgs ile aynı kalıp)."""
    def __init__(self, **kw):
        self.translate_api_key = 'sk-test'
        self.translate_base_url = 'https://api.example.com'
        self.translate_to = 'tr'
        self.translate_model = 'golden-mock'
        self.translate_workers = 1
        self.translate_register = 'documentary'
        self.translate_profanity = 'keep'
        self.translate_refine = False
        self.translate_context = 4
        self.max_cps = 20
        self.max_line_width = 42
        self.glossary = ''
        self.translate_cache = False   # korpus koşusu önbelleği kirletmesin
        self.cache_dir = None
        self.input = 'golden-corpus'
        self.__dict__.update(kw)


def corpus_cues(entries=ENTRIES_SPEC):
    """Korpus girdilerini (start, end, text) cue listesine açar."""
    cues, owners = [], []
    for entry in entries:
        parts = entry.get('parts')
        if parts:
            span = float(entry['end']) - float(entry['start'])
            step = span / len(parts)
            for i, part in enumerate(parts):
                cues.append((float(entry['start']) + i * step,
                             float(entry['start']) + (i + 1) * step, part['source']))
                owners.append((entry, i))
        else:
            cues.append((float(entry['start']), float(entry['end']), entry['source']))
            owners.append((entry, 0))
    return cues, owners


def answer_map(entries, field='target'):
    """(kaynak cümle, grup başlangıç saati) -> (tam çeviri, [parça başına hedef]).

    'Right.' gibi aynı kaynak metin iki kez geçebilir; sentence_groups satırı
    `start` taşır — mock sağlayıcı onunla ayırt eder. Bu ayrım üründeki
    bağlam-bazlı cache anahtarının mecburi karşılığıdır.
    """
    out = {}
    for entry in entries:
        parts = entry.get('parts')
        key = ' '.join(p['source'] for p in parts) if parts else entry['source']
        if parts:
            if field == 'target':
                whole = ' '.join(p['target'] for p in parts)
                out[(key, float(entry['start']))] = (whole, [p['target'] for p in parts])
            else:
                defect_parts = entry.get('defect_parts') or [p['target'] for p in parts]
                out[(key, float(entry['start']))] = (' '.join(defect_parts), defect_parts)
        else:
            text = entry[field] if field != 'defect' else entry.get('defect', entry['target'])
            out[(key, float(entry['start']))] = (text, [text])
    return out


def fake_openai(answers, calls):
    """Sağlayıcı: items/sentences protokolünde korpus cevabı döndürür."""

    class _Client:
        def __init__(self, *a, **k):
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=self._create))

        def _create(self, model=None, messages=None, **_kw):
            payload = json.loads(messages[1]['content'])
            calls.append(payload)
            items = {item['i']: item for item in payload['items']}
            reply_items, reply_sentences = {}, {}
            for row in payload['sentence_groups']:
                ids = row['ids']
                whole_key = (row['source'], float(row['start']))
                if whole_key not in answers:
                    raise AssertionError(f'corpus dışı kaynak istekte: {whole_key!r}')
                whole, parts = answers[whole_key]
                for pos, part in zip(ids, parts):
                    reply_items[str(pos)] = part
                reply_sentences[str(ids[0])] = whole
            body = json.dumps({'items': reply_items, 'sentences': reply_sentences},
                              ensure_ascii=False)
            return types.SimpleNamespace(
                choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=body))])

    fake = types.ModuleType('openai')
    import importlib.machinery
    fake.OpenAI = _Client
    fake.__spec__ = importlib.machinery.ModuleSpec('openai', None)
    return fake


def run_translate(answers):
    calls = []
    real = sys.modules.get('openai')
    sys.modules['openai'] = fake_openai(answers, calls)
    try:
        warns, status = [], {}
        out = T.llm_translate(CUES, _Args(), warns, source_lang='en', status_out=status)
    finally:
        if real is not None:
            sys.modules['openai'] = real
        else:
            sys.modules.pop('openai', None)
    return out, warns, status, calls


CUES, OWNERS = corpus_cues()
GOLDEN = answer_map(ENTRIES_SPEC, 'target')
DEFECT = answer_map(ENTRIES_SPEC, 'defect')


# --- kategori denetleyicileri (deterministik, özel adlar için liste-bazlı) ----

_STOPWORDS = {'Dr', 'Mr', 'Mrs', 'Ms', 'Flight', 'Room', 'Route', 'Gate',
              'January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December',
              'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
              'Saturday', 'Sunday', 'The', 'A', 'An', 'I'}


def names_missing(source, target, names, name_map=None):
    if names is None:
        names = [tok for tok in re.findall(r'\b[A-ZÇĞİÖŞÜ][\wçğıöşü\'-]*', source)
                 if tok not in _STOPWORDS]
        names = names[1:] if names and source.lstrip().startswith(names[0]) else names
    expected = [(name_map or {}).get(name, name) for name in names]
    return [name for name, form in zip(names, expected) if form not in target]


def register_missing(target, markers):
    # Markerlar regex'tir: 'misin\b' gibi kelime-sonu sınırı 'misiniz' ile çakışmaz.
    return [m for m in (markers or []) if not re.search(m, target)]


def sdh_missing(source, target):
    missing = []
    if re.search(r'\[[^\]]+\]', source) and not re.search(r'\[[^\]]+\]', target):
        missing.append('bracket')
    if re.search(r'\([^)]+\)', source) and not re.search(r'\([^)]+\)', target):
        missing.append('paren')
    if '♪' in source and '♪' not in target:
        missing.append('music')
    speaker = re.match(r'^\s*([A-ZÇĞİÖŞÜ]{2,})\s*:', source)
    if speaker and not re.match(r'^\s*[^\s:]{1,20}:', target):
        missing.append('speaker')
    return missing


def budget_overflow(text, entry, args):
    start, end = float(entry['start']), float(entry['end'])
    budget = T.translation_char_budget((start, end, ''), args)
    return len(text) - budget


def detect(entry, which):
    """which='target'|'defect' -> bu girişin o sürümünü yakalayan denetim seti."""
    text = entry.get(which) if which == 'target' else entry.get('defect', entry.get('target'))
    found = set()
    source_text = entry.get('source') or ' '.join(p['source'] for p in entry['parts'])
    if entry.get('parts'):
        parts = [p['target'] for p in entry['parts']] if which == 'target' \
            else entry.get('defect_parts', [p['target'] for p in entry['parts']])
        if sentence_part_boundary_issue([p['source'] for p in entry['parts']], parts):
            found.add('boundary')
        joined_target = ' '.join(parts)
    else:
        joined_target = text
    if translation_blocking_issues(source_text, joined_target):
        found.add('blocking')
    if translation_meaning_issues(source_text, joined_target):
        found.add('meaning')
    if entry.get('names') is not None or entry['category'] == 'proper_names':
        if names_missing(source_text, joined_target, entry.get('names'), entry.get('name_map')):
            found.add('names')
    if entry.get('register_markers'):
        if register_missing(joined_target, entry['register_markers']):
            found.add('register')
    if entry['category'] == 'sdh':
        if sdh_missing(source_text, joined_target):
            found.add('sdh')
    if entry['category'] == 'cps_budget' and budget_overflow(joined_target, entry, _Args()) > 0:
        found.add('budget')
    return found


class GoldenCorpusTests(unittest.TestCase):
    def test_corpus_shape(self):
        self.assertGreaterEqual(len(ENTRIES_SPEC), 50)
        cats = {e['category'] for e in ENTRIES_SPEC}
        for needed in ('proper_names', 'numbers', 'negation', 'pronouns',
                       'address_register', 'sentence_boundary', 'sdh',
                       'cps_budget', 'context', 'modal', 'currency', 'unit', 'date'):
            self.assertIn(needed, cats)

    def test_golden_targets_never_flagged(self):
        """Altın çiftler hiçbir deterministik denetimde işaretlenemez (yanlış pozitif=0)."""
        false_positives = []
        for entry in ENTRIES_SPEC:
            found = detect(entry, 'target')
            if found:
                false_positives.append((entry['id'], sorted(found)))
        self.assertEqual(false_positives, [])

    def test_defects_detected_at_declared_layer(self):
        """Her bozuk varyant beyan edilen katmanda yakalanır; 'none' dürüst boşluk."""
        per_category = {}
        undetected = []
        for entry in ENTRIES_SPEC:
            if 'defect' not in entry and 'defect_parts' not in entry:
                continue
            cat = entry['category']
            found = detect(entry, 'defect')
            per_category.setdefault(cat, [0, 0])
            per_category[cat][0] += 1
            expected = entry.get('detection', 'none')
            if expected in found:
                per_category[cat][1] += 1
            elif expected not in ('none', 'context'):
                undetected.append((entry['id'], expected, sorted(found)))
        print('\n--- Altın korpus kusur-tekilleme metriği ---')
        for cat, (total, caught) in sorted(per_category.items()):
            print(f'  {cat}: {caught}/{total} kusur yakalandı')
        self.assertEqual(undetected, [],
                         f'beyan edilen katmanda yakalanamayanlar: {undetected}')

    def test_context_separates_identical_sources(self):
        """Aynı kaynak metin farklı bağlamda ayrı cache anahtarı almalı."""
        args = _Args()
        ctx = [e for e in ENTRIES_SPEC if e['category'] == 'context' and 'context_before' in e]
        self.assertGreaterEqual(len(ctx), 4)
        keys = {}
        for entry in ctx:
            key = T.translate_cache_key(entry['source'], args, 'tr', 'en',
                                        entry['context_before'], entry.get('context_after'))
            self.assertNotIn(key, keys.values(),
                             f'{entry["id"]} aynı anahtarı paylaşmamalı')
            keys[entry['id']] = key
        same_source = [e for e in ctx if e['source'] == 'Right.']
        self.assertEqual(len(same_source), 2)
        key_a = T.translate_cache_key('Right.', args, 'tr', 'en', ['Which way at the fork?'], [])
        key_b = T.translate_cache_key('Right.', args, 'tr', 'en', ['The lift is jammed again.'], [])
        self.assertNotEqual(key_a, key_b)
        self.assertEqual(key_a,
                         T.translate_cache_key('Right.', args, 'tr', 'en', ['Which way at the fork?'], []),
                         'aynı metin + aynı bağlam aynı anahtarı üretmeli')

    def test_full_pipeline_accepts_golden(self):
        """Gerçek llm_translate: mock sağlayıcı altın cevapları döndürür → 0 ret."""
        out, warns, status, calls = run_translate(GOLDEN)
        self.assertIsNotNone(out)
        self.assertEqual(len(out), len(CUES))
        mismatches = []
        for i, (entry, part_idx) in enumerate(OWNERS):
            expected = (entry['parts'][part_idx]['target'] if entry.get('parts')
                        else entry['target'])
            if out[i][2] != expected:
                mismatches.append((entry['id'], out[i][2], expected))
        self.assertEqual(mismatches, [])
        groups = sentence_groups(CUES)
        expected_calls = len(pack_sentence_groups(groups, 20))
        self.assertEqual(len(calls), expected_calls,
                         'sağlayıcıya tam chunk sayısı kadar istek gitmeli')

    def test_defect_pass_blocking_and_boundary_only(self):
        """Bozuk çevirilerde yalnız sert kapılar bloke eder; diğerleri geçer (dürüst)."""
        out, warns, status, calls = run_translate(DEFECT)
        self.assertIsNotNone(out)
        golden_calls = len(pack_sentence_groups(sentence_groups(CUES), 20))
        blocked_ids = set()
        passed_defects = set()
        for i, (entry, part_idx) in enumerate(OWNERS):
            source = (entry['parts'][part_idx]['source'] if entry.get('parts')
                      else entry['source'])
            defect = (entry.get('defect_parts', [])[part_idx] if entry.get('parts')
                      else entry.get('defect'))
            if defect is None:
                continue
            if out[i][2] == defect:
                passed_defects.add(entry['id'])
            elif out[i][2] == source:
                blocked_ids.add(entry['id'])
            else:
                self.fail(f'{entry["id"]}: beklenmeyen çıktı {out[i][2]!r}')
        expected_blocked = {e['id'] for e in ENTRIES_SPEC
                            if e.get('detection') in ('blocking', 'boundary')
                            and (e.get('defect') or e.get('defect_parts'))}
        expected_pass = {e['id'] for e in ENTRIES_SPEC
                         if e.get('detection') not in ('blocking', 'boundary')
                         and e.get('defect')}
        self.assertEqual(blocked_ids, expected_blocked,
                         f'sert kapı dışında bloklananlar: {blocked_ids - expected_blocked}; '
                         f'bloklanması beklenen ama geçenler: {expected_blocked - blocked_ids}')
        self.assertEqual(passed_defects, expected_pass,
                         'danışman katman kusurları çıktıya geçer (belgelenen davranış)')
        groups_blocked = len(expected_blocked)
        self.assertEqual(len(calls), golden_calls + groups_blocked,
                         'bloklanan her grup tek seferlik kurtarma isteği üretmeli')


if __name__ == '__main__':
    unittest.main()
