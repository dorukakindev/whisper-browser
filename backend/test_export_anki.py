import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from export_anki import ANKI_MODEL, DECK_ID, MODEL_ID, export_package


def inspect_package(package_path: Path):
    with tempfile.TemporaryDirectory(prefix="whisper-anki-test-") as work:
        with zipfile.ZipFile(package_path) as archive:
            names = set(archive.namelist())
            assert "collection.anki2" in names
            archive.extract("collection.anki2", work)
            media_map = json.loads(archive.read("media").decode("utf-8"))
        connection = sqlite3.connect(Path(work) / "collection.anki2")
        try:
            notes = connection.execute("select guid, mid, flds, tags from notes order by guid").fetchall()
            row = connection.execute("select models, decks from col").fetchone()
        finally:
            connection.close()
    return notes, json.loads(row[0]), json.loads(row[1]), media_map, names


class ExportAnkiTests(unittest.TestCase):
    def annotation(self, **changes):
        value = {
            "id": "annotation:stable-id", "type": "quote", "mediaId": "media-1",
            "mediaTitle": "Belgesel <Bir>", "start": 65,
            "source": "Tea & coffee < water", "translation": "Çay ve kahve < su",
            "note": "Birinci satır\nİkinci satır", "status": "learning",
            "tags": ["günlük tekrar", "belgesel"],
        }
        value.update(changes)
        return value

    def test_guid_model_deck_and_schema_are_stable_across_exports(self):
        with tempfile.TemporaryDirectory() as work:
            first = Path(work) / "first.apkg"
            second = Path(work) / "second.apkg"
            export_package({"annotations": [self.annotation()]}, first, "Whisper Local")
            export_package({"annotations": [self.annotation(translation="Güncellenen çeviri")]}, second, "Whisper Local")
            notes_a, models_a, decks_a, _, _ = inspect_package(first)
            notes_b, models_b, _, _, _ = inspect_package(second)
            self.assertEqual(notes_a[0][0], notes_b[0][0])
            self.assertEqual(notes_a[0][1], MODEL_ID)
            self.assertEqual(notes_b[0][1], MODEL_ID)
            self.assertNotEqual(notes_a[0][2], notes_b[0][2])
            self.assertIn(str(MODEL_ID), models_a)
            self.assertIn(str(DECK_ID), decks_a)
            self.assertEqual(models_a[str(MODEL_ID)]["flds"], models_b[str(MODEL_ID)]["flds"])
            self.assertEqual([field["name"] for field in models_a[str(MODEL_ID)]["flds"]],
                             [field["name"] for field in ANKI_MODEL.fields])

    def test_html_is_escaped_and_media_names_do_not_leak_local_paths(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            image_a = root / "özel ad.png"
            image_b_dir = root / "başka"
            image_b_dir.mkdir()
            image_b = image_b_dir / "özel ad.png"
            audio = root / "konuşma.mp3"
            image_a.write_bytes(b"png-one")
            image_b.write_bytes(b"png-two")
            audio.write_bytes(b"mp3")
            package = root / "cards.apkg"
            payload = {"annotations": [
                self.annotation(id="one", screenshotRef=str(image_a), audioRef=str(audio)),
                self.annotation(id="two", source="Second", screenshotRef=str(image_b)),
            ]}
            result = export_package(payload, package, "Whisper Local")
            notes, _, _, media_map, names = inspect_package(package)
            fields = "\n".join(row[2] for row in notes)
            self.assertIn("Tea &amp; coffee &lt; water", fields)
            self.assertIn("Belgesel &lt;Bir&gt;", fields)
            self.assertNotIn(str(root), fields)
            self.assertEqual(result["mediaCount"], 3)
            self.assertEqual(len(media_map), 3)
            self.assertTrue(all(name.startswith("whisper-") for name in media_map.values()))
            self.assertTrue(set(media_map).issubset(names))

    def test_missing_media_is_reported_but_card_is_preserved(self):
        with tempfile.TemporaryDirectory() as work:
            output = Path(work) / "missing.apkg"
            result = export_package({"annotations": [self.annotation(
                screenshotRef=str(Path(work) / "missing.png"))]}, output, "Whisper Local")
            notes, _, _, media_map, _ = inspect_package(output)
            self.assertEqual(len(notes), 1)
            self.assertEqual(result["skippedMedia"], 1)
            self.assertEqual(media_map, {})


if __name__ == "__main__":
    unittest.main()
