#!/usr/bin/env python3
"""R112 birleşik gauntlet — T3/T4 deterministik ölçüm sürücüsü.

Gerçek `transcribe.py --translate-only` alt süreci → fixture sağlayıcı
(127.0.0.1:8788) → ham .tr.srt çıktısı → invariant denetimi + istek sayımı.
Geri planda GET /ctl/requests kaydı her senaryo öncesi sıfırlanır.
Gerçek API anahtarı/hesap YOK.
"""
import json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

FIXTURE = "http://127.0.0.1:8788"
BACKEND = "/home/ubuntu/repos/whisper-browser/backend"
VENV_PY = BACKEND + "/venv/bin/python"
FIX = Path("/home/ubuntu/qa-112/fixtures")
OUT_ROOT = Path("/home/ubuntu/qa-112/out")
RESULTS = []


def ctl(path, method="GET", data=None):
    req = urllib.request.Request(FIXTURE + path, method=method, data=data)
    if data is not None:
        req.add_header("content-type", "application/json")
    raw = urllib.request.urlopen(req, timeout=15).read() or b"{}"
    return raw.decode()


def reset():
    ctl("/ctl/reset", method="POST")


def setmode(m):
    ctl(f"/ctl/mode?set={m}")


def push(items):
    ctl("/ctl/push", method="POST", data=json.dumps(items).encode())


def requests_log():
    txt = ctl("/ctl/requests")
    out = []
    for line in txt.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and ("items" in obj or "sg" in obj or "mode" in obj):
            out.append(obj)
    return out


def run_translate(src, name, extra=None, expect_fail=False, out_dir=None, timeout=300):
    out_dir = Path(out_dir) if out_dir else OUT_ROOT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = out_dir / "cache"
    cache_dir.mkdir(exist_ok=True)
    cmd = [VENV_PY, BACKEND + "/transcribe.py",
           "--input", str(src), "--translate-only", "true",
           "--translate-base-url", FIXTURE + "/v1",
           "--translate-api-key", "fixture-key",
           "--translate-model", "fixture-q",
           "--translate-workers", "1",
           "--output-dir", str(out_dir),
           "--cache-dir", str(cache_dir),
           "--formats", "srt", "--language", "en"]
    if extra:
        cmd += extra
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    events = []
    for line in p.stdout.splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    done = [e for e in events if e.get("type") == "done"]
    err = [e for e in events if e.get("type") == "error"]
    if not expect_fail and (p.returncode != 0 or not done):
        tail = "\n".join((p.stdout + "\n" + p.stderr).splitlines()[-15:])
        raise AssertionError(f"{name}: islem basarisiz rc={p.returncode} err={err}\n{tail}")
    return {"rc": p.returncode, "events": events, "done": done[0] if done else None,
            "errors": err, "stderr": p.stderr, "out_dir": out_dir}


def parse_srt(path):
    text = Path(path).read_text(encoding="utf-8-sig")
    blocks = []
    for chunk in re.split(r"\r?\n\s*\r?\n", text.strip()):
        lines = chunk.strip().splitlines()
        if len(lines) >= 2:
            m = re.match(r"(\d\d:\d\d:\d\d[,.]\d+)\s*-->\s*(\d\d:\d\d:\d\d[,.]\d+)", lines[1])
            if not m:
                continue
            body = lines[2:] if len(lines) > 2 else []
            blocks.append({"id": lines[0].strip(), "start": m.group(1),
                           "end": m.group(2), "text": "\n".join(body)})
    return blocks


def srt_ms(t):
    h, m, rest = t.replace(",", ".").split(":")
    s, ms = rest.split(".")
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)


def check(name, cond, detail=""):
    RESULTS.append({"name": name, "ok": bool(cond), "detail": str(detail)[:400]})
    mark = "PASS" if cond else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail and not cond else ""), flush=True)


