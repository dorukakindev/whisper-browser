import sys
from pathlib import Path
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_candidate import MAX_RETRIES, measure_samples, retry_reasons, prefer_candidate
from dub_quality import speech_check


class CandidateTests(unittest.TestCase):
    rate = 8000
    text = 'Bugün yola çıktık.'

    def audio(self, seconds=2, leading=0, trailing=0):
        t=np.arange(round(seconds*self.rate))/self.rate
        return np.r_[np.zeros(round(leading*self.rate)), .1*np.sin(2*np.pi*155*t),
                     np.zeros(round(trailing*self.rate))].astype(np.float32)

    def check(self):
        return {'status':'passed', **speech_check(self.text, self.text)}

    def test_production_arrays_no_io_and_edge_candidate_accepted(self):
        baseline=self.audio(leading=1,trailing=1)
        original=baseline.copy()
        candidate=self.audio(leading=.2,trailing=.2)
        self.assertEqual(retry_reasons(baseline,self.rate,self.text), ['long-edge-pause'])
        decision=prefer_candidate(measure_samples(baseline,self.rate,self.text),
                                  measure_samples(candidate,self.rate,self.text), self.check(),self.check())
        self.assertEqual(decision, {'accepted':True,'reason':'shorter-edge-pauses'})
        np.testing.assert_array_equal(baseline, original)
        self.assertEqual(MAX_RETRIES,1)

    def test_full_content_evidence_and_no_worsening_are_required(self):
        b=measure_samples(self.audio(leading=1),self.rate,self.text)
        c=measure_samples(self.audio(leading=.1),self.rate,self.text)
        for check in ({'status':'not_checked'}, {'status':'passed'}, None,
                      {**self.check(),'review':True}, {**self.check(),'lost_negation':True},
                      {**self.check(),'missing_numbers':['12']}):
            self.assertFalse(prefer_candidate(b,c,self.check(),check)['accepted'])
        self.assertEqual(prefer_candidate(b,c,self.check(),{**self.check(),'similarity':.99})['reason'],
                         'content-evidence-regressed')
        self.assertFalse(prefer_candidate(b,c,{'status':'unavailable'},self.check())['accepted'])
        different=measure_samples(self.audio(leading=.1),self.rate,'Yarın geri geldik.')
        self.assertEqual(prefer_candidate(b,different,self.check(),self.check())['reason'],'different-expected-text')

    def test_window_improvement_is_objective_and_no_risk_means_no_retry(self):
        b=measure_samples(self.audio(),self.rate,self.text)
        c=measure_samples(self.audio(1.5),self.rate,self.text)
        self.assertEqual(retry_reasons(self.audio(),self.rate,self.text), [])
        self.assertFalse(prefer_candidate(b,c,self.check(),self.check())['accepted'])
        self.assertTrue(prefer_candidate(b,c,self.check(),self.check(),1.6)['accepted'])
        near=measure_samples(self.audio(1.9),self.rate,self.text)
        self.assertFalse(prefer_candidate(b,near,self.check(),self.check(),1.6)['accepted'])

    def test_only_pace_change_is_not_sufficient_to_replace_firstgood(self):
        text='bir iki üç dört beş altı yedi sekiz dokuz on'
        baseline=self.audio(1.2)
        candidate=self.audio(1.0)
        self.assertIn('fast-speaking-pace', retry_reasons(baseline,self.rate,text))
        b=measure_samples(baseline,self.rate,text);c=measure_samples(candidate,self.rate,text)
        self.assertFalse(prefer_candidate(b,c,self.check(),self.check())['accepted'])

    def test_pause_duration_and_new_risk_regressions_reject(self):
        b=measure_samples(self.audio(2,1,0),self.rate,self.text)
        candidates=[self.audio(3,.1,0), self.audio(1,.1,.9)]
        for audio in candidates:
            self.assertFalse(prefer_candidate(b,measure_samples(audio,self.rate,self.text),
                                             self.check(),self.check())['accepted'])

    def test_silence_nonfinite_bad_rate_bounds_and_clipping_fail_closed(self):
        for audio,rate in [(np.zeros(8000),8000), (np.array([np.nan]),8000),
                           (np.array([np.inf]),8000), (self.audio(),0), (self.audio(),float('nan')),
                           (self.audio(),True), (np.ones(8000),8000),
                           (np.zeros(8000*121),8000), (np.zeros((8000,3)),8000),
                           ([],8000), (['bad'],8000), (self.audio(),1e30)]:
            with self.subTest(rate=rate):
                metric=measure_samples(audio,rate,self.text)
                self.assertFalse(metric['valid'])
                self.assertEqual(retry_reasons(audio,rate,self.text), [])
        b=measure_samples(self.audio(leading=1),8000,self.text)
        self.assertFalse(prefer_candidate(b, {'valid':True,'seconds':float('inf')},
                                         self.check(),self.check())['accepted'])

    def test_stereo_does_not_cancel_out_and_short_frame_duration_is_exact(self):
        mono=self.audio(.333)
        result=measure_samples(np.column_stack([mono,-mono]),8000,self.text)
        self.assertTrue(result['valid'])
        self.assertAlmostEqual(result['seconds'],len(mono)/8000)
        self.assertLessEqual(result['activeSeconds'], result['seconds'])


if __name__=='__main__': unittest.main()
