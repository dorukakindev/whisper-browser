"""Cümle grubu → Türkçe dağıtım regresyon testleri (BROWSER_BUG_REPORT_108).

Kullanıcı gereksinimleri: çeviri cümle seviyesinde çalışır, parçalar kaynak
cue sınırlarına anlam gözetilerek dağıtılır, cue içi ikinci cümle \n'den başlar,
sayı/özel ad/SDH demirlenir, ek/bağlaç ortasından kesilmez.
"""
import json
import sys
import types
import importlib.machinery
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import transcribe as T
from sentence_translation import (
    sentence_groups, sentence_ended, sentence_end_count,
    internal_sentence_end_count, sentence_part_boundary_issue,
    part_tail_issue, part_repetition_issue, part_anchor_issue,
    insert_sentence_breaks, validate_sentence_parts, accept_sentence_reply,
    normalized_text,
)


class _Args:
    def __init__(self, **kw):
        self.translate_api_key = "sk-test"
        self.translate_base_url = "https://api.example.com"
        self.translate_to = "tr"
        self.translate_model = "test-model"
        self.translate_workers = 1
        self.translate_register = "documentary"
        self.translate_profanity = "keep"
        self.translate_refine = False
        self.translate_cache = False
        self.translate_context = 0
        self.glossary = ""
        self.max_cps = 20
        self.max_line_width = 42
        self.input = "test.srt"
        self.__dict__.update(kw)


def _fake_openai(create_fn):
    import contextlib

    class _Client:
        def __init__(self, *a, **k):
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=create_fn))

    fake = types.ModuleType("openai")
    fake.OpenAI = _Client
    fake.__spec__ = importlib.machinery.ModuleSpec("openai", None)

    class _Ctx:
        def __enter__(self):
            self._real = sys.modules.get("openai")
            sys.modules["openai"] = fake
            return self

        def __exit__(self, *exc):
            if self._real is not None:
                sys.modules["openai"] = self._real
            else:
                sys.modules.pop("openai", None)
    return _Ctx()


def _run_translate(entries, reply_fn, **kw):
    """reply_fn(payload) -> dict (sentences/items) veya istisna."""
    calls = []

    def _create(**kwargs):
        calls.append(json.loads(kwargs["messages"][-1]["content"]))
        data = reply_fn(json.loads(kwargs["messages"][-1]["content"]), len(calls))
        return types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=json.dumps(data)))])

    with _fake_openai(_create):
        out = T.llm_translate(entries, _Args(**kw), [], source_lang="en")
    return out, calls


def _reply(items_map, sentences_map):
    def fn(_payload, _call):
        return {"items": items_map, "sentences": sentences_map}
    return fn


# ---------- 1. İki cue'ya bölünmüş tek cümle ----------

def test_two_cue_single_sentence_distributes_naturally():
    entries = [(1.0, 2.5, "I have to find her"), (2.5, 4.0, "before it is too late.")]
    out, _ = _run_translate(entries, _reply(
        {"0": "Onu bulmam lazım", "1": "çok geç olmadan."},
        {"0": "Onu bulmam lazım çok geç olmadan."}))
    assert [t for _, _, t in out] == ["Onu bulmam lazım", "çok geç olmadan."]


def test_word_per_word_early_sentence_end_rejected():
    """Parça 0'ı noktalama ile erken kapatan dağıtım reddedilir."""
    issue = sentence_part_boundary_issue(
        ["I have to find her", "before it is too late."],
        ["Onu bulmalıyım.", "o çok geç olmadan."])
    assert issue == "erken_cumle_sonu:0"
    # Noktasız doğal durak ise serbest (mevcut doğru davranış korunur)
    assert sentence_part_boundary_issue(
        ["I have to find her", "before it is too late."],
        ["Onu bulmam lazım", "çok geç olmadan."]) == ""


