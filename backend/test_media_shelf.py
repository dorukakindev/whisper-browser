import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from media_shelf import read_book, letterboxd, letterboxd_archive, rss


class ShelfParsingTests(unittest.TestCase):

    def test_large_podcast_feed_remains_bounded_and_rejects_deep_xml(self):
        body = b'<rss><channel><title>Publisher</title><description>' + b'x' * 2_100_000 + b'</description><item><title>Episode</title><enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg"/></item></channel></rss>'
        self.assertEqual(rss(body)['episodes'][0]['title'], 'Episode')
        with self.assertRaisesRegex(ValueError, 'too large'):
            rss(b'x' * (6 * 1024 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, 'complexity'):
            rss(b'<rss>' + b'<a>' * 45 + b'</a>' * 45 + b'</rss>')


    def epub(self, folder, escape=False):
        file = Path(folder) / 'Öykü.epub'
        with zipfile.ZipFile(file, 'w') as archive:
            archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
            archive.writestr('OPS/book.opf', '''<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title/><dc:title>İstanbul &amp; Öykü</dc:title><dc:creator>Yazar</dc:creator></metadata><manifest><item id="b" href="b.xhtml"/><item id="a" href="%s"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>''' % ('../../escape.xhtml' if escape else 'a.xhtml'))
            archive.writestr('OPS/b.xhtml', '<h1>İkinci</h1><p>Bir &amp;lt; işaret.</p><script>alert(1)</script>')
            archive.writestr('OPS/a.xhtml', '<p>Birinci metin.</p>')
        return file

    def test_epub_spine_order_empty_title_unicode_and_no_scripts(self):
        with tempfile.TemporaryDirectory() as folder:
            book = read_book(self.epub(folder))
            self.assertEqual(book['title'], 'İstanbul & Öykü')
            self.assertIn('İkinci', book['chapters'][0]['text'])
            self.assertIn('&lt;', book['chapters'][0]['text'])
            self.assertNotIn('alert', book['chapters'][0]['text'])
            self.assertIn('Birinci', book['chapters'][1]['text'])
            self.assertEqual([c['sourceSpineIndex'] for c in book['chapters']], [0, 1])
            self.assertNotEqual(book['chapters'][0]['sourceId'], book['chapters'][1]['sourceId'])
            again = read_book(self.epub(folder))
            self.assertEqual([c['sourceId'] for c in book['chapters']], [c['sourceId'] for c in again['chapters']])

    def test_archive_traversal_is_rejected_without_extracting(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                read_book(self.epub(folder, escape=True))
            self.assertFalse((Path(folder) / 'escape.xhtml').exists())

    def test_dtd_is_rejected(self):
        with self.assertRaises(ValueError):
            rss(b'<!DOCTYPE rss [<!ENTITY e "bad">]><rss><channel/></rss>')

    def test_rss_audio_enclosure_and_atom(self):
        data = rss(b'<rss><channel><title>Podcast</title><item><title>A</title><enclosure url="https://audio.example/a.mp3" type="audio/mpeg"/></item><item><title>No audio</title></item></channel></rss>')
        self.assertEqual(len(data['episodes']), 1)
        self.assertEqual(data['episodes'][0]['title'], 'A')
        atom = rss(b'<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>B</title><link rel="enclosure" href="https://audio.example/b.mp3"/></entry></feed>')
        self.assertEqual(atom['episodes'][0]['title'], 'B')

    def test_csv_quotes_utf16_and_invalid_scores(self):
        data = 'Name,Year,Rating,Watched Date\r\n"Bir, Öykü",2024,4.5,2026-10-24\r\nBaşka,2025,NaN,\r\n'.encode('utf-16')
        rows = letterboxd(data)['rows']
        self.assertEqual(rows[0]['title'], 'Bir, Öykü')
        self.assertEqual(rows[0]['rating'], 4.5)
        self.assertIsNone(rows[1]['rating'])

    def test_cp1254_text_and_utf16_text(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'test.txt'
            for encoding in ['cp1254', 'utf-16']:
                file.write_bytes('Şimdi güzel bir öykü.'.encode(encoding))
                self.assertEqual(read_book(file)['chapters'][0]['text'], 'Şimdi güzel bir öykü.')

    def test_review_zip_preserves_repeat_reviews_and_metadata_without_extraction(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('reviews.csv', 'Name,Year,Review,Tags,Liked,Watched Date\nÖykü,2024,<p>İlk yorum</p><script>secret()</script>,sound,Yes,2026-01-01\nÖykü,2024,<p>İkinci yorum</p>,story,,2026-02-01\n')
            output.writestr('ratings.csv', 'Name,Year,Rating\nÖykü,2024,4.5\n')
            output.writestr('../../never-extracted.txt', 'irrelevant')
        archive.seek(0)
        result = letterboxd_archive(archive)
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(len(result['reviews']), 2)
        self.assertNotIn('secret', result['reviews'][0]['review'])
        self.assertEqual(result['rows'][0]['rating'], 4.5)
        self.assertTrue(result['rows'][0]['liked'])
        self.assertEqual(result['rows'][0]['tags'], ['sound', 'story'])


if __name__ == '__main__':
    unittest.main()
