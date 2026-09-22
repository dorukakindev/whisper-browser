"""2026-09-22 çeviri denetimi regresyonları.

Her test, düzeltmeden önce yanlış sonuç veren somut girdiyi kullanır. Sağlayıcı
yerine sahte bir `openai` modülü kullanılır; ağa çıkılmaz.
"""
import contextlib
import importlib.machinery
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_fake_openai = types.ModuleType("openai")
_fake_openai.__spec__ = importlib.machinery.ModuleSpec("openai", None)
_fake_openai.OpenAI = None
sys.modules.setdefault("openai", _fake_openai)

import transcribe as T  # noqa: E402
from sentence_translation import reply_id_range_issue  # noqa: E402
from translation_memory import fuzzy_semantically_compatible  # noqa: E402


class Args:
    def __init__(self, **kw):
        self.__dict__.update(dict(
            translate_api_key="k", translate_base_url="https://api.example.com", translate_to="tr",
            translate_model="m", translate_workers=1, translate_register="documentary",
            translate_profanity="keep", translate_refine=False, max_cps=20, max_line_width=42,
            glossary="", translate_cache=False, cache_dir=None, language="en", max_lines=2,
            wrap_mode="sentence", formats="srt", dual_subtitle=False, dual_translation_first=False))
        self.__dict__.update(kw)


def install_provider(handler):
    def create(**kw):
        payload = json.loads(kw["messages"][-1]["content"])
        content = handler(payload)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=json.dumps(content, ensure_ascii=False)),
            finish_reason="stop")])
    sys.modules["openai"].OpenAI = lambda *a, **k: types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))


def quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)


class ReplyIdRangeTests(unittest.TestCase):
    def test_off_by_one_numbering_is_rejected_as_a_whole(self):
        self.assertEqual(reply_id_range_issue({"1": "a", "2": "b"}, 2), "kimlik_araligi_disinda")
        self.assertEqual(reply_id_range_issue({"items": {"0": "a", "1": "b"}}, 2), "")
        self.assertEqual(reply_id_range_issue({"items": {"0": "a"}, "sentences": {"3": "x"}}, 2),
                         "kimlik_araligi_disinda")
        self.assertEqual(reply_id_range_issue({"0": "a", "memory": []}, 1), "")

    def test_one_based_reply_does_not_shift_every_cue(self):
        tr = {"Where are you going?": "Nereye gidiyorsun?", "To the market.": "Pazara.",
              "Can I come too?": "Ben de gelebilir miyim?", "Sure, let's go.": "Tabii, gidelim.",
              "Bring the bags.": "Çantaları getir."}
        calls = []

        def handler(payload):
            calls.append(len(payload["items"]))
            base = 1 if len(calls) == 1 else 0   # ilk toplu yanıt 1'den numaralı
            return {str(item["i"] + base): tr[item["t"]] for item in payload["items"]}

        install_provider(handler)
        entries = [(0, 2, "Where are you going?"), (3, 5, "To the market."), (6, 8, "Can I come too?"),
                   (9, 11, "Sure, let's go."), (12, 14, "Bring the bags.")]
        out = quiet(T.llm_translate, entries, Args(), [], source_lang="en")
        self.assertEqual([text for _, _, text in out], [tr[src] for _, _, src in entries])


class FuzzyMemoryTests(unittest.TestCase):
    def test_negating_affix_is_not_a_spelling_variant(self):
        for old, new in [("It is possible to win this game.", "It is impossible to win this game."),
                         ("He was very responsible today.", "He was very irresponsible today."),
                         ("That chair is comfortable enough.", "That chair is uncomfortable enough."),
                         ("This is legal here.", "This is illegal here.")]:
            self.assertFalse(fuzzy_semantically_compatible(new, old), new)

    def test_corrected_source_is_retranslated_not_reused(self):
        tr = {"It is possible to win this game.": "Bu oyunu kazanmak mümkün.",
              "It is impossible to win this game.": "Bu oyunu kazanmak imkânsız.",
              "Hello.": "Merhaba.", "Goodbye.": "Hoşça kal."}
        install_provider(lambda payload: {str(i["i"]): tr[i["t"]] for i in payload["items"]})
        with tempfile.TemporaryDirectory() as cache:
            args = Args(translate_cache=True, cache_dir=cache, input="/x/film.en.srt")
            quiet(T.llm_translate, [(0, 2, "Hello."), (5, 8, "It is possible to win this game."),
                                    (10, 12, "Goodbye.")], args, [], source_lang="en")
            out = quiet(T.llm_translate, [(0, 2, "Hello."), (5, 8, "It is impossible to win this game."),
                                          (10, 12, "Goodbye.")], args, [], source_lang="en")
        self.assertEqual(out[1][2], "Bu oyunu kazanmak imkânsız.")


