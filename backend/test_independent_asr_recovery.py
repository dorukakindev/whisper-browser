"""Producer-to-output ASR recovery and exact-zero confidence invariants, no model."""
import ast
from contextlib import ExitStack
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
import wave
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T
import pipeline_control as control


def arguments(root):
    tree = ast.parse(Path(T.__file__).read_text(encoding='utf-8'))
    main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
    prefix = []
    for node in main.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'args' for target in node.targets): break
        prefix.append(node)
    scope = dict(T.__dict__)
    exec(compile(ast.Module(body=prefix, type_ignores=[]), '<production-parser>', 'exec'), scope)
    args = scope['parser'].parse_args(['--input', str(root / 'source.wav'), '--output-dir', str(root / 'out'),
        '--cache-dir', str(root / 'cache'), '--device', 'cpu', '--compute-type', 'int8', '--formats', 'json',
        '--fix-timings', 'false', '--snap-to-speech', 'false', '--split-mode', 'none', '--resume', 'true',
        '--fix-common-errors', 'false', '--drop-repeated-hallucinations', 'false', '--confidence-report', 'true'])
    args.scene_context = None
    return args


def audio(path):
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(16000)
        stream.writeframes(b'\0\0' * 64000)


class RecoveryTests(unittest.TestCase):
    def exercise(self, mode):
        with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
            root = Path(folder); args = arguments(root); audio(args.input); events = []
            checkpoint = Path(T._checkpoint_path(args.input, args.cache_dir)); checkpoint.parent.mkdir(parents=True)
            self.assertTrue(T.write_checkpoint(str(checkpoint), T.job_signature(args), [(0, 1, 'Eski güvenli blok.')], 1, detected_language='tr'))
            before = checkpoint.read_bytes()
            class Model:
                def __init__(self, *args, **kwargs): pass
                def transcribe(self, *args, **kwargs):
                    words = [types.SimpleNamespace(start=0., end=1.5, word=' Kapı', probability=0.)]
                    segment = types.SimpleNamespace(start=0., end=2., text='Kapı burada.', words=words,
                        avg_logprob=-.1, no_speech_prob=.01, compression_ratio=1.)
                    return iter([segment]), types.SimpleNamespace(language='tr', language_probability=1., duration=4.)
            fake = types.ModuleType('faster_whisper'); fake.WhisperModel = Model
            stack.enter_context(patch.dict(sys.modules, {'faster_whisper': fake}))
            stack.enter_context(patch.dict(os.environ, {'WHISPER_JOB_TEMP_DIR': str(root / 'owned')}))
            stack.enter_context(patch.object(T, 'find_ffmpeg', return_value='fixture'))
            stack.enter_context(patch.object(T, 'extract_audio', side_effect=lambda _, target, *a, **kw: audio(target)))
            stack.enter_context(patch.object(T, 'check_vram_budget'))
            stack.enter_context(patch.object(T, 'log'))
            stack.enter_context(patch.object(T, 'emit', side_effect=lambda kind, **payload: events.append({'type': kind, **payload})))
            if mode == 'cancel':
                def cancel(stage, point):
                    if stage == 'write' and point == 'after': raise control.PipelineCancelled(stage, point)
                stack.enter_context(patch.object(control, '_CANCELLATION', control.CancellationController(probe=cancel)))
                with self.assertRaises(control.PipelineCancelled): T.transcribe(args)
                self.assertTrue(checkpoint.exists(), 'failed publication must retain the ASR resume checkpoint')
                self.assertEqual(checkpoint.read_bytes(), before)
                self.assertFalse(any(event['type'] == 'done' for event in events))
                self.assertFalse(list((root / 'out').glob('*.json')))
            elif mode == 'writer-error':
                stack.enter_context(patch.object(T, 'write_json', side_effect=OSError('disk full')))
                try:
                    with self.assertRaises(OSError): T.transcribe(args)
                finally: control.rollback_open_output_transactions()
                self.assertEqual(checkpoint.read_bytes(), before)
            else:
                T.transcribe(args)
                done = next(event for event in events if event['type'] == 'done')
                output = next(Path(file) for file in done['files'] if file.endswith('.json'))
                actual = json.loads(output.read_text(encoding='utf-8'))
                self.assertEqual(actual['segments'][0]['words'][0]['probability'], 0.)
                self.assertEqual(done['perf']['lowConfidenceWords'], 1, 'zero probability must not become default confidence 1.0')
                self.assertFalse(checkpoint.exists(), 'successful publication retires resume checkpoint')

    def test_cancel_after_output_replacement_preserves_resume(self): self.exercise('cancel')
    def test_writer_failure_preserves_resume(self): self.exercise('writer-error')
    def test_zero_confidence_survives_export_and_performance_summary(self): self.exercise('success')


if __name__ == '__main__': unittest.main()
