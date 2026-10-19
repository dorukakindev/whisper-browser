import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import wave

import dub_export as E


class DubExportTests(unittest.TestCase):
    def test_smooth_endpoints_and_pitch_preserving_schedule(self):
        sync={'version':1,'smooth':True,'videoDuration':3,'audioDuration':4,
              'segments':[{'v0':1,'v1':3,'a0':1,'a1':4}]}
        self.assertEqual(E.map_time(sync,1),(1,1))
        self.assertEqual(E.map_time(sync,3),(4,1))
        self.assertEqual(E.map_time(sync,4),(5,1))
        self.assertIn('sin(',E.video_expression(sync))
        commands=E.tempo_commands(sync,3).splitlines()
        self.assertTrue(commands)
        self.assertIn('rubberband@warp tempo',commands[0])
        self.assertIn('0.000000000',commands[0])
        self.assertNotIn('nan',E.video_expression(sync))
        row={'audioStart':1,'audioEnd':2,'status':'ready'}
        self.assertIn('0.35',E.duck_expression([row],.35))

    def test_real_audio_video_and_dual_export(self):
        import transcribe
        ffmpeg=transcribe.find_ffmpeg()
        if not ffmpeg:
            self.skipTest('FFmpeg is required for the real export probe.')
        with tempfile.TemporaryDirectory(prefix='dub-export486-') as folder:
            root=Path(folder)
            video=root/'source.mp4';voice=root/'voice.wav';background=root/'background.wav'
            def ff(*args):
                subprocess.run([ffmpeg,'-nostdin','-v','error','-y',*map(str,args)],check=True,capture_output=True,timeout=30)
            ff('-f','lavfi','-i','testsrc2=size=160x90:rate=25:duration=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac','-shortest',video)
            ff('-f','lavfi','-i','sine=frequency=650:duration=4','-c:a','pcm_s16le',voice)
            ff('-f','lavfi','-i','sine=frequency=220:duration=3','-c:a','pcm_s16le',background)
            sync={'version':1,'smooth':True,'videoDuration':3,'audioDuration':4,'segments':[{'v0':0,'v1':3,'a0':0,'a1':4}]}
            request={'voice':str(voice),'video':str(video),'sync':sync,'mix':{'voice':.8,'background':.5,'music':.5,'ambience':.5,'duck':True,'duckAmount':.35},
                     'background':str(background),'music':str(background),'rows':[{'audioStart':0,'audioEnd':3,'status':'ready'}]}
            for kind in ['audio','video','dual']:
                request['kind']=kind
                cfg=root/'request.json';cfg.write_text(json.dumps(request),encoding='utf-8')
                target=root/('out-'+kind+('.wav' if kind=='audio' else '.mp4'))
                result=subprocess.run([os.sys.executable,str(Path(E.__file__).resolve()),'--request',str(cfg),'--output',str(target),'--ffmpeg',ffmpeg],cwd=root,capture_output=True,timeout=60)
                self.assertEqual(result.returncode,0,result.stderr.decode('utf-8',errors='replace')[-2500:])
                info=E.probe(ffmpeg,str(target));self.assertAlmostEqual(float(info['format']['duration']),4,delta=.15)
                self.assertEqual(sum(s['codec_type']=='audio' for s in info['streams']),2 if kind=='dual' else 1)
                if kind=='video':
                    ffprobe=str(Path(ffmpeg).with_name('ffprobe.exe' if os.name=='nt' else 'ffprobe'))
                    frames=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(target)]))['frames']
                    self.assertEqual(len(frames),75,'export keeps every source frame')
                    for index in [10,37,60]:
                        expected=E.map_time(sync,index/25)[0]
                        self.assertAlmostEqual(float(frames[index]['best_effort_timestamp_time']),expected,delta=.065)
                if kind=='audio':
                    with wave.open(str(target)) as audio:self.assertEqual(audio.getnchannels(),2);self.assertEqual(audio.getframerate(),48000)
            # Timing must hold inside the clip, not merely after padding its tail.
            ff('-f','lavfi','-i',"sine=frequency=220:duration=3,volume='if(between(t,1.3,1.5),1,0)':eval=frame",'-c:a','pcm_s16le',background)
            ff('-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','4','-c:a','pcm_s16le',voice)
            request.update(kind='audio',music=None,rows=[])
            request['mix'].update(background=1,duck=False)
            cfg.write_text(json.dumps(request),encoding='utf-8');pulse=root/'pulse.wav'
            result=subprocess.run([os.sys.executable,str(Path(E.__file__).resolve()),'--request',str(cfg),'--output',str(pulse),'--ffmpeg',ffmpeg],cwd=root,capture_output=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace')[-2000:])
            import array
            with wave.open(str(pulse)) as audio:
                samples=array.array('h',audio.readframes(audio.getnframes()))
            weights=[sum(abs(v) for v in samples[i:i+960]) for i in range(0,len(samples),960)]
            center=sum((i+.5)*.01*v for i,v in enumerate(weights))/sum(weights)
            self.assertAlmostEqual(center,E.map_time(sync,1.4)[0],delta=.15)


if __name__=='__main__':unittest.main()
