"""Özel ad/terim tutarlılık denetimi — çeviri sonrası söz varlığı sözleşmesi.

Kaynak metinde aynı görünen özel ad, hedef satırlarda farklı biçimlerde
dönebilir ('Sherlock' → 'Sherlock'/'Şerlok'/'Şerlok Holmes'). Bu modül
eş-geçiş (co-occurrence) çözümlemesiyle kaynak ad→hedef biçim eşlemesini
çıkarır, azınlık varyantları raporlar ve kullanıcının onayladığı eşlemi
hedef metne uygular. Kaynak metin ve zaman damgaları hiç değişmez.
"""

import re
import unicodedata

_NAME_TOKEN = re.compile(r"[^\W\d_][\w'’\-]*", re.UNICODE)


def _canon(value):
    return unicodedata.normalize("NFC", str(value or "")).casefold()


def _capitalized_variants(target_text):
    """Hedef satırdaki ad adayı öbekler: büyük harfle başlayan 1-3 kelime."""
    text = unicodedata.normalize("NFC", str(target_text or ""))
    words = list(_NAME_TOKEN.finditer(text))
    variants = set()
    run = []

    def flush():
        if run:
            variants.add(" ".join(m.group(0) for m in run))
        run.clear()

    for match in words:
        word = match.group(0)
        gap = text[run[-1].end():match.start()] if run else ""
        if run and not gap.isspace():
            flush()
        if word and word[0].isupper() and len(word) >= 2:
            run.append(match)
            if len(run) >= 3:
                flush()
        else:
            flush()
    flush()
    # tek-token büyük harfli varyantlar da aday (Şerlok gibi birleşik biçimler)
    return variants


def _name_occurs(name, source_text):
    src = unicodedata.normalize("NFC", str(source_text or ""))
    needle = unicodedata.normalize("NFC", str(name or ""))
    if not needle:
        return False
    return _canon(needle) in _canon(src)


def audit_name_consistency(entries, out_texts, names=None, min_occurrences=2):
    """Kaynak ad → hedef biçim eşleme haritası + tutarsızlık raporu.

    Döndürür: [{'name': kaynak ad, 'occurrences': n,
                'variants': {biçim: sayı}, 'suggestion': çoğunluk biçimi}]
    Yalnız `min_occurrences`+ kez geçen ve 2+ güçlü varyantı olan adlar
    tutarsız sayılır. `names` verilmezse çağıran extract_auto_glossary
    çıktısını geçirmeli (çift sayımı önlemek için parametre).
    """
    by_name = {}
    names = names or []
    total = min(len(entries), len(out_texts))
    for index in range(total):
        source = entries[index][2]
        target = out_texts[index]
        for name in names:
            if not _name_occurs(name, source):
                continue
            row = by_name.setdefault(name, {"occurrences": 0, "variants": {}})
            row["occurrences"] += 1
            variants = _capitalized_variants(target)
            if _name_occurs(name, target):
                variants.add(str(name))
            for variant in variants:
                # Hedef satırdaki her büyük harfli öbek aday değildir; yalnız
                # kaynak adla eş-geçiş gücü olanlar sonradan seçilir.
                row["variants"][variant] = row["variants"].get(variant, 0) + 1
    report = []
    for name, row in by_name.items():
        occurrences = row["occurrences"]
        if occurrences < min_occurrences:
            continue
        # eş-geçiş süzgeci: varyant en az 2 kez VE geçişlerin ≥1/3'ünde görülmeli
        strong = {v: c for v, c in row["variants"].items()
                  if c >= 2 and c * 3 >= occurrences}
        if len(strong) < 2:
            continue
        # beraberlikte kaynakla özdeş biçim önerilir (adı olduğu gibi tutmak
        # genelde doğru kanonik seçimdir)
        suggestion = max(strong.items(),
                         key=lambda kv: (kv[0] == name, kv[1], kv[0]))[0]
        report.append({"name": name, "occurrences": occurrences,
                       "variants": dict(sorted(strong.items(),
                                               key=lambda kv: -kv[1])),
                       "suggestion": suggestion})
    report.sort(key=lambda r: (-r["occurrences"], _canon(r["name"])))
    return report


def apply_glossary_corrections(entries, out_texts, decisions, report=None):
    """Onaylanmış eşlemeleri hedef metne uygular → (yeni_out_texts, düzeltme_sayısı).

    `decisions`: {kaynak_ad: seçili_hedef_biçim}. Yalnız `report`'taki (veya
    audit çıktısı) o ada ait güçlü azınlık varyantlar değiştirilir — satırdaki
    başka özel adlara ('Sherlock' satırındaki 'John') dokunulmaz. `report`
    verilmezse varyantlar hedef satırlarda kaynak adla eş-geçiş yapan
    biçimlerden türetilir. Zamanlar ve kaynak metin aynen korunur.
    """
    variants_by_name = {}
    for row in report or []:
        variants_by_name[row["name"]] = set(row["variants"])
    new_texts = list(out_texts)
    fixed = 0
    for name, chosen in (decisions or {}).items():
        chosen = str(chosen or "").strip()
        if not chosen:
            continue
        allowed = variants_by_name.get(name)
        for index in range(min(len(entries), len(new_texts))):
            if not _name_occurs(name, entries[index][2]):
                continue
            target = unicodedata.normalize("NFC", str(new_texts[index] or ""))
            variants = _capitalized_variants(target)
            if allowed is not None:
                variants &= allowed
            for variant in variants:
                # adı İÇEREN ama kendisi olmayan öbekleri atla ('Sherlock
                # Holmes'u ezmeyiz); adın birebir kendisi değiştirilebilir
                if variant == chosen or (variant != name
                                         and _name_occurs(name, variant)):
                    continue
                pattern = re.compile(r"(?<![\w'’\-])" + re.escape(variant)
                                     + r"(?![\w'’\-])", re.UNICODE)
                replaced, count = pattern.subn(chosen, target)
                if count:
                    target = replaced
                    fixed += count
            new_texts[index] = target
    return new_texts, fixed


def glossary_decisions(terms, names=None):
    """'Kaynak=Hedef' bicimindeki sozluk ciftlerini onayli esleme sozlugune
    donusturur. Yalniz 'names' icinde tespit edilmis ozel adlar kabul
    edilir — keyfi '=' icerikli terimler veriye dokunamaz."""
    allowed = {_canon(n) for n in names} if names else None
    decisions = {}
    for term in terms or []:
        if "=" not in str(term):
            continue
        left, _, right = str(term).partition("=")
        left, right = left.strip(), right.strip()
        if not left or not right:
            continue
        if allowed is not None and _canon(left) not in allowed:
            continue
        decisions[left] = right
    return decisions
