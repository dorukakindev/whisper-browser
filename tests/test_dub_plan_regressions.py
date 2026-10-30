import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_plan


class DubPlanRegressionTests(unittest.TestCase):
    def test_narration_is_opt_in_and_preserves_original_ids_after_sdh_filtering(self):
        payload = ('1\n00:00:00,000 --> 00:00:01,000\n[MÜZİK]\n\n'
                   '2\n00:00:02,000 --> 00:00:03,000\nİnsan zihni\n\n'
                   '3\n00:00:03,100 --> 00:00:03,900\n(alkış)\n\n'
                   '4\n00:00:04,100 --> 00:00:06,000\nkarmaşıktır.\n\n').encode('utf-8')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'narration.srt'
            source.write_bytes(payload)
            legacy = dub_plan.plan(source)
            self.assertEqual(legacy, dub_plan.plan(source, grouping='cumle'))
            self.assertEqual([g['source_ids'] for g in legacy['groups']], [[2], [4]])
            result = dub_plan.plan(source, grouping='anlatim')
            self.assertEqual([g['source_ids'] for g in result['groups']], [[2, 4]])
            self.assertEqual(result['groups'][0]['text'], 'İnsan zihni karmaşıktır.')
            self.assertEqual(result['skipped'], 2)
            self.assertEqual(source.read_bytes(), payload)
            self.assertEqual(result['sourceHash'], legacy['sourceHash'])
        self.assertEqual(dub_plan.grouping_options('cumle'),
                         {'mode': 'cumle', 'max_chars': 250, 'max_seconds': 12, 'max_gap_ms': 600})
        self.assertEqual(dub_plan.grouping_options('akici'),
                         {'mode': 'akici', 'max_chars': 280, 'max_seconds': 18, 'max_gap_ms': 600})
        self.assertEqual(dub_plan.grouping_options('anlatim'),
                         {'mode': 'anlatim', 'max_chars': 280, 'max_seconds': 18, 'max_gap_ms': 600})

    def test_invalid_duration_cannot_drop_speech_silently(self):
        payload=b'1\n00:00:02,000 --> 00:00:01,000\nMissing speech.\n\n2\n00:00:03,000 --> 00:00:04,000\nNext.\n'
        with self.assertRaisesRegex(ValueError, 'cue 1: end'):
            dub_plan.parse_srt('unused.srt', payload)

    def test_unsorted_cues_report_identity_without_reordering(self):
        cues=dub_plan.SourceCues()
        cues.extend([(3000,4000,'First.'),(1000,2000,'Second.')])
        cues.source_ids=[2,4]
        with self.assertRaisesRegex(ValueError, 'cue 4: timestamps out of order'):
            dub_plan.make_groups(cues,mode='akici')
        self.assertEqual(cues.source_ids,[2,4])

    def test_final_text_without_newline_and_malformed_next_header(self):
        payload=b'1\n00:00:00,000 --> 00:00:01,000\nComplete last sentence.'
        self.assertEqual(dub_plan.parse_srt('unused',payload)[0][2],'Complete last sentence.')
        payload+=b'\n\n2\n00:00:02,000 --> broken\nSecond speech.'
        with self.assertRaisesRegex(ValueError,'Invalid SRT timestamp'):
            dub_plan.parse_srt('unused',payload)

    def test_compact_srt_preserves_every_cue_without_reading_indices(self):
        payload=''.join(f'{i+1}\n00:00:{i:02},000 --> 00:00:{i:02},900\nSpeech {i}.\n' for i in range(50)).encode()
        cues=dub_plan.parse_srt('unused.srt',payload)
        self.assertEqual([cue[2] for cue in cues],[f'Speech {i}.' for i in range(50)])
        self.assertEqual(cues.source_ids,list(range(1,51)))

    def test_source_hash_identifies_the_bytes_used_to_build_the_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'Türkçe.srt'
            original = b'1\n00:00:00,000 --> 00:00:02,000\nOriginal sentence.\n\n'
            source.write_bytes(original)
            make_groups = dub_plan.make_groups

            # plan() passes the grouping options by keyword; the wrapper must forward them.
            def change_after_parse(cues, *args, **options):
                source.write_text('1\n00:00:00,000 --> 00:00:02,000\nChanged sentence.\n\n', encoding='utf-8')
                return make_groups(cues, *args, **options)

            with patch.object(dub_plan, 'make_groups', side_effect=change_after_parse):
                result = dub_plan.plan(source)
            self.assertEqual(result['groups'][0]['text'], 'Original sentence.')
            self.assertEqual(result['sourceHash'], hashlib.sha256(original).hexdigest())

    def test_long_timestamps_do_not_wrap_at_two_hour_digits(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'long.srt'
            source.write_text('1\n100:00:00,000 --> 100:00:02,000\nLong recording.\n\n', encoding='utf-8')
            self.assertEqual(dub_plan.parse_srt(source), [(360000000, 360002000, 'Long recording.')])

    def test_invalid_clock_components_are_not_silently_converted(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'invalid.srt'
            for timing in ['00:99:00,000 --> 01:40:00,000', '-01:00:00,000 --> 01:00:02,000']:
                source.write_text(f'1\n{timing}\nSpeech.\n\n', encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'Invalid SRT timestamp'):
                    dub_plan.parse_srt(source)

    def test_sound_and_music_annotations_are_never_read_aloud(self):
        payload = ('1\n00:00:01,000 --> 00:00:03,000\n[MÜZİK]\n\n'
                   '2\n00:00:03,500 --> 00:00:06,000\nMerhaba, bugün 42 yıl öncesini anlatacağım.\n\n'
                   '3\n00:00:06,100 --> 00:00:08,000\n(alkış)\n\n'
                   '4\n00:00:08,100 --> 00:00:10,500\n♪ ♪\n\n'
                   '5\n00:00:10,600 --> 00:00:13,000\n[Müzik çalıyor] Peki sonra ne oldu? (fısıldar) Kimse bilmiyordu.\n\n'
                   '6\n00:00:13,100 --> 00:00:15,000\n...\n\n'
                   '7\n00:00:15,100 --> 00:00:17,000\n♪ La la la ♪\n\n').encode('utf-8')
        self.assertEqual([cue[2] for cue in dub_plan.parse_srt('unread.srt', payload)],
                         ['Merhaba, bugün 42 yıl öncesini anlatacağım.',
                          'Peki sonra ne oldu? Kimse bilmiyordu.', 'La la la'])
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'sdh.srt'
            source.write_bytes(payload)
            for grouping in ('akici', 'cumle', 'satir'):
                text = ' '.join(group['text'] for group in dub_plan.plan(source, grouping=grouping)['groups'])
                for annotation in ('MÜZİK', 'alkış', '♪', 'fısıldar', 'çalıyor', '...'):
                    self.assertNotIn(annotation, text, grouping)
            # Dropped annotation cues are counted, never silently lost: [MÜZİK], (alkış), ♪ ♪ and '...'.
            self.assertEqual(dub_plan.plan(source)['skipped'], 4)
            plain = Path(directory) / 'plain.srt'
            plain.write_text('1\n00:00:00,000 --> 00:00:02,000\nMerhaba.\n\n', encoding='utf-8')
            self.assertEqual(dub_plan.plan(plain)['skipped'], 0)

    def test_real_parenthetical_speech_and_bracketed_names_are_still_spoken(self):
        payload = ('1\n00:00:00,000 --> 00:00:02,000\n(Evet, tabii) dedi.\n\n'
                   '2\n00:00:02,100 --> 00:00:04,000\n[Brain] bir organdır.\n\n').encode('utf-8')
        self.assertEqual([cue[2] for cue in dub_plan.parse_srt('unread.srt', payload)],
                         ['(Evet, tabii) dedi.', '[Brain] bir organdır.'])

    def test_filter_keeps_original_cue_identity_for_old_edits_and_ranges(self):
        payload = ('1\n00:00:00,000 --> 00:00:01,000\n[MÜZİK]\n\n'
                   '2\n00:00:02,000 --> 00:00:04,000\nİlk konuşma.\n\n'
                   '3\n00:00:04,100 --> 00:00:05,000\n(alkış)\n\n'
                   '4\n00:00:06,000 --> 00:00:08,000\nİkinci konuşma.\n\n').encode('utf-8')
        cues = dub_plan.parse_srt('unused.srt', payload)
        self.assertEqual(cues.source_ids, [2, 4])
        for mode in ('satir', 'cumle', 'akici'):
            groups = dub_plan.make_groups(cues, mode=mode)
            self.assertEqual([i for g in groups for i in g['source_ids']], [2, 4])
        groups = dub_plan.make_groups(cues, mode='satir')
        digest = hashlib.sha256(payload).hexdigest()
        dub_plan.apply_edits(groups, {'sourceHash':digest, 'edits':{'2':'İlk cümle için düzenleme.'}}, digest)
        self.assertEqual(groups[0]['text'], 'İlk cümle için düzenleme.')
        self.assertEqual(groups[1]['text'], 'İkinci konuşma.')
        ranged = dub_plan.make_groups(cues, start=5, end=9, mode='satir')
        self.assertEqual(ranged[0]['source_ids'], [4])
        preview = dub_plan.make_groups(cues, limit=1, mode='satir')
        self.assertEqual(preview[0]['source_ids'], [2])
        shifted = dub_plan.shift_cues(cues, -5000)
        self.assertEqual(shifted.source_ids, [4])
        self.assertEqual(dub_plan.make_groups(shifted, mode='satir')[0]['source_ids'], [4])

    def test_bom_windows_newlines_and_subsecond_timestamps_still_parse(self):
        payload = '\ufeff1\r\n00:00:00,1 --> 00:00:01,25\r\nTürkçe ışık.\r\n\r\n'.encode('utf-8')
        self.assertEqual(dub_plan.parse_srt('unread-file.srt', payload), [(100, 1250, 'Türkçe ışık.')])

    def test_plan_rejects_oversized_input_before_building_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'large.srt'
            source.write_bytes(b'x' * (dub_plan.MAX_SOURCE_BYTES + 1))
            with patch.object(dub_plan, 'make_groups') as grouping:
                with self.assertRaises(ValueError):
                    dub_plan.plan(source)
                grouping.assert_not_called()


class EncodingMetadataTests(unittest.TestCase):
    def test_exact_bytes_and_turkish_text_are_preserved_with_read_metadata(self):
        text='1\n00:00:00,000 --> 00:00:02,000\nİğne ışığı güzel.\n'
        with tempfile.TemporaryDirectory() as temp:
            for codec,expected in [('utf-8','utf-8'),('utf-16','utf-16le'),('cp1254','cp1254')]:
                with self.subTest(codec=codec):
                    source=Path(temp)/'Türkçe.srt';raw=text.encode(codec);source.write_bytes(raw);result=dub_plan.plan(source);
                    self.assertEqual(result['sourceDecoding']['encoding'],expected);self.assertFalse(result['sourceDecoding']['repaired']);self.assertIn('İğne ışığı',result['groups'][0]['text']);self.assertEqual(source.read_bytes(),raw)


if __name__ == '__main__':
    unittest.main()
