"""
Oynatıcı için medya yardımcısı — yt-dlp ile YouTube formatlarını listeler ve indirir.

Neden ayrı dosya: transcribe.py transkripsiyon boru hattı; oynatma/indirme farklı bir
sorumluluk. Aynı NDJSON protokolünü kullanır (main.js satır satır okur).

Kullanım:
    python media.py probe --url <youtube-url>
    python media.py download --url <url> --height 1080 --audio-lang tr --output-dir <klasor>

ÖNEMLİ (YouTube gerçeği): video+ses BİRLEŞİK gelen progressive format (360p) çoğu videoda
artık sunulmuyor; 1080p ve üstü ayrı akışlar hâlinde gelir ve HTML5 <video> bunları
birleştiremez. Üç yol var:
  - "hls"      : YouTube'un HLS manifesti (tüm çözünürlükler + ayrı ses parçaları).
                 hls.js ile indirmeden, ses dahil, ileri-geri sararak izlenir. En iyi yol.
                 Not: googlevideo CORS başlığı göndermez — Electron tarafında yanıt
                 başlığına eklenir (main.js > installYoutubeStreamHeaders).
  - "stream"   : birleşik format varsa doğrudan <video src> (nadiren mevcut, düşük çözünürlük)
  - "download" : yt-dlp + ffmpeg birleştirir, istenen çözünürlükte yerel dosya (en sağlam)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def emit(event_type, **kwargs):
    payload = {"type": event_type}
    payload.update(kwargs)
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def log(message, level="info"):
    emit("log", level=level, message=message)


def _find_ffmpeg():
    """transcribe.py ile aynı arama sırası: yerel bin -> PATH."""
    local = Path(__file__).parent / "bin" / "ffmpeg.exe"
    if local.exists():
        return str(local)
    from shutil import which
    return which("ffmpeg") or which("ffmpeg.exe")


COOKIE_BROWSERS = {"chrome", "edge", "firefox", "brave", "vivaldi", "opera"}


def _ydl_opts(extra=None, cookie_browser=""):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        # YouTube imza çözümü için Node gerekiyor (uygulamanın zaten bağımlılığı)
        "js_runtimes": {"node": {}},
    }
    ff = _find_ffmpeg()
    if ff:
        opts["ffmpeg_location"] = str(Path(ff).parent)
    browser = str(cookie_browser or "").strip().lower()
    if browser:
        if browser not in COOKIE_BROWSERS:
            raise ValueError("Desteklenmeyen cookie tarayıcısı")
        # Cookie içeriği uygulamaya/argv'ye taşınmaz. yt-dlp seçilen tarayıcının
        # profilinden doğrudan okur; uygulama yalnızca tarayıcı adını bilir.
        opts["cookiesfrombrowser"] = (browser,)
    if extra:
        opts.update(extra)
    return opts


def probe(url, cookie_browser=""):
    """Video bilgisi + oynatılabilir/indirilebilir seçenekleri döndürür."""
    import yt_dlp

    with yt_dlp.YoutubeDL(_ydl_opts(cookie_browser=cookie_browser)) as ydl:
        info = ydl.extract_info(url, download=False)

    formats = info.get("formats") or []

    def is_video(f):
        return f.get("vcodec", "none") not in (None, "none")

    def is_audio(f):
        return f.get("acodec", "none") not in (None, "none")

    # 1) Doğrudan oynatılabilir birleşik formatlar (indirmesiz izleme)
    progressive = [
        f for f in formats
        if is_video(f) and is_audio(f) and f.get("url")
        and f.get("protocol") in ("https", "http")
        and (f.get("ext") or "") in ("mp4", "webm")
    ]
    progressive.sort(key=lambda f: (f.get("height") or 0, f.get("tbr") or 0))
    best_progressive = progressive[-1] if progressive else None

    # 2) İndirme için mevcut çözünürlükler (DASH dahil)
    heights = sorted({f.get("height") for f in formats if is_video(f) and f.get("height")})

    # 3) Ses dilleri (dublajlı videolarda birden fazla olur)
    audio_langs = []
    seen = set()
    for f in formats:
        if not is_audio(f) or is_video(f):
            continue
        lang = f.get("language")
        if not lang or lang in seen:
            continue
        seen.add(lang)
        audio_langs.append({"code": lang, "label": f.get("format_note") or lang})

    # YouTube 1080p+ formatlarini HLS manifesti olarak da sunuyor. Bu manifest
    # hem tum cozunurlukleri hem AYRI SES parcalarini (EXT-X-MEDIA) iceriyor; yani
    # hls.js ile indirmeden, ses dahil, ileri-geri sararak izlenebilir.
    hls_url = ""
    for f in formats:
        if f.get("protocol") in ("m3u8_native", "m3u8") and f.get("manifest_url"):
            hls_url = f["manifest_url"]
            break

    # 4) Bölümler — belgesellerde/uzun videolarda gezinmeyi kolaylaştırır
    chapters = []
    for ch in (info.get("chapters") or []):
        if ch.get("start_time") is None:
            continue
        chapters.append({
            "start": float(ch.get("start_time") or 0),
            "end": float(ch.get("end_time") or 0),
            "title": (ch.get("title") or "").strip(),
        })

    # 5) YouTube'un kendi altyazıları — elle yazılmış olanlar ve otomatik olanlar
    #    ayrı işaretlenir (otomatik olanlar noktalamasız ve hatalı olur; bizim
    #    çıktımızla karşılaştırma/ikinci altyazı olarak işe yarar).
    sub_langs = []
    for code in sorted((info.get("subtitles") or {}).keys()):
        sub_langs.append({"code": code, "auto": False})
    have = {x["code"] for x in sub_langs}
    for code in sorted((info.get("automatic_captions") or {}).keys()):
        if code not in have:
            sub_langs.append({"code": code, "auto": True})

    emit(
        "probe",
        title=info.get("title") or "",
        hls=hls_url,
        isLive=bool(info.get("is_live")),
        liveStatus=info.get("live_status") or "",
        chapters=chapters,
        subtitleLangs=sub_langs,
        duration=info.get("duration") or 0,
        thumbnail=info.get("thumbnail") or "",
        heights=heights,
        audioLangs=audio_langs,
        originalLanguage=info.get("language") or "",
        stream=(
            {
                "url": best_progressive.get("url"),
                "height": best_progressive.get("height"),
                "ext": best_progressive.get("ext"),
                # Progressive akista ses parcasi sonradan degistirilemez. UI ve
                # Whisper'in gercekte duyulan dili kilitleyebilmesi icin secilen
                # birlesik formatin dilini acikca bildir.
                "audioLang": best_progressive.get("language") or info.get("language") or "",
            }
            if best_progressive else None
        ),
    )


def download(url, height, audio_lang, output_dir, cookie_browser=""):
    """İstenen çözünürlükte indirip birleştirir (ffmpeg). Yerel dosya yolunu döndürür."""
    import yt_dlp

    outdir = Path(output_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    # Video: istenen yüksekliği AŞMAYAN en iyisi; ses: istenen dil varsa o, yoksa en iyi ses
    vsel = f"bestvideo[height<={int(height)}]" if height else "bestvideo"
    asel = f"bestaudio[language={audio_lang}]" if audio_lang else "bestaudio"
    fmt = f"{vsel}+{asel}/{vsel}+bestaudio/best[height<={int(height)}]/best" if height \
        else f"{vsel}+{asel}/best"

    last = [0.0]

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            got = d.get("downloaded_bytes") or 0
            now = time.time()
            if total and (now - last[0] > 0.3):
                last[0] = now
                emit("download_progress",
                     percent=round(got / total * 100.0, 1),
                     speed=d.get("speed") or 0,
                     eta=d.get("eta") or 0)
        elif d.get("status") == "finished":
            emit("download_progress", percent=100.0, speed=0, eta=0)
            log("İndirme bitti, birleştiriliyor...")

    opts = _ydl_opts({
        "format": fmt,
        "outtmpl": str(outdir / "%(title).120s [%(id)s].%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [hook],
        # Oynatıcı için tek dosya şart — birleştirme başarısızsa hata versin
        "postprocessors": [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}],
    }, cookie_browser=cookie_browser)

    log(f"İndiriliyor (en fazla {height or 'sınırsız'}p"
        + (f", ses dili: {audio_lang}" if audio_lang else "") + ")")
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    path = None
    if info.get("requested_downloads"):
        path = info["requested_downloads"][0].get("filepath")
    if not path:
        # Yedek: yt-dlp'nin ürettiği ada göre bul
        base = info.get("title") or ""
        for p in outdir.glob("*.mp4"):
            if base[:40] in p.name:
                path = str(p)
                break
    if not path or not os.path.exists(path):
        raise RuntimeError("İndirilen dosya bulunamadı")

    emit("downloaded", path=str(path), title=info.get("title") or "",
         duration=info.get("duration") or 0)


def fetch_subs(url, lang, auto, output_dir, cookie_browser=""):
    """YouTube'un hazır altyazısını SRT olarak indirir ve yolunu döndürür."""
    import yt_dlp

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    opts = _ydl_opts({
        "skip_download": True,
        "writesubtitles": not auto,
        "writeautomaticsub": auto,
        "subtitleslangs": [lang],
        "subtitlesformat": "srt/vtt/best",
        "outtmpl": {"default": str(out / "%(title).80B [%(id)s].%(ext)s")},
        # vtt gelirse ffmpeg ile srt'ye çevir (oynatıcı ve düzenleyici srt bekliyor)
        "postprocessors": [{"key": "FFmpegSubtitlesConvertor", "format": "srt"}],
    }, cookie_browser=cookie_browser)
    log(f"YouTube altyazısı indiriliyor: {lang}{' (otomatik)' if auto else ''}")
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    # Dosyayi VIDEO KIMLIGINE gore bul. "Indirmeden once/sonra yeni dosya" farkini
    # ALMIYORUZ: ayni altyazi ikinci kez istendiginde yt-dlp dosyayi atlar veya
    # uzerine yazar; yeni dosya olusmadigi icin kod yanlislikla "indirilemedi" derdi.
    vid = (info or {}).get("id") or ""
    candidates = [p for p in out.glob("*.srt") if not vid or f"[{vid}]" in p.name]
    # Dil eki dosya adinda olur (".tr.srt"); o dile ait olani tercih et
    exact = [p for p in candidates if p.name.lower().endswith(f".{lang.lower()}.srt")]
    picked = exact or candidates
    if not picked:
        raise RuntimeError(
            f"Altyazı indirilemedi ({lang}). Bu videoda o dilde altyazı olmayabilir."
        )
    path = max(picked, key=lambda p: p.stat().st_mtime)
    emit("subs", path=str(path), lang=lang, auto=bool(auto))


