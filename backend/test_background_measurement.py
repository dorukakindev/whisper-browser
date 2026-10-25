from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from measure_background import measure


class BackgroundMeasurement(unittest.TestCase):
    def test_known_components_are_reported_separately(self):
        t=np.arange(16000)/8000
        voice=.1*np.sin(2*np.pi*130*t);music=.1*np.sin(2*np.pi*220*t)
        result=measure(voice,music,voice*.01+music*.5)
        self.assertAlmostEqual(result['speech_projection_db'],-40,places=4)
        self.assertAlmostEqual(result['music_projection_db'],-6.0206,places=4)
        self.assertLess(result['residual_fraction'],1e-10)
        self.assertTrue(result['listening_required'])

    def test_invalid_or_degenerate_stems_are_not_scores(self):
        for values in [(np.ones(3),np.ones(3),np.ones(3)),(np.ones(3),np.ones(4),np.ones(3)),(np.ones(3),np.arange(3),np.full(3,np.nan))]:
            with self.assertRaises(ValueError):measure(*values)


if __name__=='__main__':unittest.main()
