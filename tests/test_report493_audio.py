import sys
import math
import tempfile
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'/'voxcpm2'))
sys.path.insert(0,str(ROOT/'backend'))
import dub_plan
import dub_export as E
from dub_quality import speech_check
from translation_memory import fuzzy_semantically_compatible

class AudioRegressions(unittest.TestCase):
    def test_493_01_compact_srt_does_not_speak_next_cue_timestamps(self):
        data=b'1\n00:00:00,000 --> 00:00:01,000\nHello.\n2\n00:00:02,000 --> 00:00:03,000\nWorld.\n'
        self.assertEqual(dub_plan.parse_srt('unused.srt',data),[(0,1000,'Hello.'),(2000,3000,'World.')])
        unindexed=b'00:00:00,000 --> 00:00:01,000\n42\n00:00:02,000 --> 00:00:03,000\nWorld.'
        self.assertEqual(dub_plan.parse_srt('unused.srt',unindexed)[0][2],'42')

    def test_493_04_export_map_agrees_with_playback_for_tolerated_compression_and_offsets(self):
        maps=[
            dict(smooth=True,videoDuration=.04,audioDuration=.01,segments=[dict(v0=0,v1=.04,a0=0,a1=.01)]),
            dict(videoDuration=2,audioDuration=3.02,segments=[dict(v0=.5,v1=1.5,a0=.52,a1=2.52)])
        ]
        for sync in maps:
            for time in [sync['videoDuration']*.2,sync['videoDuration']*.7,sync['videoDuration']]:
                s=sync['segments'][0]
                if time<s['v0']:expected=time
                elif time<s['v1']:expected=s['a0']+(time-s['v0'])*(s['a1']-s['a0'])/(s['v1']-s['v0'])
                else:expected=time+s['a1']-s['v1']
                self.assertAlmostEqual(E.map_time(sync,time)[0],expected,places=6)
                expression=E.video_expression(sync).replace('if(','choose(')
                actual=eval(expression,{'__builtins__':{}},{'T':time,'TB':1,'PI':math.pi,'sin':math.sin,'lt':lambda a,b:a<b,'choose':lambda c,a,b:a if c else b})
                self.assertAlmostEqual(actual,expected,places=6)

    def test_493_05_total_tempo_schedule_work_is_bounded_before_grid_allocation(self):
        # Each window is individually allowed; the aggregate must also be bounded.
        sync={'segments':[dict(v0=i*1000,v1=(i+1)*1000,a0=i*1000,a1=(i+1)*1000) for i in range(101)]}
        with self.assertRaisesRegex(ValueError,'schedule|Timing'):
            E.tempo_commands(sync,101000)

    def test_493_09_verification_rejects_a_lost_negative_sign_in_long_speech(self):
        text='Bugün sıcaklık -5 derece olacak ve hafta boyunca şehrin bütün bölgelerinde bu hava durumu aynı biçimde devam edecek.'
        result=speech_check(text,text.replace('-5','5'))
        self.assertTrue(result['review'])
        correct=speech_check(text,text.replace('-5','eksi beş'))
        self.assertFalse(correct.get('sign_mismatch',False))

    def test_493_15_translation_memory_must_not_reuse_positive_temperature_for_unicode_minus(self):
        self.assertFalse(fuzzy_semantically_compatible('The temperature will be −5 degrees tomorrow.',
                                                      'The temperature will be 5 degrees tomorrow.'))

    def test_493_17_verifier_detects_lost_contracted_negation(self):
        source="We don't expect the weather to change during the next several days in this region."
        result=speech_check(source,source.replace("don't",'do'))
        self.assertTrue(result['lost_negation'])
        self.assertFalse(speech_check(source,source.replace("don't",'do not'))['lost_negation'])

    def test_493_18_zero_length_cues_keep_their_words_in_voice_plan(self):
        self.assertEqual(dub_plan.parse_srt('unused.srt',b'1\n00:00:01,000 --> 00:00:01,000\nWait!\n'),[(1000,1001,'Wait!')])

if __name__=='__main__':unittest.main()
