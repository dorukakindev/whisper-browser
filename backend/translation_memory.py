"""Bağlam ve anlam çapalı SQLite çeviri hafızası."""

from __future__ import annotations

import hashlib
import re
import sqlite3
import threading
import time
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

TM_SCHEMA_VERSION = 1

_TOKEN_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.UNICODE)
_NUMBER_RE = re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)*(?!\w)", re.UNICODE)
_PUNCT = {",": ",", ";": ",", ":": ":", "?": "?", "!": "!", "(": "(", ")": ")",
          "[": "(", "]": ")", "-": "-", "–": "-", "—": "-", "…": ".", ".": "."}
_CONTRACTIONS = {
    "it's": ("it", "is"), "that's": ("that", "is"), "what's": ("what", "is"),
    "i'm": ("i", "am"), "you're": ("you", "are"), "we're": ("we", "are"),
    "they're": ("they", "are"), "he's": ("he", "is"), "she's": ("she", "is"),
    "can't": ("can", "not"), "cannot": ("can", "not"), "won't": ("will", "not"),
    "don't": ("do", "not"), "doesn't": ("does", "not"), "didn't": ("did", "not"),
    "isn't": ("is", "not"), "aren't": ("are", "not"), "wasn't": ("was", "not"),
    "weren't": ("were", "not"), "shouldn't": ("should", "not"),
    "wouldn't": ("would", "not"), "couldn't": ("could", "not"),
    "mustn't": ("must", "not"), "haven't": ("have", "not"), "hasn't": ("has", "not"),
    "hadn't": ("had", "not"),
}
_VOCAL_FILLERS = frozenset({"uh", "um", "umm", "erm", "er", "hmm", "hm", "ah"})
_VOCAL_FILLER_RE = re.compile(
    r"(?:,\s*)?\b(?:uh|um|umm|erm|er|hmm|hm|ah)\b(?:\s*,)?", re.IGNORECASE)
_NEGATIONS = frozenset({
    "not", "no", "never", "neither", "nor", "without", "none", "nothing", "nobody",
    "değil", "degil", "yok", "asla", "hiç", "hic", "ne", "ni",
})
_MODALS = frozenset({
    "can", "could", "may", "might", "must", "shall", "should", "will", "would",
    "ought", "need", "gerek", "lazım", "lazim", "meli", "malı", "mali",
})
_PRONOUNS = frozenset({
    "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
    "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them", "their",
    "ben", "bana", "beni", "biz", "bize", "bizi", "sen", "sana", "seni", "siz",
    "size", "sizi", "o", "ona", "onu", "onlar", "onlara", "onları", "onlari",
})
_NON_NAME_SENTENCE_STARTS = frozenset({
    # Cümle başındaki büyük harf, zamir/işlev sözcüğünü özel ada dönüştürmez.
    # Hem kısaltılmış hem açılmış biçimler bulunur; anlamsal token kapıları
    # zamir/olumsuzluk/modal farklarını ayrıca korumaya devam eder.
    "it's", "it", "that's", "that", "there's", "there", "what's", "what",
    "he's", "he", "she's", "she", "we're", "we", "they're", "they",
    "i'm", "i", "you're", "you", "uh", "um", "umm", "erm", "er", "hmm", "hm", "ah",
})


def _tokens(text):
    return tuple(unicodedata.normalize("NFC", token.replace("’", "'")).casefold()
                 for token in _TOKEN_RE.findall(str(text or "")))


def _semantic_tokens(text):
    expanded = []
    for token in _tokens(text):
        expanded.extend(_CONTRACTIONS.get(token, (token,)))
    return tuple(token for token in expanded if token not in _VOCAL_FILLERS)


def _number_signature(text):
    # Kaynak varyantındaki 1.5/1,5 yazım farkını aynı sayı kabul et; rakamların
    # ve işaretin kendisi değişirse eşleşme yine reddedilir.
    return tuple(re.sub(r"[.,]", ".", match.group(0)) for match in _NUMBER_RE.finditer(str(text or "")))


def _anchor_signature(tokens, vocabulary):
    return tuple(sorted(token for token in tokens if token in vocabulary))


def _proper_name_signature(text, ignore_matching_first=False):
    names = []
    for index, match in enumerate(_TOKEN_RE.finditer(str(text or ""))):
        token = unicodedata.normalize("NFC", match.group(0).replace("’", "'"))
        if index == 0 and (ignore_matching_first
                           or token.casefold() in _NON_NAME_SENTENCE_STARTS):
            continue
        if (len(token) > 1 and (token.isupper() or token[:1].isupper())
                and token.casefold() != "i"):
            names.append(token.casefold())
    return tuple(names)


def _near_typographic_tokens(left, right):
    if len(left) != len(right) or not left:
        return False
    changed = 0
    for first, second in zip(left, right):
        if first == second:
            continue
        changed += 1
        # Fuzzy reuse only repairs one likely spelling/ASR variant. Inserting,
        # deleting or replacing a content word (red -> blue) is translation,
        # not cache reuse, even when the whole sentence is 85% similar.
        if (changed > 1 or min(len(first), len(second)) < 5
                or SequenceMatcher(None, first, second).ratio() < .88):
            return False
    return changed <= 1