def test_word_split_at_boundary_rejected_by_join_match():
    """Ek/kelime kopması parça birleşimi tam cümleden sapar → reddedilir."""
    record = validate_sentence_parts(
        "Onu bulmak zorund", ["Onu bulmak zorun", "da kalacağım"], 2)
    assert record is None


# ---------- 2. Cue içinde biten + başlayan cümle ----------

def test_internal_sentence_in_source_allows_translated_end():
    """'Wait. Are you sure' / 'you want...' → 'Bekle.' artık kabul."""
    assert sentence_part_boundary_issue(
        ["Wait. Are you sure", "you want to come with me?"],
        ["Bekle.", "Benimle gelmek istediğinden emin misin?"]) == ""


def test_extra_sentence_end_beyond_internal_still_rejected():
    """Kaynak parçada 1 iç cümle varken hedefte 2 cümle sonu → ret."""
    assert sentence_part_boundary_issue(
        ["Wait. Are you sure", "you want to come with me?"],
        ["Bekle. Emin misin?", "Benimle gelmek istediğinden?"]) == "erken_cumle_sonu:0"


def test_intra_cue_second_sentence_gets_newline():
    """Aynı cue'da iki cümle kalırsa gerçek satır sonu konur."""
    record = validate_sentence_parts(
        "Bekle. Benimle gelmek istediğinden emin misin?",
        ["Bekle. Benimle gelmek", "istediğinden emin misin?"], 2)
    assert record is not None
    assert record["parts"][0] == "Bekle.\nBenimle gelmek"


def test_insert_sentence_breaks_respects_abbreviations():
    assert insert_sentence_breaks("Bekle. Emin misin?") == "Bekle.\nEmin misin?"
    assert insert_sentence_breaks("Dr. Lawson geldi.") == "Dr. Lawson geldi."
    assert insert_sentence_breaks("Tek cümle.") == "Tek cümle."


def test_numeric_separator_not_sentence_end():
    # Türkçe binlik/ondalık noktası cümle sonu değildir — sayı ortasına \n
    # koymak parça demirleme kapısını da kandırıyordu (num-05 regresyonu).
    assert insert_sentence_breaks("Kasada 3.000 sikke vardı.") == \
        "Kasada 3.000 sikke vardı."
    assert insert_sentence_breaks("Oran 2.4 milyon dolardı.") == \
        "Oran 2.4 milyon dolardı."
    assert sentence_end_count("Kasada 3.000 sikke vardı.") == 1
    assert sentence_end_count("Toplantı 5.30'da. Hazır ol.") == 2
    assert not sentence_ended("Kasada 3.000 sikke vardı")


# ---------- 3. Üç cue'ya yayılan uzun soru ----------

def test_three_cue_question_no_early_close():
    entries = [(0, 1, "Do you really"), (1, 2, "think that we"),
               (2, 3, "can make it?")]
    assert sentence_groups(entries) == [[0, 1, 2]]
    assert sentence_part_boundary_issue(
        ["Do you really", "think that we", "can make it?"],
        ["Gerçekten mi?", "başarabileceğimizi", "sanıyor musun?"]) == "erken_cumle_sonu:0"
    assert sentence_part_boundary_issue(
        ["Do you really", "think that we", "can make it?"],
        ["Başarabileceğimizi", "gerçekten sanıyor", "musun?"]) == ""


# ---------- 4. Kısaltmalar cümle sonu sayılmaz ----------

def test_abbreviations_not_sentence_end():
    for text in ["He met Dr. Lawson", "Mr. Smith", "He lives in the U.S.",
                 "Call Mrs."]:
        assert not sentence_ended(text), text
    assert sentence_ended("He met her.")
    assert internal_sentence_end_count("Dr. Lawson arrived late.") == 0


def test_ellipsis_continuation_not_end():
    assert not sentence_ended("If only I could...")
    assert internal_sentence_end_count("Well... maybe") == 0


