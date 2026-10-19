import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_quality as Q
import soundfile as sf
import numpy as np


class QualityTests(unittest.TestCase):
    def test_verification_preserves_numbers_and_detects_missing_speech(self):
        self.assertFalse(Q.speech_check('Merhaba, dünya!', 'merhaba dünya')['review'])
        self.assertTrue(Q.speech_check('1938 yılında 12 kişi.', '1938 yılında kişi')['review'])
        self.assertTrue(Q.speech_check('Bu cümle tam okunmalı.', '')['review'])
        self.assertTrue(Q.speech_check('A B C D E F G H', 'A B')['review'])

    def test_cache_key_is_independent_of_unrelated_cues(self):
        identity = {'steps':15,'reference':'hash','model':'revision'}
        self.assertEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(dict(reversed(list(identity.items()))),'Bir cümle.',42))
        self.assertNotEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(identity,'Başka cümle.',42))
        self.assertNotEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(identity,'Bir cümle.',43))

    def test_preview_packs_far_apart_excerpts_without_losing_source_ids(self):
        groups = [{'start':0,'end':1000,'text':'Evet.','source_ids':[1]},
                  {'start':600000,'end':610000,'text':'Uzun bir açıklama. '*10,'source_ids':[2]},
                  {'start':1200000,'end':1202000,'text':'Hızlı konuşma. '*8,'source_ids':[3]}]
        sample = Q.representative_groups(groups)
        self.assertEqual([g['source_ids'] for g in sample],[[1],[2],[3]])
        self.assertLess(sample[-1]['end'],20000)
        self.assertEqual(groups[-1]['start'],1200000)
        self.assertEqual(sample[-1]['source_start'],1200000)
        huge=Q.representative_groups([{'start':0,'end':86400000,'text':'Evet.','source_ids':[1]}])
        self.assertEqual(huge[0]['end'],55000)
        self.assertEqual(huge[0]['source_end'],86400000)

    def test_reference_warnings_and_valid_cache_audio(self):
        rate = 8000
        clean = np.sin(np.arange(rate*5)*.2).astype('float32')*.2
        self.assertEqual(Q.reference_quality(clean,rate)['warnings'],[])
        quiet = Q.reference_quality(clean*.001,rate)
        self.assertIn('quiet',quiet['warnings'])
        self.assertIn('clipping',Q.reference_quality(np.ones(rate*4),rate)['warnings'])
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/'a.wav'
            p.write_bytes(b'broken')
            self.assertFalse(Q.valid_audio(p,sf))
            sf.write(p,clean,rate)
            self.assertTrue(Q.valid_audio(p,sf))


if __name__ == '__main__':
    unittest.main()
