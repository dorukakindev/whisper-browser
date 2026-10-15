import array
import math
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import wave

import voice_reference as ref


class VoiceReferenceTests(unittest.TestCase):
    def test_range(self):
        self.assertEqual(ref.validate_range(5, 25), 20)
        for start, end in [(5, 4), (-1, 5), (0, 31), (0, float('nan')), (0, 2), (0, float('inf'))]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                ref.validate_range(start, end)

    def test_actual_selected_audio_interval(self):
        ffmpeg = str(Path(__file__).parent / 'bin' / 'ffmpeg.exe') if sys.platform == 'win32' else shutil.which('ffmpeg')
        self.assertTrue(ffmpeg and Path(ffmpeg).is_file(), 'ffmpeg is required for the selected-interval regression')
        with tempfile.TemporaryDirectory(prefix='referans-Türkçe-') as directory:
            source, output = Path(directory) / 'kaynak.wav', Path(directory) / 'seçilen.wav'
            samples = array.array('h', (int(6000 * math.sin(2 * math.pi * (220 if i < 80000 else 440 if i < 400000 else 880) * i / 16000)) for i in range(480000)))
            with wave.open(str(source), 'wb') as audio:
                audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(16000); audio.writeframes(samples.tobytes())
            ref.extract_clip(str(source), 5, 25, output, ffmpeg)
            with wave.open(str(output), 'rb') as audio:
                self.assertEqual(audio.getnchannels(), 1)
                self.assertAlmostEqual(audio.getnframes() / audio.getframerate(), 20, places=2)
                frames = array.array('h', audio.readframes(audio.getframerate()))
            crossings = sum(a <= 0 < b for a, b in zip(frames, frames[1:]))
            self.assertAlmostEqual(crossings, 440, delta=2)

    def test_matching_transcript_and_device(self):
        for gpu in (0, 1):
            with self.subTest(gpu=gpu), tempfile.TemporaryDirectory() as directory:
                calls = []
                class Model:
                    def __init__(self, *args, **kwargs):
                        calls.append(kwargs)
                    def transcribe(self, source, **kwargs):
                        calls.append(kwargs)
                        return iter([types.SimpleNamespace(text='Matching speech.')]), None
                modules = {'ctranslate2': types.SimpleNamespace(get_cuda_device_count=lambda: gpu),
                           'faster_whisper': types.SimpleNamespace(WhisperModel=Model)}
                transcript = Path(directory) / 'reference.txt'
                with patch.dict(sys.modules, modules):
                    ref.transcribe_reference('selected.wav', transcript)
                self.assertEqual(calls[0]['device'], 'cuda' if gpu else 'cpu')
                self.assertTrue(calls[1]['vad_filter'])
                self.assertEqual(transcript.read_text(encoding='utf-8'), 'Matching speech.')


if __name__ == '__main__':
    unittest.main()
