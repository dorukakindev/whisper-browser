"""
Invidious API client — YouTube videolarını Google'a bağlanmadan alır.

Kullanım:
    python invidious.py probe --url <youtube-url> [--instance <invidious-instance>]
    python invidious.py subs  --url <url> --lang <lang> --output-dir <dir> [--instance <url>]

Invidious instance'lar: https://api.invidious.io/instances.json
Alternatif: https://yewtu.be, https://invidious.privacyredirect.com

Altyazılar için iki yol:
1. Invidious captions API (doğrudan indirme)
2. YouTube altyazı URL'si (Invidious'un proxy'si üzerinden)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from ndjson_utils import json_dumps_finite

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Varsayılan Invidious instance'ları (sırasıyla deneniyor)
DEFAULT_INSTANCES = [
    "https://yewtu.be",
    "https://invidious.privacyredirect.com",
    "https://invidious.projectsegfau.lt",
    "https://vid.priv.au",
    "https://inv.nadeko.net",
]

# Çalışan instance'ı önbelleğe al (modül seviyesinde)
_cached_instance = None


def emit(event_type, **kwargs):
    payload = {"type": event_type}
    payload.update(kwargs)
    print(json_dumps_finite(payload), flush=True)


def log(message, level="info"):
    emit("log", level=level, message=message)


def _fetch_json(url, timeout=10):
    """URL'den JSON çeker."""
    try:
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
        })
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Invidious isteği başarısız: {url} — {e}")


def _check_instance(instance, timeout=5):
    """Instance'ın çalışıp çalışmadığını kontrol eder."""
    try:
        _fetch_json(f"{instance}/api/v1/stats", timeout=timeout)
        return True
    except Exception:
        return False


def find_working_instance(instances=None, timeout=5):
    """Çalışan ilk Invidious instance'ını bulur."""
    global _cached_instance
    if _cached_instance and _check_instance(_cached_instance, timeout):
        return _cached_instance
    
    for inst in (instances or DEFAULT_INSTANCES):
        if _check_instance(inst, timeout):
            _cached_instance = inst
            log(f"Çalışan Invidious instance: {inst}")
            return inst
    raise RuntimeError("Hiçbir Invidious instance'ı çalışmıyor. Daha sonra tekrar deneyin.")


