"""Model-free regressions; AUDIT_BASELINE=1 replays against committed pre-fix code."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'backend'), str(ROOT/'tools/voxcpm2')]
def load(name, file):
    source = subprocess.check_output(['git','show','8bd73d8e7bb75571e20232ecd5877f025737f800:'+file],cwd=ROOT).decode('utf-8') if os.getenv('AUDIT_BASELINE') else (ROOT/file).read_text(encoding='utf-8')
    mod=types.ModuleType(name); mod.__file__=str(ROOT/file)
    exec(compile(source, mod.__file__, 'exec'),mod.__dict__)
    return mod
st=load('audit_sentence','backend/sentence_translation.py')
sdh=load('audit_sdh','backend/subtitle_sdh.py')
names=load('audit_names','backend/name_consistency.py')
plan=load('audit_plan','tools/voxcpm2/dub_plan.py')
finish=load('audit_finish','tools/voxcpm2/dub_finish.py')
studio=load('audit_studio','tools/voxcpm2/text_studio.py')

class Regressions(unittest.TestCase):
    def test_name_prefix_is_not_the_same_person(self):
        for name,target in [('Ann','Annette geldi.'),('Jane','Janet geldi.'),('Lawson',"Larson’la buluştu.")]:
            self.assertFalse(st._name_preserved(name,target),(name,target))
        self.assertTrue(st._name_preserved('Lawson',"Lawson’la buluştu."))
    def test_quoted_sentence_initial_is_not_a_name(self):
        self.assertEqual(st.part_anchor_issue(['He said, "You must not leave."'],['“Gitmemelisin,” dedi.'],'tr'),'')
        self.assertIn('Alice',st._proper_names('He said, "Alice must not leave."'))
    def test_sdh_does_not_join_spoken_words(self):
        self.assertEqual(sdh.strip_sdh_descriptors('Hello[applause]world'),'Hello world')
    def test_negative_shift_retains_crossing_sentence_and_id(self):
        cues=plan.SourceCues();cues.extend([(1000,4000,'Keep the whole sentence.'),(5000,6000,'Next.')]);cues.source_ids=[7,9]
        shifted=plan.shift_cues(cues,-2000)
        self.assertEqual(shifted,[(0,2000,'Keep the whole sentence.'),(3000,4000,'Next.')]);self.assertEqual(shifted.source_ids,[7,9])
    def test_spoken_unary_signs_preserve_meaning(self):
        self.assertEqual(finish.spoken_text('Sıcaklık -5 °C, fark +12 ve sonuç −3.'),'Sıcaklık eksi beş derece Celsius, fark artı on iki ve sonuç eksi üç.')
        for text in ['2026-10-23','5-10 arası','v1.2','A-5']:
            self.assertEqual(finish.spoken_text(text),text)
    def test_name_correction_preserves_other_people_in_same_cue(self):
        entries=[(0,1,'Sherlock met Watson.')] * 4
        outs=['Şerlok ve Watson geldi.']*2+['Sherlock ve Watson geldi.']*2
        report=names.audit_name_consistency(entries,outs,['Sherlock','Watson'])
        for supplied in [report,None]:
            fixed,count=names.apply_glossary_corrections(entries,outs,{'Sherlock':'Sherlock'},supplied)
            self.assertEqual(fixed,['Sherlock ve Watson geldi.']*4);self.assertEqual(count,2)
    def test_majority_beats_original_spelling_when_not_tied(self):
        entries=[(0,1,'Sherlock came.')] * 8
        report=names.audit_name_consistency(entries,['Şerlok geldi.']*5+['Sherlock geldi.']*3,['Sherlock'])
        self.assertEqual(report[0]['suggestion'],'Şerlok')
    def test_names_in_larger_words_do_not_trigger_corrections(self):
        fixed,count=names.apply_glossary_corrections([(0,1,'Annette came.')],['Annette geldi.'],{'Ann':'Anne'})
        self.assertEqual(fixed,['Annette geldi.']);self.assertEqual(count,0)
    def studio_files(self,root):
        exe=root/'.venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python');exe.parent.mkdir(parents=True);exe.touch()
        files=[root/n for n in ['nanovllm_oku.py','reference.wav','reference.txt','source.txt']]
        for f in files:f.touch()
        files[2].write_text('Reference speech.',encoding='utf-8')
        return files[1:]
    def test_preview_zero_cannot_start_full_book(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);files=self.studio_files(root)
            with self.assertRaises(ValueError):studio.command(root,*files,root/'out.wav',dict(steps=15,batch=4,cfg=1.65,temperature=.8,pause=.25,preview=True,preview_count=0))
    def test_clone_mode_does_not_decode_unused_transcript(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);files=self.studio_files(root);files[1].write_bytes(b'\xff\xfe\xff')
            argv=studio.command(root,*files,root/'out.wav',dict(steps=15,batch=4,cfg=1.65,temperature=.8,pause=.25,mode='clone'))
            self.assertNotIn('--transcript',argv)
    def test_invalid_saved_paths_do_not_crash_studio_startup(self):
        with tempfile.TemporaryDirectory() as temp:
            config=Path(temp)/'config.json';config.write_text('{"engine":123,"reference":[],"transcript":false}')
            with patch.object(sys,'argv',['studio','--config',str(config)]):result=studio.defaults()
            self.assertIsInstance(result.engine,Path);self.assertIsInstance(result.reference,Path)
if __name__=='__main__':unittest.main()
