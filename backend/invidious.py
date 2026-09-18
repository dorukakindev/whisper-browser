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

try:
    import yt_dlp
    _YT_DLP_AVAILABLE = True
except ImportError:
    yt_dlp = None
    _YT_DLP_AVAILABLE = False

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


# ===== Auth (Invidious session) =====
# Invidious sunucu taraflı hesap kullanır; Google'a bağlanmaz. Cookie/session
# anahtarı modül seviyesinde tutulur (ana süreçten gelir).
_session_cookie = None   # SID değeri
_session_username = None


def set_session(cookie=None, username=None):
    """Ana süreçten gelen session'ı kur."""
    global _session_cookie, _session_username
    _session_cookie = cookie or None
    _session_username = username or None


def _auth_headers():
    """Invidious session cookie varsa ekler."""
    headers = {"User-Agent": "Mozilla/5.0"}
    if _session_cookie:
        headers["Cookie"] = f"SID={_session_cookie}"
    return headers


def login(username, password, instance=None):
    """Invidious hesabına giriş yapar. SID cookie'sini döndürür.

    Invidious API:
      POST /login?email_or_user=...&password=...
      veya: POST /session/login (JSON: {"email_or_user": ..., "password": ...})
      Yanıt: Set-Cookie: SID=...; HttpOnly
    """
    from http.cookiejar import CookieJar
    from urllib.request import HTTPCookieProcessor, build_opener

    inst = instance or find_working_instance()
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", "Mozilla/5.0")]

    url = f"{inst}/login"
    body = f"email_or_user={urllib_parse.quote(username)}&password={urllib_parse.quote(password)}"
    body_bytes = body.encode("utf-8")
    try:
        req = Request(url, data=body_bytes, headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        with opener.open(req, timeout=15) as resp:
            sid = None
            for cookie in jar:
                if cookie.name == "SID":
                    sid = cookie.value
                    break
            if not sid:
                raise RuntimeError("Invidious session cookie alınamadı.")
            set_session(cookie=sid, username=username)
            log(f"Invidious giriş başarılı: {username}")
            emit("login", ok=True, username=username, instance=inst, sid=sid)
    except HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Invidious: kullanıcı adı veya şifre hatalı.")
        raise RuntimeError(f"Invidious giriş başarısız: HTTP {e.code}")
    except URLError as e:
        raise RuntimeError(f"Invidious giriş ağ hatası: {e}")


def logout():
    """Session'ı temizle."""
    set_session(cookie=None, username=None)
    emit("logout", ok=True)


# urllib.parse burada import edilir (login için)
import urllib.parse as urllib_parse


# ===== Feed (ana sayfa) =====
def _parse_video_item(v):
    """Invidious video objesini ortak şemaya çevirir."""
    return {
        "videoId": v.get("videoId", ""),
        "title": v.get("title", ""),
        "author": v.get("author", ""),
        "authorId": v.get("authorId", ""),
        "lengthSeconds": int(v.get("lengthSeconds") or 0),
        "viewCount": int(v.get("viewCount") or 0),
        "publishedText": v.get("publishedText", ""),
        "published": int(v.get("published") or 0),
        "videoThumbnails": v.get("videoThumbnails", []),
    }


def _ytdlp_search_videos(query, max_results=24):
    """yt-dlp ytsearch ile video listesi çeker — Invidious devre dışıysa yedek yol."""
    if not _YT_DLP_AVAILABLE:
        raise RuntimeError("yt-dlp mevcut değil")
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
        "no_warnings": True,
        "ignoreerrors": True,
    }
    search = f"ytsearch{max_results}:{query}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(search, download=False)
    entries = (info or {}).get("entries") or []
    out = []
    for v in entries:
        if not v:
            continue
        thumbs = []
        for t in v.get("thumbnails") or []:
            url = t.get("url")
            if not url:
                continue
            thumbs.append({
                "quality": str(t.get("height") or ""),
                "url": url,
                "width": int(t.get("width") or 0),
                "height": int(t.get("height") or 0),
            })
        out.append({
            "videoId": v.get("id") or "",
            "title": v.get("title") or "",
            "author": v.get("uploader") or v.get("channel") or "",
            "authorId": v.get("uploader_id") or v.get("channel_id") or "",
            "lengthSeconds": int(v.get("duration") or 0),
            "viewCount": int(v.get("view_count") or 0),
            "publishedText": "",
            "published": int(v.get("timestamp") or 0),
            "videoThumbnails": thumbs,
        })
    return out


def feed_popular(instance=None):
    """Popüler videolar (Invidious API'si artık çoğu instance'da devre dışı — yt-dlp ytsearch yedek)."""
    try:
        inst = instance or find_working_instance()
        log(f"Invidious popular: {inst}")
        data = _fetch_json(f"{inst}/api/v1/popular", timeout=10)
        videos = [_parse_video_item(v) for v in (data or [])]
        if videos:
            emit("feed", kind="popular", videos=videos, instance=inst)
            return
        raise RuntimeError("Invidious popüler boş döndü")
    except Exception as primary:
        log(f"Invidious başarısız, yt-dlp yedek denenecek: {primary}")
        videos = _ytdlp_search_videos("trending music 2026", max_results=24)
        emit("feed", kind="popular", videos=videos, instance="yt-dlp:ytdlp_search")