class TranslateOnlyNamingTests(unittest.TestCase):
    def test_split_language_suffix(self):
        cases = {
            "film.en": ("film", []), "film": ("film", []), "film.en.forced": ("film", ["forced"]),
            "film.eng.sdh": ("film", ["sdh"]), "film.pt-BR": ("film", []),
            "Dune.Part.Two": ("Dune.Part.Two", []), "Movie.2019.HDR": ("Movie.2019.HDR", []),
            "Friends.S01E01.The.One": ("Friends.S01E01.The.One", []),
        }
        for stem, expected in cases.items():
            self.assertEqual(T.split_subtitle_language_suffix(stem), expected, stem)

    def test_two_parts_do_not_overwrite_each_other(self):
        install_provider(lambda payload: {str(i["i"]): "TR " + i["t"] for i in payload["items"]})
        srt = "1\n00:00:01,000 --> 00:00:03,000\n{} line.\n\n"
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for name in ("Dune.Part.One.srt", "Dune.Part.Two.srt", "film.en.forced.srt"):
                src = folder / name
                src.write_text(srt.format(name.split(".")[2] if name.startswith("Dune") else "Forced"),
                               encoding="utf-8")
                quiet(T.translate_existing_subtitle, Args(input=str(src), output_dir=str(folder)))
            names = sorted(p.name for p in folder.iterdir() if ".tr." in p.name and p.suffix == ".srt")
        self.assertEqual(names, ["Dune.Part.One.tr.srt", "Dune.Part.Two.tr.srt", "film.tr.forced.srt"])


class AssParsingTests(unittest.TestCase):
    def test_hard_space_becomes_nbsp(self):
        text = ("[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
                "Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,Mr.\\hSmith\\Nis here\n")
        self.assertEqual(T.parse_ass(text), [(4.0, 5.0, "Mr. Smith\nis here")])


class AssFormatPreservationTests(unittest.TestCase):
    ASS = ("[Script Info]\nScriptType: v4.00+\n\n[Events]\n"
           "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
           "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Sign on the wall.\n"
           "Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}I hear music.{\\i0}\n"
           "Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,Normal line.\n"
           "Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,{\\pos(960,120)\\fs40}Title.\n"
           "Dialogue: 0,0:00:13.00,0:00:15.00,Default,,0,0,0,,{\\i1}Half{\\i0} italic.\n")
    TR = {"Sign on the wall.": "Duvardaki tabela.", "I hear music.": "Müzik duyuyorum.",
          "Normal line.": "Normal satır.", "Title.": "Başlık.", "Half italic.": "Yarı italik."}

    def test_formats_are_parsed_in_dialogue_order(self):
        formats = T.parse_ass_cue_formats(self.ASS)
        self.assertEqual([f["align"] for f in formats], [8, None, None, None, None])
        self.assertEqual([f["italic"] for f in formats], [False, True, False, False, False])
        self.assertEqual(formats[3]["pos"], ("960", "120"))
        self.assertEqual(len(formats), len(T.parse_ass(self.ASS)))

    def test_translation_keeps_alignment_position_and_italics(self):
        install_provider(lambda payload: {str(i["i"]): self.TR[i["t"]] for i in payload["items"]})
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "film.en.ass"
            src.write_text(self.ASS, encoding="utf-8")
            quiet(T.translate_existing_subtitle, Args(input=str(src), output_dir=tmp, formats="srt,ass"))
            srt = (Path(tmp) / "film.tr.srt").read_text(encoding="utf-8-sig")
            ass = (Path(tmp) / "film.tr.ass").read_text(encoding="utf-8-sig")
        self.assertIn("{\\an8}Duvardaki tabela.", srt)
        self.assertIn("<i>Müzik duyuyorum.</i>", srt)
        self.assertIn("\nNormal satır.\n", srt)
        self.assertIn(",,{\\an8}Duvardaki tabela.", ass)
        self.assertIn(",,{\\i1}Müzik duyuyorum.", ass)
        self.assertIn(",,{\\pos(960,120)}Başlık.", ass)
        self.assertIn(",,Yarı italik.", ass)   # kısmi italik taşınmaz (metin bölünür)

    def test_untrusted_translation_text_still_cannot_inject_tags(self):
        install_provider(lambda payload: {str(i["i"]): "{\\an1}Kötü." for i in payload["items"]})
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "film.en.srt"
            src.write_text("1\n00:00:01,000 --> 00:00:02,000\nBad.\n", encoding="utf-8")
            quiet(T.translate_existing_subtitle, Args(input=str(src), output_dir=tmp, formats="ass"))
            ass = (Path(tmp) / "film.tr.ass").read_text(encoding="utf-8-sig")
        self.assertNotIn(",,{\\an1}", ass)


class TranslationQualityEventTests(unittest.TestCase):
    def test_quality_event_reports_batches_and_rejections(self):
        calls = []

        def handler(payload):
            calls.append(1)
            base = 1 if len(calls) == 1 else 0
            return {str(item["i"] + base): "Çeviri " + str(item["i"]) + "." for item in payload["items"]}

        install_provider(handler)
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            T.llm_translate([(0, 2, "One."), (3, 5, "Two."), (6, 8, "Three.")], Args(), [], source_lang="en")
        events = [json.loads(line) for line in buffer.getvalue().splitlines() if line.startswith("{")]
        quality = [event for event in events if event.get("type") == "translation_quality"]
        self.assertEqual(len(quality), 1)
        self.assertEqual(quality[0]["model"], "m")
        self.assertEqual(quality[0]["invalid_batches"], 1)
        self.assertEqual(quality[0]["rejections"].get("kimlik_araligi_disinda"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
