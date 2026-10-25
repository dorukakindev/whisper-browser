import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from review_scene import inspect, main


class SceneReviewTests(unittest.TestCase):
    def test_real_sidecars_and_output(self):
        with tempfile.TemporaryDirectory(prefix='scene review ') as temp:
            root=Path(temp)
            source=root/'source.srt';source.write_text('1\n00:00:00,000 --> 00:00:02,000\nI paid $45.\n',encoding='utf-8-sig')
            wave=root/'voice.wav';sf.write(wave,.1*np.sin(np.arange(24000)*.1),8000)
            quality={'groups':[{'key':'1','audioStart':0,'audioEnd':2,'status':'ready','text':'45 lira ödedim.'}]}
            wave.with_suffix('.quality.json').write_text(json.dumps(quality),encoding='utf-8')
            sync={'version':1,'videoDuration':3,'audioDuration':3,'segments':[{'v0':0,'v1':3,'a0':0,'a1':3}]}
            wave.with_suffix('.sync.json').write_text(json.dumps(sync),encoding='utf-8')
            result=inspect(wave,source)
            self.assertIn('currency_mismatch',result['groups'][0]['blocking'])
            video=root/'video.mp4';video.write_bytes(b'fixture - media decoding tested separately')
            out=root/'output'
            with contextlib.redirect_stdout(io.StringIO()):main(['--before',str(wave),'--after',str(wave),'--source-srt',str(source),'--video',str(video),'--output',str(out)])
            self.assertEqual((out/'before.wav').read_bytes(),wave.read_bytes())
            self.assertTrue((out/'dub-sync-map.js').is_file())
            self.assertTrue((out/'scene-review.js').is_file())
            self.assertIn('application/json',(out/'index.html').read_text(encoding='utf-8'))
            sync['audioDuration']=20
            wave.with_suffix('.sync.json').write_text(json.dumps(sync),encoding='utf-8')
            with self.assertRaises(Exception):inspect(wave,source)


if __name__=='__main__':unittest.main()
