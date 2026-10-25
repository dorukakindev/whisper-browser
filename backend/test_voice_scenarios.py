from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from accept_voice_scenarios import dense_subtitles
from dub_plan import parse_srt


class SceneControls(unittest.TestCase):
    def test_density_preserves_source_ids_words_and_input(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'source.srt'
            data='7\n00:00:00,000 --> 00:00:04,000\nBir cümle.\n\n9\n00:00:05,000 --> 00:00:08,000\nİkinci cümle.\n'
            source.write_text(data,encoding='utf-8-sig');original=source.read_bytes()
            target=Path(temp)/'dense.srt'
            self.assertEqual(dense_subtitles(source,target,2),4)
            cues=parse_srt(target)
            self.assertEqual([c[2] for c in cues],['Bir cümle.','İkinci cümle.'])
            self.assertEqual([(s,e) for s,e,_ in cues],[(0,2000),(2500,4000)])
            self.assertEqual(source.read_bytes(),original)
            with self.assertRaises(FileExistsError):dense_subtitles(source,target,2)
            with self.assertRaises(ValueError):dense_subtitles(source,Path(temp)/'other',0)


if __name__=='__main__':unittest.main()
