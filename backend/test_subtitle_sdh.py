import unittest

from subtitle_sdh import is_structural_sdh_cue, strip_sdh_descriptors


class SubtitleSdhTests(unittest.TestCase):
    def test_balanced_120_example_structural_corpus(self):
        descriptors = [
            "music", "applause", "cheering", "laughter", "sighs", "gasps",
            "coughing", "screaming", "crying", "whispering", "inaudible",
            "garbled voices", "crowd cheering", "door slams", "phone rings",
            "gunshots", "thunder", "explosion", "siren", "footsteps",
            "wind", "rain", "silence", "müzik", "alkış", "kahkaha",
            "fısıldar", "uğultu", "kapı çarpar", "telefon çalar",
        ]
        safe_phrases = [
            "Soft Power", "The crying child spoke", "Howling Wolf", "Doctor",
            "Captain", "Brain", "The music is wonderful", "I can't hear you",
            "Rain is expected tomorrow", "Silence is not consent",
            "The door slams in the novel", "She studies thunder",
            "Explosion was the film title", "Siren is her name",
            "Wind River", "The applause surprised him", "Crying is natural",
            "He said whispering was rude", "The phone rings twice in the script",
            "Gunshots changed the investigation", "Music theory", "Rain Man",
            "The crowd cheering changed the result", "Footsteps is chapter five",
            "The captain is speaking", "Doctor, come in", "東京",
            "A documentary about silence", "The laughter ended", "Engine Room",
        ]
        positives = [f"{left}{text}{right}"
                     for text in descriptors for left, right in (("[", "]"), ("(", ")"))]
        negatives = [f"{left}{text}{right}"
                     for text in safe_phrases for left, right in (("[", "]"), ("(", ")"))]
        self.assertEqual(len(positives), 60)
        self.assertEqual(len(negatives), 60)
        for text in positives:
            self.assertTrue(is_structural_sdh_cue(text), text)
        for text in negatives:
            self.assertFalse(is_structural_sdh_cue(text), text)

    def test_structural_effects_are_detected_but_titles_and_dialogue_survive(self):
        self.assertTrue(is_structural_sdh_cue("[garbled voices]"))
        self.assertTrue(is_structural_sdh_cue("[uzaktan müzik]"))
        self.assertTrue(is_structural_sdh_cue("[arka planda müzik devam ediyor]"))
        self.assertTrue(is_structural_sdh_cue("♪ ♪"))
        self.assertFalse(is_structural_sdh_cue("[Soft Power]"))
        self.assertFalse(is_structural_sdh_cue("(I can't hear you.)"))
        self.assertFalse(is_structural_sdh_cue("[Doctor]: Come in."))

    def test_audited_english_effects_are_detected_without_substring_deletion(self):
        for text in ("[wind howling]", "(crying)", "(siren wailing)"):
            self.assertTrue(is_structural_sdh_cue(text), text)
        for text in ("[The crying child spoke.]", "[Howling Wolf]", "[Wailing is not dialogue.]"):
            self.assertFalse(is_structural_sdh_cue(text), text)

    def test_inline_effect_is_removed_without_losing_dialogue(self):
        self.assertEqual(strip_sdh_descriptors("[whispering] Don't move."), "Don't move.")
        self.assertEqual(strip_sdh_descriptors("[hafif alkış] Teşekkürler."), "Teşekkürler.")
        self.assertEqual(strip_sdh_descriptors("[Soft Power] A documentary"), "[Soft Power] A documentary")
        self.assertEqual(strip_sdh_descriptors("[Doctor]: Come in."), "[Doctor]: Come in.")
        self.assertEqual(strip_sdh_descriptors("- [whispering] Don't move."), "- Don't move.")
        self.assertEqual(strip_sdh_descriptors("[Brain]"), "[Brain]")
        self.assertEqual(strip_sdh_descriptors("[The music is wonderful]"), "[The music is wonderful]")
        self.assertEqual(strip_sdh_descriptors("(He said [whispering])"), "(He said [whispering])")
        self.assertEqual(strip_sdh_descriptors("♪ Sing to me ♪"), "♪ Sing to me ♪")
        self.assertEqual(strip_sdh_descriptors("[wind howling] Keep moving."), "Keep moving.")

    def test_asr_filter_preserves_bracketed_dialogue(self):
        import transcribe
        for text in ("[Soft Power]", "(I can't hear you.)", "[Brain]", "[東京]"):
            self.assertFalse(transcribe.is_hallucination(text), text)
            self.assertFalse(transcribe.should_skip_hallucination(text), text)
        self.assertTrue(transcribe.should_skip_hallucination("[music]"))

    def test_general_cleaning_applies_inline_sdh_without_erasing_dialogue(self):
        import transcribe
        self.assertEqual(transcribe.clean_text("[whispering] Don't move."), "Don't move.")
        self.assertEqual(transcribe.clean_text("[Doctor]: Come in."), "[Doctor]: Come in.")
        self.assertEqual(transcribe.clean_text("[Soft Power] A documentary"),
                         "[Soft Power] A documentary")


if __name__ == "__main__":
    unittest.main()
