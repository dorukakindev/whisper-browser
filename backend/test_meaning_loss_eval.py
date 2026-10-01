# -*- coding: utf-8 -*-
"""Anlam kaybı korpusu + kalite kapısı metrik kilidi (kuyruk-50 madde 3).

eval_data/meaning_loss_corpus.json (120 vaka, CC0) iki şeyi sabitler:
1) Doğru çeviriler (accept satırları) blocking kapısında yanlış-reddedilmez
   ve anlam tanısı üretmez — yanlış-ret oranı 0'dır.
2) Bozuk çevirilerde (reject satırları) 'gatable' işaretli vakalar blocking
   kapısından geçemez; gatable=false olanlar (argo/hitap — yapısal olarak
   kanıtlanamaz) yalnız ölçülen kör nokta olarak kalır.

Eşikler promosyon sonrası ölçülen değerlerdir; metrik bozulursa test düşer.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_meaning_loss import evaluate, report  # noqa: E402

CORPUS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      'eval_data', 'meaning_loss_corpus.json')


class MeaningLossCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = evaluate(CORPUS)
        cls.metrics = report(cls.rows)

    def test_corpus_shape_and_license(self):
        data = json.load(open(CORPUS, encoding='utf-8'))
        cases = data['cases']
        self.assertEqual(len(cases), 120)
        self.assertIn('CC0', data['meta']['license'])
        self.assertIn('sıfırdan yazıldı', data['meta']['license'])
        cats = {c['cat'] for c in cases}
        self.assertEqual(cats, {'olumsuzluk', 'ihtimal', 'zorunluluk',
                                'sayi', 'hitap', 'argo'})
        verdicts = {c['expected'] for c in cases}
        self.assertEqual(verdicts, {'accept', 'reject'})
        self.assertEqual(len(self.rows), 120)

    def test_zero_false_rejections(self):
        """58 doğru çeviri satırının hiçbiri blocking kapısında reddedilemez."""
        allm = self.metrics['totals']['ALL']
        self.assertEqual(allm['accept_n'], 58)
        self.assertEqual(allm['false_reject'], 0)
        self.assertEqual(allm['accept_flagged_meaning'], 0)

    def test_gatable_rejects_all_blocked(self):
        """Yapısal olarak kanıtlanabilir 44 kusurun 41'i blocking'de yakalanır;
        kalan 3 (para/birim dönüşümsüz takas) tanıda kalır — bilinen sınır."""
        allm = self.metrics['totals']['ALL']
        self.assertEqual(allm['reject_gatable'], 44)
        self.assertEqual(allm['false_accept_blocking_gatable'], 3)
        # blocking'den sızan 21 satır = 3 dönüşümsüz takas + 18 argo/hitap kör noktası
        self.assertEqual(allm['false_accept_blocking'], 21)
        self.assertEqual(allm['false_accept_meaning'], 18)

    def test_per_category_pin(self):
        """Kategori bazlı pin: yakalama sınırları gerilerse düşer."""
        m = self.metrics['per_cat']
        # Gatable kategoriler: blocking tam yakalar
        for cat in ('olumsuzluk', 'ihtimal', 'zorunluluk'):
            self.assertEqual(m[cat]['false_accept_blocking'], 0, cat)
            self.assertEqual(m[cat]['false_reject'], 0, cat)
        # sayi: 3 dönüşümsüz takas blocking'den geçer (currency/unit tanıda)
        self.assertEqual(m['sayi']['false_accept_blocking'], 3)
        self.assertEqual(m['sayi']['false_accept_meaning'], 0)
        # argo/hitap: gatable=false — yapısal kanıt yok, bilinen kör nokta
        self.assertEqual(m['argo']['false_accept_meaning'], 10)
        self.assertEqual(m['hitap']['false_accept_meaning'], 8)
        self.assertEqual(m['argo']['reject_gatable'], 0)
        self.assertEqual(m['hitap']['reject_gatable'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
