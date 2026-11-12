import tempfile
import unittest
from pathlib import Path
import transcribe as T
from subtitle_sdh import restore_sdh_markers
from sentence_translation import markup_preserved

class V6TimingTests(unittest.TestCase):
    def test_reordered_markup_is_balanced_and_attribute_preserving(self):
        self.assertTrue(markup_preserved('<i>Hello</i> <b>world</b>','<b>Dünya</b> <i>merhaba</i>'))
        self.assertFalse(markup_preserved('<i><b>Hi</b></i>','<i><b>Selam</i></b>'))
        self.assertTrue(markup_preserved('<v Alice>Hello','<v Alice>Merhaba'))

    def test_unset_word_clocks_are_skipped_in_confidence_index(self):
        entries=[(i*10,i*10+2,'A repeated signature') for i in range(4)]
        words=[{'start':None,'end':None,'probability':.1}]+[{'start':i*10,'end':i*10+2,'probability':.1} for i in range(4)]
        self.assertEqual(T.find_repeated_hallucinations(entries,words)[0]['count'],4)

    def test_short_cue_does_not_move_across_a_long_silence(self):
        result=T.normalize_timings([(1,1.1,'Evet.'),(10,12,'Sonraki cümle.')],min_dur=.05,max_cps=0)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0][2],'Evet.')
        self.assertEqual(result[1][2],'Sonraki cümle.')

    def test_trailing_descriptor_stays_after_dialogue(self):
        self.assertEqual(restore_sdh_markers('Wait for me! [screams]','Bekle beni!'),'Bekle beni! [screams]')
        self.assertEqual(restore_sdh_markers('[music] Wait! [screams]','Bekle!'),'[music] Bekle! [screams]')

    def test_ass_upper_alignment_is_a_vtt_cue_setting(self):
        with tempfile.TemporaryDirectory() as work:
            file=Path(work)/'upper.vtt'
            T.write_vtt([(1,2,'A sign')],file,decorations=T.cue_format_decorations([{'align':8}],'vtt'))
            self.assertIn('line:5% position:50% align:center',file.read_text())

if __name__=='__main__':
    unittest.main()
