import sys,tempfile,unittest,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).parents[1]/'tools'/'voxcpm2'))
from dub_continuity import measure,prepare
class Continuity(unittest.TestCase):
 def test_scene_gap_and_source_preview_times_do_not_level_or_warn_across_scenes(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);sr=8000;t=np.arange(sr)/sr;paths=[]
   for i,gain in enumerate([.15,.15,.015]):
    p=root/(str(i)+'.wav');sf.write(p,np.sin(t*2*np.pi*220)*gain,sr,subtype='FLOAT');paths.append(p)
   groups=[{'start':i*1500,'end':i*1500+1000,'source_start':s,'source_end':s+1000}
           for i,s in enumerate([0,1500,30000])]
   originals=[p.read_bytes() for p in paths]
   with prepare(paths,['One.','One.','Many words spoken at a different pace.'],enabled=True,directory=root,groups=groups) as (rendered,metrics):
    self.assertEqual(rendered,paths);self.assertEqual(metrics[2]['gainDb'],0)
    self.assertNotIn('level-jump',metrics[2]['warnings']);self.assertNotIn('pace-jump',metrics[2]['warnings'])
   self.assertEqual([p.read_bytes() for p in paths],originals)
   groups[2].update(source_start=3000,source_end=4000)
   with prepare(paths,['One.']*3,enabled=True,directory=root,groups=groups) as (_,metrics):
    self.assertEqual(metrics[2]['gainDb'],2);self.assertIn('level-jump',metrics[2]['warnings'])
   groups[2]['speaker']='second';groups[1]['speaker']='first'
   with prepare(paths,['One.']*3,enabled=True,directory=root,groups=groups) as (_,metrics):
    self.assertEqual(metrics[2]['gainDb'],0);self.assertNotIn('level-jump',metrics[2]['warnings'])
 def test_mismatched_rows_and_invalid_group_times_fail_before_silent_zip_truncation(self):
  for paths,texts,groups in [(['unused'],[],None),(['unused'],['one'],[]),
                           (['unused'],['one'],[{'start':float('nan'),'end':3}]),
                           (['unused'],['one'],[{'start':3,'end':2}])]:
   with self.subTest(groups=groups),self.assertRaises(ValueError):
    with prepare(paths,texts,groups=groups):pass
 def test_measure_and_bounded_render_preserve_frames_cache_and_dynamics(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);paths=[];original=[];sr=24000;t=np.arange(sr*2)/sr
   for i,gain in enumerate([.15,.015,.16]):
    p=root/(str(i)+'.wav');sf.write(p,np.sin(t*2*np.pi*220)*gain,sr,subtype='FLOAT');paths.append(p);original.append(p.read_bytes())
   with prepare(paths,['One two three.']*3,enabled=True,directory=root) as (rendered,metrics):
    self.assertEqual(metrics[1]['gainDb'],2);self.assertIn('level-jump',metrics[1]['warnings']);self.assertEqual(rendered[0],paths[0]);self.assertNotEqual(rendered[1],paths[1]);self.assertEqual(sf.info(rendered[1]).frames,sr*2);self.assertEqual(sf.info(rendered[1]).samplerate,sr)
   self.assertEqual([p.read_bytes() for p in paths],original);self.assertFalse(Path(rendered[1]).exists())
   with prepare(paths,['One.']*3,enabled=False,directory=root) as (rendered,metrics):self.assertEqual(rendered,paths);self.assertTrue(all(m['gainDb']==0 for m in metrics))
 def test_timeline_owns_audio_after_temporary_levelled_files_are_removed(self):
  from dub_timing import build_narration_timeline
  from dub_timeline_storage import write_audio
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);sr=24000;t=np.arange(sr)/sr;paths=[]
   for i,gain in enumerate([.15,.015,.16]):
    p=root/(str(i)+'.wav');sf.write(p,np.sin(t*2*np.pi*220)*gain,sr);paths.append(p)
   cues=[(i*1500,i*1500+1000,'Some words here.') for i in range(3)]
   with prepare(paths,['Some words here.']*3,enabled=True,directory=root) as (rendered,metrics):
    timeline,report=build_narration_timeline(cues,rendered,sr,root)
   output=root/'final.wav';write_audio(output,timeline,sr);self.assertGreater(sf.info(output).duration,3);self.assertEqual(len(report['groups']),3)
 def test_silence_and_bad_audio_are_not_boosted_or_reported_as_speech(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'silence.wav';sf.write(p,np.zeros(24000),24000)
   m=measure(p);self.assertIsNone(m['levelDb']);self.assertEqual(m['voicedSeconds'],0);self.assertEqual(measure(Path(folder)/'missing.wav')['status'],'unavailable')
if __name__=='__main__':unittest.main()
