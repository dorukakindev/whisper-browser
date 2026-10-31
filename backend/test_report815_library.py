import unittest
from media_shelf import rss, Prose

class Report815Library(unittest.TestCase):
    def test_atom_base_inheritance_and_stable_episode_identity(self):
        feed = b'''<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://media.example/shows/"><title>Fixture</title><entry xml:base="episodes/"><title>A</title><id>urn:episode:one</id><link rel="enclosure" xml:base="audio/" href="one.mp3"/></entry></feed>'''
        ep = rss(feed)['episodes'][0]
        self.assertEqual(ep['url'], 'https://media.example/shows/episodes/audio/one.mp3')
        self.assertEqual(ep['guid'], 'urn:episode:one')

    def test_hidden_html_subtree_does_not_become_reader_text(self):
        p = Prose()
        p.feed('<p>Visible</p><div hidden><p>Secret editor note</p></div><p hidden="until-found">Hidden</p><p>End</p>')
        result = ''.join(p.parts)
        self.assertIn('Visible', result)
        self.assertIn('End', result)
        self.assertNotIn('Secret', result)
        self.assertNotIn('Hidden', result)

if __name__ == '__main__':
    unittest.main()
