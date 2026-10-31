"""Explicit ordinal, clock and unit forms; ambiguous identifiers remain literal."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
from dub_finish import spoken_text
from dub_quality import speech_check

class NumericReading200Tests(unittest.TestCase):
    def test_explicit_ordinal_suffixes(self):
        for source,expected in [("3’üncü sıra",'üçüncü sıra'),("1'inci bölüm",'birinci bölüm'),("20’nci kat",'yirminci kat'),("100'üncü kişi",'yüzüncü kişi'),("6'ncı kapı",'altıncı kapı')]:
            with self.subTest(source=source):self.assertEqual(spoken_text(source),expected)

    def test_inflected_unit_quantities(self):
        for source,expected in [("5 kg’dan ağır",'beş kilogramdan ağır'),("2 cm’ye kadar",'iki santimetreye kadar'),("3 m'de",'üç metrede'),("1,5 km’nin sonu",'bir virgül beş kilometrenin sonu')]:
            with self.subTest(source=source):self.assertEqual(spoken_text(source),expected)

    def test_explicit_clock_context(self):
        for source,expected in [('Saat 14:30 oldu.','Saat on dört otuz oldu.'),('saat 09:05','saat dokuz sıfır beş'),("saat 14:00’te",'saat on dörtte'),("saat 14:30’da",'saat on dört otuzda')]:
            with self.subTest(source=source):self.assertEqual(spoken_text(source),expected)

    def test_ambiguous_and_malformed_numbers_are_preserved(self):
        for source in ["2026’da",'17.10.2026','10:18','3. sınıf','v1.2',"ID3'üncü", "03'üncü",'00123', 'saat 25:30','saat 14:99','saat 14:30:02', 'saat 14:30.2',"3'inci", "saat 14:30'te"]:
            with self.subTest(source=source):self.assertEqual(spoken_text(source),source)

    def test_new_readings_are_idempotent_and_verified(self):
        for source in ["3’üncü sıra", "5 kg’dan ağır", 'Saat 14:30 oldu.',"saat 14:00’te"]:
            spoken=spoken_text(source)
            self.assertEqual(spoken_text(spoken),spoken)
            self.assertFalse(speech_check(spoken,spoken,source)['review'],source)

    def test_midnight_does_not_invent_a_day_period(self):
        self.assertEqual(spoken_text('saat 00:05'), 'saat sıfır beş')
        self.assertEqual(spoken_text('saat 00:00'), 'saat sıfır')

    def test_suffix_harmony_and_unit_boundaries(self):
        self.assertEqual(spoken_text("4'üncü ve 40'ıncı"), 'dördüncü ve kırkıncı')
        self.assertEqual(spoken_text("2 cm’den ve 5 kg’ı"), 'iki santimetreden ve beş kilogramı')
        for source in ["3’inci", "4'uncu", "20'ıncı", "saat 09:05'de", "03'üncü", "a3’üncü"]:
            self.assertEqual(spoken_text(source), source)
        for source, expected in [('5 km/hz', 'beş km/hz'), ('2 cmake', 'iki cmake'),
                                 ("2 cm’yerine", "iki cm’yerine"), ("5 kg’danlar", "beş kg’danlar")]:
            self.assertEqual(spoken_text(source), expected)

if __name__=='__main__':unittest.main()
