"""Controlled regressions for independently submitted report407; no network/model."""
import os
import sys
import math
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T
import separate_dialogue as D
import invidious as I


class Report407(unittest.TestCase):
    def test_missing_audio_before_any_model_import(self):
        with mock.patch.dict(sys.modules, {'faster_whisper': None}):
            with self.assertRaisesRegex(ValueError, 'nonexistent'):
                D.transcribe({'audio': '/nonexistent/407.wav'})

    def test_semicolonless_text_and_single_decode(self):
        self.assertEqual(T.strip_html('Tom &not here &copy &reg'), 'Tom &not here &copy &reg')
        self.assertEqual(T.strip_html('<i>Bar&#305;&#351;</i> &amp;#305;').strip(), 'Barış  &#305;')

    def test_body_timecode_stays_in_its_cue(self):
        text = '1\n00:00:01,000 --> 00:00:05,000\nEkranda yazan:\n00:01:23,000 --> 00:01:24,000\nÖrnek.\n\n2\n00:00:06,000 --> 00:00:07,000\nSon.'
        cues = T.parse_srt(text)
        self.assertEqual(len(cues), 2)
        self.assertIn('00:01:23,000 --> 00:01:24,000', cues[0][2])

    def test_words_share_finite_clamped_contract(self):
        words = [types.SimpleNamespace(word='a', start=None, end=float('nan'), probability=None),
                 types.SimpleNamespace(word='b', start=-5, end=900, probability=float('inf'))]
        segment = types.SimpleNamespace(start=2, end=6, words=words, text='a b')
        rows = T.normalized_segment_words(segment, 100)
        self.assertEqual(rows[0], {'word':'a','start':102,'end':102,'probability':0})
        self.assertEqual(rows[1]['end'], 106)
        self.assertEqual(T.words_in_accepted_ranges(rows, [(102,103)]), rows)
        self.assertEqual(T.words_in_accepted_ranges(rows, []), [])
        args = types.SimpleNamespace(split_mode='sentence')
        words[1].start = words[1].end = None
        self.assertEqual(T.segment_to_chunks(segment, args), [(2,6,'a b')])

    def test_read_timeout_has_context(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.side_effect = TimeoutError('fixture timeout')
        with mock.patch.object(I,'urlopen',return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'Invidious isteği başarısız'):
                I._fetch_json('https://fixture.invalid/api', session=False)

    def test_filtered_chunk_words_do_not_reach_json_timeline(self):
        class StopFixture(Exception): pass
        observed = []
        segment = types.SimpleNamespace(start=0.,end=10.,text='Good. Bad.',words=[
            types.SimpleNamespace(word='Good.',start=0.,end=2.,probability=.9),
            types.SimpleNamespace(word='Bad.',start=4.,end=9.,probability=.9)])
        def segments():
            yield segment
            frame = sys._getframe(1)
            while 'all_words' not in frame.f_locals: frame = frame.f_back
            observed.extend(frame.f_locals['all_words'])
            raise StopFixture()
        class Model:
            def __init__(self,*a,**kw): pass
            def transcribe(self,*a,**kw):
                return segments(),types.SimpleNamespace(language='en',language_probability=1.,duration=10.)
        fake = types.ModuleType('faster_whisper'); fake.WhisperModel=Model
        with tempfile.TemporaryDirectory() as td, mock.patch.dict(os.environ, {}, clear=True):
            source=Path(td)/'test.mp4';source.write_bytes(b'fixture')
            with mock.patch.object(sys,'argv',['transcribe.py','--input',str(source),'--output-dir',td,'--engine','faster','--resume','false','--clip-start','120','--clip-end','130']),mock.patch.object(T,'transcribe') as capture:
                T.main()
            args=capture.call_args.args[0]
            with mock.patch.dict(sys.modules,{'faster_whisper':fake}),mock.patch.object(T,'find_ffmpeg',return_value='ffmpeg'),mock.patch.object(T,'resolve_device_and_compute',return_value=('cpu','int8')),mock.patch.object(T,'build_prompt_and_hotwords',return_value=('','','')),mock.patch.object(T,'extract_audio'),mock.patch.object(T,'log'),mock.patch.object(T,'emit'),mock.patch.object(T,'_wx_free_gpu'),mock.patch.object(T,'segment_to_chunks',return_value=[(0,3,'Good.'),(3,10,'Bad.')]),mock.patch.object(T,'should_skip_hallucination',side_effect=lambda text,*a: text=='Bad.'):
                with self.assertRaises(StopFixture): T.transcribe(args)
        self.assertEqual([row['word'] for row in observed], ['Good.'])
        self.assertEqual(observed[0]['start'], 120)

if __name__ == '__main__': unittest.main()
