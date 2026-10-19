import argparse
import ast
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_plan as P
import dub_timing as D


class DubEdgeTests(unittest.TestCase):
    def test_simultaneous_cues_have_a_valid_window_in_both_modes(self):
        cues = [(1000, 2000, 'A: Merhaba.'), (1000, 5000, 'B: Ayni anda konusuyorum.')]
        for mode in ('cumle', 'satir'):
            groups = P.make_groups(cues, mode=mode)
            self.assertEqual(len(groups), 1)
            self.assertEqual(groups[0]['source_ids'], [1, 2])
            self.assertIn('A: Merhaba.', groups[0]['text'])
            self.assertIn('B: Ayni anda', groups[0]['text'])
            timeline = [(g['start'], g['end'], g['text']) for g in groups]
            self.assertGreater(D.available_window(timeline, 0), 0)
            start, stop = D.placement_window(timeline, 0, 1, 0, 1)
            self.assertGreater(stop, start)
            with tempfile.TemporaryDirectory() as directory:
                audio = Path(directory) / 'cue.wav'
                D.sf.write(audio, D.np.ones(8000, dtype='float32') * .1, 8000)
                wav, report, sync = D.build_adaptive_timeline(timeline, [audio], 8000, 7, 1, directory)
                self.assertGreater(len(wav), 0)
                self.assertEqual(report['clipped_groups'], 0)
                self.assertGreater(sync['segments'][0]['v1'], sync['segments'][0]['v0'])

    def test_direct_parse_and_group_generation_enforce_plan_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'large.srt'
            source.write_bytes(b'x' * (P.MAX_SOURCE_BYTES + 1))
            with self.assertRaisesRegex(ValueError, 'buyuk'):
                P.parse_srt(source)
            with self.assertRaisesRegex(ValueError, 'buyuk'):
                P.parse_srt(source, b'x' * (P.MAX_SOURCE_BYTES + 1))
        with self.assertRaisesRegex(ValueError, 'grup'):
            P.make_groups([(i * 2000, i * 2000 + 1000, 'text') for i in range(P.MAX_GROUPS + 1)], mode='satir')

    def test_cold_start_wait_is_configurable_and_bounded(self):
        source = Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2' / 'altyazi_oku.py'
        parse = next(n for n in ast.parse(source.read_text(encoding='utf-8')).body
                     if isinstance(n, ast.FunctionDef) and n.name == 'parse_args')
        scope = {'Path': Path, 'argparse': argparse}
        exec(compile(ast.Module(body=[parse], type_ignores=[]), str(source), 'exec'), scope)
        with tempfile.TemporaryDirectory() as directory:
            srt, ref = Path(directory) / 'file.srt', Path(directory) / 'voice.wav'
            srt.touch(); ref.touch()
            with patch.dict(sys.modules, {'kitap_voxcpm': SimpleNamespace(DEFAULT_REFERENCE=ref)}):
                self.assertEqual(scope['parse_args']([str(srt), str(ref)]).ready_timeout, 300)
                self.assertEqual(scope['parse_args']([str(srt), str(ref), '--hazir-timeout', '600']).ready_timeout, 600)
                with self.assertRaises(SystemExit):
                    scope['parse_args']([str(srt), str(ref), '--ready-timeout', '9999'])


if __name__ == '__main__':
    unittest.main()