def _punctuation_shape(text):
    value = str(text or "").replace("…", "...").rstrip(".!?…\"'”’»)]} ")
    shape = []
    for char in value:
        mapped = _PUNCT.get(char)
        if mapped and (not shape or shape[-1] != mapped):
            shape.append(mapped)
    return tuple(shape)


def _semantic_punctuation_shape(text):
    # Dolgu sözcüğünü çevreleyen virgüller konuşmanın anlam iskeleti değildir;
    # diğer iç noktalama (özellikle hitap virgülü) aynen korunur.
    return _punctuation_shape(_VOCAL_FILLER_RE.sub(" ", str(text or "")))


def fuzzy_semantically_compatible(source, candidate):
    source_tokens = _semantic_tokens(source)
    candidate_tokens = _semantic_tokens(candidate)
    same_initial_token = bool(
        source_tokens and candidate_tokens and source_tokens[0] == candidate_tokens[0]
    )
    if not _near_typographic_tokens(source_tokens, candidate_tokens):
        return False
    return bool(
        _number_signature(source) == _number_signature(candidate)
        and _anchor_signature(source_tokens, _NEGATIONS)
        == _anchor_signature(candidate_tokens, _NEGATIONS)
        and _anchor_signature(source_tokens, _MODALS)
        == _anchor_signature(candidate_tokens, _MODALS)
        and _anchor_signature(source_tokens, _PRONOUNS)
        == _anchor_signature(candidate_tokens, _PRONOUNS)
        and _proper_name_signature(source, same_initial_token)
        == _proper_name_signature(candidate, same_initial_token)
        and _semantic_punctuation_shape(source) == _semantic_punctuation_shape(candidate)
        and str(source).rstrip().endswith("?") == str(candidate).rstrip().endswith("?")
    )


class TranslationMemory:
    MAX_ROWS = 50000
    _COLUMNS = {"id", "source", "target", "scope", "context_key", "created_at"}

    def __init__(self, db_path, max_rows=None):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), timeout=20, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        version = int(self._conn.execute("PRAGMA user_version").fetchone()[0])
        if version not in {0, TM_SCHEMA_VERSION}:
            self._conn.close(); self._conn = None
            raise RuntimeError(f"Desteklenmeyen çeviri hafızası şeması: {version}")
        existing_columns = {
            row[1] for row in self._conn.execute("PRAGMA table_info(tm)").fetchall()
        }
        if existing_columns and existing_columns != self._COLUMNS:
            self._conn.close(); self._conn = None
            raise RuntimeError("Çeviri hafızası tablosu beklenen şemayla uyuşmuyor")
        self._conn.execute("""CREATE TABLE IF NOT EXISTS tm (
          id INTEGER PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL,
          scope TEXT NOT NULL, context_key TEXT NOT NULL, created_at REAL NOT NULL,
          UNIQUE(source, scope, context_key))""")
        self._conn.execute("CREATE INDEX IF NOT EXISTS tm_scope_length ON tm(scope, length(source))")
        self._conn.execute(f"PRAGMA user_version={TM_SCHEMA_VERSION}")
        self._conn.commit()
        requested_limit = self.MAX_ROWS if max_rows is None else int(max_rows)
        self.max_rows = max(1, requested_limit)

    @staticmethod
    def context_key(value):
        return hashlib.sha256(str(value or "").encode("utf-8", "replace")).hexdigest()[:24]

    def lookup(self, source, scope, context_fingerprint, threshold=.85):
        source = str(source or "").strip()
        if len(source) < 12:
            return None
        context_key = self.context_key(context_fingerprint)
        lo, hi = max(1, int(len(source) * .75)), int(len(source) * 1.25) + 1
        with self._lock:
            rows = self._conn.execute(
                "SELECT source,target FROM tm WHERE scope=? AND context_key=? AND length(source) BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 240",
                (str(scope), context_key, lo, hi)).fetchall()
        best = None
        for candidate, target in rows:
            ratio = SequenceMatcher(None, source.casefold(), candidate.casefold()).ratio()
            if ratio < threshold or not fuzzy_semantically_compatible(source, candidate):
                continue
            if best is None or ratio > best[0]:
                best = (ratio, target, candidate)
        return None if best is None else {"target": best[1], "source": best[2], "ratio": best[0]}

    def store(self, source, target, scope, context_fingerprint):
        source, target = str(source or "").strip(), str(target or "").strip()
        if not source or not target or source.casefold() == target.casefold():
            return False
        with self._lock:
            self._conn.execute(
                "INSERT INTO tm(source,target,scope,context_key,created_at) VALUES(?,?,?,?,?) "
                "ON CONFLICT(source,scope,context_key) DO UPDATE SET target=excluded.target,created_at=excluded.created_at",
                (source, target, str(scope), self.context_key(context_fingerprint), time.time()))
            count = int(self._conn.execute("SELECT count(*) FROM tm").fetchone()[0])
            prune_at = self.max_rows + min(1000, max(1, self.max_rows // 20))
            overflow = count - self.max_rows
            if overflow > 0 and count >= prune_at:
                self._conn.execute(
                    "DELETE FROM tm WHERE id IN (SELECT id FROM tm ORDER BY created_at ASC, id ASC LIMIT ?)",
                    (overflow,),
                )
            self._conn.commit()
        return True

    def close(self):
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None