# ---------- 5. Soru işaretinden sonra yeni cümle ----------

def test_question_then_new_sentence_same_cue():
    """Tek cue 'Sure? We go now' → TR'de ikinci cümle yeni satırda."""
    record = validate_sentence_parts(
        "Emin misin? Hemen gidiyoruz.", ["Emin misin? Hemen gidiyoruz."], 1)
    assert record["parts"][0] == "Emin misin?\nHemen gidiyoruz."


# ---------- 6. Sayı + birim demirleme ----------

def test_number_and_unit_stay_in_source_cue():
    issue = part_anchor_issue(
        ["It costs", "2.4 million dollars."],
        ["Fiyatı", "2.4 milyon dolar."], "tr")
    assert issue == ""
    # sayı başka cue'ya taşındı → ret
    assert part_anchor_issue(
        ["It costs 2.4", "million dollars."],
        ["Fiyatı", "2.4 milyon dolar."], "tr").startswith("sayi_kaydi")
    # sayı tamamen kayboldu → ret
    assert part_anchor_issue(
        ["We drove", "80 kilometers."],
        ["Yol", "aldık kilometre."], "tr").startswith("sayi_kaydi")
    # aynı cue'da Türkçe yazıyla geçer (bilgi korunur)
    assert part_anchor_issue(
        ["We drove", "80 kilometers."],
        ["Yol", "aldık seksen kilometre."], "tr") == ""
    assert part_anchor_issue(
        ["We drove", "80 kilometers."],
        ["Yol", "aldık. Seksen kilometre."], "tr") == ""


def test_unit_marker_requires_quantity():
    # Sıra sayısı "Second." birim değildir; "İkinci." meşru çeviri kabul edilir.
    assert part_anchor_issue(["Second."], ["İkinci."], "tr") == ""
    # Niceliksiz "wait a second" doğal karşılığa çevrilebilir.
    assert part_anchor_issue(
        ["Wait a second."], ["Bir dakika bekle."], "tr") == ""
    # Nicelikli birim yine zorunlu: birim türü değişimi reddedilir.
    assert part_anchor_issue(
        ["3 seconds left."], ["3 dakika kaldı."], "tr").startswith("unit_kaydi")
    assert part_anchor_issue(
        ["He ran 80 kilometers."], ["80 mil koştu."], "tr").startswith("unit_kaydi")
    assert part_anchor_issue(
        ["It takes 2 hours."], ["İki saat sürer."], "tr") == ""
    assert part_anchor_issue(
        ["She waited 5 minutes."], ["5 dakika bekledi."], "tr") == ""


def test_numbers_across_cue_boundary_rejected():
    assert part_anchor_issue(
        ["It is", "1,200 dollars."],
        ["O", "1.200 dolar."], "tr") == ""


# ---------- 7. Özel ad demirleme ----------

def test_proper_names_stay_in_cue():
    assert part_anchor_issue(
        ["Tell Lawson that", "Persephone read Theogony."],
        ["Lawson'a söyle,", "Persephone Theogony'yi okudu."], "tr") == ""
    assert part_anchor_issue(
        ["Tell Lawson that", "Persephone read it."],
        ["Söyle ki", "Persephone okudu."], "tr").startswith("ozel_ad_kaydi")


# ---------- 8. Olumsuzluk / modal (bütün seviyesi) ----------

def test_negation_modal_whole_level():
    assert "negation_missing" in T.translation_meaning_issues(
        "He didn't come.", "O geldi.", "tr")
    assert "modal_missing" in T.translation_meaning_issues(
        "We must leave.", "Gidiyoruz.", "tr")


# ---------- 9. SDH işareti demirleme ----------

def test_sdh_marker_preserved_in_same_cue():
    assert part_anchor_issue(
        ["[music playing]", "She smiled."],
        ["[music playing]", "Gülümsedi."], "tr") == ""
    assert part_anchor_issue(
        ["[music playing]"],
        ["müzik çalıyor"], "tr").startswith("sdh_kaydi")


