"""Anlam ve kaynak-yankısı kapıları için dengeli, sentetik regresyon korpusu."""

import unittest

import transcribe as T


class TranslationQualityCorpusTests(unittest.TestCase):
    def test_turkish_number_forms_preserve_exact_value(self):
        good = [
            ('At 5:30 we found it.', 'Onu 5.30’da bulduk.'),
            ('At 5:30 we found it.', 'Onu saat beş buçukta bulduk.'),
            ('There were 10000 witnesses.', '10 bin tanık vardı.'),
            ('We sold 2,000,000 copies.', '2 milyon kopya sattık.'),
            ('The amount was 1,234.56.', 'Tutar 1.234,56 idi.'),
            ('It took 3.5 hours.', 'Üç buçuk saat sürdü.'),
            ('3 of them returned.', 'Üçünü geri getirdiler.'),
            ('5 people came.', 'Beşte buluştuk, beş kişi geldi.'),
        ]
        bad = [
            ('At 5:30 we found it.', 'Onu 5.40’ta bulduk.'),
            ('There were 10000 witnesses.', '11 bin tanık vardı.'),
            ('We sold 2,000,000 copies.', '3 milyon kopya sattık.'),
            ('The amount was 1,234.56.', 'Tutar 1.234,57 idi.'),
            ('It took 3.5 hours.', 'Dört buçuk saat sürdü.'),
            ('3 of them returned.', 'Dördünü geri getirdiler.'),
        ]
        for source, target in good:
            self.assertNotIn('number_mismatch', T.translation_meaning_issues(source, target))
        for source, target in bad:
            self.assertIn('number_mismatch', T.translation_meaning_issues(source, target))

    def test_whole_sentence_cannot_collapse_into_first_cue(self):
        payload = {
            'items': {'0': 'Bütün çeviri tek cue içinde.', '1': '', '2': ''},
            'sentences': {'0': 'Bütün çeviri tek cue içinde.'},
        }
        self.assertIsNone(T.accept_sentence_reply(payload, [0, 1, 2]))

    def test_balanced_120_pair_meaning_corpus(self):
        groups = {
            'number_mismatch': [
                ("The crate contains 12 samples.", "Sandıkta 12 numune var.", "Sandıkta numuneler var."),
                ("They found 80 bags.", "Seksen paket buldular.", "Paketler buldular."),
                ("The total is 2.4 million.", "Toplam 2,4 milyon.", "Toplam milyonlarca."),
                ("Flight 815 has landed.", "815 sefer sayılı uçak indi.", "Uçak indi."),
                ("The report covers 2026.", "Rapor 2026 yılını kapsıyor.", "Rapor bu yılı kapsıyor."),
                ("Only 5% remained.", "Yalnızca %5 kaldı.", "Çok azı kaldı."),
                ("The vault held 3,000 coins.", "Kasada 3.000 sikke vardı.", "Kasada binlerce sikke vardı."),
                ("Room 42 is sealed.", "42 numaralı oda mühürlü.", "Oda mühürlü."),
                ("7 witnesses returned.", "Yedi tanık geri döndü.", "Tanıklar geri döndü."),
                ("The batch has 100 doses.", "Partide yüz doz var.", "Partide dozlar var."),
            ],
            'negation_missing': [
                ("I don't know the answer.", "Cevabı bilmiyorum.", "Cevabı biliyorum."),
                ("She never opened the case.", "Kasayı asla açmadı.", "Kasayı açtı."),
                ("No passenger complained.", "Hiçbir yolcu şikâyet etmedi.", "Yolcular şikâyet etti."),
                ("They cannot enter tonight.", "Bu gece giremezler.", "Bu gece girebilirler."),
                ("He wasn't carrying a phone.", "Telefon taşımıyordu.", "Telefon taşıyordu."),
                ("We haven't seen the driver.", "Şoförü görmedik.", "Şoförü gördük."),
                ("The bag is not mine.", "Çanta benim değil.", "Çanta benim."),
                ("Nobody heard the alarm.", "Kimse alarmı duymadı.", "Herkes alarmı duydu."),
                ("She left without speaking.", "Konuşmadan ayrıldı.", "Konuşarak ayrıldı."),
                ("They won't release him.", "Onu serbest bırakmayacaklar.", "Onu serbest bırakacaklar."),
            ],
            'modal_missing': [
                ("You must show your passport.", "Pasaportunuzu göstermek zorundasınız.", "Pasaportunuzu gösterdiniz."),
                ("We should inspect the suitcase.", "Valizi incelemeliyiz.", "Valizi inceledik."),
                ("She can identify the suspect.", "Şüpheliyi teşhis edebilir.", "Şüpheliyi teşhis etti."),
                ("It might rain tonight.", "Bu gece yağmur yağabilir.", "Bu gece yağmur yağdı."),
                ("They have to wait outside.", "Dışarıda beklemek zorundalar.", "Dışarıda beklediler."),
                ("I need to call the office.", "Ofisi aramam gerekiyor.", "Ofisi aradım."),
                ("The plane will leave early.", "Uçak erken kalkacak.", "Uçak erken kalktı."),
                ("Could he be mistaken?", "Yanılıyor olabilir mi?", "Yanıldı mı?"),
                ("You ought to tell the truth.", "Gerçeği söylemelisin.", "Gerçeği söyledin."),
                ("We may search the vehicle.", "Aracı aramamız mümkün.", "Aracı aradık."),
            ],
            'currency_mismatch': [
                ("The fee is 20 dollars.", "Ücret 20 dolar.", "Ücret 20 avro."),
                ("He paid $45.", "45 dolar ödedi.", "45 lira ödedi."),
                ("The ticket costs 30 euros.", "Bilet 30 avro.", "Bilet 30 dolar."),
                ("They seized €500.", "500 avroya el koydular.", "500 liraya el koydular."),
                ("The deposit was 70 pounds.", "Depozito 70 sterlindi.", "Depozito 70 avroydu."),
                ("She carried £90.", "90 sterlin taşıyordu.", "90 dolar taşıyordu."),
                ("The fine is 800 lira.", "Ceza 800 lira.", "Ceza 800 dolar."),
                ("The invoice says TRY 250.", "Faturada 250 TL yazıyor.", "Faturada 250 avro yazıyor."),
                ("The meal was 600 yen.", "Yemek 600 yen tuttu.", "Yemek 600 dolardı."),
                ("The account received JPY 900.", "Hesaba 900 yen geldi.", "Hesaba 900 lira geldi."),
            ],
            'unit_mismatch': [
                ("The border is 12 km away.", "Sınır 12 kilometre uzakta.", "Sınır 12 metre uzakta."),
                ("The parcel weighs 8 kilograms.", "Paket 8 kilogram ağırlığında.", "Paket 8 gram ağırlığında."),
                ("Pour 3 liters into the tank.", "Depoya 3 litre dökün.", "Depoya 3 gram koyun."),
                ("We walked 5 miles.", "5 mil yürüdük.", "5 kilometre yürüdük."),
                ("The wall is 4 meters high.", "Duvar 4 metre yüksekliğinde.", "Duvar 4 kilometre yüksekliğinde."),
                ("Wait for 2 hours.", "2 saat bekleyin.", "2 dakika bekleyin."),
                ("The delay was 15 minutes.", "Gecikme 15 dakikaydı.", "Gecikme 15 saniyeydi."),
                ("Hold it for 30 seconds.", "30 saniye tutun.", "30 dakika tutun."),
                ("The sample weighs 6 grams.", "Numune 6 gramdır.", "Numune 6 kilogramdır."),
                ("The chamber reached 40 degrees Celsius.", "Oda 40 santigrata ulaştı.", "Oda 40 dereceye ulaştı."),
            ],
            'date_mismatch': [
                ("The hearing is on January 12.", "Duruşma 12 Ocak'ta.", "Duruşma 12 Şubat'ta."),
                ("She arrived on February 3.", "3 Şubat'ta geldi.", "3 Mart'ta geldi."),
                ("The permit expires in March.", "İzin Mart'ta bitiyor.", "İzin Nisan'da bitiyor."),
                ("The trial begins in April.", "Dava Nisan'da başlıyor.", "Dava Mayıs'ta başlıyor."),
                ("We met in May.", "Mayıs ayında buluştuk.", "Haziran ayında buluştuk."),
                ("The shipment leaves in June.", "Sevkiyat Haziran'da çıkıyor.", "Sevkiyat Temmuz'da çıkıyor."),
                ("The office closes in July.", "Ofis Temmuz'da kapanıyor.", "Ofis Ağustos'ta kapanıyor."),
                ("The audit starts in August.", "Denetim Ağustos'ta başlıyor.", "Denetim Eylül'de başlıyor."),
                ("The appeal is due in September.", "İtiraz Eylül'de verilecek.", "İtiraz Ekim'de verilecek."),
                ("The contract ends in December.", "Sözleşme Aralık'ta bitiyor.", "Sözleşme Kasım'da bitiyor."),
            ],
        }
        rows = [(source, good, bad, expected)
                for expected, cases in groups.items()
                for source, good, bad in cases]
        self.assertEqual(len(rows) * 2, 120)
        false_rejections, missed_defects = [], []
        for source, good, bad, expected in rows:
            good_issues = T.translation_meaning_issues(source, good)
            bad_issues = T.translation_meaning_issues(source, bad)
            if good_issues:
                false_rejections.append((source, good_issues))
            if expected not in bad_issues:
                missed_defects.append((source, expected, bad_issues))
        self.assertEqual(false_rejections, [])
        self.assertEqual(missed_defects, [])

    def test_truncated_fragments_flagged_and_legitimate_forms_pass(self):
        truncated = [
            # Sarkan bağlaç: çeviri gerçekten ortadan kesilmiş.
            ('We have to go now.', 'Şimdi gitmek zorundayız ve'),
            ('We have to go now.', 'Şimdi gitmek zorundayız ve.'),
            ('Come with me.', 'Benimle gel ve'),
            ('He left but she stayed.', 'O gitti çünkü'),
            ('She opened the window.', 'Pencereyi açtı ama'),
            # Çıplak soru eki: uzun kaynak cümle tek eke indirgenmiş.
            ('Are you absolutely sure about this?', 'misin'),
            ('Are you absolutely sure about this?', 'misin?'),
            ('Are you absolutely sure about this?', 'Mısın?'),
            ('Are you absolutely sure about this?', 'mısınız'),
            # Kelime-ortası kırık tire: 'gör-' kesin kesim izidir.
            ('Nobody saw him walking by.', 'Onu kimse gör-'),
            ('He tried to open the door.', 'Kapıyı açmayı denedi-'),
        ]
        legitimate = [
            # Soru eki cümlenin parçasıysa ya da kaynak da tekil/boşken kusur yok.
            ('Are you sure?', 'Sen misin?'),
            ('Really?', 'Mı?'),
            ('Are you?', 'Misin?'),
            ('But.', 'Ama.'),
            ('And.', 'Ve.'),
            # 'ki'/'de'/'da' bağlaç listesi dışında: doğal cümle sonları.
            ('He said to him.', 'Ona dedi ki.'),
            ('You came too.', 'Sen de geldin.'),
            ('I see.', 'Görüyorum.'),
            # Kırık tire yalnız ASCII '-' içindir; kesinti em-dashi '—' değildir.
            ('Wait—', 'Bekle—'),
            ('The note was mi.', 'Nota mi idi.'),
            ('Sing mi.', 'Mi söyle.'),
            ('The note is mi.', 'Nota mi.'),
        ]
        for source, target in truncated:
            issues = T.translation_meaning_issues(source, target)
            self.assertIn('truncated_fragment', issues, (source, target))
            self.assertIn('truncated_fragment',
                          T.translation_blocking_issues(source, target),
                          (source, target))
        for source, target in legitimate:
            self.assertNotIn('truncated_fragment',
                             T.translation_meaning_issues(source, target),
                             (source, target))

    def test_source_echo_30_positive_and_30_legitimate_pairs(self):
        echo_sources = [
            "Hello.", "Goodbye!", "Thank you.", "Please wait.", "Stop!", "Come on.",
            "All right.", "Okay.", "I understand.", "Open the door.", "Close the gate.",
            "Where are you?", "What happened?", "We need help.", "This is impossible.",
            "Nobody move.", "Tell me the truth.", "The plane has landed.", "Search the bag.",
            "Call the police.", "He is innocent.", "She knows everything.", "Take a seat.",
            "Look at me.", "Do not touch it.", "The room is empty.", "Wait outside.",
            "Follow that car.", "Turn around.", "I am sorry.",
        ]
        legitimate = [
            ("Australia", "Australia"), ("Ankara", "Ankara"), ("Netflix", "Netflix"),
            ("Flight 815", "815 seferi"), ("Room 42", "42 numaralı oda"),
            ("COVID-19", "COVID-19"), ("FBI", "FBI"), ("Interpol", "Interpol"),
            ("Sydney Airport", "Sidney Havalimanı"), ("John", "John"),
            ("Dr. Lee", "Dr. Lee"), ("Model X", "Model X"), ("Boeing 747", "Boeing 747"),
            ("https://example.com", "https://example.com"), ("www.test.org", "www.test.org"),
            ("USB", "USB"), ("DNA", "DNA"), ("May", "Mayıs"), ("OK", "Tamam"),
            ("No", "Hayır"), ("Yes", "Evet"), ("Stop", "Dur"), ("Wait", "Bekle"),
            ("London", "Londra"), ("New York", "New York"), ("Route 66", "66. Rota"),
            ("Gate A5", "A5 Kapısı"), ("Agent Smith", "Ajan Smith"),
            ("iPhone", "iPhone"), ("YouTube", "YouTube"),
        ]
        self.assertEqual(len(echo_sources), 30)
        self.assertEqual(len(legitimate), 30)
        for source in echo_sources:
            self.assertTrue(T.translation_is_source_echo(source, "  " + source.swapcase() + "  "), source)
        for source, target in legitimate:
            self.assertFalse(T.translation_is_source_echo(source, target), (source, target))


if __name__ == '__main__':
    unittest.main()
