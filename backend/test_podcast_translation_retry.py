import hashlib
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
import transcribe as T
from test_transcribe import _TrArgs

class PodcastTranslationRetryTests(unittest.TestCase):
    def fixture(self, root):
        source, translation = root / 'retry.en.srt', root / 'retry.tr.srt'
        source.write_text('1\n00:00:12,000 --> 00:00:14,000\nHello there.\n\n2\n00:00:14,000 --> 00:00:16,000\nHow are you today?\n\n', encoding='utf-8-sig')
        translation.write_text(source.read_text(encoding='utf-8-sig').replace('Hello there.', 'Merhaba dostum.'), encoding='utf-8-sig')
        args = _TrArgs(input=str(source), output_dir=str(root), language='en', translate_to='tr', max_lines=2, wrap_mode='sentence', formats='srt', dual_subtitle=False, dual_translation_first=False, translate_existing=str(translation), translate_retry_only=True, translate_cue_range='12:16', merge_continuation=False, dedupe_cues=False)
        entries = T.parse_subtitle_entries(source.read_text(encoding='utf-8-sig'), '.srt')
        metadata = {'version': 1, 'role': 'translation', 'sourceHash': T.subtitle_entries_hash(entries), 'sourceId': T.subtitle_source_id(args, T.subtitle_entries_hash(entries)), 'targetLanguage': 'tr', 'forSpeech': False, 'subtitleHash': hashlib.sha256(translation.read_bytes()).hexdigest(), 'total': 2, 'completed': 1, 'failed': 1, 'status': 'partial', 'cues': [{'key': T.translation_cue_fingerprint(row, i), 'status': 'completed' if i == 0 else 'failed', 'text': 'Merhaba dostum.' if i == 0 else row[2]} for i, row in enumerate(entries)]}
        Path(str(translation)+'.meta.json').write_text(json.dumps(metadata), encoding='utf-8')
        return source, translation, args, metadata

    def test_strict_retry_keeps_reviewed_line_breaks_and_text(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tmp') as directory:
            source, translation, args, metadata = self.fixture(Path(directory))
            reviewed = '<i>Merhaba</i>\ndostum.'
            translation.write_text(translation.read_text(encoding='utf-8-sig').replace(
                'Merhaba dostum.', reviewed), encoding='utf-8-sig')
            metadata['subtitleHash'] = hashlib.sha256(translation.read_bytes()).hexdigest()
            metadata['cues'][0]['text'] = reviewed
            Path(str(translation)+'.meta.json').write_text(json.dumps(metadata), encoding='utf-8')

            def translate(rows, _args, _warnings, source_lang=None, status_out=None, precompleted=None):
                self.assertEqual(precompleted, {0: reviewed})
                status_out.update(completed=[1], failed=[])
                return [(s, e, ['Unexpected replacement.', 'Bugün nasılsın?'][i])
                        for i, (s, e, _) in enumerate(rows)]

            with patch.object(T, 'llm_translate', side_effect=translate), patch.object(T, 'emit') as events, redirect_stdout(io.StringIO()):
                T.translate_existing_subtitle(args)
            saved = T.parse_subtitle_entries(translation.read_text(encoding='utf-8-sig'), '.srt')
            self.assertEqual(saved, [(12.0, 14.0, reviewed), (14.0, 16.0, 'Bugün nasılsın?')])
            done = next(call.kwargs for call in events.call_args_list if call.args[0] == 'done')
            self.assertEqual(done['outputs'][0]['subtitleHash'], hashlib.sha256(translation.read_bytes()).hexdigest())

    def test_strict_range_does_not_mark_missing_cues_outside_range_completed(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tmp') as directory:
            root = Path(directory)
            _, translation, args, metadata = self.fixture(root)
            previous = 'Nasıl hissediyorsun?'
            translation.write_text(translation.read_text(encoding='utf-8-sig').replace(
                'How are you today?', previous), encoding='utf-8-sig')
            metadata['subtitleHash'] = hashlib.sha256(translation.read_bytes()).hexdigest()
            metadata['cues'][1]['text'] = previous
            Path(str(translation)+'.meta.json').write_text(json.dumps(metadata), encoding='utf-8')
            args.translate_cue_range = '12:13'
            with patch.object(T, 'llm_translate') as provider, patch.object(T, 'emit'), redirect_stdout(io.StringIO()):
                T.translate_existing_subtitle(args)
            provider.assert_not_called()
            result = json.loads(next(root.glob('*.partial.srt.meta.json')).read_text(encoding='utf-8'))
            self.assertEqual([cue['status'] for cue in result['cues']], ['completed', 'failed'])
            self.assertEqual(result['cues'][1]['text'], previous)

    def test_strict_retry_preserves_completed_cue_even_inside_original_range(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tmp') as directory:
            source, translation, args, metadata = self.fixture(Path(directory))
            def translate(entries, _args, _warnings, source_lang=None, status_out=None, precompleted=None):
                self.assertEqual(precompleted, {0: 'Merhaba dostum.'})
                status_out.update(completed=[0, 1], failed=[])
                return [(entries[0][0], entries[0][1], precompleted[0]), (entries[1][0], entries[1][1], 'Bugün nasılsın?')]
            with patch.object(T, 'llm_translate', side_effect=translate) as provider, patch.object(T, 'emit'), redirect_stdout(io.StringIO()):
                T.translate_existing_subtitle(args)
            self.assertEqual(provider.call_count, 1)
            saved = T.parse_subtitle_entries(translation.read_text(encoding='utf-8-sig'), '.srt')
            self.assertEqual(saved[0][2], 'Merhaba dostum.')
            self.assertEqual(source.read_text(encoding='utf-8-sig').count('Hello there.'), 1)

    def test_metadata_or_cleaned_source_mismatch_never_calls_provider(self):
        for mode in ['missing', 'target', 'source', 'changed-file', 'cleanup', 'same-language']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tmp') as directory:
                source, translation, args, metadata = self.fixture(Path(directory))
                sidecar = Path(str(translation)+'.meta.json')
                if mode == 'missing': sidecar.unlink()
                elif mode == 'target': args.translate_to = 'de'
                elif mode == 'same-language': args.language = 'tr'
                elif mode == 'source': source.write_text(source.read_text(encoding='utf-8-sig').replace('Hello there.', 'Changed source.'), encoding='utf-8-sig')
                elif mode == 'changed-file': translation.write_text(translation.read_text(encoding='utf-8-sig').replace('Merhaba dostum.', 'Changed translation.'), encoding='utf-8-sig')
                cleanup = (lambda entries: (entries[1:], 0, 1)) if mode == 'cleanup' else (lambda entries: (entries, 0, 0))
                with patch.object(T, 'dedupe_rolling_window_cues', side_effect=cleanup), patch.object(T, 'llm_translate') as provider, patch.object(T, 'emit'), redirect_stdout(io.StringIO()):
                    with self.assertRaises(RuntimeError): T.translate_existing_subtitle(args)
                provider.assert_not_called()

    def test_strict_retry_keeps_unchanged_names_and_structural_sdh(self):
        for first in ['New York', '[wind]', '[distant music]']:
            with self.subTest(first=first), tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tmp') as directory:
                source, translation, args, metadata = self.fixture(Path(directory))
                source.write_text(source.read_text(encoding='utf-8-sig').replace('Hello there.', first), encoding='utf-8-sig')
                translation.write_text(source.read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
                entries = T.parse_subtitle_entries(source.read_text(encoding='utf-8-sig'), '.srt')
                metadata.update(sourceHash=T.subtitle_entries_hash(entries), sourceId=T.subtitle_source_id(args, T.subtitle_entries_hash(entries)), subtitleHash=hashlib.sha256(translation.read_bytes()).hexdigest(), cues=[{'key': T.translation_cue_fingerprint(row, i), 'status': 'completed' if i == 0 else 'failed', 'text': row[2]} for i, row in enumerate(entries)])
                Path(str(translation)+'.meta.json').write_text(json.dumps(metadata), encoding='utf-8')
                def translate(rows, _args, _warnings, source_lang=None, status_out=None, precompleted=None):
                    self.assertEqual(precompleted, {0: first})
                    status_out.update(completed=[0, 1], failed=[])
                    return [(rows[0][0], rows[0][1], precompleted[0]), (rows[1][0], rows[1][1], 'Bugün nasılsın?')]
                with patch.object(T, 'llm_translate', side_effect=translate) as provider, patch.object(T, 'emit'), redirect_stdout(io.StringIO()):
                    T.translate_existing_subtitle(args)
                self.assertEqual(provider.call_count, 1)
                self.assertEqual(T.parse_subtitle_entries(translation.read_text(encoding='utf-8-sig'), '.srt')[0][2], first)

if __name__ == '__main__': unittest.main()