# ---------- 10. Açık bağlantı / ek-birleşik yapı ----------

def test_dangling_tail_rejected():
    assert part_tail_issue(["Onu bulmak zorunda", "kaldım."], "tr") == "acik_baglanti:0"
    assert part_tail_issue(["Emin", "misin?"], "tr") == "acik_baglanti:0"
    assert part_tail_issue(["Gelmeyecek", "mi?"], "tr") == ""
    assert part_tail_issue(["Gitmeyeceğim ve", "görmeyeceğim."], "tr") == "acik_baglanti:0"
    # Edat/soru eki sonda doğal cümlecik kapanışıdır — bloklanmamalı (sb-02).
    assert part_tail_issue(
        ["Fırtına elektrikleri kestiği için,", "içeride kaldık."], "tr") == ""
    assert part_tail_issue(["Doğru mu", "sanıyorsun?"], "tr") == ""
    # TR dışı hedefte devre dışı
    assert part_tail_issue(["I will not", "go."], "en") == ""


def test_name_anchor_accepts_inflection_and_rejects_substitution():
    # Yerel ad çekimi kabul: apostroflu kök ve unvan biçimi (pn-03 / ctx-a4).
    assert part_anchor_issue(
        ["Maria left Lisbon on Tuesday."],
        ["Maria Salı günü Lizbon'dan ayrıldı."], "tr") == ""
    assert part_anchor_issue(
        ["Your Majesty already spoke."],
        ["Majesteleri çoktan konuştu."], "tr") == ""
    # Zamir 'I' özel ad değildir.
    assert part_anchor_issue(
        ["tell him I called."], ["aradığımı söyle."], "tr") == ""
    # Ad bozması / düşmesi hâlâ bloklanır.
    assert part_anchor_issue(
        ["Detective Lawson entered the precinct."],
        ["Dedektif Larson karakola girdi."], "tr").startswith("ozel_ad_")
    assert part_anchor_issue(
        ["Meet me at Winterfell before dawn."],
        ["Şafaktan önce Winterhaven'da buluşalım."], "tr").startswith("ozel_ad_kaydi")
    assert part_anchor_issue(
        ["He quoted the Theogony carefully."],
        ["Dikkatle alıntı yaptı."], "tr").startswith("ozel_ad_kaydi")


def test_repeated_part_rejected():
    assert part_repetition_issue(
        ["Yes.", "No."], ["Evet.", "Evet."]) == "tekrarli_part:1"
    assert part_repetition_issue(["Yes.", "Yes."], ["Evet.", "Evet."]) == ""


# ---------- 11. Cache'e bozuk sonuç yazılmaz + entegrasyon ----------

def test_llm_translate_rejects_early_end_and_recovers(tmp_path):
    """İlk yanıt erken kapanırsa ret → tek grup kurtarma ile doğru dağıtım alınır."""
    entries = [(1.0, 2.5, "I have to find her"), (2.5, 4.0, "before it is too late.")]

    def reply(payload, call):
        if call == 1:
            return {"items": {"0": "Onu bulmalıyım.", "1": "o çok geç olmadan."},
                    "sentences": {"0": "Onu bulmalıyım. o çok geç olmadan."}}
        return {"items": {"0": "Onu bulmam lazım", "1": "çok geç olmadan."},
                "sentences": {"0": "Onu bulmam lazım çok geç olmadan."}}

    out, calls = _run_translate(entries, reply)
    assert len(calls) >= 2, "kurtarma denemesi yapılmalıydı"
    assert [t for _, _, t in out] == ["Onu bulmam lazım", "çok geç olmadan."]


