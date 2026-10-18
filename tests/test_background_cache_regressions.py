import hashlib
import io
import os
import shutil
import subprocess
from pathlib import Path
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import prepare_background as background


class BackgroundCacheTests(unittest.TestCase):
    def execute(self, root, source, *, download=None, invalid_generated=False, cues=None, interval=None, real_extraction=False):
        root = Path(root)
        srt = root / 'Türkçe.srt'
        srt.write_text(cues or '1\n00:00:00,000 --> 00:00:02,000\nSpeech.\n\n', encoding='utf-8-sig')
        calls = []
        output = root / 'out.wav'

        def run(args):
            calls.append(args)
            if '-m' in args:
                if download:
                    download(args)
            else:
                if real_extraction:
                    executable = Path(__file__).resolve().parents[1] / 'backend' / 'bin' / ('ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
                    command = str(executable) if executable.is_file() else shutil.which('ffmpeg')
                    if not command:
                        raise RuntimeError('FFmpeg test runtime is missing')
                    subprocess.run([command] + args[1:], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                else:
                    sf.write(args[-1], np.zeros((800, 2)), 8000)

        class Separator:
            torch_device = 'cuda'

            def __init__(self, **options):
                self.output = Path(options['output_dir']) / 'Instrumental.wav'

            def load_model(self, **options):
                pass

            def separate(self, source):
                if invalid_generated:
                    self.output.write_bytes(b'broken wave')
                elif real_extraction:
                    shutil.copyfile(source, self.output)
                else:
                    sf.write(self.output, np.ones((800, 2)) * .1, 8000)
                return [str(self.output)]

        modules = {'audio_separator': types.ModuleType('audio_separator'),
                   'audio_separator.separator': types.SimpleNamespace(Separator=Separator)}
        argv = ['prepare_background', '--source', str(source), '--srt', str(srt),
                '--output', str(output), '--models', str(root / 'models'), '--cache', str(root / 'cache'),
                '--ffmpeg', 'ffmpeg-fixture', '--download-python', 'python-fixture']
        if interval:
            argv += ['--start', str(interval[0]), '--end', str(interval[1])]
        with patch.object(sys, 'argv', argv), patch.object(background, 'run', side_effect=run), \
                patch.dict(sys.modules, modules), patch.dict('os.environ'), redirect_stdout(io.StringIO()):
            background.main()
        return output, calls

    def test_empty_download_cache_does_not_skip_a_fresh_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = 'https://www.youtube.com/watch?v=abcdefghijk'
            key = hashlib.sha256(source.encode()).hexdigest()[:24]
            cache = root / 'cache'
            cache.mkdir()
            broken = cache / (key + '.source.webm')
            broken.touch()

            def download(args):
                self.assertIn('--force-overwrites', args, 'yt-dlp otherwise skips the existing empty final file')
                broken.write_bytes(b'fixture complete download')

            output, calls = self.execute(root, source, download=download)
            self.assertTrue(output.is_file())
            self.assertTrue(any('-m' in args for args in calls), 'empty cache was treated as a complete download')

    def test_temporary_downloader_file_is_not_accepted_as_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = 'https://www.youtube.com/watch?v=abcdefghijk'
            key = hashlib.sha256(source.encode()).hexdigest()[:24]

            def download(args):
                (root / 'cache' / (key + '.source.tmp')).write_bytes(b'incomplete')

            with self.assertRaises(ValueError):
                self.execute(root, source, download=download)
            self.assertFalse((root / 'out.wav').exists())

    def test_corrupt_instrumental_cache_is_regenerated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'video.mp4'
            source.write_bytes(b'fixture')
            output, _ = self.execute(root, source)
            stem = next((root / 'cache').glob('*-instrumental.wav'))
            stem.write_bytes(b'broken cache')
            output.unlink()
            output, calls = self.execute(root, source)
            self.assertTrue(calls, 'corrupt instrumental was copied without regeneration')
            self.assertGreater(sf.info(output).frames, 0)

    def test_invalid_separator_output_never_replaces_existing_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'video.mp4'
            source.write_bytes(b'fixture')
            output = root / 'out.wav'
            output.write_bytes(b'keep existing output')
            with self.assertRaises(ValueError):
                self.execute(root, source, invalid_generated=True)
            self.assertEqual(output.read_bytes(), b'keep existing output')

    def test_valid_cache_reuse_does_not_repeat_separation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'video.mp4'
            source.write_bytes(b'fixture')
            output, _ = self.execute(root, source)
            expected = output.read_bytes()
            output.unlink()
            output, calls = self.execute(root, source)
            self.assertEqual(calls, [])
            self.assertEqual(output.read_bytes(), expected)

    def test_non_wav_content_with_wav_extension_is_not_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'wrong.wav'
            sf.write(file, np.ones(800) * .1, 8000, format='FLAC')
            self.assertFalse(background.valid_wav(file))

    def test_latest_end_of_overlapping_subtitles_controls_background_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'video.mp4'
            source.write_bytes(b'fixture')
            cues = ('1\n00:00:00,000 --> 00:01:00,000\nLong cue.\n\n'
                    '2\n00:00:02,000 --> 00:00:03,000\nShort cue.\n\n')
            _, calls = self.execute(root, source, cues=cues)
            extract = calls[0]
            self.assertEqual(float(extract[extract.index('-t') + 1]), 62)

    def test_nonfinite_intervals_are_rejected_before_extraction(self):
        for interval in [('nan', 10), (0, 'inf')]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / 'video.mp4'
                source.write_bytes(b'fixture')
                with self.assertRaises(ValueError):
                    self.execute(root, source, interval=interval)

    def test_download_candidates_must_be_complete_regular_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'key.source.webm').mkdir()
            (root / 'key.source.tmp').write_bytes(b'temporary')
            (root / 'key.source.mp4.part').write_bytes(b'temporary')
            (root / 'key.source.m4a').write_bytes(b'complete')
            self.assertEqual(background.downloaded_sources(root, 'key'), [root / 'key.source.m4a'])

    def test_real_ffmpeg_extraction_and_wav_cache_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'Türkçe kaynak.wav'
            sf.write(source, np.zeros((40000, 2)), 8000)
            output, calls = self.execute(root, source, real_extraction=True)
            info = sf.info(output)
            self.assertEqual(info.samplerate, 44100)
            self.assertAlmostEqual(info.duration, 4, places=2)
            self.assertEqual(info.channels, 2)
            self.assertEqual(len(calls), 1)
            output.unlink()
            output, calls = self.execute(root, source, real_extraction=True)
            self.assertEqual(calls, [])
            self.assertAlmostEqual(sf.info(output).duration, 4, places=2)


if __name__ == '__main__':
    unittest.main()
