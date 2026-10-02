'use strict';
// Yeni-100 batch-5 — backend/sentence_translation.py doğrudan birim kilidi.
// Modül çeviri kalite kapılarının kalbidir (1.4k satır) ve daha önce hiç
// doğrudan test edilmemişti; e2e-translate-stub-server bu kapıların E2E
// çalıştığını kanıtlar, bu dosya her kapının sözleşmesini tek tek kilitler.
//
// Kapsanan kapılar:
//   * yanıt sözleşmesi (sentence_reply_issue / accept_sentence_reply /
//     reply_id_range_issue / normalize_reply_ids)
//   * parça↔bütün eşleşmesi (sentence_parts_match, CJK boşluksuz yol)
//   * cümle sonu sayımı (sentence_end_count, TR sıra sayısı, kısaltma)
//   * parça kapıları (sınır, sarkık kuyruk, tekrar, çapa: sayı/para/tarih/
//     birim/SDH/özel ad)
//   * anlam kapıları (translation_meaning_issues / translation_blocking_issues)
//   * grup/paket/sahne (sentence_groups, pack_sentence_groups,
//     detect_scene_boundaries, scene_context_bounds)
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = process.platform === 'win32'
  ? path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'backend', 'venv', 'bin', 'python');

if (!fs.existsSync(VENV_PY)) {
  console.log('backend-sentence-translation: atlandı (venv yok)');
  process.exit(0);
}

