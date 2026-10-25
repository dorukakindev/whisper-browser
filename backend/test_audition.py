import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from audition import summary,prepare_controls,write_player


class AuditionTests(unittest.TestCase):
    def test_reviewed_video_control_passes_whole_speech_group_checks(self):
        from dub_plan import make_groups,grouping_options
        from transcribe import compute_translation_quality_report
        data=json.loads((Path(__file__).resolve().parents[1]/'tools/voxcpm2/testdata/audition_controls.json').read_text(encoding='utf-8'))
        cues=data['video']['cues']
        groups=make_groups([(round(r['start']*1000),round(r['end']*1000),r['translation']) for r in cues],**grouping_options('akici'))
        source=[(g['start']/1000,g['end']/1000,' '.join(cues[i-1]['source'] for i in g['source_ids'])) for g in groups]
        target=[(g['start']/1000,g['end']/1000,g['text']) for g in groups]
        result=compute_translation_quality_report(source,target)
        self.assertEqual(result['translation_issues'],0)

    def test_controls_are_reproducible_and_never_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'controls';prepare_controls(root)
            source=json.loads((root/'sources.json').read_text())
            self.assertEqual(source['seconds'],125)
            for name in ['video.en.srt','video.tr.srt','book.srt']:
                self.assertTrue((root/name).read_bytes().startswith(b'\xef\xbb\xbf'))
            before=(root/'book.srt').read_bytes()
            with self.assertRaises(FileExistsError):prepare_controls(root)
            self.assertEqual((root/'book.srt').read_bytes(),before)

    def test_invalid_quality_cannot_be_a_passing_zero(self):
        for groups in [[],None,[{}],[None],[{'status':'invented'}]]:
            with self.assertRaises(ValueError):summary({'groups':groups})
        self.assertEqual(summary({'groups':[{'status':'ready'},{'status':'review'}]}),
                         {'ready':1,'review':1,'failed':0,'total':2})

    def test_missing_waveform_is_visible_without_broken_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);write_player(folder,[{'name':'video-flowing','groups':{'review':1}}])
            text=(folder/'listen.html').read_text(encoding='utf-8')
            self.assertNotIn('<audio',text)
            self.assertIn('Ses dosyası üretilemedi',text)
            self.assertIn('Varsayılan ayarlar değiştirilmedi',text)


if __name__=='__main__':unittest.main()