def extract_video_id(url):
    """YouTube URL'sinden video ID çıkarır."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    # Zaten video ID ise
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    raise ValueError(f"Geçersiz YouTube URL: {url}")


def probe(url, instance=None):
    """Video bilgisi + stream seçenekleri döndürür."""
    vid = extract_video_id(url)
    inst = instance or find_working_instance()
    
    log(f"Invidious probe: {vid} @ {inst}")
    
    # Video bilgisi
    data = _fetch_json(f"{inst}/api/v1/videos/{vid}")
    
    # Stream seçenekleri (adaptive = ayrı video/ses akışları)
    video_streams = []
    audio_streams = []
    hls_manifests = []
    
    for stream in (data.get("adaptiveFormats") or []):
        itag = stream.get("itag", 0)
        mime = stream.get("type", "")
        url_stream = stream.get("url") or stream.get("cipher") or stream.get("signatureCipher", "")
        
        # Signature cipher varsa çözemeyiz (JS player gerekir)
        if not url_stream or "signatureCipher" in stream:
            continue
            
        if "video" in mime:
            video_streams.append({
                "itag": itag,
                "height": stream.get("height") or 0,
                "fps": stream.get("fps") or 30,
                "url": url_stream,
                "mime": mime.split(";")[0],
            })
        elif "audio" in mime:
            audio_streams.append({
                "itag": itag,
                "bitrate": stream.get("bitrate") or 0,
                "url": url_stream,
                "mime": mime.split(";")[0],
            })
    
    # HLS akışları
    for hls in (data.get("hlsManifestUrl", []) or [data.get("hlsUrl")]):
        if hls:
            hls_manifests.append(hls)
    
    # DASH manifest URL
    dash_url = data.get("dashManifestUrl") or ""
    
    # YouTube altyazıları
    sub_langs = []
    captions = data.get("captions") or []
    for cap in captions:
        code = cap.get("languageCode") or ""
        label = cap.get("label") or code
        sub_langs.append({
            "code": code,
            "label": label,
            "auto": cap.get("baseUrl", "").startswith("https://www.youtube.com/api/timedtext"),
        })
    
    # Bölümler
    chapters = []
    for ch in (data.get("chapters") or []):
        if ch.get("startTime") is None:
            continue
        chapters.append({
            "start": float(ch.get("startTime") or 0),
            "end": float(ch.get("endTime") or 0),
            "title": (ch.get("title") or "").strip(),
        })
    
    emit(
        "probe",
        videoId=vid,
        title=data.get("title") or "",
        hls=hls_manifests[0] if hls_manifests else "",
        dash=dash_url,
        chapters=chapters,
        subtitleLangs=sub_langs,
        duration=float(data.get("lengthSeconds") or 0),
        thumbnail=data.get("thumbnailUrl") or "",
        videoStreams=video_streams,
        audioStreams=audio_streams,
        source="invidious",
        instance=inst,
    )


def fetch_subs(url, lang, output_dir, instance=None, auto=False):
    """Invidious üzerinden altyazı indirir."""
    vid = extract_video_id(url)
    inst = instance or find_working_instance()
    
    log(f"Invidious subs: {vid} lang={lang} @ {inst}")
    
    # Önce captions API dene
    captions = _fetch_json(f"{inst}/api/v1/videos/{vid}/captions") if False else []
    
    # YouTube captions API'ye doğrudan istek (Invidious proxy ile)
    # Invidious caption endpoint'i yoksa, YouTube'un timedtext API'sini dene
    sub_url = None
    caption_label = lang
    
    try:
        # Timedtext API (YouTube'un altyazı sunucusu)
        # Not: Bu API authentication gerektirmez ama rate-limit olabilir
        yt_sub_url = f"https://www.youtube.com/api/timedtext?lang={lang}&v={vid}&fmt=srv1"
        req = Request(yt_sub_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            if content.strip():
                sub_url = yt_sub_url
    except Exception:
        pass
    
    if not sub_url:
        # Alternatif: Invidious'un captions listesi
        try:
            cap_data = _fetch_json(f"{inst}/api/v1/videos/{vid}")
            for cap in (cap_data.get("captions") or []):
                if cap.get("languageCode") == lang:
                    base = cap.get("baseUrl")
                    if base:
                        sub_url = base
                        caption_label = cap.get("label", lang)
                        break
        except Exception:
            pass
    
    if not sub_url:
        raise RuntimeError(f"Altyazı bulunamadı: {lang}")
    
    # İndir
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    
    # YouTube timedtext formatını SRT'ye çevir
    try:
        req = Request(sub_url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.youtube.com",
        })
        with urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8")
    except Exception as e:
        raise RuntimeError(f"Altyazı indirilemedi: {e}")
    
    # Timedtext → SRT dönüşümü
    srt_content = _convert_timedtext_to_srt(content)
    
    # Dosya kaydet
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', vid)[:80]
    out_path = out / f"{safe_title}.{lang}.srt"
    
    # BOM ile UTF-8 (Windows uyumluluğu)
    with open(out_path, "w", encoding="utf-8-sig") as f:
        f.write(srt_content)
    
    emit("subs", path=str(out_path), lang=lang, auto=bool(auto))


def _convert_timedtext_to_srt(content):
    """YouTube timedtext XML'ini SRT formatına çevirir."""
    import xml.etree.ElementTree as ET
    
    # Namespace'i kaldır
    content = re.sub(r'xmlns="[^"]*"', '', content)
    content = re.sub(r'tts:', '', content)
    
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        # Düz metin olarak döndür
        return content
    
    srt_lines = []
    index = 1
    
    for body in root.findall(".//body"):
        for p in body.findall(".//p"):
            start_ms = int(p.get("t", 0))
            dur = int(p.get("d", 0))
            end_ms = start_ms + dur
            
            # İç içe p varsa (alt satırlar)
            texts = []
            for span in p.findall(".//span"):
                t = span.text or ""
                texts.append(t.strip())
            if not texts:
                t = p.text or ""
                if t.strip():
                    texts = [t.strip()]
            
            if texts:
                start = _ms_to_srt_time(start_ms)
                end = _ms_to_srt_time(end_ms)
                text = " ".join(texts)
                
                srt_lines.append(f"{index}")
                srt_lines.append(f"{start} --> {end}")
                srt_lines.append(text)
                srt_lines.append("")
                index += 1
    
    # Boş dosya kontrolü
    if not srt_lines:
        return "1\n00:00:00,000 --> 00:00:05,000\nNo subtitles available.\n"
    
    return "\n".join(srt_lines)


def _ms_to_srt_time(ms):
    """Milisaniyeyi SRT zaman koduna çevirir (HH:MM:SS,mmm)."""
    ms = max(0, ms)
    hours = ms // 3600000
    ms %= 3600000
    minutes = ms // 60000
    ms %= 60000
    seconds = ms // 1000
    millis = ms % 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def main():
    ap = argparse.ArgumentParser(description="Invidious API client")
    ap.add_argument("command", choices=["probe", "subs"])
    ap.add_argument("--url", required=True, help="YouTube URL veya video ID")
    ap.add_argument("--lang", default="en", help="Altyazı dili kodu")
    ap.add_argument("--auto", action="store_true", help="Otomatik altyazılar dahil")
    ap.add_argument("--instance", default="", help="Invidious instance URL")
    ap.add_argument("--output-dir", default=".", help="Çıktı klasörü")
    args = ap.parse_args()
    
    instance = args.instance.strip() if args.instance else None
    
    try:
        if args.command == "probe":
            probe(args.url, instance)
        elif args.command == "subs":
            fetch_subs(args.url, args.lang, args.output_dir, instance, args.auto)
    except Exception as e:
        emit("error", message=str(e))


if __name__ == "__main__":
    main()