def test_llm_translate_wait_example_two_sentence_cue():
    """Kullanıcı Örnek 2: 'Bekle.' + tam soru dağıtımı kabul edilir."""
    entries = [(1.0, 2.5, "Wait. Are you sure"), (2.5, 4.0, "you want to come with me?")]
    out, _ = _run_translate(entries, _reply(
        {"0": "Bekle.", "1": "Benimle gelmek istediğinden emin misin?"},
        {"0": "Bekle. Benimle gelmek istediğinden emin misin?"}))
    assert [t for _, _, t in out] == ["Bekle.", "Benimle gelmek istediğinden emin misin?"]


def test_timestamps_unchanged_default_mode():
    entries = [(1.0, 2.5, "Hello"), (2.5, 4.0, "there.")]
    out, _ = _run_translate(entries, _reply(
        {"0": "Merhaba", "1": "orası."},
        {"0": "Merhaba orası."}))
    assert [(s, e) for s, e, _ in out] == [(1.0, 2.5), (2.5, 4.0)]


def test_model_shifting_ids_rejected():
    """items anahtarı kaydırılırsa kabul edilmez; kurtarma da aynıysa blok kaynak kalır."""
    entries = [(1.0, 2.0, "One.")]

    def reply(payload, call):
        return {"items": {"5": "Beş."}, "sentences": {"5": "Beş."}}

    out, calls = _run_translate(entries, reply)
    assert len(calls) >= 2, "geçersiz yanıt kurtarma denemesi doğurmalıydı"
    # hiçbir blok kabul edilmedi: dosya yazılmaz, bozuk sonuç cache'e girmez
    assert out is None, out


def test_whole_mismatch_rejected():
    """items birleşimi sentences'tan saparsa ret."""
    record = accept_sentence_reply(
        {"items": {"0": "Onu bulmam", "1": "çok geç olmadan."},
         "sentences": {"0": "Tamamen farklı bir cümle."}}, [0, 1])
    assert record is None


# ---------- 12. Artan girdi dedupe ----------

def test_incremental_growth_reuses_cache(tmp_path):
    """100 cue + 20 yeni → yalnız yeni gruplar sağlayıcıya gider."""
    cache_dir = tmp_path / "cache"
    entries = [(i * 2.0, i * 2.0 + 1.5, f"Sentence {i}.") for i in range(25)]

    def reply(payload, _call):
        items = {str(it["i"]): f"[TR] {it['t']}" for it in payload["items"]}
        sentences = {
            str(g["ids"][0]): " ".join(items[str(i)] for i in g["ids"])
            for g in payload["sentence_groups"]}
        return {"items": items, "sentences": sentences}

    args = _Args(translate_cache=True, cache_dir=str(cache_dir))
    calls = []

    def _create(**kw):
        payload = json.loads(kw["messages"][-1]["content"])
        calls.append(payload)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=json.dumps(reply(payload, 0))))])

    with _fake_openai(_create):
        out1 = T.llm_translate(entries, args, [], source_lang="en")
    assert out1 and all("[TR]" in t for _, _, t in out1)
    first_calls = len(calls)
    assert first_calls >= 1

    grown = entries + [(100.0 + i, 101.0 + i, f"New sentence {i}.") for i in range(10)]
    calls.clear()
    with _fake_openai(_create):
        out2 = T.llm_translate(grown, _Args(translate_cache=True, cache_dir=str(cache_dir)),
                               [], source_lang="en")
    assert out2 and len(out2) == len(grown)
    sent_texts = {it["t"] for c in calls for it in c["items"]}
    # Yalnızca yeni bloklar gönderildi (eski 25 cue cache'ten geldi)
    assert sent_texts == {f"New sentence {i}." for i in range(10)}, sent_texts


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            import tempfile
            if "tmp_path" in t.__code__.co_varnames[:t.__code__.co_argcount]:
                with tempfile.TemporaryDirectory() as d:
                    t(Path(d))
            else:
                t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} geçti, {failed} başarısız ({len(tests)} test)")
    return failed == 0




