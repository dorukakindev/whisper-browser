"""Speech text preservation, conservative finishing and measured activity regressions."""
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
from dub_finish import spoken_text, finish_audio, active_ranges, join_pause_frames
from dub_quality import speech_check

class FinishTests(unittest.TestCase):
    def test_unicode_ellipsis_and_nested_quotes_keep_sentence_pause_and_existing_breath(self):
        voice=np.full(800,.1,dtype='float32')
        for text in ('Bitti…','“Bitti…”','«Bitti… »','「Bitti…」','Bitti.','Bitti...'):
            self.assertEqual(join_pause_frames(voice,voice,8000,text),1760,text)
        self.assertEqual(join_pause_frames(voice,voice,8000,'“Bitti! ”'),1920)
        breath=np.concatenate([voice,np.zeros(2400,dtype='float32')])
        self.assertEqual(join_pause_frames(breath,voice,8000,'“Bitti…”'),0)
        self.assertEqual(join_pause_frames(voice,voice,8000,'devam,'),960)
        self.assertEqual(join_pause_frames(voice,voice,8000,'devam'),640)
    def test_auto_delivery_does_not_level_each_phrase_separately(self):
        t=np.arange(8000)/8000
        quiet=.02*np.sin(2*np.pi*150*t)
        loud=quiet*5
        a,info_a=finish_audio(quiet,8000,preserve_dynamics=True)
        b,info_b=finish_audio(loud,8000,preserve_dynamics=True)
        self.assertEqual(info_a['gain_db'],0)
        self.assertEqual(info_b['gain_db'],0)
        self.assertAlmostEqual(float(np.sqrt(np.mean(b*b))/np.sqrt(np.mean(a*a))),5,places=4)
    def test_separate_spoken_numbers_units_and_ambiguous_forms(self):
        original = 'Dr. Kaya 12,5 km ve 2026 yılını anlattı.'
        self.assertEqual(spoken_text(original),'Doktor Kaya on iki virgül beş kilometre ve iki bin yirmi altı yılını anlattı.')
        self.assertEqual(original,'Dr. Kaya 12,5 km ve 2026 yılını anlattı.')
        for value in ['10:18', '17.10.2026', 'v1.2', '00123', "2026’da", '+90-532-123', '3.14']:
            self.assertEqual(spoken_text(value),value)
        self.assertEqual(spoken_text('0 kişi, 100 kişi ve 1000000 kişi.'),'sıfır kişi, yüz kişi ve bir milyon kişi.')

    def test_leading_zero_group_does_not_lose_its_separator(self):
        self.assertEqual(spoken_text('0.500 kg'),'0.500 kilogram')
        self.assertEqual(spoken_text('-0.500 kg'),'-0.500 kilogram')
        self.assertEqual(spoken_text('01.500 kişi'),'01.500 kişi')
        self.assertEqual(spoken_text('Değer 0.500 idi.'),'Değer 0.500 idi.')

    def test_signed_thousands_percent_and_currency(self):
        for source,spoken in [('-1.500 kişi','eksi bin beş yüz kişi'),
                              ('+1.500 kişi','artı bin beş yüz kişi'),
                              ('Fiyat €1.500','Fiyat bin beş yüz euro'),
                              ('Oran %1.500','Oran yüzde bin beş yüz')]:
            self.assertEqual(spoken_text(source),spoken)
            self.assertFalse(speech_check(source,spoken)['review'])
        self.assertEqual(spoken_text('ID-1.500'),'ID-1.500')

    def test_contextual_thousands_and_verification(self):
        for source, spoken in [('Toplam 1.500 kişi var.', 'Toplam bin beş yüz kişi var.'),
                               ('1.250 kişi', 'bin iki yüz elli kişi'),
                               ('Fiyat 1.500,25 lira', 'Fiyat bin beş yüz virgül iki beş lira')]:
            self.assertEqual(spoken_text(source), spoken)
            self.assertFalse(speech_check(source, spoken)['review'])
            self.assertFalse(speech_check(spoken, source, source)['review'])
        for text in ['v1.500', 'ID 1.500', '1.500', '12.005.2026', '3.14', '1.500:30']:
            self.assertEqual(spoken_text(text),text)
        self.assertTrue(speech_check('Toplam 1.500 kişi var.', 'Toplam beş yüz kişi var.')['review'])

    def test_numbers_that_end_a_clause_or_sentence_are_spoken(self):
        self.assertEqual(spoken_text('Toplam 42.'),'Toplam kırk iki.')
        self.assertEqual(spoken_text('Yaşı 25, boyu 180.'),'Yaşı yirmi beş, boyu yüz seksen.')
        self.assertEqual(spoken_text('Sayfa 7; sonra 8: bitti'),'Sayfa yedi; sonra sekiz: bitti')
        self.assertEqual(spoken_text('Oran %50.'),'Oran yüzde elli.')
        # A mid-text period may be a Turkish ordinal marker; dates, clocks,
        # versions and ranges are still left alone; explicit quantities expand.
        for value in ['3. sınıf', '2. Dünya Savaşı', '2.0 sürümü', '10:30 civarı',
                      "Saat 5'te", '5-7 kişi', '12.05.2026 tarihli']:
            self.assertEqual(spoken_text(value),value)

    def test_turkish_abbreviations_are_spoken_and_verified_as_words(self):
        self.assertEqual(spoken_text('Elma, armut vb. meyveler vardı.'),'Elma, armut ve benzeri meyveler vardı.')
        self.assertEqual(spoken_text('Kitaplar, defterler vb.'),'Kitaplar, defterler ve benzeri.')
        self.assertEqual(spoken_text('Kitaplar vb. Sonra gitti.'),'Kitaplar ve benzeri. Sonra gitti.')
        self.assertEqual(spoken_text('Örn. bu kitap; bkz. şu.'),'Örneğin bu kitap; bakınız şu.')
        self.assertEqual(spoken_text('Sn. Yılmaz ve Doç. Kaya.'),'Sayın Yılmaz ve Doçent Kaya.')
        # Ambiguous or non-abbreviation forms stay untouched.
        for value in ['Messi vs. Ronaldo', 'vb.com adresi', 'sn. altı saniye', 'Doç. değil']:
            self.assertEqual(spoken_text(value),value)
        for source,heard in [('Elma, armut vb. meyveler vardı.','elma armut ve benzeri meyveler vardı'),
                             ('Sn. Yılmaz geldi.','sayın yılmaz geldi'),('Doç. Kaya anlattı.','doçent kaya anlattı')]:
            self.assertFalse(speech_check(spoken_text(source),heard,source)['review'],source)

    def test_rates_and_currency_symbols_are_spoken_as_words(self):
        self.assertEqual(spoken_text('100 km/h hızla, 20 m/s rüzgârla.'),
                         'yüz kilometre bölü saat hızla, yirmi metre bölü saniye rüzgârla.')
        self.assertEqual(spoken_text('Fiyatı 5$, ötekisi €12,5 ve ₺3.'),
                         'Fiyatı beş dolar, ötekisi on iki virgül beş euro ve üç lira.')
        self.assertEqual(spoken_text('$ simgesi ve € işareti'),'$ simgesi ve € işareti')
        self.assertEqual(spoken_text('Bkz. Şekil 2.'), 'Bakınız Şekil iki.')
        self.assertEqual(spoken_text('Örn. Ankara.'), 'Örneğin Ankara.')

    def test_verification_does_not_flag_correctly_spoken_clause_final_numbers(self):
        for source,heard in [('Toplam 42.','toplam kırk iki'),
                             ('Yaşı 25, boyu 180.','yaşı yirmi beş boyu yüz seksen'),
                             ('Bu işte sadece 3.','bu işte sadece üç'),
                             ('Fiyatı 5$ oldu','fiyatı beş dolar oldu')]:
            result=speech_check(spoken_text(source),heard,source)
            self.assertFalse(result['review'],(source,result))
        self.assertTrue(speech_check(spoken_text('Toplam 42.'),'toplam kırk üç','Toplam 42.')['review'])

    def test_finishing_preserves_quiet_tail_and_internal_pause(self):
        sr=10000
        tone=np.sin(np.arange(2000)*.15).astype('float32')*.1
        quiet=tone*.01
        source=np.concatenate([np.zeros(3000),tone,np.zeros(8000),quiet,np.zeros(4000)])
        finished,report=finish_audio(source,sr)
        self.assertAlmostEqual(report['trim_start_seconds'],.24,delta=.002)
        self.assertAlmostEqual(report['trim_end_seconds'],.34,delta=.002)
        self.assertEqual(len(finished),len(source)-round((report['trim_start_seconds']+report['trim_end_seconds'])*sr))
        self.assertTrue(np.max(np.abs(finished[-1600:]))>0,'quiet final syllable must survive')
        self.assertLessEqual(abs(report['gain_db']),3.001)
        self.assertEqual(finished[0],0);self.assertEqual(finished[-1],0)
        with self.assertRaises(ValueError):finish_audio(np.array([np.nan]),sr)

    def test_verification_accepts_equivalent_numbers_but_rejects_changed_values(self):
        source='Dr. Kaya 12,5 km yürüdü.'
        spoken=spoken_text(source)
        result=speech_check(spoken,'Doktor Kaya 12,5 kilometre yürüdü.',source)
        self.assertFalse(result['review']);self.assertEqual(result['similarity'],1)
        self.assertTrue(speech_check(spoken,'Doktor Kaya 13,5 kilometre yürüdü.',source)['review'])
        self.assertEqual(speech_check('12 kişi, 12 saat.', 'on iki kişi.', '12 kişi, 12 saat.')['missing_numbers'],['12'])

    def test_number_phrases_do_not_match_inside_larger_values(self):
        expected='iki kişi bugün bu uzun yoldan buraya kadar yürüyerek geldi'
        actual='on iki kişi bugün bu uzun yoldan buraya kadar yürüyerek geldi'
        result=speech_check(expected,actual,'2 kişi bugün bu uzun yoldan buraya kadar yürüyerek geldi')
        self.assertTrue(result['review'])
        self.assertEqual(result['missing_numbers'],['2'])

    def test_activity_excludes_long_pause_and_silence(self):
        sr=8000
        voice=np.ones(sr,dtype='float32')*.1
        audio=np.concatenate([voice,np.zeros(sr),voice])
        intervals=active_ranges(audio,sr,10)
        self.assertEqual(len(intervals),2)
        self.assertLess(intervals[0][1],11.2)
        self.assertGreater(intervals[1][0],11.8)
        self.assertEqual(active_ranges(np.zeros(sr),sr),[])

