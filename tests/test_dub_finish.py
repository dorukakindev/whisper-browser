"""Speech text preservation, conservative finishing and measured activity regressions."""
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
from dub_finish import spoken_text, finish_audio, active_ranges
from dub_quality import speech_check

class FinishTests(unittest.TestCase):
    def test_separate_spoken_numbers_units_and_ambiguous_forms(self):
        original = 'Dr. Kaya 12,5 km ve 2026 yılını anlattı.'
        self.assertEqual(spoken_text(original),'Doktor Kaya on iki virgül beş kilometre ve iki bin yirmi altı yılını anlattı.')
        self.assertEqual(original,'Dr. Kaya 12,5 km ve 2026 yılını anlattı.')
        for value in ['10:18', '17.10.2026', 'v1.2', '00123', "2026’da", '+90-532-123', '3.14']:
            self.assertEqual(spoken_text(value),value)
        self.assertEqual(spoken_text('0 kişi, 100 kişi ve 1000000 kişi.'),'sıfır kişi, yüz kişi ve bir milyon kişi.')

    def test_finishing_preserves_quiet_tail_and_internal_pause(self):
        sr=10000
        tone=np.sin(np.arange(2000)*.15).astype('float32')*.1
        quiet=tone*.01
        source=np.concatenate([np.zeros(3000),tone,np.zeros(8000),quiet,np.zeros(4000)])
        finished,report=finish_audio(source,sr)
        self.assertAlmostEqual(report['trim_start_seconds'],.24,delta=.002)
        self.assertAlmostEqual(report['trim_end_seconds'],.34,delta=.002)
        self.assertEqual(len(finished),len(source)-round((report['trim_start_seconds']+report['trim_end_seconds'])*sr))
        self.assertTrue(np.max(np.abs(finished[-1600:]))>0,'quiet final syllable must survive')
        self.assertLessEqual(abs(report['gain_db']),3.001)
        self.assertEqual(finished[0],0);self.assertEqual(finished[-1],0)
        with self.assertRaises(ValueError):finish_audio(np.array([np.nan]),sr)

    def test_verification_accepts_equivalent_numbers_but_rejects_changed_values(self):
        source='Dr. Kaya 12,5 km yürüdü.'
        spoken=spoken_text(source)
        result=speech_check(spoken,'Doktor Kaya 12,5 kilometre yürüdü.',source)
        self.assertFalse(result['review']);self.assertEqual(result['similarity'],1)
        self.assertTrue(speech_check(spoken,'Doktor Kaya 13,5 kilometre yürüdü.',source)['review'])
        self.assertEqual(speech_check('12 kişi, 12 saat.', 'on iki kişi.', '12 kişi, 12 saat.')['missing_numbers'],['12'])

    def test_activity_excludes_long_pause_and_silence(self):
        sr=8000
        voice=np.ones(sr,dtype='float32')*.1
        audio=np.concatenate([voice,np.zeros(sr),voice])
        intervals=active_ranges(audio,sr,10)
        self.assertEqual(len(intervals),2)
        self.assertLess(intervals[0][1],11.2)
        self.assertGreater(intervals[1][0],11.8)
        self.assertEqual(active_ranges(np.zeros(sr),sr),[])

if __name__=='__main__':unittest.main()
