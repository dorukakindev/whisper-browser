"""
Oynatıcı için medya yardımcısı — yt-dlp ile YouTube formatlarını listeler ve indirir.

Neden ayrı dosya: transcribe.py transkripsiyon boru hattı; oynatma/indirme farklı bir
sorumluluk. Aynı NDJSON protokolünü kullanır (main.js satır satır okur).

Kullanım:
    python media.py probe --url <youtube-url>
    python media.py download --url <url> --height 1080 --audio-lang tr --output-dir <klasor>

ÖNEMLİ (YouTube gerçeği): YouTube'da video+ses BİRLEŞİK gelen tek format genelde 360p'dir
(format 18). 1080p ve üstü DASH'tir — video ve ses ayrı akışlardır, HTML5 <video> bunları
birleştiremez. Bu yüzden:
  - "stream" yolu: yalnızca birleşik format (hızlı, indirmesiz, düşük çözünürlük)
  - "download" yolu: yt-dlp + ffmpeg birleştirir, istenen çözünürlükte yerel dosya
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


def _ydl_opts(extra=None):
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
    if extra:
        opts.update(extra)
    return opts


def probe(url):
    """Video bilgisi + oynatılabilir/indirilebilir seçenekleri döndürür."""
    import yt_dlp

    with yt_dlp.YoutubeDL(_ydl_opts()) as ydl:
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

    emit(
        "probe",
        title=info.get("title") or "",
        duration=info.get("duration") or 0,
        thumbnail=info.get("thumbnail") or "",
        heights=heights,
        audioLangs=audio_langs,
        stream=(
            {
                "url": best_progressive.get("url"),
                "height": best_progressive.get("height"),
                "ext": best_progressive.get("ext"),
            }
            if best_progressive else None
        ),
    )


def download(url, height, audio_lang, output_dir):
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
    })

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


def main():
    ap = argparse.ArgumentParser(description="Oynatıcı medya yardımcısı")
    ap.add_argument("command", choices=["probe", "download"])
    ap.add_argument("--url", required=True)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--audio-lang", default="")
    ap.add_argument("--output-dir", default=".")
    args = ap.parse_args()

    try:
        if args.command == "probe":
            probe(args.url)
        else:
            download(args.url, args.height, args.audio_lang, args.output_dir)
    except Exception as e:
        import traceback
        emit("error", message=str(e), traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