class Focus600Tests(unittest.TestCase):
    def test_p09_signed_prefix_currency(self):
        for symbol, name in [(chr(36),'dolar'),('€','euro'),('£','sterlin'),('₺','lira')]:
            self.assertEqual(spoken_text('Fiyat '+symbol+'-5'),'Fiyat eksi beş '+name)
            self.assertEqual(spoken_text(symbol+'+1.500'),'artı bin beş yüz '+name)
        self.assertEqual(spoken_text(chr(36)+'-12,5'),'eksi on iki virgül beş dolar')

    def test_p10_signed_prefix_percent(self):
        self.assertEqual(spoken_text('Oran %-12,5'),'Oran yüzde eksi on iki virgül beş')
        self.assertEqual(spoken_text('%+5'),'yüzde artı beş')
        self.assertEqual(spoken_text('%−1.500'),'yüzde eksi bin beş yüz')

    def test_p11_currency_identifier_is_not_a_quantity(self):
        for value in ['a5'+chr(36)+'x','ID'+chr(36)+'5','5'+chr(36)+'ID']:
            self.assertEqual(spoken_text(value),value)

    def test_p12_percent_identifier_is_not_a_quantity(self):
        for value in ['ID%50','50%ID','a50%x']:
            self.assertEqual(spoken_text(value),value)
        self.assertEqual(spoken_text('Oran %50.'),'Oran yüzde elli.')

    def test_p13_sample_rates_rejected_consistently(self):
        for sr in [float('nan'),float('inf'),True,0,-1,7999,8000.5,384001,'8000']:
            for operation in [lambda:finish_audio(np.ones(100)*.1,sr),lambda:active_ranges(np.ones(100)*.1,sr),lambda:join_pause_frames(np.ones(100),np.ones(100),sr,'.')]:
                with self.subTest(sr=sr),self.assertRaises(ValueError):operation()

    def test_p14_float32_peak_rms_never_overflows(self):
        with np.errstate(over='raise',invalid='raise'):
            audio,report=finish_audio(np.full(1000,np.finfo(np.float32).max),8000)
            self.assertTrue(np.isfinite(audio).all())
            self.assertTrue(np.isfinite(report['gain_db']))
            self.assertGreater(float(np.max(np.abs(audio))),.9)
            self.assertLessEqual(float(np.max(np.abs(audio))),.971)

    def test_p15_nonfinite_or_stereo_activity_cannot_look_like_silence(self):
        for audio in [np.array([float('nan')]),np.array([float('inf')]),np.ones((10,2))]:
            with self.assertRaises(ValueError):active_ranges(audio,8000)
        self.assertEqual(active_ranges(np.array([]),8000),[])

    def test_p16_activity_offset_rejects_negative_or_nonfinite_times(self):
        for offset in [-1,float('inf'),float('nan'),True,'1']:
            with self.assertRaises(ValueError):active_ranges(np.ones(800)*.1,8000,offset)
        self.assertEqual(active_ranges(np.ones(800)*.1,8000,4),[[4,4.1]])

    def test_p17_large_finite_activity_is_not_lost_to_rms_overflow(self):
        with np.errstate(over='raise',invalid='raise'):
            self.assertEqual(active_ranges(np.full(800,np.finfo(np.float32).max),8000),[[0,0.1]])

    def test_p18_existing_breath_and_punctuation_pause_are_preserved(self):
        voice=np.ones(800)*.1
        self.assertEqual(join_pause_frames(voice,voice,8000,'bitti.'),1760)
        padded=np.concatenate([voice,np.zeros(2400)])
        self.assertEqual(join_pause_frames(padded,voice,8000,'bitti.'),0)
        out,report=finish_audio(voice,8000,preserve_dynamics=True)
        self.assertEqual(report['gain_db'],0)

if __name__=='__main__':unittest.main()
