"""Caption success must identify this extraction artifact, never a folder guess."""
import sys
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import media

class CaptionArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name)
        self.events = []
        self.options = []

    def file(self, name, text='1\n00:00:01,000 --> 00:00:02,000\nHello.\n'):
        p = self.out / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding='utf-8')
        return p

    def run_fetch(self, info, auto=False):
        owner = self
        class YDL:
            def __init__(self, opts): owner.options.append(opts)
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def extract_info(self, url, download): return info
        with patch.dict(sys.modules, {'yt_dlp': types.SimpleNamespace(YoutubeDL=YDL)}), patch.object(media, '_ydl_opts', side_effect=lambda extra, **kw:extra), patch.object(media, 'emit', side_effect=lambda kind, **kw:self.events.append((kind,kw))):
            media.fetch_subs('https://www.youtube.com/watch?v=synthetic', 'en', auto, str(self.out))

    def test_missing_requested_caption_never_reuses_old_sibling(self):
        self.file('Old [synthetic].en.srt')
        with self.assertRaises(RuntimeError): self.run_fetch({'id':'synthetic','requested_subtitles':{}})
        self.assertFalse(any(k=='subs' for k,_ in self.events))

    def test_missing_video_identity_never_picks_another_video(self):
        self.file('Other [other].en.srt')
        with self.assertRaises(RuntimeError): self.run_fetch({})

    def test_exact_postprocessor_artifact_wins_over_newer_sibling(self):
        exact = self.file('Selected [synthetic].en.srt')
        newer = self.file('Other title [synthetic].en.srt')
        import os
        os.utime(newer, (2000000000,2000000000))
        self.run_fetch({'id':'synthetic','requested_subtitles':{'en':{'ext':'srt','filepath':str(exact)}}})
        self.assertEqual([v['path'] for k,v in self.events if k=='subs'], [str(exact.resolve())])

    def test_zero_or_unconverted_artifact_is_not_success(self):
        for ext,text in [('srt',''),('vtt','WEBVTT')]:
            with self.subTest(ext=ext):
                exact = self.file('Selected [synthetic].en.'+ext,text)
                self.file('Old [synthetic].en.srt') if ext=='vtt' else None
                with self.assertRaises(RuntimeError): self.run_fetch({'id':'synthetic','requested_subtitles':{'en':{'ext':ext,'filepath':str(exact)}}})

    def test_manual_and_automatic_have_distinct_output_namespaces(self):
        exact = self.file('Selected [synthetic].en.srt')
        info = {'id':'synthetic','requested_subtitles':{'en':{'ext':'srt','filepath':str(exact)}}}
        self.run_fetch(info,False)
        self.run_fetch(info,True)
        self.assertNotEqual(self.options[0]['outtmpl'],self.options[1]['outtmpl'])

    def test_actual_ytdlp_ffmpeg_conversion_reports_final_srt_path(self):
        try:
            import yt_dlp
            from yt_dlp.postprocessor.ffmpeg import FFmpegSubtitlesConvertorPP
        except ImportError:
            self.skipTest('Optional yt-dlp is not installed')
        ffmpeg = media._find_ffmpeg()
        if not ffmpeg:
            self.skipTest('FFmpeg is not installed')
        vtt = self.file('Türkçe [synthetic].en.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello.\n')
        info = {'id':'synthetic', 'requested_subtitles':{'en':{'ext':'vtt','filepath':str(vtt)}}, '__files_to_move':{str(vtt):str(vtt)}}
        with yt_dlp.YoutubeDL({'quiet':True,'ffmpeg_location':str(Path(ffmpeg).parent)}) as ydl:
            _,converted = FFmpegSubtitlesConvertorPP(ydl,format='srt').run(info)
        self.run_fetch(converted)
        selected = [v for k,v in self.events if k=='subs'][-1]
        self.assertEqual(Path(selected['path']).suffix,'.srt')
        self.assertIn('Hello.',Path(selected['path']).read_text(encoding='utf-8-sig'))

    def test_metadata_cannot_select_a_file_outside_output_or_another_language(self):
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other) / 'Other.en.srt'
            outside.write_text('Foreign file',encoding='utf-8')
            with self.assertRaises(RuntimeError): self.run_fetch({'id':'synthetic','requested_subtitles':{'en':{'ext':'srt','filepath':str(outside)}}})
        wrong = self.file('Other [synthetic].en-US.srt')
        with self.assertRaises(RuntimeError): self.run_fetch({'id':'synthetic','requested_subtitles':{'en-US':{'ext':'srt','filepath':str(wrong)}}})

    def test_cli_preserves_only_safe_caption_error_codes(self):
        for code in media.CaptionDownloadError.MESSAGES:
            with self.subTest(code=code), patch.object(sys,'argv',['media.py','subs','--url=https://synthetic.example']), patch.object(media,'fetch_subs',side_effect=media.CaptionDownloadError(code)), patch.object(media,'emit',side_effect=lambda kind,**kw:self.events.append((kind,kw))):
                with self.assertRaises(SystemExit) as exited: media.main()
                self.assertEqual(exited.exception.code,1)
                event=self.events[-1][1]
                self.assertEqual(event['code'],code)
                self.assertEqual(event['message'],media.CaptionDownloadError.MESSAGES[code])

    def test_network_errors_keep_existing_specific_classification(self):
        with patch.object(sys,'argv',['media.py','subs','--url=https://synthetic.example']), patch.object(media,'fetch_subs',side_effect=RuntimeError('HTTP Error 429 https://synthetic.example/?token=PRIVATE')), patch.object(media,'emit',side_effect=lambda kind,**kw:self.events.append((kind,kw))):
            with self.assertRaises(SystemExit): media.main()
        event=self.events[-1][1]
        self.assertNotIn('code',event)
        self.assertIn('429',event['message'])
        self.assertNotIn('PRIVATE',event['message'])

    def test_real_ytdlp_skip_video_runs_caption_conversion_stage(self):
        try:
            import yt_dlp
            from yt_dlp.extractor.common import InfoExtractor
        except ImportError:
            self.skipTest('Optional yt-dlp is not installed')
        if not media._find_ffmpeg(): self.skipTest('FFmpeg is not installed')
        import base64
        vtt=base64.b64encode(b'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nPipeline caption.\n').decode()
        class FixtureIE(InfoExtractor):
            IE_NAME='caption-test'
            _VALID_URL=r'https?://caption\.invalid/(?P<id>[^/?]+)'
            def _real_extract(self,url):
                return {'id':'synthetic','title':'Türkçe fixture','formats':[{'url':'https://caption.invalid/never-download-video.mp4','ext':'mp4'}],
                        'automatic_captions':{'en':[{'url':'data:text/vtt;base64,'+vtt,'ext':'vtt'}]}}
        base=yt_dlp.YoutubeDL
        class FixtureYDL(base):
            def __init__(self,opts):
                super().__init__(opts,auto_init=False)
                self.add_info_extractor(FixtureIE())
        with patch.object(yt_dlp,'YoutubeDL',FixtureYDL), patch.object(media,'emit',side_effect=lambda kind,**kw:self.events.append((kind,kw))):
            media.fetch_subs('https://caption.invalid/synthetic','en',True,str(self.out))
        event=[v for k,v in self.events if k=='subs'][-1]
        self.assertTrue(event['auto'])
        self.assertIn('automatic',Path(event['path']).parts)
        self.assertIn('Pipeline caption.',Path(event['path']).read_text(encoding='utf-8-sig'))
        self.assertEqual(list(self.out.rglob('*.mp4')),[])

    def test_repeated_same_artifact_remains_usable(self):
        exact = self.file('Selected [synthetic].en.srt')
        info = {'id':'synthetic','requested_subtitles':{'en':{'ext':'srt','filepath':str(exact)}}}
        self.run_fetch(info);self.run_fetch(info)
        self.assertEqual(len([k for k,_ in self.events if k=='subs']),2)

if __name__ == '__main__': unittest.main()
