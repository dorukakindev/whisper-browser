import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_quality as Q
import soundfile as sf
import numpy as np


class QualityTests(unittest.TestCase):
    def test_recognized_text_preserves_original_bounded_evidence(self):
        actual='50.000 kişi geldi.'
        result=Q.speech_check('Elli bin kişi geldi.',actual)
        self.assertEqual(result['recognizedText'],actual)
        self.assertFalse(result['review'])
        self.assertEqual(len(Q.speech_check('Merhaba.','x'*9000)['recognizedText']),8000)

    def test_verification_preserves_numbers_and_detects_missing_speech(self):
        self.assertFalse(Q.speech_check('Merhaba, dünya!', 'merhaba dünya')['review'])
        self.assertTrue(Q.speech_check('1938 yılında 12 kişi.', '1938 yılında kişi')['review'])
        self.assertTrue(Q.speech_check('Bu cümle tam okunmalı.', '')['review'])
        self.assertTrue(Q.speech_check('A B C D E F G H', 'A B')['review'])
        self.assertTrue(Q.speech_check('12 kişi 12 gün bekledi.', '12 kişi gün bekledi.')['review'])
        self.assertTrue(Q.speech_check('Bu açıklama hiçbir zaman doğru değil.', 'Bu açıklama hiçbir zaman doğru.')['review'])
        self.assertTrue(Q.speech_check('Merhaba dünya.', 'Merhaba merhaba merhaba dünya.')['review'])

    def test_signed_quantities_and_without_cannot_reverse_long_narration(self):
        before = ('Bu ölçüm sonuçları karşılaştırırken laboratuvar kaydında ayrıntılarıyla '
                  'korunmalıdır ve rapor sonunda ayrıca kontrol edilmelidir. '
                  'Deneyin koşulları ilgili belgede açık biçimde anlatılırken her değer kaynak kaydıyla birlikte sunulacaktır. ')
        for source, heard in [('+5 derece Celsius', '-5 derece Celsius'),
                              ('5 derece Celsius', 'eksi beş derece Celsius'),
                              ('artı beş derece Celsius', 'beş derece Celsius'),
                              ('eksi beş ve eksi beş', 'eksi beş ve beş'),
                              ('artı beş ve eksi beş', 'eksi beş ve artı beş')]:
            with self.subTest(source=source, heard=heard):
                result = Q.speech_check(before+source, before+heard)
                self.assertGreater(result['similarity'], .85)
                self.assertTrue(result['sign_mismatch'])
                self.assertTrue(result['review'])
        for source, heard in [('+5 derece Celsius', 'artı beş derece Celsius'),
                              ('-5 derece Celsius', 'eksi beş derece Celsius'),
                              ('eksi beş derece Celsius', '-5 derece Celsius'),
                              ('5-10 kişi bekledi', '5-10 kişi bekledi'),
                              ('Saat 12:30 ve 23/10/2026.', 'Saat 12:30 ve 23/10/2026.')]:
            self.assertFalse(Q.speech_check(source, heard)['review'], (source, heard))
        self.assertTrue(Q.speech_check('5-10 kişi bekledi', '5-20 kişi bekledi')['review'])
        # The original numeric reference is authoritative after an optional edit.
        self.assertTrue(Q.speech_check('Kişi bekledi.', 'Kişi bekledi.', '12 kişi bekledi.')['review'])
        result = Q.speech_check(before+'without opening the main valve', before+'opening the main valve')
        self.assertGreater(result['similarity'], .85)
        self.assertTrue(result['lost_negation'])
        self.assertTrue(result['review'])

    def test_cache_key_is_independent_of_unrelated_cues(self):
        identity = {'steps':15,'reference':'hash','model':'revision'}
        self.assertEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(dict(reversed(list(identity.items()))),'Bir cümle.',42))
        self.assertNotEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(identity,'Başka cümle.',42))
        self.assertNotEqual(Q.chunk_key(identity,'Bir cümle.',42), Q.chunk_key(identity,'Bir cümle.',43))
        cues=[(0,1000,'Önce.'),(1000,2000,'O da geldi.'),(2000,3000,'Sonra.')]
        before=Q.duration_identity(cues,1,1)
        cues[0]=(0,1000,'Başka kişi.')
        self.assertNotEqual(Q.chunk_key(identity,before,42),Q.chunk_key(identity,Q.duration_identity(cues,1,1),42))

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

    def test_long_speech_cannot_hide_negative_verb_flip(self):
        prefix='Bu uzun anlatımın ayrıntılarını ve sonuçlarını şimdi hep birlikte dikkatle değerlendirelim. '
        for source,heard in [('Ben gitmem.','Ben giderim.'),('Bunu okuyamam.','Bunu okurum.'),('Böyle olmasın.','Böyle olsun.'),('Gelmeden gitti.','Gelip gitti.'),('Gelmeksizin gitti.','Gelip gitti.'),('Gelmeyince gitti.','Gelince gitti.')]:
            result=Q.speech_check(prefix+source,prefix+heard)
            self.assertTrue(result['semantic_mismatch'])
            self.assertTrue(result['review'])
        self.assertFalse(Q.speech_check(prefix+'Bu çalışma güzel.',prefix+'Bu çalışma güzel.')['review'])

    def test_timing_fallbacks_keep_review_visible(self):
        for timing in ({'tempo_error':True},{'cut_frames':20}):
            row={'status':'ready'}
            Q.apply_timing_quality(row,timing)
            self.assertEqual(row['status'],'review')
            row={'status':'failed'}
            Q.apply_timing_quality(row,timing)
            self.assertEqual(row['status'],'failed')

    def test_cache_checks_samples_not_only_header(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'float.wav'
            for payload in (np.zeros(8000), np.full(8000,np.nan), np.full(8000,np.inf)):
                sf.write(p,payload,8000,subtype='FLOAT')
                self.assertFalse(Q.valid_audio(p,sf))
            payload=np.ones(65536*2+100,dtype='float32')*.01
            payload[-1]=np.nan
            sf.write(p,payload,8000,subtype='FLOAT')
            self.assertFalse(Q.valid_audio(p,sf),'late corruption is not missed')
            payload[-1]=.01
            sf.write(p,payload,8000,subtype='FLOAT')
            self.assertTrue(Q.valid_audio(p,sf))

    def test_preview_and_reference_invalid_inputs(self):
        self.assertEqual(Q.representative_groups([]),[])
        for end in (0,-1,float('nan'),float('inf')):
            with self.assertRaisesRegex(ValueError,'preview'):
                Q.representative_groups([{'start':0,'end':end,'text':'Speech.'}])
        loud=Q.reference_quality(np.full(8000,np.finfo(np.float32).max),8000)
        self.assertTrue(np.isfinite(loud['rms']))
        self.assertIn('clipping',loud['warnings'])
        for audio,sr in ((np.ones(3),float('nan')),(np.ones((2,2,2)),8000),(np.ones((2,0)),8000),(np.array(1),8000)):
            with self.assertRaisesRegex(ValueError,'reference'):
                Q.reference_quality(audio,sr)

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