def main():
    ap = argparse.ArgumentParser(description="Oynatıcı medya yardımcısı")
    ap.add_argument("command", choices=["probe", "download", "subs"])
    ap.add_argument("--url", required=True)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--audio-lang", default="")
    ap.add_argument("--output-dir", default=".")
    ap.add_argument("--sub-lang", default="en")
    ap.add_argument("--sub-auto", default="false")
    ap.add_argument("--cookie-browser", default="")
    args = ap.parse_args()

    try:
        if args.command == "probe":
            probe(args.url, args.cookie_browser)
        elif args.command == "subs":
            fetch_subs(args.url, args.sub_lang,
                       str(args.sub_auto).lower() == "true", args.output_dir,
                       args.cookie_browser)
        else:
            download(args.url, args.height, args.audio_lang, args.output_dir,
                     args.cookie_browser)
    except Exception as e:
        import traceback
        message = str(e)
        if "confirm you’re not a bot" in message or "confirm you're not a bot" in message:
            message = ("YouTube bu video için oturum doğrulaması istedi. "
                       "YouTube ayarlarından giriş yaptığınız tarayıcıyı seçip yeniden deneyin.")
        elif "Could not copy" in message and "cookie" in message.lower():
            message = ("Tarayıcı cookie veritabanı okunamadı. Tarayıcıyı tamamen kapatıp "
                       "yeniden deneyin veya Firefox oturumunu seçin.")
        emit("error", message=message, traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
