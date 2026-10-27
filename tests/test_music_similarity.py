import sys
import unittest
import tempfile
import io
import hashlib
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import numpy as np
from music_similarity import SPACE, windows, valid_vectors, rank, rank_many
import music_similarity


def record(id, vector, hash=None, artist=''):
    return {'id':id,'hash':hash or id,'space':SPACE,'vectors':[vector], 'segments':[[5,15]],'levels':[-15], 'artist':artist}


class MusicSimilarity(unittest.TestCase):
    def test_multi_reference_balances_each_seed_and_explains_real_scores(self):
        a=np.eye(1,512,0)[0];b=np.eye(1,512,1)[0]
        refs=[record('a',a.tolist(),artist='One'),record('b',b.tolist(),artist='Two')]
        rows=[record('only-a',a.tolist()),record('both',(a+b).tolist()),record('copy-of-a',a.tolist(),hash='a'),record('excluded',(a+b).tolist(),artist='TWO')]
        hits=rank_many(refs,rows,True)
        self.assertEqual([r['id'] for r in hits],['both','only-a'])
        self.assertAlmostEqual(hits[0]['score'],.70711,places=5)
        self.assertEqual([r['score'] for r in hits[1]['referenceScores']],[1,0])
        self.assertAlmostEqual(hits[1]['score'],.5)
        self.assertEqual(hits[1]['referenceId'],'a')
        self.assertEqual(rank_many(refs[:1],rows)[0]['score'],rank(refs[0],rows)[0]['score'])
        with self.assertRaises(ValueError):rank_many([],rows)
    def test_pinned_model_resume_verifies_checksum_before_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            for name in ['config.json','preprocessor_config.json']:(directory/name).write_text('{}')
            (directory/'pytorch_model.bin.download').write_bytes(b'abc')
            response=io.BytesIO(b'de');response.status=206;response.headers={'Content-Range':'bytes 3-4/5'}
            sha=hashlib.sha256(b'abcde').hexdigest()
            with patch.object(music_similarity,'WEIGHT_SIZE',5),patch.object(music_similarity,'WEIGHT_SHA',sha),patch('urllib.request.urlopen',return_value=response) as request:
                music_similarity.prepare(directory)
                self.assertEqual(request.call_args.args[0].headers['Range'],'bytes=3-')
            self.assertEqual((directory/'pytorch_model.bin').read_bytes(),b'abcde')
            self.assertTrue((directory/'READY.json').exists())
    def test_windows_cover_selected_range_without_random_crops(self):
        self.assertEqual(windows(7,10),[(7,3)])
        self.assertEqual(windows(10,90),[(10,10),(24,10),(38,10),(52,10),(66,10),(80,10)])
        self.assertEqual(windows(0,10),[(0,10)])

    def test_reject_zero_nan_wrong_dimension_and_too_many_vectors(self):
        for vectors in [[[0]*512],[[float('nan')]*512],[[1]*4],[[1]*512]*7]:
            with self.assertRaises(ValueError):valid_vectors(vectors)

    def test_real_cosine_ranking_dedup_self_and_space_isolation(self):
        a=np.eye(1,512,0)[0].tolist();b=np.eye(1,512,1)[0].tolist()
        reference=record('ref',a,'source')
        rows=[record('self',a,'source'),record('close',a,'other'),record('copy',a,'other'),record('different',b),{**record('wrong',a),'space':'another-model'},record('broken',[0]*512)]
        results=rank(reference,rows)
        self.assertEqual([r['id'] for r in results],['close','different'])
        self.assertAlmostEqual(results[0]['score'],1)
        self.assertAlmostEqual(results[-1]['score'],0)
        self.assertEqual(results[0]['matchedRange'],[5,15])
        with self.assertRaises(ValueError):rank({**reference,'space':'wrong'},rows)

    def test_artist_exclusion_uses_known_artist_not_filename_guess(self):
        v=[1]*512
        reference=record('ref',v,artist='Artist')
        self.assertEqual(rank(reference,[record('one',v,artist='ARTIST'),record('two',v,artist='Other')],exclude_artist=True)[0]['id'],'two')


if __name__=='__main__':unittest.main()