def find_output(out_dir, suffix=".tr.srt", any_variant=False):
    if any_variant:
        outs = sorted(p for p in out_dir.glob("*.tr*.srt"))
    else:
        outs = sorted(p for p in out_dir.glob(f"*{suffix}"))
    return outs[0] if outs else None


def same_timeline(src_path, out_path):
    src, out = parse_srt(src_path), parse_srt(out_path)
    if len(src) != len(out):
        return False, f"cue sayisi {len(src)}!={len(out)}"
    for i, (a, b) in enumerate(zip(src, out)):
        if srt_ms(a["start"]) != srt_ms(b["start"]) or srt_ms(a["end"]) != srt_ms(b["end"]):
            return False, f"cue{i+1} zaman {a['start']}/{a['end']} != {b['start']}/{b['end']}"
        if a["id"] != b["id"]:
            return False, f"cue{i+1} id {a['id']} != {b['id']}"
    return True, ""


def event_texts(r):
    return " ".join(str(e.get("message", "")) for e in r["events"])


# ---------- T3: boyut korpusu ----------
def scenario_sizes():
    for size, timeout in ((1, 120), (100, 180), (1000, 600)):
        f = FIX / f"size-{size}.srt"
        reset()
        t0 = time.time()
        r = run_translate(f, f"size-{size}", timeout=timeout)
        dt = time.time() - t0
        out = find_output(r["out_dir"])
        ok, why = same_timeline(f, out) if out else (False, "cikti yok")
        check(f"size{size}:timeline+order+id", ok, why)
        blocks = parse_srt(out) if out else []
        empty = [i + 1 for i, b in enumerate(blocks) if not b["text"].strip()]
        check(f"size{size}:no-empty", not empty, f"bos: {empty[:10]}")
        reqs = requests_log()
        # Beklenen: ~ceil(size/20) toplu istek (baglamlar dahil degil cue basina)
        lo, hi = max(1, size // 25), size  # genis bant: bolum ~20'li gruplar
        check(f"size{size}:req-band", lo <= len(reqs) <= hi,
              f"{len(reqs)} istek (bant {lo}-{hi})")
        check(f"size{size}:done", r["done"] is not None,
              f"rc={r['rc']} sure={dt:.1f}s istek={len(reqs)}")
        print(f"  size{size}: {dt:.1f}s, {len(reqs)} istek")


# ---------- T3: 10k ayrı (uzun) ----------
def scenario_10k():
    f = FIX / "size-10000.srt"
    reset()
    t0 = time.time()
    r = run_translate(f, "size-10000", timeout=1200)
    dt = time.time() - t0
    out = find_output(r["out_dir"])
    ok, why = same_timeline(f, out) if out else (False, "cikti yok")
    check("size10k:timeline+order+id", ok, why)
    blocks = parse_srt(out) if out else []
    empty = [i + 1 for i, b in enumerate(blocks) if not b["text"].strip()]
    check("size10k:no-empty", not empty, f"bos: {empty[:10]}")
    reqs = requests_log()
    check("size10k:req-band", 400 <= len(reqs) <= 10000, f"{len(reqs)} istek")
    print(f"  size10000: {dt:.1f}s, {len(reqs)} istek")


# ---------- T3: yarim TR parca / baglac kuyruğu kalite örneklemi ----------
def scenario_tr_fragments():
    """Scriptli yanıt: cue sonu sarkan bağlaç + tek başına soru eki.
    Kapının yakalaması BEKLENEN davranış; yakalayamazsa kanıtlı GAP raporlanır."""
    f = FIX / "size-1.srt"  # degil — ozel 4-cue fixture kullan
    f = FIX / "frag-src.srt"
    f.write_text(
        "1\n00:00:01,000 --> 00:00:02,000\nWe have to go now.\n\n"
        "2\n00:00:03,000 --> 00:00:04,000\nAre you ready for this?\n\n"
        "3\n00:00:05,000 --> 00:00:06,000\nShe opened the door.\n\n"
        "4\n00:00:07,000 --> 00:00:08,000\nNobody saw him leave.\n", encoding="utf-8")
    reset()
    # items: cue1 bağlaçla bitiyor, cue2 yalnız "misin" (soru eki kopmuş),
    # cue3 düzgün, cue4 yarım kelime ("kapıyı aç")
    push([{"content": json.dumps({"items": {
        "0": "Şimdi gitmek zorundayız ve",
        "1": "misin",
        "2": "Kapıyı açtı.",
        "3": "Onu kimse gör-"},
        "sentences": {}}, ensure_ascii=False)}])
    r = run_translate(f, "frag")
    out = find_output(r["out_dir"], any_variant=True)
    blocks = parse_srt(out) if out else []
    texts = [b["text"] for b in blocks]
    reqs = requests_log()
    # Beklenen: yarım/bozuk parçalar kabul edilmez -> kurtarma veya kaynak korunur.
    bad = [t for t in texts if re.search(r"(?:\bve|\bama|\bçünkü|\bile)\s*$", t.strip())
           or re.fullmatch(r"(?:mı|mi|mu|mü|misin|misiniz)\s*[?!.]?", t.strip())
           or t.strip().endswith("-")]
    check("frag:no-bad-tail-on-screen", not bad,
          f"ekranda kalan bozuk parca: {bad} (metinler: {texts})")
    print(f"  frag: {len(reqs)} istek, metinler={texts}")


# ---------- T4: yanlış dil yanıtı ----------
def scenario_wrong_lang():
    f = FIX / "size-1.srt"
    reset()
    # Sağlayıcı İngilizce kaynağı aynen döndürür (echo) -> ret beklenir.
    push([{"content": json.dumps({"items": {"0": "Engine room reported that valve 0 failed twice before the alarm."}, "sentences": {}})}])
    r = run_translate(f, "wronglang", expect_fail=True)
    out = find_output(r["out_dir"], any_variant=True)
    reqs = requests_log()
    # Echo kapıları reddetmeli -> kurtarma da echo verirse son cue kaynak kalır
    # ve kalite raporu 'untranslated' sayar -> .partial.srt VEYA complete ama
    # kaynak metinli cue ile. Her iki durumda SAHTE İngilizce 'çeviri'
    # başarı sayılmamalı: done.partial veya uyarı olmalı.
    logs = event_texts(r)
    surfaced = ("partial" in (out.name if out else "")) or \
               any(k in logs for k in ("kaynak", "çevrilmedi", "untranslated", "yankı", "kısmen"))
    check("wronglang:not-counted-as-success", surfaced or out is None,
          f"out={out and out.name} logs_kuyruk={logs[-200:]}")
    print(f"  wronglang: {len(reqs)} istek, out={out and out.name}")


# ---------- T4: 100 -> 20 yeni -> 5 düzenleme -> restart maliyeti ----------
def scenario_revision_cost():
    base = FIX / "size-100.srt"
    out_dir = OUT_ROOT / "revcost"
    reset()
    run_translate(base, "revcost")           # 100 cue ilk koşu
    r1 = requests_log()
    # 20 yeni cue ekle (101..120)
    text = base.read_text()
    blocks = text.strip().split("\n\n")
    extra = []
    for i in range(100, 120):
        st = i * 2000 + 400
        extra.append(f"{i+1}\n{__import__('builtins').globals() if False else ''}"
                     f"00:03:{(st//1000%60):02d},{st%1000:03d} --> 00:03:{(st//1000%60)+1:02d},{st%1000:03d}\n"
                     f"New shift log entry {i} confirmed.")
    rev120 = out_dir / "rev-120.srt"
    rev120.write_text(text + "\n\n" + "\n\n".join(extra), encoding="utf-8")
    reset()
    run_translate(rev120, "revcost")          # 120 cue revizyon
    r2 = requests_log()
    # 5 cue düzenle
    rev_text = rev120.read_text()
    for n in (10, 30, 50, 70, 90):
        rev_text = rev_text.replace(f"sector {n%9}", f"sector {n%9+2}", 1)
    rev_edit = out_dir / "rev-edit.srt"
    rev_edit.write_text(rev_text, encoding="utf-8")
    reset()
    run_translate(rev_edit, "revcost")        # 5 editli koşu
    r3 = requests_log()
    # "Restart": aynı cache diziniyle yeni süreç zaten yukarıda (her run ayrı proc)
    # Gerçek restart etkisi: sıfırdan aynı 120'lik dosyayı tekrar koştur -> 0 istek
    reset()
    run_translate(rev120, "revcost")
    r4 = requests_log()
    check("revcost:r1-baseline", 4 <= len(r1) <= 8, f"{len(r1)} istek (100 cue)")
    check("revcost:r2-delta-not-full", len(r2) < len(r1),
          f"20 yeni cue sonrası {len(r2)} istek (ilk {len(r1)})")
    check("revcost:r3-edit-bounded", 0 < len(r3) <= 15,
          f"5 düzenleme sonrası {len(r3)} istek")
    check("revcost:r4-restart-cache", len(r4) == 0,
          f"restart sonrası aynı içerik: {len(r4)} istek")
    print(f"  revcost: {len(r1)} -> +20cue {len(r2)} -> 5edit {len(r3)} -> restart {len(r4)}")


# ---------- T4: çift-başlat/iptal maliyeti (process düzeyi) ----------
def scenario_double_start():
    f = FIX / "size-100.srt"
    reset()
    import threading
    res = {}
    def worker(tag):
        res[tag] = run_translate(f, f"dbl-{tag}")
    t1 = threading.Thread(target=worker, args=("a",))
    t2 = threading.Thread(target=worker, args=("b",))
    t1.start(); t2.start(); t1.join(); t2.join()
    reqs = requests_log()
    # İki eşzamanlı iş ayrı cache dizini -> her biri ~5 istek. Kritik: çıktılar tutarlı.
    outA = find_output(OUT_ROOT / "dbl-a"); outB = find_output(OUT_ROOT / "dbl-b")
    okA = same_timeline(f, outA)[0] if outA else False
    okB = same_timeline(f, outB)[0] if outB else False
    check("dbl:both-consistent", okA and okB, f"A={okA} B={okB}")
    print(f"  dbl: {len(reqs)} istek (2 x ~{len(reqs)//2})")


# ---------- T4: hata yüzeyi — e401 kalite döngüsüne girmez ----------
def scenario_error_surface():
    f = FIX / "size-1.srt"
    reset()
    setmode("e401")
    r = run_translate(f, "err401", expect_fail=True)
    reqs = requests_log()
    setmode("ok")
    logs = event_texts(r) + r["stderr"]
    # Yetkilendirme hatası kalite-kurtarma döngüsüne GİRMEMELİ: istek sayısı sınırlı
    # (ilk deneme + yol değişimi; sonsuz retry yok) ve yüzeyde anlaşılır hata var.
    check("err401:bounded-requests", 1 <= len(reqs) <= 6, f"{len(reqs)} istek")
    check("err401:surface-message",
          any(k in logs.lower() for k in ("401", "api anahtar", "anahtar", "yetki", "auth", "invalid")),
          f"stderr_tail={r['stderr'][-200:]}")
    print(f"  err401: {len(reqs)} istek, tail={logs[-160:]}")


# ---------- T4: sağlayıcı hata matrisi (gecikme/429/503/drop/bozuk JSON/yanlış id) ----------
def scenario_provider_matrix():
    f = FIX / "size-1.srt"
    for mode, name in (("e429", "err429"), ("e503", "err503"), ("hang", "errhang"),
                       ("truncated", "errtrunc"), ("badjson", "errbadjson"),
                       ("badids", "errbadids"), ("slow", "errslow")):
        reset()
        setmode(mode)
        t0 = time.time()
        r = run_translate(f, name, expect_fail=True, timeout=240)
        dt = time.time() - t0
        setmode("ok")
        reqs = requests_log()
        logs = (event_texts(r) + " " + r["stderr"]).lower()
        out = find_output(r["out_dir"], any_variant=True)
        check(f"{name}:bounded-requests", 1 <= len(reqs) <= 14,
              f"{len(reqs)} istek, {dt:.0f}s")
        # Bozuk/basılmış yanıt asla sessiz "başarı" sayılmamalı: rc!=0 veya
        # partial çıktı veya log'da açık hata/uyarı. 'slow' hata değil —
        # gecikmeli ama geçerli yanıtın tamamlanması beklenen davranış.
        if mode == "slow":
            ok, why = same_timeline(f, out) if out else (False, "çıktı yok")
            check(f"{name}:slow-completes", ok, why)
        else:
            honest = (r["rc"] != 0 or out is None or "partial" in out.name
                      or any(k in logs for k in
                             ("hata", "error", "kısm", "partial", "başarısız",
                              "untranslated", "çevrilmedi", "başarisiz")))
            check(f"{name}:honest-failure", honest,
                  f"rc={r['rc']} out={out and out.name} log_tail={logs[-160:]}")
        print(f"  {name}: {len(reqs)} istek, {dt:.1f}s, rc={r['rc']}, out={out and out.name}")


# ---------- T4: scriptli anomaliler — kısmi JSON, tekrarlanan/fazla id, usage yok ----------
def scenario_id_anomalies():
    f = FIX / "size-1.srt"
    cases = [
        # Yanlış tek id: beklenen '0' yerine '9' — cue doldurulamaz → ret+kurtarma.
        ("wrongid", {"content": json.dumps(
            {"items": {"9": "Yanlış anahtar."}, "sentences": {}}, ensure_ascii=False)}),
        # Kısmi JSON gövdesi (içerik ortadan kesik) → ayrıştırma hatası → ret.
        ("partialjson", {"_http": 200, "ctype": "application/json",
                         "body": '{"items":{"0":"Motoru aç'}),
        # Fazla id: beklenen '0' + fazladan '1','2' — ekstralara güvenilemez.
        ("extraids", {"content": json.dumps(
            {"items": {"0": "Motor valfi rapor etti.", "1": "Fazla metin 1.", "2": "Fazla metin 2."},
             "sentences": {}}, ensure_ascii=False)}),
        # Boş items — hiç cue doldurulamaz.
        ("emptyitems", {"content": json.dumps(
            {"items": {}, "sentences": {}}, ensure_ascii=False)}),
    ]
    for name, scripted in cases:
        reset()
        push([scripted])
        r = run_translate(f, f"anom-{name}", expect_fail=True)
        reqs = requests_log()
        out = find_output(r["out_dir"], any_variant=True)
        logs = (event_texts(r) + " " + r["stderr"]).lower()
        # Anomali kabul edilirse bile tekrar+kurtarma sınırlı olmalı ve süreç
        # çökmemeli; çıktı varsa tutarlı zaman çizelgesi korumalı.
        check(f"anom-{name}:bounded", 1 <= len(reqs) <= 10, f"{len(reqs)} istek")
        check(f"anom-{name}:no-crash", "traceback" not in logs,
              f"stderr tail: {r['stderr'][-160:]}")
        if out:
            ok, why = same_timeline(f, out)
            check(f"anom-{name}:timeline", ok, why)
        print(f"  anom-{name}: {len(reqs)} istek, rc={r['rc']}, out={out and out.name}")
    # usage alanı hiç yok / sıfır — token muhasebesi çökmeden dürüst raporlar.
    for mode, name in (("no_usage", "nousage"), ("zero_usage", "zerousage")):
        reset()
        setmode(mode)
        r = run_translate(f, f"anom-{name}", expect_fail=True)
        setmode("ok")
        logs = (event_texts(r) + " " + r["stderr"]).lower()
        check(f"anom-{name}:no-crash", "traceback" not in logs,
              f"stderr tail: {r['stderr'][-160:]}")
        print(f"  anom-{name}: rc={r['rc']}")


# ---------- T4: iptal ortasında maliyet sınırı ----------
def scenario_cancel_mid():
    """100-cue işi ~yarıda öldür → o ana kadar kaç istek + kalan çıktı durumu."""
    f = FIX / "size-100.srt"
    out_dir = OUT_ROOT / "cancelmid"
    shutil.rmtree(out_dir, ignore_errors=True)   # önceki koşudan kalan çıktı
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "cache").mkdir(exist_ok=True)
    reset()
    cmd = [VENV_PY, BACKEND + "/transcribe.py",
           "--input", str(f), "--translate-only", "true",
           "--translate-base-url", FIXTURE + "/v1",
           "--translate-api-key", "fixture-key",
           "--translate-model", "fixture-q",
           "--translate-workers", "1",
           "--output-dir", str(out_dir),
           "--cache-dir", str(out_dir / "cache"),
           "--formats", "srt", "--language", "en"]
    setmode("slow")                       # istek başına 3sn — iş gerçekten uçuşta
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(5)                         # ~yarıda: 1-2 istek atılmış, iş sürüyor
    proc.kill()
    proc.wait(timeout=20)
    setmode("ok")
    reqs_mid = requests_log()
    out = find_output(out_dir, any_variant=True)
    check("cancelmid:bounded", 1 <= len(reqs_mid) <= 5,
          f"iptal anında {len(reqs_mid)} istek")
    check("cancelmid:no-done-output", out is None or "partial" in out.name,
          f"iptalde tam çıktı var mı: {out}")
    # Yeniden başlatma tutarlı: aynı iş temiz koşar, tamamlanan parçalar
    # önbellekten gelir (maliyet tavanı: ilk+tekrar toplamı tek koşunun ~2 katı).
    reset()
    run_translate(f, "cancelmid", out_dir=out_dir)
    reqs_resume = requests_log()
    out2 = find_output(out_dir)
    ok, why = same_timeline(f, out2) if out2 else (False, "çıktı yok")
    check("cancelmid:resume-consistent", ok, why)
    check("cancelmid:total-bounded", len(reqs_mid) + len(reqs_resume) <= 15,
          f"toplam {len(reqs_mid)}+{len(reqs_resume)} istek")
    print(f"  cancelmid: kill@{len(reqs_mid)} istek, resume {len(reqs_resume)} istek")


