"""Model-free checks for the exact text sent to dubbing and background planning."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_plan import parse_srt, make_groups


class DubSubtitleTextTests(unittest.TestCase):
    def parse(self, text):
        return parse_srt('unused.srt', text.encode('utf-8'))

    def test_whitespace_only_separator_does_not_speak_following_timestamps(self):
        for separator in ('\n \n', '\n\t\n', '\r\n \t\r\n'):
            with self.subTest(separator=repr(separator)):
                text = ('1\n00:00:01,000 --> 00:00:02,000\nİlk cümle.' + separator
                        + '2\n00:00:03,000 --> 00:00:04,000\nİkinci cümle.\n\n')
                cues = self.parse(text)
                self.assertEqual(cues, [(1000, 2000, 'İlk cümle.'), (3000, 4000, 'İkinci cümle.')])
                self.assertEqual([g['text'] for g in make_groups(cues)], ['İlk cümle.', 'İkinci cümle.'])

    def test_html_entities_are_decoded_once_after_markup_removal(self):
        cues = self.parse('1\n00:00:00,000 --> 00:00:02,000\n'
                          '<i>Tom &amp; Jerry</i> &quot;ışık&quot; &#351; &lt;3 &amp;lt;\n\n')
        self.assertEqual(cues[0][2], 'Tom & Jerry "ışık" ş <3 &lt;')

    def test_inline_styles_preserve_words_and_breaks_preserve_separation(self):
        cues = self.parse('1\n00:00:00,000 --> 00:00:02,000\n'
                          'Türk<i>çe</i> {\\i1}ışık{\\i0}<br />yeni<br>satır.\n\n')
        self.assertEqual(cues[0][2], 'Türkçe ışık yeni satır.')


if __name__ == '__main__':
    unittest.main()
