"""SDH betimlemelerini gerçek diyalog ve başlıklardan ayıran temkinli katman."""

import re
import unicodedata

_FORMAT_TAG = re.compile(r"</?(?:i|b|u|font)(?:\s[^>]*)?>", re.I)
_GROUP = re.compile(r"\[([^\]\n]{1,160})\]|\(([^)\n]{1,160})\)")
_MUSIC = re.compile(r"[♪♫♬♩]+")
_SPEAKER = frozenset({"man", "woman", "narrator", "host", "doctor", "captain", "officer",
                      "adam", "kadın", "anlatıcı", "sunucu", "doktor", "kaptan", "polis"})
_SDH = frozenset({
    "music", "applause", "applauding", "cheering", "laughter", "laughing", "chuckles",
    "sighs", "sighing", "gasps", "gasping", "coughs", "coughing", "screams", "screaming",
    "crying", "sobbing", "weeping",
    "whispers", "whispering", "inaudible", "indistinct", "garbled voices", "crowd cheering",
    "door slams", "door closes", "door opens", "phone rings", "ringing", "gunshot", "gunshots",
    "thunder", "explosion", "siren", "engine", "footsteps", "wind", "rain", "silence",
    "müzik", "muzik", "alkış", "alkis", "kahkaha", "gülüşmeler", "gulusmeler", "iç çeker",
    "ic ceker", "öksürür", "oksurur", "çığlık", "ciglik", "fısıldar", "fisildar",
    "anlaşılmıyor", "anlasilmiyor", "uğultu", "ugultu", "kapı çarpar", "kapi carpar",
    "telefon çalar", "telefon calar", "silah sesi", "gök gürültüsü", "gok gurultusu",
})


def _key(value):
    value = unicodedata.normalize("NFKD", str(value or "")).casefold()
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9çğıöşü\s-]", " ", value).strip(" :-–—").strip()


def is_sdh_descriptor(value):
    key = _key(value)
    if not key or key in _SPEAKER:
        return False
    normalized_terms = {_key(term) for term in _SDH}
    if key in normalized_terms:
        return True
    # Alt dize eşleşmesi tehlikelidir: [Brain] içindeki rain veya gerçek
    # [The music is wonderful] cümlesi ses etiketi değildir.
    modifiers = {"soft", "tense", "dramatic", "ominous", "distant", "quiet",
                 "loud", "upbeat", "background", "continues", "playing", "howling", "wailing",
                 "hafif", "gergin", "dramatik", "ugursuz", "uzak", "uzaktan",
                 "sessiz", "yuksek", "neseli", "arka", "planda", "devam", "ediyor", "caliyor"}
    words = key.split()
    if not 0 < len(words) <= 6:
        return False
    for term in normalized_terms:
        term_words = term.split()
        if not term_words or len(term_words) > len(words):
            continue
        for start in range(len(words) - len(term_words) + 1):
            if words[start:start + len(term_words)] != term_words:
                continue
            surrounding = words[:start] + words[start + len(term_words):]
            if surrounding and set(surrounding) <= modifiers:
                return True
    return False


def is_structural_sdh_cue(text):
    plain = _FORMAT_TAG.sub("", str(text or "")).strip()
    if plain and not _MUSIC.sub("", plain).strip(" .…-–—"):
        return True
    match = _GROUP.fullmatch(plain)
    return bool(match and is_sdh_descriptor(match.group(1) or match.group(2)))


def strip_sdh_descriptors(text):
    value = str(text or "")
    # İç içe veya dengesiz parantezlerin içinden parça sökme. Böylece başlık,
    # açıklama ve gerçek diyalogda sadece iç grubun yanlış silinmesi önlenir.
    stack, spans, start = [], [], None
    pairs = {"]": "[", ")": "("}
    for index, char in enumerate(value):
        if char == "\n":
            stack, start = [], None
        elif char in "[(":
            if not stack: start = index
            stack.append(char)
        elif char in "])" and stack:
            if stack[-1] != pairs[char]:
                stack, start = [], None
                continue
            stack.pop()
            if not stack and start is not None:
                descriptor = value[start + 1:index]
                if len(descriptor) <= 160 and not any(c in descriptor for c in "[]()") and is_sdh_descriptor(descriptor):
                    spans.append((start, index + 1))
                start = None
    for start, end in reversed(spans):
        value = value[:start] + value[end:]
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()