def main():
    shutil.rmtree(OUT_ROOT, ignore_errors=True)
    OUT_ROOT.mkdir(parents=True)
    only = sys.argv[1:] or []
    scenarios = {
        "sizes": scenario_sizes,
        "10k": scenario_10k,
        "frag": scenario_tr_fragments,
        "wronglang": scenario_wrong_lang,
        "revcost": scenario_revision_cost,
        "dbl": scenario_double_start,
        "err": scenario_error_surface,
        "matrix": scenario_provider_matrix,
        "anom": scenario_id_anomalies,
        "cancelmid": scenario_cancel_mid,
    }
    for name, fn in scenarios.items():
        if only and name not in only:
            continue
        print(f"=== {name} ===", flush=True)
        try:
            fn()
        except Exception as e:
            check(f"{name}:harness", False, f"{type(e).__name__}: {e}")
    ok = sum(1 for x in RESULTS if x["ok"])
    Path("/home/ubuntu/qa-112/logs").mkdir(exist_ok=True)
    Path("/home/ubuntu/qa-112/logs/r112-t34-results.json").write_text(
        json.dumps(RESULTS, ensure_ascii=False, indent=1))
    print(f"SONUC: {ok}/{len(RESULTS)} PASS")


if __name__ == "__main__":
    main()
