import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import numpy as np
from music_analysis import analyze


class MusicMeasurements(unittest.TestCase):
    def test_silence_has_no_tempo_and_no_nan(self):
        result = analyze(np.zeros(22050), 11025)
        self.assertTrue(result['silent'])
        self.assertIsNone(result['tempo'])
        self.assertEqual(result['rmsDb'], -96)
        self.assertFalse(result['capabilities']['mood'])
        self.assertTrue(all(p['low'] == p['mid'] == p['high'] == 0 for p in result['points']))

    def test_calibrated_tone_level_and_spectral_band(self):
        sr = 11025
        x = .5 * np.sin(2 * np.pi * 120 * np.arange(sr * 3) / sr)
        result = analyze(x, sr)
        self.assertAlmostEqual(result['rmsDb'], -9.03, places=1)
        self.assertAlmostEqual(result['peakDb'], -6.02, places=1)
        self.assertGreater(result['points'][10]['low'], .99)
        self.assertLess(result['points'][10]['high'], .001)
        self.assertLessEqual(len(result['waveform']), 900)
        self.assertLessEqual(len(result['points']), 600)

    def test_temporal_changes_are_preserved(self):
        sr = 11025
        x = np.concatenate([.3*np.sin(2*np.pi*f*np.arange(sr*3)/sr) for f in [120, 3000]])
        result = analyze(x, sr)
        self.assertGreater(result['points'][10]['low'], .99)
        self.assertGreater(result['points'][-10]['high'], .99)

    def test_reject_short_invalid_and_unbounded(self):
        for x in [np.zeros(100), np.full(22050, np.nan), np.zeros((100, 3)), np.zeros(1802)]:
            with self.assertRaises(ValueError):
                analyze(x, 11025 if len(x) != 1802 else 1)


if __name__ == '__main__':
    unittest.main()
