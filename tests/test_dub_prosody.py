import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_prosody import VERSION, features, delivery_rows, delivery_instruction, load_plan
import prepare_prosody as P


class ProsodyTests(unittest.TestCase):
    def test_silence_noise_steady_tone_and_clipping_are_unknown(self):
        rng=np.random.default_rng(42); t=np.arange(16000)/8000
        for audio in (np.zeros(16000),rng.normal(0,.02,16000),.2*np.sin(2*np.pi*160*t),np.ones(16000),np.array([np.nan]*16000)):
            self.assertIsNone(features(audio))

    def test_voiced_signal_has_finite_features(self):
        t=np.arange(32000)/8000
        phase=2*np.pi*np.cumsum(150+40*np.sin(2*np.pi*1.3*t))/8000
        audio=.12*np.sin(phase)*(.6+.4*np.sin(2*np.pi*3*t))
        f=features(audio)
        self.assertIsNotNone(f)
        self.assertTrue(all(np.isfinite(x) for x in f.values()))
        self.assertGreater(f['variation'],.1)

    def test_relative_energy_unknown_fallback_and_no_smoothing_across_gaps(self):
        rows=[{'key':str(i),'start':i*10000,'end':i*10000+2000,
               'features':{'level':level,'variation':.3,'pauses':.1,'confidence':.8}}
              for i,level in enumerate([-30,-30,-30,-17,-40])]
        out=delivery_rows(rows)
        self.assertEqual(out[3]['delivery']['energy'],'high')
        self.assertEqual(out[4]['delivery']['energy'],'low')
        self.assertTrue(all(r['delivery'] is None for r in delivery_rows(rows[:2])))
        self.assertEqual(delivery_instruction(None),'')
        with self.assertRaises(ValueError): delivery_instruction({'energy':'angry'})
        with self.assertRaises(ValueError): delivery_rows(rows,'arbitrary')

    def test_plan_binds_source_group_and_timeline(self):
        groups=[{'source_ids':[4,5],'start':1000,'end':4000}]
        doc={'version':VERSION,'sourceHash':'abc','groups':[{'key':'4,5','start':1000,'end':4000,'delivery':None}]}
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'plan.json'; file.write_text(json.dumps(doc))
            self.assertEqual(load_plan(file,'abc',groups),[None])
            with self.assertRaises(ValueError): load_plan(file,'other',groups)
            with self.assertRaises(ValueError): load_plan(file,'abc',[{**groups[0],'end':5000}])
            doc['groups']*=2;file.write_text(json.dumps(doc))
            with self.assertRaises(ValueError): load_plan(file,'abc',groups)

    def test_preview_analyzes_original_times_and_keeps_packed_map_times(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); source=folder/'source.wav';source.write_bytes(b'fixture')
            srt=folder/'Türkçe.srt'
            srt.write_text('1\n00:10:00,000 --> 00:10:02,000\nBir cümle.\n\n'
                           '2\n00:20:00,000 --> 00:20:03,000\nDaha uzun ikinci cümle.\n',encoding='utf-8-sig')
            output=folder/'map.json'; calls=[]
            def run(cmd,**kwargs):
                calls.append(cmd)
                return type('Result',(),{'returncode':0,'stdout':np.zeros(24000,dtype='<f4').tobytes()})()
            with patch.object(sys,'argv',['prepare','--source',str(source),'--srt',str(srt),'--output',str(output),'--ffmpeg','ffmpeg','--sample']),patch.object(P.subprocess,'run',run):
                P.main()
            self.assertEqual([float(c[c.index('-ss')+1]) for c in calls],[600.,1200.])
            result=json.loads(output.read_text())
            self.assertEqual(result['groups'][0]['start'],0)
            self.assertEqual(result['groups'][1]['source_start'],1200000)
            self.assertEqual(result['sourceHash'],hashlib.sha256(srt.read_bytes()).hexdigest())


if __name__=='__main__': unittest.main()