def test_tail_gate_mate_verification():
    """B20: 'değil,'/'bile' meşru cümlecik sonları koşulsuz reddedilmemeli;
    'değil|mi', 'emin|misin', 'zorunda|kaldı' çift-kesimleri hâlâ yakalanmalı."""
    import sentence_translation as ST
    # meşru sonlar — ret YOK
    assert not ST.part_tail_issue(["Bu doğru değil,", "sen de biliyorsun."], "tr")
    assert not ST.part_tail_issue(["Bunu ben bile", "yapabilirim."], "tr")
    assert not ST.part_tail_issue(["Aradığımız kişi o.", "Geç oldu."], "tr")
    # kötü çift-kesimler — ret VAR
    assert ST.part_tail_issue(["Bu doğru değil", "mi?"], "tr")
    assert ST.part_tail_issue(["O emin", "misin?"], "tr")
    assert ST.part_tail_issue(["Kaçmak zorunda", "kaldım."], "tr")
    # bağlaç-sarkık hâlâ koşulsuz ret
    assert ST.part_tail_issue(["Gitmek istiyorum ve", "orada kalacağım."], "tr")


def test_currency_code_case_sensitivity():
    """C-try: 'try' fiili ₺/TRY kodu sayılmamalı; gerçek kod/simgeler korunur."""
    import sentence_translation as ST
    assert not ST.part_anchor_issue(["we could try again."], ["tekrar deneyebiliriz."], "tr")
    assert ST.part_anchor_issue(["It costs 50 TRY."], ["50 dolara mal oldu."], "tr")
    assert ST.part_anchor_issue(["It costs ₺50."], ["50 dolara mal oldu."], "tr")


def test_name_near_miss_swap_rejected():
    """C12/C18: cümle-ilk adın benzer-yazım takası ve orta-cümle
    'Larson'≈'Lawson' kabulü yakalanmalı; meşru çekimler geçmeli."""
    import sentence_translation as ST
    issue = ST.part_anchor_issue(["Lawson won the case."], ["Larson davayı kazandı."], "tr")
    assert issue and "ozel_ad" in issue, issue
    # orta-cümle benzer-yazım (yalın yanlış ad yakalanır; 'Larson'la' ekli
    # biçimi 'Lizbon'dan' yerelleştirmesiyle ayrıştırılamaz — belgelenmiş sınır)
    assert ST.part_anchor_issue(["He met Lawson there."], ["Larson geldi."], "tr")
    assert not ST.part_anchor_issue(["He met Lawson there."], ["Larson'la buluştu."], "tr")
    # meşru çekim / transliterasyon / normal metin
    assert not ST.part_anchor_issue(["He met Lawson there."], ["Lawson'la buluştu."], "tr")
    assert not ST.part_anchor_issue(["Persephone descended."], ["Persefone yeraltına indi."], "tr")
    assert not ST.part_anchor_issue(["Suddenly he ran."], ["Aniden koştu."], "tr")
    assert not ST.part_anchor_issue(["Tuesday came."], ["Salı geldi."], "tr")


def test_initial_can_modal_is_not_a_proper_name():
    assert not part_anchor_issue(
        ["Can I come too?"], ["Ben de gelebilir miyim?"], "tr")
    assert part_anchor_issue(
        ["Can arrived early."], ["Cam erken geldi."], "tr").startswith("ozel_ad_")


def test_named_entity_phrase_localization():
    """C13/B16: ≥2 tokenlık adlı-varlık öbeği birleşik yerelleşebilir
    ('French Revolution'→'Fransız Devrimi'); öbeğin tümüyle düşmesi ret."""
    import sentence_translation as ST
    assert not ST.part_anchor_issue(
        ["Today we will examine", "the causes of the French Revolution."],
        ["Bugün inceleyeceğimiz konu:", "Fransız Devrimi'nin nedenleri."], "tr")
    # öbek tümüyle düşmüşse bloklanır
    assert ST.part_anchor_issue(
        ["the causes of the French Revolution."],
        ["devrimin nedenleri."], "tr")