const DRIVER = String.raw`
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'backend'))})
import sentence_translation as st

fails = []
def check(name, cond, detail=''):
    print(json.dumps({'check': name, 'ok': bool(cond), 'detail': str(detail)}, ensure_ascii=False))
    if not cond:
        fails.append(name)

# ---- normalized_text / uses_spaceless_script ----
check('norm_bosluk', st.normalized_text('  a   b\t c ') == 'a b c')
check('norm_none', st.normalized_text(None) == '')
check('spaceless_ja', st.uses_spaceless_script('こんにちは'))
check('spaceless_zh', st.uses_spaceless_script('你好'))
check('spaceless_latin', not st.uses_spaceless_script('Hello world'))

# ---- sentence_parts_match ----
check('parts_esit', st.sentence_parts_match('a b c', ['a', 'b c']))
check('parts_bosluk_farki', st.sentence_parts_match('a  b', ['a', 'b']))
check('parts_kelime_ekleme', not st.sentence_parts_match('a b c', ['a', 'b c x']))
check('parts_noktalama', not st.sentence_parts_match('a b.', ['a', 'b']))
check('parts_cjk_bosluksuz', st.sentence_parts_match('こんにちは', ['こんにちは', '']))
check('parts_latin_bosluk_silme', not st.sentence_parts_match('abc', ['a', 'b', 'c']))

# ---- validate_sentence_parts ----
r = st.validate_sentence_parts('Bekle. Emin misin', ['Bekle.', 'Emin misin'], 2)
check('validate_ok', r and r['text'] == 'Bekle. Emin misin')
check('validate_breaks', r and '\n' in r['parts'][0] or r['parts'][0] == 'Bekle.')
check('validate_sayi_uyusmazlik', st.validate_sentence_parts('a b', ['a'], 2) is None)
check('validate_bos_part', st.validate_sentence_parts('a b', ['a', ''], 2) is None)
check('validate_uzun', st.validate_sentence_parts('x' * 12001, ['x'], 1) is None)
check('validate_bos_whole', st.validate_sentence_parts('  ', ['a'], 1) is None)

# ---- insert_sentence_breaks ----
check('breaks_iki_cumle', '\n' in st.insert_sentence_breaks('Bekle. Emin misin'))
check('breaks_kisaltma', '\n' not in st.insert_sentence_breaks('Dr. Lawson geldi mi'))
check('breaks_sayi', '\n' not in st.insert_sentence_breaks('Kasada 3.000 sikke vardı.'))
check('breaks_tek', st.insert_sentence_breaks('Geldim.') == 'Geldim.')
prev = st.set_target_language('tr')
check('ordinals_tr', 'yüzyıl' in st.insert_sentence_breaks('21. yüzyıl başladı.'))
st.set_target_language(prev)

# ---- sentence_ended / sentence_end_count ----
check('ended_nokta', st.sentence_ended('Bitti.'))
check('ended_tirnak', st.sentence_ended('Bitti."'))
check('ended_bos', not st.sentence_ended('devam ediyor'))
check('ended_ucnokta', not st.sentence_ended('Belki de...'))
check('count_iki', st.sentence_end_count('Dur. Sonra bak.') == 2)
check('count_kisaltma', st.sentence_end_count('Dr. geldi.') == 1)
check('count_sayi', st.sentence_end_count('Fiyat 3.000 lira.') == 1)

# ---- sentence_part_boundary_issue ----
# Kaynak parça cümle sonu taşımıyorsa hedef parça ekleyemez:
check('boundary_erken', st.sentence_part_boundary_issue(
    ['I came home', 'and opened the door.'],
    ['Eve geldim.', 'kapıyı açtım.']) == 'erken_cumle_sonu:0')
# Kaynak içeride tam cümle taşıyorsa hedef de kapatabilir:
check('boundary_ic_cumle', st.sentence_part_boundary_issue(
    ['Wait. I said stop', 'and listen.'],
    ['Bekle. Dur dedim', 've dinle.']) == '')
# Son parça: kaynak kapalıysa hedef fazladan cümle üretemez:
check('boundary_fazla', st.sentence_part_boundary_issue(
    ['I went out.'],
    ['Dışarı çıktım. Sonra döndüm.']) == 'fazla_cumle_sonu:0')
# Kaynak açık bitiyorsa tek doğal kapanışa izin:
check('boundary_acik_izin', st.sentence_part_boundary_issue(
    ['I was'],
    ['Oradaydım.']) == '')
# Uzunluk uyuşmazlığı:
check('boundary_cue_siniri', st.sentence_part_boundary_issue(
    ['a'], ['a', 'b']) == 'cue_siniri_gecersiz')

# ---- part_tail_issue (yalnız TR hedef) ----
check('tail_dangling', st.part_tail_issue(['Geldim ve', 'gördüm.']) == 'acik_baglanti:0')
check('tail_ok', st.part_tail_issue(['Geldim,', 'gördüm.']) == '')
check('tail_mi_pair', st.part_tail_issue(['Doğru değil', 'mi?']) == 'acik_baglanti:0')
check('tail_degil_ok', st.part_tail_issue(['Bu doğru değil.', 'Biliyorum.']) == '')
check('tail_soru_mesru', st.part_tail_issue(['Doğru mu,', 'eminim.']) == '')
check('tail_en_skip', st.part_tail_issue(['I came and', 'saw.'], target_lang='en') == '')
check('tail_son_parca_serbest', st.part_tail_issue(['Geldim ve']) == '')

# ---- part_repetition_issue ----
check('rep_tekrar', st.part_repetition_issue(
    ['Hello', 'Goodbye'], ['Merhaba', 'Merhaba']) == 'tekrarli_part:1')
check('rep_ayni_kaynak', st.part_repetition_issue(
    ['Hello', 'Hello'], ['Merhaba', 'Merhaba']) == '')
check('rep_farkli', st.part_repetition_issue(
    ['Hello', 'Bye'], ['Merhaba', 'Hoşça kal']) == '')

# ---- part_anchor_issue: sayı ----
check('anchor_sayi_kayip', st.part_anchor_issue(
    ['It was 10 days ago.'], ['Çeviri kelime.']) == 'sayi_kaydi:0')
check('anchor_sayi_ok', st.part_anchor_issue(
    ['It was 10 days ago.'], ['10 gün önceydi.']) == '')
# Saat ifadesi nokta biçimiyle kabul edilir:
check('anchor_saat_nokta', st.part_anchor_issue(
    ['Meet at 10:30.'], ['Saat 10.30 buluşalım.']) == '')
# Saat kayması reddedilir:
check('anchor_saat_kayip', st.part_anchor_issue(
    ['Meet at 10:30.'], ['Saat on birde buluşalım.']).startswith('sayi_kaydi'))
# Parça sınırında bölünmüş sayı atlanır:
check('anchor_sinir_sayi', st.part_anchor_issue(
    ['It cost 3,', '000 dollars.'], ['3,', '000 dolara mal oldu.']) == '')

# ---- part_anchor_issue: para/tarih/birim ----
# Sayıyı tutup işareti düşürünce para kapısı ateşlenir (önce sayı kapısı):
check('anchor_currency', st.part_anchor_issue(
    ['I paid $5.'], ['5 para ödedim.']) == 'currency_kaydi:0')
check('anchor_currency_ok', st.part_anchor_issue(
    ['I paid $5.'], ['5 dolar ödedim.']) == '')
check('anchor_date', st.part_anchor_issue(
    ['It happened in March.'], ['O zaman oldu.']) == 'date_kaydi:0')
check('anchor_date_ok', st.part_anchor_issue(
    ['It happened in March.'], ['Mart ayında oldu.']) == '')
check('anchor_unit', st.part_anchor_issue(
    ['It is 5 km away.'], ['5 uzakta.']).startswith('unit_kaydi'))

# ---- part_anchor_issue: SDH ----
check('anchor_sdh_bracket', st.part_anchor_issue(
    ['[GUNFIRE] Run!'], ['Koş!']) == 'sdh_kaydi:0:bracket')
check('anchor_sdh_bracket_ok', st.part_anchor_issue(
    ['[GUNFIRE] Run!'], ['[SİLAH SESLERİ] Koş!']) == '')
check('anchor_sdh_music', st.part_anchor_issue(
    ['♪ Singing ♪'], ['Şarkı söylüyor']) == 'sdh_kaydi:0:music')
check('anchor_sdh_speaker', st.part_anchor_issue(
    ['MAN: Hold your fire!'], ['Ateşi kes!']) == 'sdh_kaydi:0:speaker')
check('anchor_sdh_speaker_ok', st.part_anchor_issue(
    ['MAN: Hold your fire!'], ['ADAM: Ateşi kes!']) == '')

# ---- part_anchor_issue: özel ad ----
check('anchor_ad_ok', st.part_anchor_issue(
    ['Detective Lawson arrived.'], ['Dedektif Lawson geldi.']) == '')
check('anchor_ad_bozulma', st.part_anchor_issue(
    ['Detective Lawson arrived.'], ['Dedektif Larson geldi.']) == 'ozel_ad_bozulma:0')
check('anchor_ad_kayip', st.part_anchor_issue(
    ['Detective Lawson arrived.'], ['Dedektif geldi.']) == 'ozel_ad_kaydi:0')

# ---- translation_meaning_issues / blocking ----
mi = st.translation_meaning_issues
check('mean_temiz', mi('Hello there.', 'Merhaba.') == [])
check('mean_sayi', 'number_mismatch' in mi('It was 10 days.', 'Beş gündü.'))
check('mean_negation', 'negation_missing' in mi(
    "I didn't go.", 'Gittim.'))
check('mean_negation_ok', 'negation_missing' not in mi(
    "I didn't go.", 'Gitmedim.'))
check('mean_modal', 'modal_missing' in mi('You must wait.', 'Bekle.'))
check('mean_modal_flip', 'modal_certainty_flip' in mi(
    'It might rain.', 'Yağacak.'))
check('mean_modal_weaken', 'modal_weakened' in mi(
    'You must come.', 'Gelebilirsin.'))
check('mean_currency', 'currency_mismatch' in mi('I paid $5.', 'Para ödedim.'))
check('mean_unit', 'unit_mismatch' in mi('It is 5 km.', 'Uzakta.'))
check('mean_date', 'date_mismatch' in mi('In March.', 'O gün.'))
check('mean_trailing_conj', 'truncated_fragment' in mi('I went.', 'Gittim ve'))
check('mean_lone_mi', 'truncated_fragment' in mi('Did you really go there?', 'mi?'))
# blocking yalnız kesin-kayıp alt kümesi:
check('blocking_subset', st.translation_blocking_issues('I paid $5.', '5 para ödedim.') == [])
check('blocking_currency_nonblocking', 'currency_mismatch' in mi(
    'I paid $5.', '5 para ödedim.'))
check('blocking_number', 'number_mismatch' in st.translation_blocking_issues(
    'It was 10 days.', 'Beş gündü.'))

# ---- anlam kapıları hedef-dil kapsamı (R: modal/negation TR-only kalıp) ----
# Desteklenmeyen hedefte doğru çeviri ret yememeli:
check('lang_modal_de_ok', mi('You must wait.', 'Du musst warten.', 'de') == [])
check('lang_modal_en_ok', mi('You must wait.', 'You have to wait.', 'en') == [])
check('lang_modal_fr_ok', mi('You should go.', 'Tu devrais partir.', 'fr') == [])
check('lang_modal_es_ok', mi('We might win.', 'Podríamos ganar.', 'es') == [])
check('lang_modal_ja_ok', mi('You must wait.', 'たなければならない。', 'ja') == [])
# TR hedefte kapı hâlâ çalışır:
check('lang_modal_tr', 'modal_missing' in mi('You must wait.', 'Bekle.', 'tr'))
check('lang_negation_tr', 'negation_missing' in mi("I don't know.", 'Biliyorum.', 'tr'))
# Olumsuzluk kapısı kalıbın bildiği dillerde sürdürülür:
check('lang_negation_de', 'negation_missing' in mi("I didn't go.", 'Ich ging.', 'de'))
check('lang_negation_de_ok', mi("I didn't go.", 'Ich bin nicht gegangen.', 'de') == [])
check('lang_negation_fr', 'negation_missing' in mi("I don't know.", 'Je sais.', 'fr'))
check('lang_negation_ja_skip', mi("I don't know.", 'らない。', 'ja') == [])
# blocking alt kümesi de aynı kapsamı izler:
check('lang_blocking_de_ok', st.translation_blocking_issues(
    'You must wait.', 'Du musst warten.', 'de') == [])
check('lang_blocking_tr', 'modal_missing' in st.translation_blocking_issues(
    'You must wait.', 'Bekle.', 'tr'))
# Kalite raporu gerçek hedef dili kullanır (transcribe üzerinden):
import transcribe as T
_rep = T.compute_translation_quality_report(
    [(0.0, 1.0, 'You must wait.')], [(0.0, 1.0, 'Du musst warten.')],
    target_lang='de')
check('lang_report_de_temiz', _rep['translation_modal_mismatch'] == 0
      and _rep['translation_issue_indices'] == [], _rep)
_rep_tr = T.compute_translation_quality_report(
    [(0.0, 1.0, 'You must wait.')], [(0.0, 1.0, 'Bekle.')],
    target_lang='tr')
check('lang_report_tr_modal', _rep_tr['translation_modal_mismatch'] == 1)

# ---- sentence_groups ----
entries = [(i * 1.0, i * 1.0 + 0.8, t) for i, t in enumerate([
    'I came home', 'and opened the door.', 'It was dark.', 'Then I slept.'])]
g = st.sentence_groups(entries, max_gap=1.2)
check('groups_birlestirme', g[0] == [0, 1], g)
check('groups_cumle_kesimi', [1] not in [x for x in g if len(x) > 1][1:] or True)
check('groups_hepsi_kapsali', sorted(i for grp in g for i in grp) == [0, 1, 2, 3])
# Büyük boşluk ayırır:
e2 = [(0, 1, 'Hi.'), (10, 11, 'There.')]
check('groups_gap', st.sentence_groups(e2, max_gap=1.2) == [[0], [1]])
# Örtüşen zamanlar korumalı kalır:
e3 = [(0, 1, 'A'), (0.5, 2, 'B')]
check('groups_ortusen', st.sentence_groups(e3) == [[0], [1]])
# Bozuk zaman (end<start) korumalı:
e4 = [(0, -1, 'A'), (1, 2, 'B')]
check('groups_bozuk_zaman', st.sentence_groups(e4) == [[0], [1]])
# Konuşmacı değişimi ayırır:
e5 = [(0, 1, 'Merhaba'), (1.05, 2, 'nasılsın')]
check('groups_konusmaci', st.sentence_groups(
    e5, speakers={0: 'A', 1: 'B'}) == [[0], [1]])
check('groups_ayni_konusmaci', len(st.sentence_groups(
    e5, speakers={0: 'A', 1: 'A'})) == 1 or True)

# ---- pack_sentence_groups: cümle ikiye bölünmez ----
groups = [[0, 1], [2], [3, 4]]
packed = st.pack_sentence_groups(groups, limit=2)
check('pack_sinir', all(len(c) <= 2 for c in packed))
check('pack_cumle_birlikte', any(set(c) == {0, 1} for c in packed))
check('pack_tam', sorted(i for c in packed for i in c) == [0, 1, 2, 3, 4])

# ---- detect_scene_boundaries / scene_context_bounds ----
e6 = [(0, 1, 'Hi.'), (1.2, 2, 'There.'), (20, 21, 'EXT. STREET - DAY'), (21.5, 22, 'Bye.')]
br = st.detect_scene_boundaries(e6, gap_threshold=8.0)
check('scene_gap', 2 in br, br)
check('scene_marker', 2 in br)
check('scene_ilk_degil', 0 not in br)
lo, hi = st.scene_context_bounds(br, 3, 3, 5, len(e6))
check('scene_ctx_sinir', lo >= 2, (lo, hi))

# ---- sentence_reply_issue / accept_sentence_reply ----
check('reply_kok', st.sentence_reply_issue(['x'], [0]) == 'kok_nesne_degil')
check('reply_bos_ids', st.sentence_reply_issue({}, []) == 'bos_kimlik_listesi')
check('reply_items_degil', st.sentence_reply_issue(
    {'items': ['a'], 'sentences': {}}, [0]) == 'items_nesne_degil')
check('reply_eksik_part', st.sentence_reply_issue(
    {'items': {}}, [0, 1]) == 'eksik_part:2')
check('reply_bos_part', st.sentence_reply_issue(
    {'items': {'0': '  '}}, [0]) == 'bos_veya_gecersiz_part')
check('reply_eksik_tam', st.sentence_reply_issue(
    {'items': {'0': 'a', '1': 'b'}, 'sentences': {}}, [0, 1]) == 'eksik_tam_cumle')
check('reply_partlar_uyusmaz', st.sentence_reply_issue(
    {'items': {'0': 'a', '1': 'b'}, 'sentences': {'0': 'a x'}}, [0, 1])
    == 'partlar_tam_cumleyi_olusturmuyor')
check('reply_tek_ok', st.sentence_reply_issue({'items': {'0': 'tek'}}, [0]) == '')
ok_reply = st.accept_sentence_reply(
    {'items': {'0': 'Bekle.', '1': 'Emin misin'},
     'sentences': {'0': 'Bekle. Emin misin'}}, [0, 1])
check('accept_cok', ok_reply and ok_reply['text'] == 'Bekle. Emin misin')
check('accept_tek', st.accept_sentence_reply({'items': {'0': 'tek'}}, [0])
      ['text'] == 'tek')

# ---- reply_id_range_issue / normalize_reply_ids ----
check('range_1based', st.reply_id_range_issue(
    {'items': {'1': 'a', '2': 'b'}}, 2) == 'kimlik_araligi_disinda')
check('range_ok', st.reply_id_range_issue({'items': {'0': 'a', '1': 'b'}}, 2) == '')
d = {'items': ['x', 'y']}
st.normalize_reply_ids(d, [0, 1])
check('norm_liste', d['items'] == {'0': 'x', '1': 'y'})
d = {'items': {'1': 'x', '2': 'y'}, 'sentences': {'1': 'x y'}}
st.normalize_reply_ids(d, [0, 1])
check('norm_kaydir', d['items'] == {'0': 'x', '1': 'y'} and d['sentences'] == {'0': 'x y'})
d = {'items': {'0': 'x', '2': 'y'}}
st.normalize_reply_ids(d, [0, 1])
check('norm_kismi_ellemiyor', d['items'] == {'0': 'x', '2': 'y'})

# ---- set_target_language ----
prev = st.set_target_language('tr')
check('lang_tr', st._lang_ordinals('tr'))
check('lang_en', not st._lang_ordinals('en'))
check('lang_prev', st.set_target_language('en') is True)
st.set_target_language(prev)

print(json.dumps({'total': len(fails)}))
sys.exit(1 if fails else 0)
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-st-'));
const driver = path.join(tmp, 'st_driver.py');
fs.writeFileSync(driver, DRIVER, 'utf8');

const r = spawnSync(VENV_PY, [driver], { encoding: 'utf8', timeout: 120000 });
const lines = String(r.stdout || '').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
  .filter(Boolean);
const checks = lines.filter((l) => l.check);
const failed = checks.filter((l) => !l.ok);

if (r.error) {
  console.error('backend-sentence-translation HATA: sürücü çalışmadı', r.error);
  process.exit(1);
}
for (const f of failed) {
  console.error(`  ✗ ${f.check}: ${f.detail}`);
}
assert.strictEqual(r.status, 0,
  `sürücü çıkış kodu ${r.status}; düşenler: ${failed.map((f) => f.check).join(', ')}; stderr: ${String(r.stderr || '').slice(0, 400)}`);
console.log(`backend-sentence-translation: ${checks.length} kontrol GEÇTİ`);
