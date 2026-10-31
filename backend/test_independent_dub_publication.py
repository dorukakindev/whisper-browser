"""Execute the real model-free publication tail with real WAVs and fault injection."""
import ast
import hashlib
import json
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'voxcpm2'))
sys.path.insert(0, str(ROOT / 'backend'))
from dub_timeline_storage import DiskTimeline, write_audio, manifest_segments, check_storage
from dub_quality import valid_audio
import pipeline_control as control


def publication_tail():
    tree = ast.parse((ROOT / 'tools' / 'voxcpm2' / 'altyazi_oku.py').read_text(encoding='utf-8'))
    body = next(node.body for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
    start = next(i for i, node in enumerate(body) if isinstance(node, ast.Assign)
                 and any(isinstance(target, ast.Name) and target.id == 'stem' for target in node.targets))
    end = next(i for i in range(start, len(body)) if isinstance(body[i], ast.If)
               and ast.unparse(body[i].test) == 'args.video')
    return compile(ast.Module(body=body[start:end], type_ignores=[]), '<actual-dub-publication>', 'exec')


class PublicationTests(unittest.TestCase):
    def test_large_disk_timeline_streams_exact_length_and_releases_storage(self):
        with tempfile.TemporaryDirectory() as folder:
            storage=DiskTimeline(folder);frames=8000*300
            storage.silence(frames);timeline=storage.finish()
            self.assertTrue(hasattr(timeline,'storage'),'large timeline must remain disk-backed')
            timeline[-8000:]=np.ones(8000,dtype=np.float32)*.2
            self.assertGreater(check_storage(300,8000,folder),frames*4)
            with self.assertRaises(ValueError):check_storage(0,8000,folder)
            target=Path(folder)/'large.wav';write_audio(target,timeline,8000)
            self.assertIsNone(timeline.storage)
            self.assertEqual(sf.info(target).frames,frames)
            with sf.SoundFile(target) as stream:
                stream.seek(frames-8000)
                self.assertTrue(np.allclose(stream.read(),.2,atol=1/32768))

    def fixture(self, folder):
        root = Path(folder); output = root / 'speech.wav'; cached = root / 'cache.wav'
        sf.write(output, np.ones(8000, dtype=np.float32) * .1, 8000)
        sf.write(cached, np.ones(16000, dtype=np.float32) * .2, 8000)
        for suffix in ('.sync.json', '.quality.json', '.manifest.json', '.performance.json'):
            output.with_suffix(suffix).write_text(json.dumps({'old': suffix}), encoding='utf-8')
        phases = types.SimpleNamespace(seconds={}, snapshot=lambda: {'wall_seconds': .1})
        args = types.SimpleNamespace(srt=root / 'input.srt', representative_preview=False, limit=0,
            output=output, gruplama='satir', reference=root / 'reference.wav', no_norm=True,
            verification='strict', group_keys=['1'], range_start=None, phases=phases)
        timing = {'groups': [{'start_seconds': 0, 'after_seconds': 2}]}
        env = dict(args=args, Path=Path, OUTPUT_ROOT=root, voice_label_for=lambda _: 'fixture',
            json=json, time=__import__('time'), sf=sf, sr=8000,
            timeline=np.ones(16000, dtype=np.float32) * .2, sync=None,
            write_audio=write_audio, _install_with_fallback=lambda src, dst: (os.replace(src, dst) or dst),
            public_groups=[{'key': '1', 'status': 'ready', 'text': 'Yeni metin.', 'audioStart': 0, 'audioEnd': 2}],
            groups=[{'start': 0, 'end': 2000, 'source_ids': [1], 'text': 'Yeni metin.'}],
            paths=[cached], cache_keys=['recipe'], cues=[(0, 2000, 'Yeni metin.')], timing=timing,
            valid_audio=valid_audio, manifest_segments=manifest_segments,
            write_manifest=lambda wave, record: wave.with_suffix('.manifest.json').write_text(json.dumps(record), encoding='utf-8'))
        return output, env

    @staticmethod
    def identities(output):
        return {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in output.parent.glob(output.stem + '*') if file.is_file()}

    def test_metadata_failure_keeps_previous_audio_and_sidecars(self):
        for error in (OSError('disk full'), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__), tempfile.TemporaryDirectory() as folder:
                output, env = self.fixture(folder); before = self.identities(output)
                original = Path.write_text
                def fail_quality(path, *args, **kwargs):
                    if path.name.endswith('.quality.json'): raise error
                    return original(path, *args, **kwargs)
                with patch.object(Path, 'write_text', fail_quality), self.assertRaises(type(error)):
                    exec(publication_tail(), env)
                self.assertEqual(self.identities(output), before)

    def test_success_replaces_bundle_and_removes_obsolete_sync_map(self):
        with tempfile.TemporaryDirectory() as folder:
            output, env = self.fixture(folder)
            exec(publication_tail(), env)
            self.assertEqual(sf.info(output).duration, 2)
            self.assertFalse(output.with_suffix('.sync.json').exists())
            self.assertEqual(json.loads(output.with_suffix('.quality.json').read_text())['groups'][0]['text'], 'Yeni metin.')
            record = json.loads(output.with_suffix('.manifest.json').read_text())
            self.assertEqual(record['wav'], output.name)
            self.assertTrue(Path(record['segments'][0]['file']).is_file())
            self.assertEqual(record['segments'][0]['sha256'], hashlib.sha256(Path(record['segments'][0]['file']).read_bytes()).hexdigest())

    def test_cancel_after_replacements_restores_audio_metadata_and_deleted_sync(self):
        with tempfile.TemporaryDirectory() as folder:
            output, env = self.fixture(folder); before = self.identities(output)
            def cancel(stage, point):
                if point == 'after':
                    self.assertEqual(sf.info(output).duration, 2)
                    self.assertFalse(output.with_suffix('.sync.json').exists())
                    raise control.PipelineCancelled(stage, point)
            with patch.object(control, '_CANCELLATION', control.CancellationController(probe=cancel)):
                with self.assertRaises(control.PipelineCancelled): exec(publication_tail(), env)
            self.assertEqual(self.identities(output), before)
            self.assertEqual(list(output.parent.glob('.whisper-output-transaction-*')), [])

    def test_process_death_after_replacements_recovers_old_bundle_and_can_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            output, env = self.fixture(folder); before = self.identities(output)
            script = """import os,sys
from backend.test_independent_dub_publication import PublicationTests,publication_tail,control
output,env=PublicationTests().fixture(sys.argv[1])
def crash(stage,point):
    if point=='after': os._exit(91)
control._CANCELLATION=control.CancellationController(probe=crash)
exec(publication_tail(),env)
"""
            child = subprocess.run([sys.executable, '-c', script, folder], cwd=ROOT, capture_output=True, timeout=20)
            self.assertEqual(child.returncode, 91, child.stderr.decode(errors='replace'))
            self.assertEqual(sf.info(output).duration, 2)
            self.assertEqual(control.recover_output_transactions(output.parent), 1)
            self.assertEqual(self.identities(output), before)
            exec(publication_tail(), env)
            self.assertEqual(sf.info(output).duration, 2)
            self.assertFalse(output.with_suffix('.sync.json').exists())

    def test_new_sync_and_quality_are_consumable_by_actual_scene_reader(self):
        from review_scene import inspect
        with tempfile.TemporaryDirectory() as folder:
            output, env = self.fixture(folder)
            source=output.parent/'input.srt'
            source.write_text('1\n00:00:00,000 --> 00:00:02,000\nA new message.\n',encoding='utf-8')
            env['sync']={'version':1,'videoDuration':2,'audioDuration':2,
                         'segments':[{'v0':0,'v1':2,'a0':0,'a1':2}]}
            exec(publication_tail(),env)
            consumed=inspect(output,source)
            self.assertEqual(consumed['seconds'],2)
            self.assertEqual(consumed['groups'][0]['translation'],'Yeni metin.')
            self.assertEqual(consumed['sync'],env['sync'])
            self.assertFalse(list(output.parent.glob('.dub-output-*')))


if __name__ == '__main__': unittest.main()