def test_boundary_split_number_halves_skipped():
    """C4/c01b: cue sınırında ikiye bölünmüş sayı ('3,' + '000'→'3.000')
    per-parça demirlemeyi bozmamalı; rakamın tümüyle düşmesi ret."""
    import sentence_translation as ST
    assert not ST.part_anchor_issue(
        ["He counted 3,", "000 coins in total."],
        ["Toplam", "3.000 madeni para saydı."], "tr")
    assert ST.part_anchor_issue(
        ["He counted 3,", "000 coins in total."],
        ["Toplam", "madeni para saydı."], "tr")


def test_wrap_preserves_explicit_sentence_breaks():
    """D1: insert_sentence_breaks'in koyduğu \\n, wrap_text'in max_lines
    sınırında yeniden birleştirilmemeli."""
    out = T.wrap_text("Dur.\nBak.\nDikkatli dinle.", 42, 2, language="tr",
                      wrap_mode="sentence")
    assert out == "Dur.\nBak.\nDikkatli dinle.", repr(out)
    # açık \n yoksa eski davranış (max_lines birleşimi) korunur
    out2 = T.wrap_text("Dur. Bak. Dikkatli dinle.", 42, 2, language="tr",
                       wrap_mode="sentence")
    assert out2.count("\n") == 1, repr(out2)


def test_sdh_markers_restored_after_strip():
    """C14/C16: model girdisinden çıkarılan SDH işaretleri çevrilmiş
    cue'da kaybolmamalı."""
    from subtitle_sdh import sdh_markers_removed, restore_sdh_markers
    orig = "[music] [applause] Thank you."
    assert sdh_markers_removed(orig) == ["[music]", "[applause]"]
    # model marker'ı hiç görmedi → ikisi de geri konur
    assert restore_sdh_markers(orig, "Teşekkürler.") == "[music] [applause] Teşekkürler."
    # model marker'ı çevirdiyse → yalnız eksik sayıda geri konur
    assert restore_sdh_markers(orig, "[alkış] Teşekkürler.") == "[music] [alkış] Teşekkürler."
    # strip edilmeyen cue → dokunma
    assert restore_sdh_markers("[GUNFIRE] Run!", "Kaç!") == "Kaç!"


def test_lone_sdh_marker_echo_is_not_rejected():
    """R111: yalnız-SDH cue'unda sağlayıcının işareti aynen döndürmesi
    kaynak-yankısı değil, doğru sonuçtur — kurtarma yakılmamalı.

    '[music playing]' tamamen işaretten oluşur; 'çevirisi' işaretin kendisi
    olabilir. Eskiden kaynak_yankisi=1 sayılıp tekil kurtarma tetikleniyordu
    (gereksiz ek istekler).
    """
    entries = [(9.0, 10.5, "[music playing]"), (11.0, 12.0, "She stood up.")]
    out, calls = _run_translate(entries, _reply(
        {"0": "[music playing]", "1": "Ayağa kalktı."}, {}))
    assert [t for _, _, t in out] == ["[music playing]", "Ayağa kalktı."]
    assert len(calls) == 1, f"{len(calls)} istek: kurtarma tetiklendi"


def test_dialogue_echo_still_rejected():
    """Koruma: diyalog cue'unda kaynak-yankısı kapısı hâlâ aktif."""
    entries = [(0.0, 2.0, "Wait right there.")]
    out, calls = _run_translate(
        entries,
        lambda payload, call: {"items": {"0": "Wait right there."}, "sentences": {}}
        if call < 3 else {"items": {"0": "Tam orada bekle."}, "sentences": {}})
    assert [t for _, _, t in out] == ["Tam orada bekle."]
    assert len(calls) == 3, f"{len(calls)} istek"


if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