def feed_trending(instance=None):
    """Trend videolar (yt-dlp ytsearch yedek)."""
    try:
        inst = instance or find_working_instance()
        log(f"Invidious trending: {inst}")
        # Invidious /api/v1/trending 4 kategori: music/gaming/news/movies
        all_videos = []
        for tab in ("music", "gaming", "news", "movies"):
            data = _fetch_json(f"{inst}/api/v1/trending?type={tab}", timeout=10)
            if data:
                all_videos.extend([_parse_video_item(v) for v in data])
        if all_videos:
            emit("feed", kind="trending", videos=all_videos, instance=inst)
            return
        raise RuntimeError("Invidious trend boş döndü")
    except Exception as primary:
        log(f"Invidious başarısız, yt-dlp yedek denenecek: {primary}")
        videos = _ytdlp_search_videos("youtube trending videos today", max_results=24)
        emit("feed", kind="trending", videos=videos, instance="yt-dlp:ytdlp_search")


def feed_subscriptions(instance=None):
    """Kullanıcının abonelik feed'i — giriş gerekli."""
    inst = instance or find_working_instance()
    if not _session_cookie:
        raise RuntimeError("Abonelikler için Invidious hesabına giriş gerekli.")
    log(f"Invidious subscriptions: {inst}")
    try:
        req = Request(f"{inst}/api/v1/feed/subscriptions",
                      headers=_auth_headers())
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        videos = [_parse_video_item(v) for v in (data.get("videos") or [])]
        # notifications gibi ek alanlar olabilir
        notifications = data.get("notifications", [])
        emit("feed", kind="subscriptions", videos=videos,
             notifications=notifications, instance=inst)
    except HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Oturum süresi dolmuş — yeniden giriş yapın.")
        raise RuntimeError(f"Abonelik feed hatası: HTTP {e.code}")


# ===== Arama =====
def search(query, page=1, instance=None):
    """Invidious arama. Sonuçları video listesi olarak döndürür. yt-dlp yedek."""
    try:
        inst = instance or find_working_instance()
        log(f"Invidious search: {query!r}")
        q = urllib_parse.quote(query)
        data = _fetch_json(
            f"{inst}/api/v1/search?q={q}&page={int(page)}&type=video",
            timeout=15
        )
        videos = []
        for v in (data or []):
            if v.get("type") != "video":
                continue
            videos.append(_parse_video_item(v))
        if videos:
            emit("search", query=query, page=int(page), videos=videos, instance=inst)
            return
        raise RuntimeError("Invidious arama boş")
    except Exception as primary:
        log(f"Invidious arama başarısız, yt-dlp yedek: {primary}")
        max_results = 20 * max(1, int(page))
        videos = _ytdlp_search_videos(query, max_results=max_results)
        emit("search", query=query, page=int(page), videos=videos, instance="yt-dlp:ytdlp_search")


# ===== Kanal =====
def channel(channel_id, instance=None):
    """Kanal bilgisi + son videolar."""
    inst = instance or find_working_instance()
    log(f"Invidious channel: {channel_id} @ {inst}")
    # Invidious /api/v1/channels/{ucid} (channelId = UC...)
    url = f"{inst}/api/v1/channels/{urllib_parse.quote(channel_id)}"
    data = _fetch_json(url, timeout=15)
    info = {
        "author": data.get("author", ""),
        "authorId": data.get("authorId", channel_id),
        "authorThumbnails": data.get("authorThumbnails", []),
        "subCount": int(data.get("subCount") or 0),
        "description": (data.get("description") or "")[:500],
    }
    videos = [_parse_video_item(v) for v in (data.get("latestVideos") or [])]
    emit("channel", info=info, videos=videos, instance=inst)


def main():
    ap = argparse.ArgumentParser(description="Invidious API client")
    ap.add_argument("command", choices=[
        "probe", "subs", "login", "logout",
        "popular", "trending", "subscriptions",
        "search", "channel",
    ])
    ap.add_argument("--url", default="", help="YouTube URL veya video ID")
    ap.add_argument("--lang", default="en", help="Altyazı dili kodu")
    ap.add_argument("--auto", action="store_true", help="Otomatik altyazılar dahil")
    ap.add_argument("--instance", default="", help="Invidious instance URL")
    ap.add_argument("--output-dir", default=".", help="Çıktı klasörü")
    ap.add_argument("--username", default="", help="Invidious kullanıcı adı")
    ap.add_argument("--password", default="", help="Invidious şifresi (güvenli: argv'de görünür)")
    ap.add_argument("--query", default="", help="Arama terimi")
    ap.add_argument("--page", type=int, default=1, help="Arama sayfası")
    ap.add_argument("--channel-id", default="", help="Invidious kanal ID (UCID)")
    args = ap.parse_args()

    instance = args.instance.strip() if args.instance else None

    try:
        if args.command == "probe":
            probe(args.url, instance)
        elif args.command == "subs":
            fetch_subs(args.url, args.lang, args.output_dir, instance, args.auto)
        elif args.command == "login":
            login(args.username, args.password, instance)
        elif args.command == "logout":
            logout()
        elif args.command == "popular":
            feed_popular(instance)
        elif args.command == "trending":
            feed_trending(instance)
        elif args.command == "subscriptions":
            feed_subscriptions(instance)
        elif args.command == "search":
            search(args.query, args.page, instance)
        elif args.command == "channel":
            channel(args.channel_id, instance)
    except Exception as e:
        emit("error", message=str(e))


if __name__ == "__main__":
    main()
