#!/usr/bin/env python3
"""Whisper Local öğrenme notlarını güvenli bir Anki paketine dönüştürür."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

import genanki


MODEL_ID = 2143810192
DECK_ID = 2059400110
MODEL_NAME = "Whisper Local Bağlam Kartı"
MAX_INPUT_BYTES = 32 * 1024 * 1024
MAX_NOTES = 5000
MAX_MEDIA_FILE_BYTES = 32 * 1024 * 1024
MAX_MEDIA_TOTAL_BYTES = 256 * 1024 * 1024

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}


ANKI_MODEL = genanki.Model(
    MODEL_ID,
    MODEL_NAME,
    fields=[
        {"name": "Source"}, {"name": "Translation"}, {"name": "UserNote"},
        {"name": "MediaTitle"}, {"name": "Timestamp"},
        {"name": "Screenshot"}, {"name": "Audio"},
    ],
    templates=[{
        "name": "Bağlam kartı",
        "qfmt": ('<div class="source">{{Source}}</div>'
                 '<div class="context">{{MediaTitle}} · {{Timestamp}}</div>'
                 '<div class="screenshot">{{Screenshot}}</div>'),
        "afmt": ('{{FrontSide}}<hr id="answer">'
                 '<div class="translation">{{Translation}}</div>'
                 '<div class="note">{{UserNote}}</div>'
                 '<div class="audio">{{Audio}}</div>'),
    }],
    css=(".card{font-family:Arial,sans-serif;font-size:22px;text-align:left;"
         "color:#ece8df;background:#17191d;line-height:1.45;padding:20px}"
         ".source{font-size:26px}.translation{font-size:24px;color:#9dd7d5}"
         ".context{margin-top:12px;color:#d5a35c;font-size:14px}"
         ".note{margin-top:14px;color:#d7d1c7;font-size:17px}"
         ".screenshot img{display:block;max-width:100%;max-height:420px;margin:16px auto}"
         ".audio{margin-top:12px}hr{border:0;border-top:1px solid #454a52;margin:18px 0}"),
)


def _clean_text(value: Any, limit: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:limit]


def _timecode(seconds: Any) -> str:
    try:
        total = max(0, int(float(seconds)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _safe_tags(annotation: dict[str, Any]) -> list[str]:
    values = ["whisper-local", f"durum-{_clean_text(annotation.get('status'), 24) or 'new'}"]
    values.extend(annotation.get("tags") if isinstance(annotation.get("tags"), list) else [])
    result: list[str] = []
    for raw in values:
        tag = "-".join(_clean_text(raw, 80).split())
        if tag and tag not in result:
            result.append(tag)
    return result[:32]


def _hash_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _stage_media(raw_ref: Any, kind: str, staging_dir: Path,
                 staged: dict[str, Path], budget: dict[str, int]) -> tuple[str, bool]:
    ref = _clean_text(raw_ref, 1000)
    if not ref:
        return "", False
    try:
        source = Path(ref).expanduser().resolve(strict=True)
        allowed = IMAGE_EXTENSIONS if kind == "image" else AUDIO_EXTENSIONS
        stat = source.stat()
        if not source.is_file() or source.suffix.lower() not in allowed:
            return "", True
        if stat.st_size <= 0 or stat.st_size > MAX_MEDIA_FILE_BYTES:
            return "", True
        digest = _hash_file(source)
        extension = ".jpg" if source.suffix.lower() == ".jpeg" else source.suffix.lower()
        package_name = f"whisper-{digest[:24]}{extension}"
        if package_name not in staged:
            if budget["bytes"] + stat.st_size > MAX_MEDIA_TOTAL_BYTES:
                return "", True
            destination = staging_dir / package_name
            shutil.copyfile(source, destination)
            staged[package_name] = destination
            budget["bytes"] += stat.st_size
        return package_name, False
    except (OSError, ValueError):
        return "", True


def _load_payload(stream: Any) -> dict[str, Any]:
    raw = stream.buffer.read(MAX_INPUT_BYTES + 1) if hasattr(stream, "buffer") else stream.read(MAX_INPUT_BYTES + 1)
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Anki girdisi güvenli boyut sınırını aşıyor.")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Anki girdisi geçerli UTF-8 JSON değil.") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("annotations"), list):
        raise ValueError("Anki girdisinde annotations dizisi bulunamadı.")
    if len(payload["annotations"]) > MAX_NOTES:
        raise ValueError("Anki kart sayısı güvenli sınırı aşıyor.")
    return payload


def export_package(payload: dict[str, Any], output_path: str | os.PathLike[str], deck_name: str) -> dict[str, Any]:
    output = Path(output_path).expanduser().resolve()
    if output.suffix.lower() != ".apkg":
        raise ValueError("Anki çıktısı .apkg uzantılı olmalı.")
    output.parent.mkdir(parents=True, exist_ok=True)
    deck = genanki.Deck(DECK_ID, _clean_text(deck_name, 160) or "Whisper Local")
    annotations = payload.get("annotations") if isinstance(payload, dict) else []
    skipped_media = 0
    exported = 0

    with tempfile.TemporaryDirectory(prefix="whisper-anki-") as temporary_dir:
        staging_dir = Path(temporary_dir)
        staged: dict[str, Path] = {}
        budget = {"bytes": 0}
        for raw in annotations[:MAX_NOTES]:
            if not isinstance(raw, dict) or _clean_text(raw.get("type"), 16) != "quote":
                continue
            annotation_id = _clean_text(raw.get("id"), 180)
            source = _clean_text(raw.get("source"), 4000)
            translation = _clean_text(raw.get("translation"), 4000)
            user_note = _clean_text(raw.get("note"), 8000)
            if not annotation_id or not source or not (translation or user_note):
                continue
            screenshot, screenshot_skipped = _stage_media(
                raw.get("screenshotRef"), "image", staging_dir, staged, budget)
            audio, audio_skipped = _stage_media(
                raw.get("audioRef"), "audio", staging_dir, staged, budget)
            skipped_media += int(screenshot_skipped) + int(audio_skipped)
            fields = [
                html.escape(source), html.escape(translation),
                html.escape(user_note).replace("\n", "<br>"),
                html.escape(_clean_text(raw.get("mediaTitle") or raw.get("mediaId"), 500)),
                html.escape(_timecode(raw.get("start"))),
                f'<img src="{screenshot}">' if screenshot else "",
                f"[sound:{audio}]" if audio else "",
            ]
            deck.add_note(genanki.Note(model=ANKI_MODEL, fields=fields,
                tags=_safe_tags(raw), guid=genanki.guid_for(annotation_id)))
            exported += 1

        if not exported:
            raise ValueError("Dışa aktarılabilecek kaynak ve çeviri içeren alıntı bulunamadı.")
        package = genanki.Package(deck, media_files=[str(item) for item in staged.values()])
        temporary_output = output.with_name(f".{output.name}.{os.getpid()}.tmp")
        try:
            package.write_to_file(str(temporary_output))
            os.replace(temporary_output, output)
        finally:
            try:
                temporary_output.unlink(missing_ok=True)
            except OSError:
                pass

    return {"ok": True, "count": exported, "mediaCount": len(staged),
            "skippedMedia": skipped_media, "modelId": MODEL_ID, "deckId": DECK_ID}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Whisper Local notlarını Anki paketine dönüştürür.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--deck-name", default="Whisper Local")
    args = parser.parse_args(argv)
    try:
        result = export_package(_load_payload(sys.stdin), args.output, args.deck_name)
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(f"Anki paketi oluşturulamadı: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
