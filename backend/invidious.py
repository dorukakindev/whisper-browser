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
import threading
import time
import urllib.parse as urllib_parse
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
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com",
    "https://invidious.tiekoetter.com",
    "https://invidious.f5.si",
]

# Çalışan instance'ı önbelleğe al (modül seviyesinde)
_cached_instance = None


# Paralel thread'lerden gelen emit'lerin satırları karışmasın — NDJSON
# bütünlüğü tek write altında korunur (feed_home iki kolu eşzamanlı çalıştırır).
_emit_lock = threading.Lock()


def emit(event_type, **kwargs):
    payload = {"type": event_type}
    payload.update(kwargs)
    with _emit_lock:
        print(json_dumps_finite(payload), flush=True)


def log(message, level="info"):
    emit("log", level=level, message=message)


def _fetch_json(url, timeout=10, session=True):
    """URL'den JSON çeker. session=True iken SID cookie'si de gönderir."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    if session and _session_cookie and _session_url_ok(url):
        headers["Cookie"] = f"SID={_session_cookie}"
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Invidious isteği başarısız: {url} — {e}")


def _to_int(value, default=0):
    """Invidious bazı sayı alanlarını string/float döndürür."""
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default


def _abs_url(inst, url):
    """Instance-göreli URL'leri mutlak yap."""
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return inst.rstrip("/") + url
    return url


def _iter_instances(preferred=None):
    """Tercih edilen + önbellek + varsayılan listeyi tek dolaşımda verir."""
    seen = set()
    for inst in ([preferred] if preferred else []) + \
                ([_cached_instance] if _cached_instance else []) + \
                DEFAULT_INSTANCES:
        if inst and inst not in seen:
            seen.add(inst)
            yield inst


