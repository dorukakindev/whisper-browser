"""Altyazı cümle haritası: kaynak bloklarını değiştirmeden grup bazlı kabul."""

import math
import re
import unicodedata

SENTENCE_PROTOCOL_VERSION = 1
_BOUNDARY = re.compile(r'(?:^|\n)\s*(?:[-–—♪♫\[(]|<v\b|[^.!?:\n]{1,32}:\s)', re.I)
_END = re.compile(r'[.!?…。！？][\"\'”’)}\]]*$')
_ABBREVIATION = re.compile(r'\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|e\.g|i\.e)\.$', re.I)


def normalized_text(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(text or ''))).strip()


def sentence_ended(text):
    text = normalized_text(text)
    return bool(_END.search(text) and not _ABBREVIATION.search(text))


def sentence_groups(entries, max_gap=1.2, max_chars=280, max_duration=12, max_parts=6):
    """Her giriş tam bir gruba aittir; zamanlar/sıra/kelimeler değiştirilmez.

    Konuşmacı/SDH işareti taşıyan, örtüşen veya zamanı bozuk bloklar tek kalır.
    Etiketsiz konuşmacı değişimi yalnız metinden kesin olarak saptanamaz.
    """
    groups, group = [], []
    length = 0

    def protected(index):
        start, end, text = entries[index]
        return (not math.isfinite(float(start)) or not math.isfinite(float(end))
                or float(end) <= float(start) or not normalized_text(text)
                or bool(_BOUNDARY.search(str(text).strip())))

    for index, (start, end, text) in enumerate(entries):
        size = len(normalized_text(text))
        if group:
            previous = group[-1]
            gap = float(start) - float(entries[previous][1])
            if (protected(index) or protected(previous) or not -0.05 <= gap <= max_gap
                    or float(end) - float(entries[group[0]][0]) > max_duration
                    or length + 1 + size > max_chars or len(group) >= max_parts):
                groups.append(group)
                group, length = [], 0
        group.append(index)
        length += size + (1 if len(group) > 1 else 0)
        if protected(index) or sentence_ended(text):
            groups.append(group)
            group, length = [], 0
    if group:
        groups.append(group)
    return groups


def pack_sentence_groups(groups, limit=20):
    """İstek sınırı veya aradaki cache isabeti cümleyi ikiye bölmez."""
    chunks, current = [], []
    for group in groups:
        if current and (group[0] != current[-1] + 1 or len(current) + len(group) > limit):
            chunks.append(current)
            current = []
        current.extend(group)
    if current:
        chunks.append(current)
    return chunks


def validate_sentence_parts(whole, parts, count):
    if (not isinstance(whole, str) or not normalized_text(whole) or len(whole) > 12000
            or not isinstance(parts, list) or len(parts) != count
            or any(not isinstance(part, str) or not normalized_text(part) for part in parts)):
        return None
    # Sadece boşluk/NFC farkına izin ver: sözcük/noktalama ekleme, silme veya
    # yineleme yerleştirme aşamasında sessizce kabul edilmesin.
    if normalized_text(' '.join(parts)) != normalized_text(whole):
        return None
    return {"text": normalized_text(whole), "parts": [part.strip() for part in parts]}


def accept_sentence_reply(data, ids):
    """Çok bloklu grup ya bütünüyle kabul edilir ya hiç uygulanmaz.

    Eski düz ID→metin yanıtları yalnız bağımsız tek bloklarda uyumluluk için
    kabul edilir. Çok bloklu grupta ayrı tam çeviri kanıtı zorunludur.
    """
    if not isinstance(data, dict):
        return None
    items = data.get('items', data)
    wholes = data.get('sentences', {})
    if not isinstance(items, dict) or not isinstance(wholes, dict):
        return None
    parts = [items.get(str(index)) for index in ids]
    whole = wholes.get(str(ids[0]))
    if len(ids) == 1 and whole is None:
        whole = parts[0]
    return validate_sentence_parts(whole, parts, len(ids))
