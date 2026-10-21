import ast
import asyncio
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_lifecycle import EngineStalled
from dub_resume import recover_completed
from dub_timing import build_adaptive_timeline


class Resume(unittest.TestCase):
    def wrapper(self):
        script=Path(__file__).resolve().parents[1]/'tools/voxcpm2/altyazi_oku.py'
        function=next(n for n in ast.parse(script.read_text(encoding='utf-8')).body
                      if isinstance(n,ast.FunctionDef) and n.name=='generate_with_fallback')
        scope={'asyncio':asyncio}
        exec(compile(ast.Module(body=[function],type_ignores=[]),str(script),'exec'),scope)
        return scope['generate_with_fallback']

    def test_two_stalls_export_completed_speech_with_explicit_missing_group(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp); paths=[folder/'good.wav',folder/'missing.wav']
            voice=(np.sin(np.arange(8000)*.1)*.1).astype('float32')
            sf.write(paths[0],voice,8000)
            paths[0].with_suffix('.json').write_text(json.dumps({'status':'ready','text':'İlk cümle.', 'verification':{'status':'passed'}}))
            before=paths[0].read_bytes()
            args=SimpleNamespace(eszamanli=4,report_dir=folder,group_keys=['1','2'],force_groups=set())
            cues=[(0,1000,'İlk cümle.'),(1100,2100,'Eksik cümle.')];calls=[]
            async def stalled(*_): calls.append(True);raise EngineStalled('fixture')
            with contextlib.redirect_stdout(io.StringIO()):
                sr=self.wrapper()(args,cues,paths,'',stalled)
            self.assertEqual(len(calls),2)
            self.assertEqual(paths[0].read_bytes(),before)
            self.assertEqual([r['status'] for r in args.group_results],['ready','failed'])
            self.assertFalse((folder/'missing.wav').exists(),'missing speech must stay retryable')
            wav,timing,sync=build_adaptive_timeline(cues,paths,sr,2.1,1,folder)
            self.assertGreater(np.max(np.abs(wav)),.09)
            self.assertAlmostEqual(sync['audioDuration'],2.1,places=3)
            self.assertEqual(len(timing['groups']),2)

    def test_all_missing_is_not_fake_success_and_cancel_never_salvages(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp); paths=[folder/'absent.wav']; cues=[(0,1000,'Eksik.')]
            args=SimpleNamespace(eszamanli=1,report_dir=folder,group_keys=['1'],force_groups=set())
            self.assertIsNone(recover_completed(args,cues,paths))
            async def cancel(*_):raise asyncio.CancelledError()
            with self.assertRaises(asyncio.CancelledError):self.wrapper()(args,cues,paths,'',cancel)
            self.assertFalse(list(folder.glob('unfinished*')))

    def test_failed_forced_regeneration_keeps_old_text_for_actual_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp); path=folder/'old.wav';sf.write(path,np.ones(8000)*.1,8000)
            path.with_suffix('.json').write_text(json.dumps({'status':'ready','text':'Eski sesin metni.', 'verification':{'status':'passed'}}))
            args=SimpleNamespace(group_keys=['1'],force_groups={'1'},report_dir=folder)
            with contextlib.redirect_stdout(io.StringIO()):recover_completed(args,[(0,1000,'Yeni metin.')],[path])
            self.assertEqual(args.group_results[0]['text'],'Eski sesin metni.')
            self.assertEqual(args.group_results[0]['status'],'review')
            self.assertTrue(args.group_results[0]['regenerationFailed'])


if __name__=='__main__':unittest.main()
