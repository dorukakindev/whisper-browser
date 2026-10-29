"""Targeted external audit regressions; no model or network required."""
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest
from unittest.mock import patch
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'tools/voxcpm2')]
import sentence_translation as S
from dub_finish import spoken_text, decimal_evidence
from dub_quality import speech_check
from dub_timing import build_narration_timeline
from dub_timeline_storage import DiskTimeline, write_audio, pause_before_ms, check_storage, manifest_segments

class Audit790(unittest.TestCase):
    def test_nominal_homographs_and_real_negation_remain_distinct(self):
        for source,target in [("I can't swim.",'Yüzemem.'),('This is a sentence.','Bu konuşma cümlesidir.'),('This is a search.','Bu arama.'),('before it is too late.','Çok geç olmadan.'),('Do not speak!','Konuşma!'),('Do not search.','Arama yapma.')]:
            self.assertEqual(S.translation_blocking_issues(source,target,'tr','en'),[],(source,target))
        for source,target,issue in [("I can't swim.",'Yüzerim.','negation_missing'),('Please speak.','Konuşma!','negation_added'),('Before breakfast, he did not call.','Kahvaltıdan önce aradı.','negation_missing')]:
            self.assertIn(issue,S.translation_blocking_issues(source,target,'tr','en'))

    def test_explicit_decimal_speech_without_identifier_reinterpretation(self):
        for source,heard in [('3.14 metre.','üç virgül on dört metre.'),('1.5 kg','bir virgül beş kilogram'),('1.5 kg','bir nokta beş kilogram'),('2.75%','yüzde iki virgül yetmiş beş')]:
            self.assertFalse(speech_check(source,heard)['review'],(source,heard))
            self.assertTrue(speech_check(source,heard)['decimalEvidence'])
        self.assertFalse(speech_check(spoken_text('3.14 metre.'),'üç virgül on dört metre.',numeric_reference='3.14 metre.')['review'])
        for source in ['v1.5','2026.10.29','01.05','3.14','Saat 1.5te','0.500 kg','ID 1.5 kg']:
            self.assertFalse(decimal_evidence(source),source)
        self.assertTrue(speech_check('3.14 metre.','üç virgül on beş metre.')['review'])
        self.assertTrue(speech_check('1.5 kg','bir virgül beş metre')['review'])

    def test_narration_pause_metadata_matches_wave_without_changing_legacy_field(self):
        with tempfile.TemporaryDirectory() as folder:
            a=Path(folder)/'a.wav';sf.write(a,np.ones(8000,dtype=np.float32)*.1,8000)
            audio,timing=build_narration_timeline([(0,1000,'Bitti.'),(1000,2000,'Devam.')],[a,a],8000,folder)
            self.assertEqual(pause_before_ms(timing['groups'],0),0)
            self.assertTrue(219<=pause_before_ms(timing['groups'],1)<=221)
            self.assertEqual(len(audio),round((timing['groups'][1]['start_seconds']+1)*8000))
            segments=manifest_segments([(0,1000,'Bitti.'),(1000,2000,'Devam.')],[{'file':'a.wav'},{'file':'b.wav'}],[{'source_ids':[1]},{'source_ids':[2]}],timing)
            self.assertEqual(segments[1]['pause_ms'],0)
            self.assertTrue(219<=segments[1]['pause_before_ms']<=221)
            self.assertEqual(segments[1]['source_ids'],[2])

    def test_disk_backed_audio_read_modify_write_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            storage=DiskTimeline(folder);storage.silence(2200000);audio=storage.finish()
            audio[10:14]+=np.array([.1,.2,-.2,-.1],dtype=np.float32)
            output=Path(folder)/'long.wav';write_audio(output,audio,8000)
            self.assertIsNone(storage.file)
            self.assertEqual(sf.info(output).frames,2200000)
            with sf.SoundFile(output) as stream:
                stream.seek(10);np.testing.assert_allclose(stream.read(4),[.1,.2,-.2,-.1],atol=1/32768)
            self.assertFalse(list(Path(folder).glob('*.f32')))

    def test_process_cancellation_releases_windows_temporary_file(self):
        with tempfile.TemporaryDirectory() as folder:
            script="import sys;sys.path.insert(0,sys.argv[1]);from dub_timeline_storage import DiskTimeline;s=DiskTimeline(sys.argv[2]);s.silence(2200000);a=s.finish();print('ready',flush=True);sys.stdin.read()"
            child=subprocess.Popen([sys.executable,'-c',script,str(ROOT/'tools/voxcpm2'),folder],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(),'ready')
            finally:
                if sys.platform=='win32':
                    subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],check=True,capture_output=True)
                else:
                    child.kill()
                child.wait(timeout=10)
                child.stdin.close();child.stdout.close();child.stderr.close()
            self.assertFalse(list(Path(folder).glob('*.f32')))

    def test_write_failure_closes_scratch_and_removes_partial(self):
        with tempfile.TemporaryDirectory() as folder:
            storage=DiskTimeline(folder);storage.silence(2200000);audio=storage.finish();output=Path(folder)/'broken.wav'
            with patch('dub_timeline_storage.sf.SoundFile',side_effect=RuntimeError('write failed')):
                with self.assertRaisesRegex(RuntimeError,'write failed'):
                    write_audio(output,audio,8000)
            self.assertIsNone(storage.file)
            self.assertFalse(output.exists())
            self.assertFalse(list(Path(folder).glob('*.f32')))

    def test_disk_preflight_fails_without_creating_output(self):
        with tempfile.TemporaryDirectory() as folder,patch('dub_timeline_storage.shutil.disk_usage') as disk:
            disk.return_value.free=1
            with self.assertRaisesRegex(ValueError,'disk'):
                check_storage(7200,48000,folder)
            self.assertEqual(list(Path(folder).iterdir()),[])

if __name__=='__main__':unittest.main()
