import ast
import asyncio
import contextlib
import io
import json
import inspect
from pathlib import Path
import sys
import tempfile
import time
import unittest
import uuid
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'/'voxcpm2'))
import dub_quality as Q
SOURCE = (ROOT/'tools'/'voxcpm2'/'altyazi_oku.py').read_text(encoding='utf-8')

class Report494(unittest.TestCase):
    def test_494_01_manual_lock_changes_real_generated_cache_path(self):
        start=SOURCE.index('    paths = [cache_dir / (chunk_key(group_settings(i), text, seed)')
        end=SOURCE.index('    for p in paths:', start)
        code=inspect.cleandoc(SOURCE[start:end])
        def paths(manual):
            args=SimpleNamespace(auto_fit=True,natural_speech=True,group_keys=['1'],manual_groups=manual,
                group_seeds=[42],bosluk_pay_ms=0,end_limit_ms=None)
            scope=dict(group_settings=lambda i:('fixture',),args=args,cues=[(0,1000,'Original.')],cache_dir=Path('cache'),settings=('fixture',),
                chunk_key=Q.chunk_key,duration_identity=Q.duration_identity,available_window=lambda *a:1)
            exec(code, scope)
            return scope['paths']
        self.assertNotEqual(paths(set()), paths({'1'}))

    def test_494_07_invalid_optional_rewrite_keeps_original_speech(self):
        node=next(n for n in ast.parse(SOURCE).body if isinstance(n,ast.AsyncFunctionDef) and n.name=='rewrite_for_window')
        with tempfile.TemporaryDirectory() as folder:
            def respond(line, **kwargs):
                request=json.loads(line.removeprefix('DUB_REWRITE '))
                (Path(folder)/(request['id']+'.json')).write_text('{torn',encoding='utf-8')
            scope=dict(asyncio=asyncio,uuid=uuid,json=json,time=time,print=respond)
            exec(compile(ast.Module(body=[node],type_ignores=[]),'rewrite','exec'),scope)
            args=SimpleNamespace(rewrite_dir=Path(folder),auto_fit=True,natural_speech=True)
            self.assertEqual(asyncio.run(scope['rewrite_for_window'](args,0,'Original.',1)),'Original.')

    def test_494_08_uppercase_turkish_negation_cannot_disappear(self):
        expected='Burada HİÇ kimse uzun yıllardır böyle bir olayı görmedi ve bütün insanlar bu durumu dikkatle izliyor.'
        self.assertTrue(Q.speech_check(expected,expected.replace('HİÇ ',''))['lost_negation'])
        self.assertFalse(Q.speech_check(expected,expected.replace('HİÇ','hiç'))['lost_negation'])

    def test_494_09_named_place_cannot_change_in_otherwise_similar_speech(self):
        text="Ankara'ya yarın sabah erken saatlerde gideceğiz ve yol boyunca herkes için yeterince mola vereceğiz."
        self.assertTrue(Q.speech_check(text,text.replace('Ankara','İzmir'))['review'])
        self.assertFalse(Q.speech_check(text,text.lower())['review'])

    def test_494_17_nested_source_cue_end_determines_full_output_duration(self):
        line=next(line.strip() for line in SOURCE.splitlines() if line.strip().startswith('total_s = duration or'))
        scope=dict(duration=None,cues=[(0,60000,'Long.'),(10000,11000,'Short.')])
        exec(line,scope)
        self.assertEqual(scope['total_s'],62)

    def test_494_18_torn_cache_metadata_keeps_audio_reviewable_without_crashing(self):
        start=SOURCE.index('    group_results = []\n    failed =')
        end=SOURCE.index('    cues = [(s, e, record.get',start)
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'cache.wav';file.write_bytes(b'valid audio owned separately')
            file.with_suffix('.json').write_text('null',encoding='utf-8')
            scope=dict(args=SimpleNamespace(group_results=[],group_keys=['1']),paths=[file],json=json)
            if hasattr(Q,'cached_record'):scope['cached_record']=Q.cached_record
            exec(inspect.cleandoc(SOURCE[start:end]),scope)
            self.assertEqual(scope['group_results'][0]['status'],'review')
            self.assertEqual(scope['group_results'][0]['verification']['status'],'unavailable')

if __name__=='__main__':unittest.main()
