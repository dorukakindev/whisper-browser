import importlib.util
from pathlib import Path
import tempfile
import unittest
import ast
import json
import math
import asyncio
import sys
import shutil
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))
spec = importlib.util.spec_from_file_location('dub_timing', Path(__file__).resolve().parents[1] / 'tools/voxcpm2/dub_timing.py')
D = importlib.util.module_from_spec(spec)
spec.loader.exec_module(D)


class DubTimingTests(unittest.TestCase):
    def test_narration_bridges_a_short_unfinished_fragment_only_when_selected(self):
        cues = [(0, 1000, 'İnsan zihni'), (2200, 4000, 'sandığımızdan daha karmaşıktır.')]
        for mode in ('cumle', 'satir', 'akici'):
            self.assertEqual([g['source_ids'] for g in D.sentence_plan(cues, mode)], [[1], [2]], mode)
        groups = D.sentence_plan(cues, 'anlatim')
        self.assertEqual(groups, [{'start': 0, 'end': 4000,
                                  'text': 'İnsan zihni sandığımızdan daha karmaşıktır.',
                                  'source_ids': [1, 2]}])
        self.assertEqual(D.sentence_plan(cues), D.sentence_plan(cues, 'cumle'))

    def test_narration_keeps_hard_boundaries_and_completed_replies(self):
        cases = [
            ([(0, 1000, 'İnsan zihni'), (2201, 4000, 'karmaşıktır.')], {}),
            ([(0, 1000, 'Bitti.'), (1900, 4000, 'Sonra devam etti.')], {}),
            ([(0, 1000, '"Bitti!"'), (1900, 4000, 'Sonra devam etti.')], {}),
            ([(0, 1000, 'bir iki üç dört beş'), (1900, 4000, 'devam eder.')], {}),
            ([(0, 1000, 'Bu oldukça uzun tamamlanmamış anlatım'), (1900, 4000, 'devam eder.')], {}),
            ([(0, 1000, 'İnsan zihni'), (900, 4000, 'karmaşıktır.')], {}),
            ([(0, 1000, 'İnsan zihni'), (1900, 4000, 'ANLATICI: Devam.')], {}),
            ([(0, 1000, 'ANLATICI: İnsan zihni'), (1900, 4000, 'karmaşıktır.')], {}),
            ([(0, 1000, 'İnsan zihni'), (1900, 4000, 'karmaşıktır.')], {'max_seconds': 3}),
            ([(0, 1000, 'İnsan zihni'), (1900, 4000, 'karmaşıktır.')], {'max_chars': 20}),
        ]
        for cues, options in cases:
            with self.subTest(cues=cues, options=options):
                self.assertEqual([g['source_ids'] for g in D.sentence_plan(cues, 'anlatim', **options)], [[1], [2]])

    def test_narration_gap_extension_respects_explicit_gap_configuration(self):
        cues = [(0, 1000, 'İnsan zihni'), (2500, 4000, 'karmaşıktır.')]
        self.assertEqual(len(D.sentence_plan(cues, 'anlatim', max_gap_ms=2000)), 1)
        cues[1] = (1500, 4000, 'karmaşıktır.')
        self.assertEqual(len(D.sentence_plan(cues, 'anlatim', max_gap_ms=200)), 2)

    def test_simultaneous_cues_keep_legacy_identity_without_disabling_narration_bridge(self):
        cues = [(0, 1000, 'İlk'), (0, 1000, 'cümle.'),
                (4000, 5000, 'İnsan zihni'), (6000, 8000, 'karmaşıktır.')]
        self.assertEqual([g['source_ids'] for g in D.sentence_plan(cues, 'akici')], [[1, 2], [3], [4]])
        groups = D.sentence_plan(cues, 'anlatim')
        self.assertEqual([g['source_ids'] for g in groups], [[1, 2], [3, 4]])
        self.assertEqual(' '.join(g['text'] for g in groups), ' '.join(c[2] for c in cues))

    def test_timelines_reject_missing_or_extra_audio_before_reading_files(self):
        cues = [(0, 1000, 'First.'), (1000, 2000, 'Last sentence.')]
        for selected, files in [(cues, ['missing.wav']), (cues, ['a.wav', 'b.wav', 'extra.wav']), ([], [])]:
            with self.subTest(groups=len(selected), files=len(files)):
                with self.assertRaisesRegex(ValueError, 'count mismatch'):
                    D.build_narration_timeline(selected, files, 8000)
                with self.assertRaisesRegex(ValueError, 'count mismatch'):
                    D.build_adaptive_timeline(selected, files, 8000, 2, 1, '.')
                with self.assertRaisesRegex(ValueError, 'count mismatch'):
                    D.build_fixed_timeline(selected, files, 8000, 2, 1, '.')

    def test_invalid_speech_cannot_become_silent_or_corrupt_timeline(self):
        for speech in (np.array([]), np.array([np.nan]), np.array([np.inf]), np.ones((80, 2))):
            with self.subTest(shape=speech.shape):
                with patch.object(D.subprocess, 'run') as convert:
                    with self.assertRaisesRegex(ValueError, 'Invalid speech audio'):
                        D.fit_to_window(speech, 8000, 1, 1.15, '.', 'invalid', 'uzat')
                    convert.assert_not_called()
                # A source sample-rate mismatch must not bypass validation by
                # interpolating a stereo/empty/nonfinite cache entry first.
                with tempfile.TemporaryDirectory() as folder:
                    with patch.object(D.sf, 'read', return_value=(speech, 16000)):
                        with self.assertRaisesRegex(ValueError, 'Invalid speech audio'):
                            D.build_fixed_timeline([(0, 1000, 'Speech.')], ['fixture.wav'],
                                8000, 1, 1, folder, log=lambda _: None)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg is needed for the tempo preservation fixture')
    def test_tempo_preserves_quiet_detail_without_quantization_bias(self):
        sr = 8000
        quiet = (1e-5 * np.sin(np.arange(sr * 2) * 2*np.pi*220/sr)).astype(np.float32)
        with tempfile.TemporaryDirectory() as folder:
            fitted, report = D.fit_to_window(quiet, sr, 1.8, 1.15, folder, 'quiet', 'uzat')
        self.assertGreater(report['tempo'], 1)
        self.assertNotIn('tempo_error', report)
        self.assertLess(len(fitted), len(quiet))
        self.assertGreater(float(np.sqrt(np.mean(fitted.astype(np.float64)**2))), 4e-6)
        self.assertLess(float(np.max(np.abs(fitted))), 1.1e-5)
        self.assertLess(abs(float(np.mean(fitted))), 1e-7)

    def test_adaptive_timeline_keeps_speech_and_maps_video_without_overlap(self):
        with tempfile.TemporaryDirectory() as folder:
            a,b = Path(folder)/'a.wav',Path(folder)/'b.wav'
            D.sf.write(a,np.ones(12000,dtype=np.float32)*.2,8000)
            D.sf.write(b,np.ones(8000,dtype=np.float32)*.3,8000)
            wav,timing,sync = D.build_adaptive_timeline([(0,1000,'a'),(1000,2000,'b')],
                [a,b],8000,2,1,folder,extra_ms=0)
            self.assertGreaterEqual(len(wav),19800)
            self.assertEqual(timing['clipped_groups'],0)
            self.assertEqual(timing['stretched_groups'],1)
            self.assertAlmostEqual(sync['segments'][0]['v1'],1)
            self.assertGreater(sync['segments'][0]['a1'],1.49)
            self.assertEqual(sync['segments'][1]['a0'],sync['segments'][0]['a1'])

    def test_sentence_boundaries_abbreviations_and_continuations(self):
        cues = [(0,1000,'Dr.'),(1000,2000,'Ali geldi.'),(2000,3000,'Ama henüz bütün hazırlıklar'),
                (3000,4000,'tamamlanmış değildi.'),(4000,4500,'Evet.')]
        groups = D.sentence_plan(cues)
        self.assertEqual([g['text'] for g in groups], ['Dr. Ali geldi.', 'Ama henüz bütün hazırlıklar tamamlanmış değildi. Evet.'])
        self.assertEqual([i for g in groups for i in g['source_ids']], list(range(1,6)))
        self.assertEqual(len(D.sentence_plan([(0,2000,'bir'),(1500,3000,'iki')])), 2)

    def test_separate_text_checks_source_and_keeps_original(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))
        from dub_plan import apply_edits
        groups = D.sentence_plan([(0,1000,'Bu çok uzun bir cümledir.')])
        apply_edits(groups, {'sourceHash':'abc', 'edits':{'1':'Bu uzun.'}}, 'abc')
        self.assertEqual(groups[0]['original_text'], 'Bu çok uzun bir cümledir.')
        self.assertEqual(groups[0]['text'], 'Bu uzun.')
        with self.assertRaises(ValueError): apply_edits(groups, {'sourceHash':'xyz'}, 'abc')
        with self.assertRaises(ValueError): apply_edits(groups, {'sourceHash':'abc','edits':{'1':''}}, 'abc')

    def test_range_selects_only_intersections_with_original_source_ids(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))
        from dub_plan import make_groups
        cues = [(0,1000,'Eski.'),(2000,4000,'Yeni cümle'),(4000,7000,'burada biter.'),(8000,9000,'Son.')]
        groups = make_groups(cues, 3, 6)
        self.assertEqual(groups, [{'start':3000,'end':6000,'text':'Yeni cümle burada biter.','source_ids':[2,3]}])
        self.assertEqual(make_groups(cues,3,6,limit=1)[0]['source_ids'],[2])
        for start,end in [(6,3),(-1,3),(float('nan'),3),(10,11)]:
            with self.assertRaises(ValueError): make_groups(cues,start,end)

    def test_quality_retry_does_not_retry_valid_long_speech(self):
        calls = []
        async def generate(seed):
            calls.append(seed)
            return np.ones(32000, dtype=np.float32)
        audio, metric = asyncio.run(D.quality_retry(generate, lambda _: 0, 42))
        self.assertEqual(len(audio), 32000)
        self.assertEqual(calls, [42])
        self.assertEqual(metric['retries'], 0)

    def test_quality_retry_keeps_best_valid_attempt_and_times_out(self):
        async def generate(seed): return seed
        best, metric = asyncio.run(D.quality_retry(generate, lambda x: {1:2,100004:1,200007:3}[x], 1))
        self.assertEqual(best, 100004)
        self.assertEqual(metric['attempts'], 3)
        async def invalid(seed): return np.array([])
        with self.assertRaises(ValueError):
            asyncio.run(D.quality_retry(invalid, lambda _: math.inf, 1))
        async def stalled(seed): await asyncio.sleep(1)
        with self.assertRaises(D.EngineStalled):
            asyncio.run(D.quality_retry(stalled, lambda _: 0, 1, timeout=.01))

    def test_placement_borrows_silence_without_overlap_or_unnecessary_shift(self):
        cues = [(0,1000,'a'),(1500,2500,'b'),(3000,4000,'c')]
        start, stop = D.placement_window(cues, 1, 2, 1.3, 1.25, limit_ms=4000)
        self.assertAlmostEqual(start, 1.3)
        self.assertEqual(stop, 3)
        self.assertEqual(D.placement_window(cues, 1, 1, 1.3, 1.25), (1.5,3))
        start, stop = D.placement_window(cues, 2, 3, 2.9, 1.25, limit_ms=4500)
        self.assertGreaterEqual(start, 2.9)
        self.assertEqual(stop, 4.5)

    def test_default_timeline_returns_wav_when_speech_overflows(self):
        # Load the pure timeline function without importing the external GPU engine.
        source = Path(__file__).resolve().parents[1] / 'tools/voxcpm2/altyazi_oku.py'
        function = next(n for n in ast.parse(source.read_text(encoding='utf-8')).body
                        if isinstance(n, ast.FunctionDef) and n.name == 'build_timeline')
        scope = dict(np=np, math=math, json=json, Path=Path, sf=D.sf,
                     available_window=D.available_window, fit_audio=D.fit_to_window,
                     placement_window=D.placement_window,
                     TimingOverflow=D.TimingOverflow)
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), scope)
        with tempfile.TemporaryDirectory() as directory:
            part = Path(directory) / 'part.wav'
            sr = 8000
            D.sf.write(part, np.sin(np.arange(sr*2)*2*np.pi*220/sr)*.3, sr)
            warnings = []
            audio, timing = scope['build_timeline']([(0,1000,'a'),(1000,2000,'b')],
                [part,part], sr, 2, 1.15, directory, log=warnings.append, end_limit_ms=2000)
            self.assertEqual(len(audio), sr*2)
            self.assertEqual(timing['clipped_groups'], 2)
            events = [json.loads(w) for w in warnings if w.startswith('{')]
            self.assertEqual(events, [{'type': 'timing', 'version': 1, 'accelerated': timing['accelerated_groups'], 'clipped': 2, 'overflow': timing['overflow_groups']}])
            self.assertGreater(float(np.abs(audio).max()), .1)
            self.assertEqual(len([w for w in warnings if w.startswith('UYARI:')]), 2)
            self.assertTrue((Path(directory)/'timing_report.json').is_file())

    def test_continuation_groups_preserve_text_and_ids(self):
        cues = [(0, 2000, 'Bu kisa cumle'), (2050, 4000, 'burada tamamlanir.'),
                (6500, 7500, 'Yeni sahne.'), (7550, 9000, '- Baska konusmaci.')]
        plan = D.sentence_plan(cues)
        self.assertEqual(len(plan), 3)
        self.assertEqual(plan[0]['text'], 'Bu kisa cumle burada tamamlanir.')
        self.assertEqual(plan[0]['source_ids'], [1, 2])
        self.assertEqual([i for g in plan for i in g['source_ids']], [1, 2, 3, 4])
        self.assertEqual(len(D.sentence_plan(cues, mode='satir')), 4)

    def test_limits_and_nonmonotonic_input(self):
        tail = D.sentence_plan([(0, 8000, 'a'*130 + '.'), (8050, 9200, 'Kisa.')])
        self.assertEqual(len(tail), 1, 'nearby short ending must not lose sentence context')
        self.assertEqual(len(D.sentence_plan([(0, 3000, 'a'*100), (3100, 5000, 'b'*100)], max_chars=150)), 2)
        self.assertEqual(len(D.sentence_plan([(0, 3000, 'a'), (3050, 6000, 'b')], max_seconds=4)), 2)
        with self.assertRaises(ValueError):
            D.sentence_plan([(3000, 4000, 'a'), (0, 2000, 'b')])
        self.assertAlmostEqual(D.available_window([(0, 1000, 'a'), (1100, 2000, 'b')], 0), 1.1)
        self.assertAlmostEqual(D.available_window([(0, 1000, 'a')], 0, limit_ms=1400), 1.4)

    def test_speech_overrun_never_silently_clips(self):
        sr = 8000
        speech = np.sin(np.arange(sr*2) * 2*np.pi*220/sr).astype(np.float32) * .3
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(D.TimingOverflow) as failure:
                D.fit_to_window(speech, sr, 1, 1.15, directory, 'safe')
            self.assertGreater(failure.exception.report['overrun_seconds'], .5)
            wav, report = D.fit_to_window(speech, sr, 1, 1.15, directory, 'explicit', 'kirp')
            self.assertEqual(len(wav), sr)
            self.assertGreater(report['cut_frames'], 0)
            self.assertGreater(report['tempo'], 1)

    def test_padding_trim_is_separate_from_speech_cut(self):
        wav = np.concatenate([np.ones(8000, np.float32)*.2, np.zeros(80, np.float32)])
        with tempfile.TemporaryDirectory() as directory:
            out, report = D.fit_to_window(wav, 8000, 1, 1.15, directory, 'padding')
        self.assertEqual(len(out), 8000)
        self.assertEqual(report['cut_frames'], 0)
        self.assertEqual(report['silence_trim_frames'], 80)

    def test_a_colon_inside_narration_is_not_a_speaker_change(self):
        from dub_timing import sentence_plan, is_speaker_turn
        narration = [(0, 3000, 'Önemli olan şu kadar basit görünüyor ve'),
                     (3100, 6000, 'Şöyle düşünün: bir adam yürüyor'),
                     (6100, 9000, 've sonra birden duruyor.')]
        for mode in ('akici', 'cumle'):
            groups = sentence_plan(narration, mode, 280, 18, 600)
            self.assertEqual([g['source_ids'] for g in groups], [[1, 2, 3]], mode)
        self.assertEqual(len(sentence_plan(narration, 'satir', 280, 18, 600)), 3, 'line mode keeps one group per cue')
        for text in ['Kitabın temel iddiası şuydu: bilinç', 'Sonuç olarak şunu söyledi: evet', 'Saat 5:30 civarı', 'Julian Jaynes şunu yazdı: bir']:
            self.assertFalse(is_speaker_turn(text), text)

    def test_real_speaker_labels_still_split_turns(self):
        from dub_timing import sentence_plan, is_speaker_turn
        for text in ['JOHN: Merhaba', 'Dr. Kaya: Bugün', 'Prof. Demir: Dinliyorum', 'Anlatıcı: Ve', '- Evet.', '[Kadın] Hayır.', 'Mary Ann Smith: Hi', 'Ahmet bin Ali: Merhaba.', 'Ludwig van Beethoven: Evet.']:
            self.assertTrue(is_speaker_turn(text), text)
        dialogue = [(0, 2000, 'JOHN: Merhaba, nasılsın?'), (2100, 4000, 'MARY: İyiyim, teşekkürler.'), (4100, 6000, 'JOHN: Güzel.')]
        self.assertEqual([g['source_ids'] for g in sentence_plan(dialogue, 'akici', 280, 18, 600)], [[1], [2], [3]])


if __name__ == '__main__':
    unittest.main()
