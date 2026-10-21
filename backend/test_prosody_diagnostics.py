import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from analyze_prosody import measure, analyze, pitch_summary


class ProsodyDiagnostics(unittest.TestCase):
    def test_sparse_pitch_does_not_imply_reliable_voice_statistics(self):
        for frames,span in [(10,8),(23,8),(50,10),(100,0)]:
            summary=pitch_summary(np.full(frames,160),span)
            self.assertFalse(summary['pitch_sufficient'])
            self.assertIsNone(summary['f0_median_hz'])
        result=pitch_summary(np.full(97,160),1)
        self.assertTrue(result['pitch_sufficient'])
        self.assertEqual(result['f0_median_hz'],160)
        self.assertEqual(result['f0_range_90_10_semitones'],0)

    def test_rate_excludes_edge_silence_and_preserves_samples(self):
        sr = 8000
        voice = (.1*np.sin(2*np.pi*160*np.arange(sr)/sr)).astype('float32')
        wav = np.r_[np.zeros(sr),voice,np.zeros(sr)]
        original = wav.copy()
        result = measure(wav, sr, 'Bir iki üç dört.')
        self.assertAlmostEqual(result['speech_span_seconds'], 1)
        self.assertAlmostEqual(result['words_per_second_span'], 4)
        np.testing.assert_array_equal(wav, original)
        self.assertIsNone(measure(np.zeros(sr), sr, 'Sessizlik')['words_per_second_span'])
        with self.assertRaises(ValueError): measure(np.array([np.nan]), sr, 'Hata')

    def test_manifest_cannot_read_outside_its_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'results.json'
            path.write_text(json.dumps({'cases':[{'text':'Merhaba', 'variants':[{'file':'../outside.wav'}]}]}))
            with self.assertRaises(ValueError): analyze(path, Path(folder)/'out.json')
            self.assertFalse((Path(folder)/'out.json').exists())


if __name__ == '__main__': unittest.main()
