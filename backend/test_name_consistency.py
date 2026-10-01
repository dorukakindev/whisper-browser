"""Özel ad/terim tutarlılık denetimi — eş-geçiş haritası + onaylı düzeltme."""

import sys
sys.path.insert(0, 'backend')

from name_consistency import audit_name_consistency, apply_glossary_corrections


def check(name, condition):
    if not condition:
        print('FAIL', name)
        raise SystemExit(1)
    print('PASS', name)


def make(pairs):
    entries = [(i * 3.0, i * 3.0 + 2.0, src) for i, (src, _t) in enumerate(pairs)]
    outs = [t for _s, t in pairs]
    return entries, outs


entries, outs = make([
    ("Sherlock girdi.", "Sherlock girdi."),
    ("Sherlock konuştu.", "Şerlok konuştu."),
    ("Sherlock gülümsedi.", "Şerlok gülümsedi."),
    ("Watson baktı.", "Watson baktı."),
    ("Watson koştu.", "Watson koştu."),
    ("Sherlock ve Watson.", "Şerlok ve Watson."),
    ("John aradı.", "John aradı."),
    ("Sherlock çıktı.", "Sherlock çıktı."),
    ("Sherlock döndü.", "Sherlock döndü."),
    ("Bugün hava güzel.", "Bugün hava güzel."),
    ("Sherlock dedi.", "Şerlok dedi."),
    ("Sherlock bitirdi.", "Sherlock bitirdi."),
])

report = audit_name_consistency(entries, outs, names=["Sherlock", "Watson", "John"])
by_name = {r["name"]: r for r in report}
check('Sherlock tutarsızlığı bulundu', "Sherlock" in by_name)
check('Sherlock varyantları', "Şerlok" in by_name["Sherlock"]["variants"]
      and "Sherlock" in by_name["Sherlock"]["variants"])
check('çoğunluk öneri Sherlock', by_name["Sherlock"]["suggestion"] == "Sherlock")
check('Watson tutarlı rapor edilmedi', "Watson" not in by_name)
check('John tutarlı rapor edilmedi', "John" not in by_name)

# tutarlı dosyada rapor boş
entries2, outs2 = make([(f"Sherlock {i}", f"Sherlock {i}") for i in range(5)])
check('tutarlı dosya boş rapor', audit_name_consistency(entries2, outs2, ["Sherlock"]) == [])

# az geçiş rapora girmez
entries3, outs3 = make([("Sherlock", "Şerlok"), ("Sherlock", "Sherlock")])
check('2 geçişli az-varyant sınırdan önce tutarlı', audit_name_consistency(entries3, outs3, ["Sherlock"]) == [])

# onaylı düzeltme: azınlık 'Şerlok' → 'Sherlock'; John'a dokunulmaz
new_outs, fixed = apply_glossary_corrections(entries, outs,
                                           {"Sherlock": "Sherlock"}, report)
check('4 azınlık varyant düzeltildi', fixed == 4)
check('kaynak metin korundu', entries[1][2] == "Sherlock konuştu.")
check('zamanlar korundu', entries[1][0] == 3.0 and entries[1][1] == 5.0)
check('azınlık düzeltildi', new_outs[1] == "Sherlock konuştu.")
check('çoğunluk aynı', new_outs[0] == "Sherlock girdi.")
check('başka ad etkilenmedi', new_outs[6] == "John aradı.")
check('Watson satırı aynı', new_outs[3] == "Watson baktı.")

# reportsuz çağrıda da güvenli: eş-geçişli varyantlar değişir
new_outs2, fixed2 = apply_glossary_corrections(entries, outs, {"Sherlock": "Sherlock"})
check('reportsuz mod da çalışır', fixed2 >= 4)

# yanlış karar: mevcut olmayan biçim seçilirse varyantlar yine değişir ama
# çoğunluk biçimi de listede → yalnız non-chosen değişir
new3, f3 = apply_glossary_corrections(entries, outs, {"Sherlock": "Şerlok"}, report)
check('ters karar da uygulanabilir', f3 == 4 and new3[0] == "Şerlok girdi.")

print('name-consistency: tüm kontroller geçti')

# onaylı-eşlem ayrıştırması: '=' çifti yalnız tespit edilmiş ada uygulanır
from name_consistency import glossary_decisions
d = glossary_decisions(["Sherlock=Şerlok", "Fenerbahçe=Fener", "Nazlıca=Nazlıca"],
                       ["Sherlock", "Nazlıca"])
check('sözlük eşlemi alındı', d.get("Sherlock") == "Şerlok")
check('tespit edilmemiş ad reddedildi', "Fenerbahçe" not in d)
check('özdeş eşlem de tutulur', d.get("Nazlıca") == "Nazlıca")
check('eşittirsiz terim atlanır', glossary_decisions(["sadece terim"], ["x"]) == {})
check('boş girdi güvenli', glossary_decisions(None) == {})
check('names verilmezse hepsi kabul', glossary_decisions(["A=B"]) == {"A": "B"})

print('decisions: tüm kontroller geçti')