def _fetch_with_failover(path, preferred=None, timeout=10):
    """Aynı API yolunu sırayla çalışan instance'larda dener."""
    last_err = None
    for inst in _iter_instances(preferred):
        try:
            global _cached_instance
            data = _fetch_json(inst.rstrip("/") + path, timeout=timeout)
            _cached_instance = inst
            return data, inst
        except Exception as e:
            last_err = e
            log(f"Instance atlandı ({inst}): {e}", level="warn")
    raise RuntimeError(f"Tüm Invidious instance'ları başarısız: {last_err}")


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
    """YouTube URL'sinden video ID çıkarır.

    Desteklenenler: watch?v= (param sırası bağımsız), youtu.be/, /shorts/, /embed/,
    /live/, /v/, youtube-nocookie ve herhangi bir Invidious instance URL'si
    (aynı yol yapısını aynalar: /watch?v=..., /shorts/... vb.).
    """
    url = url.strip()
    patterns = [
        r'[?&]v=([a-zA-Z0-9_-]{11})',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'/(?:shorts|embed|live|v)/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    raise ValueError(f"Geçersiz YouTube URL: {url}")


def _pick_thumbnail(inst, thumbs):
    """En iyi thumbnail URL'si — yüksek çözünürlükten başa doğru, mutlaklaştırılmış."""
    if not thumbs:
        return ""
    order = {"maxres": 0, "maxresdefault": 1, "sddefault": 2, "high": 3, "hqdefault": 4,
             "medium": 5, "mqdefault": 6, "default": 7}
    def key(t):
        q = (t.get("quality") or "").lower()
        return order.get(q, 9), -_to_int(t.get("width"), 0)
    best = sorted(thumbs, key=key)
    return _abs_url(inst, best[0].get("url") or "")


def probe(url, instance=None):
    """Video bilgisi + stream seçenekleri döndürür."""
    vid = extract_video_id(url)
    data, inst = _fetch_with_failover(f"/api/v1/videos/{vid}", preferred=instance, timeout=15)
    if not isinstance(data, dict) or not data.get("title"):
        raise RuntimeError(f"Video bulunamadı: {vid}")

    log(f"Invidious probe: {vid} @ {inst}")

    # formatStreams: birleşik (progressive) — <video> doğrudan oynatır
    progressive = []
    for s in (data.get("formatStreams") or []):
        su = s.get("url") or ""
        if not su:
            continue
        progressive.append({
            "itag": s.get("itag"),
            "height": _to_int(re.sub(r"[^\d]", "", str(s.get("resolution") or s.get("qualityLabel") or "0")) or 0),
            "url": su,
            "mime": (s.get("type") or "").split(";")[0],
            "qualityLabel": s.get("qualityLabel") or s.get("resolution") or "",
        })
    progressive.sort(key=lambda s: -s["height"])

    # adaptiveFormats: ayrı video/ses akışları (indirme + kalite listesi)
    video_streams = []
    audio_streams = []
    audio_langs = []
    for stream in (data.get("adaptiveFormats") or []):
        itag = stream.get("itag", 0)
        mime = stream.get("type", "")
        url_stream = stream.get("url") or ""
        if not url_stream:
            continue
        if "video" in mime:
            h = _to_int(re.sub(r"[^\d]", "", str(stream.get("resolution") or stream.get("qualityLabel") or stream.get("height") or "0")) or 0)
            video_streams.append({
                "itag": itag,
                "height": h,
                "fps": _to_int(stream.get("fps"), 30),
                "url": url_stream,
                "mime": mime.split(";")[0],
                "qualityLabel": stream.get("qualityLabel") or stream.get("resolution") or (f"{h}p" if h else ""),
            })
        elif "audio" in mime:
            track = stream.get("audioTrack") or {}
            lang_code = (track.get("audioTrackId") or "").split(".")[0] or stream.get("languageCode") or ""
            audio_streams.append({
                "itag": itag,
                "bitrate": _to_int(stream.get("bitrate"), 0),
                "url": url_stream,
                "mime": mime.split(";")[0],
                "language": lang_code,
                "label": track.get("audioTrackName") or stream.get("audioName") or lang_code,
            })
            if lang_code and not any(a["code"] == lang_code for a in audio_langs):
                audio_langs.append({
                    "code": lang_code,
                    "label": track.get("audioTrackName") or stream.get("audioName") or lang_code,
                })

    # HLS akışı — canlı yayınlar ve >720p progressive olmayan videolar
    hls_url = data.get("hlsUrl") or data.get("hlsLocalUrl") or ""
    if not hls_url:
        hls_url = _abs_url(inst, data.get("hlsManifestUrl") or "")

    # DASH manifest URL
    dash_url = data.get("dashUrl") or data.get("dashManifestUrl") or ""

    # YouTube altyazıları — language_code / url Invidious şeması
    sub_langs = []
    for cap in (data.get("captions") or []):
        code = cap.get("language_code") or cap.get("languageCode") or ""
        label = cap.get("label") or code
        kind = cap.get("kind") or ""
        auto = kind == "asr" or "auto" in label.lower() or "otomatik" in label.lower()
        cap_url = cap.get("url") or cap.get("baseUrl") or ""
        sub_langs.append({
            "code": code,
            "label": label,
            "auto": bool(auto),
            "kind": kind,
            "url": _abs_url(inst, cap_url),
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

    # Kalite listesi — progressive + adaptive yüksekliklerinin birleşimi (düz sayılar;
    # renderer yt-dlp probe'uyla aynı şemayı bekler: heights=[1080, 720, ...]).
    heights = sorted({s["height"] for s in progressive + video_streams if s["height"]}, reverse=True)

    # Doğrudan oynatılabilir progressive akış — {url, height, audioLang} şeması
    stream_obj = None
    if progressive:
        best = progressive[0]
        stream_obj = {
            "url": best["url"],
            "height": best["height"],
            "audioLang": audio_langs[0]["code"] if audio_langs else "",
        }

    emit(
        "probe",
        videoId=vid,
        title=data.get("title") or "",
        hls=hls_url,
        dash=dash_url,
        dashUrl=dash_url,
        stream=stream_obj,
        heights=heights,
        chapters=chapters,
        subtitleLangs=sub_langs,
        audioLangs=audio_langs,
        duration=float(data.get("lengthSeconds") or 0),
        thumbnail=_pick_thumbnail(inst, data.get("videoThumbnails") or []),
        videoStreams=video_streams,
        audioStreams=audio_streams,
        isLive=bool(data.get("liveNow")),
        isUpcoming=bool(data.get("isUpcoming")),
        author=data.get("author") or "",
        authorId=data.get("authorId") or "",
        recommended=[
            _parse_video_item(v) for v in (data.get("recommendedVideos") or [])[:12]
            if isinstance(v, dict) and v.get("videoId")
        ],
        source="invidious",
        instance=inst,
    )


def _vtt_to_srt(content):
    """WEBVTT metnini SRT'ye çevirir."""
    lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cues, cur = [], []
    for line in lines:
        if "-->" in line and "." in line:
            ts = line.split("-->")
            start = ts[0].strip()
            end = ts[1].strip().split(" ")[0]
            def to_srt(t):
                t = t.replace(".", ",")
                parts = t.split(":")
                if len(parts) == 2:
                    t = "00:" + t
                return t
            cur = [f"{to_srt(start)} --> {to_srt(end)}"]
        elif cur is not None:
            if line.strip() == "":
                if len(cur) > 1:
                    cues.append(cur)
                cur = []
            elif not line.startswith(("WEBVTT", "NOTE", "STYLE", "Kind:", "Language:")):
                cur.append(line)
    if cur and len(cur) > 1:
        cues.append(cur)
    out = []
    for i, cue in enumerate(cues, 1):
        out.append(str(i))
        out.extend(cue)
        out.append("")
    return "\n".join(out)


def fetch_subs(url, lang, output_dir, instance=None, auto=False):
    """Invidious üzerinden altyazı indirir — instance-proxied captions öncelikli."""
    vid = extract_video_id(url)
    data, inst = _fetch_with_failover(f"/api/v1/videos/{vid}", preferred=instance, timeout=15)
    if not isinstance(data, dict):
        raise RuntimeError(f"Video bulunamadı: {vid}")

    log(f"Invidious subs: {vid} lang={lang} auto={auto} @ {inst}")

    captions = data.get("captions") or []
    want_auto = bool(auto)

    def cap_code(c):
        return c.get("language_code") or c.get("languageCode") or ""

    def cap_is_auto(c):
        k = c.get("kind") or ""
        lbl = (c.get("label") or "").lower()
        return k == "asr" or "auto" in lbl or "otomatik" in lbl

    # İstenen dil + auto bayrağıyla eşleşen caption
    match = None
    for cap in captions:
        if cap_code(cap) != lang:
            continue
        if cap_is_auto(cap) == want_auto:
            match = cap
            break
    if match is None:
        for cap in captions:
            if cap_code(cap) == lang:
                match = cap
                break

    candidates = []
    if match is not None:
        u = _abs_url(inst, match.get("url") or match.get("baseUrl") or "")
        if u:
            candidates.append(u)
    # Timedtext — srv3 (Invidious/YouTube'un varsayılanı) + kind=asr gerekiyorsa
    tt = f"https://www.youtube.com/api/timedtext?lang={urllib_parse.quote(lang)}&v={vid}&fmt=srv3"
    if want_auto:
        tt += "&kind=asr"
    candidates.append(tt)

    content = None
    for cand in candidates:
        try:
            req = Request(cand, headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://www.youtube.com",
            })
            with urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
            if body and body.strip():
                content = body
                break
        except Exception:
            continue
    if content is None:
        raise RuntimeError(f"Altyazı bulunamadı: {lang}" + (" (otomatik)" if want_auto else ""))

    if content.lstrip().startswith("WEBVTT"):
        srt_content = _vtt_to_srt(content)
    else:
        srt_content = _convert_timedtext_to_srt(content)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    title = re.sub(r'[<>:"/\\|?*]', "_", str(data.get("title") or vid)).strip()[:80] or vid
    suffix = f"{lang}.auto" if want_auto else lang
    out_path = out / f"{title} [{vid}].{suffix}.srt"
    with open(out_path, "w", encoding="utf-8-sig") as f:
        f.write(srt_content)

    emit("subs", path=str(out_path), lang=lang, auto=want_auto, instance=inst)


def _convert_timedtext_to_srt(content):
    """YouTube timedtext XML'ini SRT'ye çevirir — srv3 (<p t d>) ve srv1 (<text start dur>) destekler."""
    import xml.etree.ElementTree as ET

    if content.lstrip().startswith("WEBVTT"):
        return _vtt_to_srt(content)

    content = re.sub(r'xmlns="[^"]*"', '', content)
    content = re.sub(r'tts:', '', content)

    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise RuntimeError(f"Altyazı formatı tanınamadı: {e}")

    srt_lines = []
    index = 1

    def add_cue(start_ms, end_ms, text):
        nonlocal index
        text = " ".join(text.split())
        if not text or end_ms <= start_ms:
            return
        srt_lines.append(str(index))
        srt_lines.append(f"{_ms_to_srt_time(start_ms)} --> {_ms_to_srt_time(end_ms)}")
        srt_lines.append(text)
        srt_lines.append("")
        index += 1

    # srv1: <transcript><text start="saniye" dur="saniye">metin</text></transcript>
    texts = root.findall(".//text")
    if texts:
        for t in texts:
            start_s = float(t.get("start", 0) or 0)
            dur_s = float(t.get("dur", 0) or 0)
            raw = "".join(t.itertext())
            add_cue(int(start_s * 1000), int((start_s + dur_s) * 1000), raw)
    else:
        # srv3: <timedtext><body><p t="ms" d="ms"><s>metin</s></p></body></timedtext>
        for p in root.findall(".//body//p"):
            start_ms = int(p.get("t", 0) or 0)
            dur = int(p.get("d", 0) or 0)
            spans = [s.text or "" for s in p.findall(".//s")]
            text = " ".join(spans) if spans else "".join(p.itertext())
            add_cue(start_ms, start_ms + dur, text)

    if not srt_lines:
        raise RuntimeError("Altyazı içeriği boş — başka bir dil deneyin.")
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
_session_instance = None # SID'in ait olduğu instance — başka host'a sızdırılmaz


def set_session(cookie=None, username=None, instance=None):
    """Ana süreçten gelen session'ı kur."""
    global _session_cookie, _session_username, _session_instance
    _session_cookie = cookie or None
    _session_username = username or None
    _session_instance = (instance or None) if cookie else None


def _session_url_ok(url):
    """SID bu URL'nin host'una mı ait? Failover başka instance'a düşerse
    credential sızmasın — SID yalnız kendi instance'ına gider."""
    if not _session_instance:
        return False   # instance bilinmiyorken sızdırmamak güvenli varsayılan
    try:
        return urllib_parse.urlparse(url).netloc == urllib_parse.urlparse(_session_instance).netloc
    except Exception:
        return False


def _auth_headers(url=None):
    """Invidious session cookie'sini ekler.

    url verilirse SID yalnızca kendi instance host'una eklenir (failover
    sızıntısı önlenir). url=None → eski sözleşme: istek zaten oturumlu
    instance'a gidiyor kabul edilir, SID eklenir.
    """
    headers = {"User-Agent": "Mozilla/5.0"}
    if _session_cookie and (url is None or _session_url_ok(url)):
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
    # Instance sürümüne göre alan adı 'email' veya 'email_or_user' olabilir — ikisini de gönder
    fields = urllib_parse.urlencode({
        "email": username,
        "email_or_user": username,
        "password": password,
    })
    body_bytes = fields.encode("utf-8")
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
            set_session(cookie=sid, username=username, instance=inst)
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


# ===== Feed (ana sayfa) =====
_TREND_TABS = ("music", "gaming", "news", "movies")


def _parse_video_item(v):
    """Invidious video objesini ortak şemaya çevirir."""
    return {
        "videoId": v.get("videoId", ""),
        "title": v.get("title", ""),
        "author": v.get("author", ""),
        "authorId": v.get("authorId", ""),
        "authorThumbnails": v.get("authorThumbnails", []),
        "lengthSeconds": _to_int(v.get("lengthSeconds"), 0),
        "viewCount": _to_int(v.get("viewCount"), 0),
        "publishedText": v.get("publishedText", ""),
        "published": _to_int(v.get("published"), 0),
        "liveNow": bool(v.get("liveNow")),
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


def _ytdlp_tab_videos(tab_url, max_results=30):
    """yt-dlp ile gerçek YouTube sekmesi/feed sayfası — arama DEĞİL, gerçek feed.
    ytsearch yedekleri 'trending videos today' gibi meta-sonuçlar üretiyordu;
    burada /feed/trending gibi gerçek sayfanın flat entry'leri alınır."""
    if not _YT_DLP_AVAILABLE:
        raise RuntimeError("yt-dlp mevcut değil")
    ydl_opts = {
        "quiet": True,
        "extract_flat": "in_playlist",
        "skip_download": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "playlistend": max_results,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(tab_url, download=False)
    entries = (info or {}).get("entries") or []
    out = []
    for v in entries:
        if not v or (v.get("_type") or "video") not in ("video", "url"):
            continue
        vid = v.get("id") or ""
        if not vid or len(vid) != 11:
            continue
        thumbs = [{"quality": str(t.get("height") or ""), "url": t.get("url"),
                   "width": int(t.get("width") or 0), "height": int(t.get("height") or 0)}
                  for t in (v.get("thumbnails") or []) if t.get("url")]
        out.append({
            "videoId": vid,
            "title": v.get("title") or "",
            "author": v.get("uploader") or v.get("channel") or "",
            "authorId": v.get("uploader_id") or v.get("channel_id") or "",
            "lengthSeconds": int(v.get("duration") or 0),
            "viewCount": int(v.get("view_count") or 0),
            "publishedText": "",
            "published": int(v.get("timestamp") or 0),
            "liveNow": bool(v.get("live_status") == "is_live"),
            "videoThumbnails": thumbs,
        })
        if len(out) >= max_results:
            break
    return out


def _popular_payload(instance=None):
    """Popüler payload'ı üretir (emit etmez) — feed_home paralel çağırır."""
    try:
        data, inst = _fetch_with_failover("/api/v1/popular", preferred=instance, timeout=10)
        videos = [_parse_video_item(v) for v in (data or [])]
        if videos:
            return {"videos": videos, "instance": inst}
        raise RuntimeError("Invidious popüler boş döndü")
    except Exception as primary:
        log(f"Invidious başarısız, yt-dlp yedek denenecek: {primary}")
        videos = _ytdlp_tab_videos("https://www.youtube.com/feed/trending", max_results=24)
        return {"videos": videos, "instance": "yt-dlp:tab",
                "degraded": True, "source": "yt-dlp"}


def _trending_payload(instance=None, tab=None):
    """Trend payload'ı üretir (emit etmez) — feed_home paralel çağırır."""
    tabs = [tab] if tab else ["music", "gaming", "news", "movies"]
    try:
        all_videos = []
        used_inst = None
        for t in tabs:
            data, inst = _fetch_with_failover(
                f"/api/v1/trending?type={t}", preferred=instance, timeout=10)
            used_inst = used_inst or inst
            if data:
                all_videos.extend([_parse_video_item(v) for v in data])
        if all_videos:
            return {"videos": all_videos, "instance": used_inst, "tab": tab or ""}
        raise RuntimeError("Invidious trend boş döndü")
    except Exception as primary:
        log(f"Invidious başarısız, yt-dlp yedek denenecek: {primary}")
        url = "https://www.youtube.com/feed/trending"
        if tab == "music":
            url += "?bp=4gINGgt5dWQ"
        videos = _ytdlp_tab_videos(url, max_results=24)
        return {"videos": videos, "instance": "yt-dlp:tab", "tab": tab or "",
                "degraded": True, "source": "yt-dlp"}


def feed_popular(instance=None):
    """Popüler videolar — instance failover + yt-dlp yedek."""
    emit("feed", kind="popular", **_popular_payload(instance))


def feed_trending(instance=None, tab=None):
    """Trend videolar — tab verilirse tek kategori, yoksa 4'ü birleşik.
    Instance failover + yt-dlp gerçek-trend yedeği."""
    emit("feed", kind="trending", **_trending_payload(instance, tab))


def feed_home(instance=None):
    """Ana sayfa: popular + trending TEK komutta, iki paralel ağ kolu.
    Ayrı iki süreç yerine tek süreçte ThreadPoolExecutor — Invidious
    failover + yt-dlp yedek mantığı aynı payload fonksiyonlarından gelir."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    results = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(_popular_payload, instance): "popular",
            pool.submit(_trending_payload, instance, None): "trending",
        }
        for future in as_completed(futures):
            section = futures[future]
            results[section] = future.result()
            # A slow trend endpoint must not hold already available cards hostage.
            emit("feed_partial", kind="home", section=section, **results[section])
    # Üst düzey instance: yt-dlp olmayan gerçek instance'ı tercih et
    inst = ""
    for key in ("popular", "trending"):
        cand = results[key].get("instance") or ""
        if cand and not cand.startswith("yt-dlp"):
            inst = cand
            break
    if not inst:
        inst = results["popular"].get("instance") or ""
    emit("feed", kind="home",
         popular=results["popular"], trending=results["trending"],
         instance=inst)


def feed_subscriptions(instance=None):
    """Kullanıcının abonelik feed'i — giriş gerekli (/api/v1/auth/feed)."""
    if not _session_cookie:
        raise RuntimeError("Abonelikler için Invidious hesabına giriş gerekli.")
    # Oturumlu istek failover YAPMAZ — SID yalnız kendi instance'ına gider;
    # başka instance'a düşmek hem credential sızdırır hem yanlış hesap olur.
    inst = _session_instance or instance or find_working_instance()
    log(f"Invidious subscriptions: {inst}")
    try:
        feed_url = f"{inst}/api/v1/auth/feed"
        req = Request(feed_url, headers=_auth_headers(feed_url))
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        videos = [_parse_video_item(v) for v in (data.get("videos") or [])]
        notifications = data.get("notifications", [])
        emit("feed", kind="subscriptions", videos=videos,
             notifications=notifications, instance=inst)
    except HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Oturum süresi dolmuş — yeniden giriş yapın.")
        raise RuntimeError(f"Abonelik feed hatası: HTTP {e.code}")


# ===== Arama =====
def search(query, page=1, instance=None):
    """Invidious arama — instance failover + yt-dlp yedek."""
    try:
        log(f"Invidious search: {query!r}")
        q = urllib_parse.quote(query)
        data, inst = _fetch_with_failover(
            f"/api/v1/search?q={q}&page={_to_int(page, 1)}&type=video",
            preferred=instance, timeout=15)
        videos = []
        for v in (data or []):
            if not isinstance(v, dict):
                continue
            if v.get("type") not in (None, "video"):
                continue
            videos.append(_parse_video_item(v))
        if videos:
            emit("search", query=query, page=_to_int(page, 1), videos=videos, instance=inst)
            return
        raise RuntimeError("Invidious arama boş")
    except Exception as primary:
        log(f"Invidious arama başarısız, yt-dlp yedek: {primary}")
        max_results = 20 * max(1, int(page))
        videos = _ytdlp_search_videos(query, max_results=max_results)
        emit("search", query=query, page=int(page), videos=videos, instance="yt-dlp:ytdlp_search")


def suggest(query, instance=None):
    """Arama önerileri — /api/v1/search/suggestions?q=..."""
    q = (query or "").strip()[:100]
    if not q:
        emit("suggestions", query="", suggestions=[], instance="")
        return
    data, inst = _fetch_with_failover(
        f"/api/v1/search/suggestions?q={urllib_parse.quote(q)}",
        preferred=instance, timeout=8)
    items = data.get("suggestions") if isinstance(data, dict) else data
    out = [str(s).strip()[:120] for s in (items or [])
           if str(s or "").strip()][:10]
    emit("suggestions", query=q, suggestions=out, instance=inst)


# ===== Kanal =====
def channel(channel_id, instance=None):
    """Kanal bilgisi + son videolar — instance failover."""
    data, inst = _fetch_with_failover(
        f"/api/v1/channels/{urllib_parse.quote(channel_id)}",
        preferred=instance, timeout=15)
    if not isinstance(data, dict):
        raise RuntimeError(f"Kanal bulunamadı: {channel_id}")
    log(f"Invidious channel: {channel_id} @ {inst}")
    info = {
        "author": data.get("author", ""),
        "authorId": data.get("authorId", channel_id),
        "authorThumbnails": data.get("authorThumbnails", []),
        "subCount": int(data.get("subCount") or 0),
        "description": (data.get("description") or "")[:500],
    }
    videos = [_parse_video_item(v) for v in (data.get("latestVideos") or [])]
    emit("channel", info=info, videos=videos, instance=inst)


# ===== Yorumlar =====
def _parse_comment(c):
    """Invidious yorum objesini ortak şemaya çevirir — metin HTML olabilir,
    renderer textContent ile basar; burada yalnız etiketleri soyup düz metin
    bırakıyoruz (whitelist whitelist değil, güvenli text render)."""
    import re as _re
    raw = c.get("content") or c.get("contentHtml") or ""
    text = _re.sub(r"<[^>]+>", "", raw)
    text = (text.replace("&amp;", "&").replace("&lt;", "<")
                .replace("&gt;", ">").replace("&quot;", '"')
                .replace("&#39;", "'").strip())
    replies = c.get("replies")
    return {
        "author": c.get("author") or "",
        "authorId": c.get("authorId") or "",
        "text": text[:2000],
        "likeCount": _to_int(c.get("likeCount"), 0),
        "publishedText": c.get("publishedText") or "",
        "replies": _to_int(replies.get("replyCount"), 0) if isinstance(replies, dict) else 0,
    }


def comments(video_url, instance=None, continuation=""):
    """Video yorumları — /api/v1/comments/:id, continuation ile sayfalama."""
    vid = extract_video_id(video_url)
    if not vid:
        raise RuntimeError(f"Geçersiz video ID: {video_url}")
    path = f"/api/v1/comments/{urllib_parse.quote(vid)}"
    if continuation:
        path += f"?continuation={urllib_parse.quote(continuation)}"
    data, inst = _fetch_with_failover(path, preferred=instance, timeout=15)
    if not isinstance(data, dict):
        raise RuntimeError("Yorum yanıtı beklenmeyen biçimde")
    items = [_parse_comment(c) for c in (data.get("comments") or [])
             if isinstance(c, dict)]
    emit("comments", videoId=vid, comments=items,
         continuation=data.get("continuation") or "",
         disabled=bool(data.get("disabled")), instance=inst)


# ===== Oynatma listesi =====
def playlist(playlist_id, instance=None, page=1):
    """Playlist bilgisi + videolar — /api/v1/playlists/:id."""
    pid = (playlist_id or "").strip()
    if not pid or len(pid) > 200 or not all(ch.isalnum() or ch in "-_" for ch in pid):
        raise RuntimeError(f"Geçersiz playlist ID: {playlist_id!r}")
    data, inst = _fetch_with_failover(
        f"/api/v1/playlists/{urllib_parse.quote(pid)}?page={_to_int(page, 1)}",
        preferred=instance, timeout=15)
    if not isinstance(data, dict):
        raise RuntimeError(f"Playlist bulunamadı: {pid}")
    videos = [_parse_video_item(v) for v in (data.get("videos") or [])
              if isinstance(v, dict)]
    emit("playlist", playlistId=pid,
         title=data.get("title") or "",
         author=data.get("author") or "",
         authorId=data.get("authorId") or "",
         videoCount=_to_int(data.get("videoCount"), len(videos)),
         videos=videos, instance=inst)


def main():
    ap = argparse.ArgumentParser(description="Invidious API client")
    ap.add_argument("command", choices=[
        "probe", "subs", "login", "logout",
        "popular", "trending", "subscriptions", "home",
        "search", "suggest", "channel", "comments", "playlist",
    ])
    ap.add_argument("--url", default="", help="YouTube URL veya video ID")
    ap.add_argument("--lang", default="en", help="Altyazı dili kodu")
    ap.add_argument("--auto", action="store_true", help="Otomatik altyazılar dahil")
    ap.add_argument("--instance", default="", help="Invidious instance URL")
    ap.add_argument("--output-dir", default=".", help="Çıktı klasörü")
    ap.add_argument("--username", default="", help="Invidious kullanıcı adı")
    ap.add_argument("--password", default="", help="Invidious şifresi — argv'de görünür; env WHISPER_INVIDIOUS_PASSWORD tercih edilir")
    ap.add_argument("--query", default="", help="Arama terimi")
    ap.add_argument("--page", default="1", help="Arama sayfası")
    ap.add_argument("--channel-id", default="", help="Invidious kanal ID (UCID)")
    ap.add_argument("--sid", default="", help="Invidious SID cookie (env WHISPER_INVIDIOUS_SID da kabul)")
    ap.add_argument("--tab", default="", help="Trend kategorisi: music|gaming|news|movies")
    ap.add_argument("--playlist-id", default="", help="Invidious playlist ID (PLID)")
    ap.add_argument("--continuation", default="", help="Yorum sayfalama continuation token'ı")
    args = ap.parse_args()

    instance = args.instance.strip() if args.instance else None

    # Session — env (süreç listesinde görünmez) veya argv
    sid = os.environ.get("WHISPER_INVIDIOUS_SID", "").strip() or args.sid.strip()
    if sid and args.command not in ("login", "logout"):
        set_session(cookie=sid, instance=instance)

    try:
        if args.command == "probe":
            probe(args.url, instance)
        elif args.command == "subs":
            fetch_subs(args.url, args.lang, args.output_dir, instance, args.auto)
        elif args.command == "login":
            # Şifre env'de taşınır (süreç listesinde görünmesin); argv sadece
            # doğrudan CLI kullanımı için geriye dönük yedek olarak okunur.
            password = os.environ.get("WHISPER_INVIDIOUS_PASSWORD", "") or args.password
            login(args.username, password, instance)
        elif args.command == "logout":
            logout()
        elif args.command == "popular":
            feed_popular(instance)
        elif args.command == "trending":
            tab = args.tab.strip().lower()
            feed_trending(instance, tab=tab if tab in _TREND_TABS else None)
        elif args.command == "subscriptions":
            feed_subscriptions(instance)
        elif args.command == "home":
            feed_home(instance)
        elif args.command == "search":
            search(args.query, args.page, instance)
        elif args.command == "suggest":
            suggest(args.query, instance)
        elif args.command == "channel":
            channel(args.channel_id, instance)
        elif args.command == "comments":
            comments(args.url, instance, continuation=args.continuation.strip())
        elif args.command == "playlist":
            playlist(args.playlist_id, instance, page=args.page)
    except Exception as e:
        emit("error", message=str(e))


if __name__ == "__main__":
    main()
