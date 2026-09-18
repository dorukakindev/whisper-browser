#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube OAuth (cihaz kodu akışı) + InnerTube kişisel feed köprüsü.

SmartTube'un TV'de kullandığı yöntemin masaüstü karşılığı:
  1) device_code  → oauth2.googleapis.com/device/code → ekranda kullanıcı kodu
  2) poll         → kullanıcı google.com/device'ta onaylayana dek token polling
  3) refresh      → access_token yenileme (refresh_token env'den gelir)
  4) browse       → youtubei/v1/browse (FEsubscriptions vb.) Bearer token ile
  5) me           → youtube/v3/channels?mine=true → gösterim adı
  6) revoke       → oauth2.googleapis.com/revoke → çıkış

Sözleşme (NDJSON, invidious.py ile aynı):
  emit(type, ...) → {"type": ..., ...} satırı
  main.js yalnız YOUTUBE_RESULT_TYPES içindeki tipleri sonuç kabul eder.

Gizli değerler ASLA argv'den geçmez — env kanalı:
  WHISPER_YT_CLIENT_SECRET  (OAuth client secret)
  WHISPER_YT_DEVICE_CODE    (poll için)
  WHISPER_YT_ACCESS_TOKEN   (browse/me/revoke için)
  WHISPER_YT_REFRESH_TOKEN  (refresh için)
"""
import sys
import os
import json
import re
import time
import argparse
import threading
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

OAUTH_DEVICE = "https://oauth2.googleapis.com/device/code"
OAUTH_TOKEN = "https://oauth2.googleapis.com/token"
OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke"
YTV3_CHANNELS = "https://www.googleapis.com/youtube/v3/channels"
YTI_BROWSE = "https://www.youtube.com/youtubei/v1/browse"
YOUTUBE_HOME = "https://www.youtube.com/"

# Salt-okuma kapsamı — abonelik feed'i, öneriler, geçmiş için yeterli.
# Yazma (beğeni/abone ol) ileride eklenecekse scope genişletilir.
OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"

# youtube.com HTML'inden çıkarılamazsa bilinen genel web istemcisi anahtarı.
INNERTUBE_KEY_FALLBACK = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
INNERTUBE_CLIENT = {"clientName": "WEB", "clientVersion": "2.20250101.00.00"}

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
_YP = {
    "Accept": "application/json",
    "User-Agent": _UA,
    "Accept-Language": "tr,en;q=0.9",
}

_emit_lock = threading.Lock()


def emit(ev_type, **kwargs):
    line = json.dumps({"type": ev_type, **kwargs}, ensure_ascii=False)
    with _emit_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log(message, level="info"):
    emit("log", level=level, message=str(message))


def _post_form(url, fields, timeout=15, headers=None):
    body = urlencode(fields).encode("utf-8")
    req = Request(url, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        **(headers or {}),
    })
    try:
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace")), None
    except HTTPError as e:
        try:
            return None, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return None, {"error": f"http_{e.code}", "error_description": str(e)}
    except (URLError, OSError) as e:
        return None, {"error": "network", "error_description": str(e)}


def _post_json(url, payload, access_token="", timeout=20):
    req = Request(url, data=json.dumps(payload).encode("utf-8"), headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": _UA,
        **({"Authorization": f"Bearer {access_token}"} if access_token else {}),
    })
    try:
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace")), None
    except HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:600]
        return None, f"HTTP {e.code}: {raw[:200]}"
    except (URLError, OSError) as e:
        return None, str(e)


# ---------------------------------------------------------------- OAuth akışı

def device_code(client_id):
    """Adım 1 — cihaz kodu üretir; kullanıcı kodu ekrana basılır."""
    data, err = _post_form(OAUTH_DEVICE, {
        "client_id": client_id,
        "scope": OAUTH_SCOPE,
    })
    if err or not data:
        raise RuntimeError("Cihaz kodu alınamadı: "
                           + (err or {}).get("error_description", str(err)))
    emit("device_code",
         device_code=data["device_code"],
         user_code=data["user_code"],
         verification_url=data.get("verification_url", "https://www.google.com/device"),
         expires_in=data.get("expires_in", 1800),
         interval=data.get("interval", 5))


def poll(client_id, expires_in=1800, interval=5):
    """Adım 2 — kullanıcı onaylayana dek token endpoint'ini yoklar."""
    client_secret = os.environ.get("WHISPER_YT_CLIENT_SECRET", "")
    device = os.environ.get("WHISPER_YT_DEVICE_CODE", "")
    if not device:
        raise RuntimeError("Device code eksik — önce device_code çalıştırın.")
    deadline = time.time() + max(60, int(expires_in))
    delay = max(3, int(interval))
    while time.time() < deadline:
        time.sleep(delay)
        data, err = _post_form(OAUTH_TOKEN, {
            "client_id": client_id,
            "client_secret": client_secret,
            "device_code": device,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        })
        if data and data.get("access_token"):
            user = _fetch_me(data["access_token"]) or {}
            emit("login",
                 access_token=data["access_token"],
                 refresh_token=data.get("refresh_token", ""),
                 expires_in=data.get("expires_in", 3600),
                 user_name=user.get("name", ""),
                 user_email=user.get("email", ""))
            return
        code = (err or {}).get("error", "")
        if code == "authorization_pending":
            log("Onay bekleniyor…")
            continue
        if code == "slow_down":
            delay += 5
            continue
        if code in ("expired_token", "access_denied", "invalid_grant"):
            raise RuntimeError({
                "expired_token": "Kodun süresi doldu — yeniden kod üretin.",
                "access_denied": "Kullanıcı erişimi reddetti.",
                "invalid_grant": "Geçersiz cihaz kodu — yeniden başlatın.",
            }[code])
        raise RuntimeError(f"Token hatası: {code or err}")
    raise RuntimeError("Kodun süresi doldu — yeniden kod üretin.")


def refresh(client_id):
    """access_token yeniler; refresh_token env'den."""
    client_secret = os.environ.get("WHISPER_YT_CLIENT_SECRET", "")
    refresh_token = os.environ.get("WHISPER_YT_REFRESH_TOKEN", "")
    if not refresh_token:
        raise RuntimeError("Refresh token yok — yeniden giriş gerekli.")
    data, err = _post_form(OAUTH_TOKEN, {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })
    if err or not data or not data.get("access_token"):
        code = (err or {}).get("error", "")
        if code in ("invalid_grant", "unauthorized_client"):
            raise RuntimeError("Oturum düştü — yeniden giriş gerekli (invalid_grant).")
        raise RuntimeError(f"Token yenileme hatası: {code or err}")
    emit("token",
         access_token=data["access_token"],
         expires_in=data.get("expires_in", 3600))


def revoke():
    token = os.environ.get("WHISPER_YT_ACCESS_TOKEN", "") \
        or os.environ.get("WHISPER_YT_REFRESH_TOKEN", "")
    if token:
        _post_form(OAUTH_REVOKE, {"token": token}, timeout=10)
    emit("revoked")


def _fetch_me(access_token):
    """Kanal adı/e-posta görünümü — youtube.readonly scope yeterli."""
    req = Request(f"{YTV3_CHANNELS}?part=snippet&mine=true",
                  headers={"Authorization": f"Bearer {access_token}",
                           "Accept": "application/json"})
    try:
        with urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        items = data.get("items") or []
        if items:
            snip = items[0].get("snippet") or {}
            return {"name": snip.get("title", ""), "email": ""}
    except Exception:
        pass
    return None


# --------------------------------------------------------------- InnerTube

_innertube_key = ""


def _get_innertube_key():
    """API anahtarını youtube.com HTML'inden çıkarır; süreç-içi cache."""
    global _innertube_key
    if _innertube_key:
        return _innertube_key
    try:
        req = Request(YOUTUBE_HOME, headers={"User-Agent": _UA})
        with urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", "replace")
        m = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
        if m:
            _innertube_key = m.group(1)
            return _innertube_key
    except Exception as e:
        log(f"InnerTube anahtarı sayfadan alınamadı ({e}); yedek anahtar.", level="warn")
    _innertube_key = INNERTUBE_KEY_FALLBACK
    return _innertube_key


def _walk(obj):
    """Derin JSON dolaşımı — dict listelerini rekürsif verir."""
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v)


def _runs_text(node):
    if not isinstance(node, dict):
        return ""
    if "simpleText" in node:
        return node["simpleText"] or ""
    runs = node.get("runs") or []
    return "".join(r.get("text", "") for r in runs if isinstance(r, dict))


def _runs_link(node):
    """runs[0].navigationEndpoint.browseEndpoint.browseId (kanal ID)."""
    try:
        return (node["runs"][0]["navigationEndpoint"]
                ["browseEndpoint"]["browseId"])
    except Exception:
        return ""


def _length_seconds(text):
    parts = [p for p in (text or "").split(":") if p.strip().isdigit()]
    if not parts:
        return 0
    sec = 0
    for p in parts:
        sec = sec * 60 + int(p)
    return sec


def _view_count(text):
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else 0


def _vr_to_card(vr):
    """InnerTube videoRenderer → SmartTube kart şeması."""
    vid = vr.get("videoId") or ""
    if not vid:
        return None
    owner = vr.get("ownerText") or vr.get("shortBylineText") or {}
    thumbs = (vr.get("thumbnail") or {}).get("thumbnails") or []
    thumb_url = ""
    if thumbs:
        # ~320 genişlik tercih et; yoksa son (en büyük) aday
        mid = [t for t in thumbs if 240 <= (t.get("width") or 0) <= 480]
        pick = mid[0] if mid else thumbs[-1]
        thumb_url = pick.get("url", "")
    live = False
    for node in _walk(vr):
        style = node.get("style")
        if isinstance(style, str) and style.upper() == "LIVE":
            live = True
            break
    return {
        "videoId": vid,
        "title": _runs_text(vr.get("title")),
        "author": _runs_text(owner),
        "authorId": _runs_link(owner),
        "publishedText": _runs_text(vr.get("publishedTimeText")),
        "lengthSeconds": _length_seconds(_runs_text(vr.get("lengthText"))),
        "viewCount": _view_count(_runs_text(
            vr.get("viewCountText") or vr.get("shortViewCountText"))),
        "videoThumbnails": ([{"url": thumb_url, "quality": "medium"}]
                            if thumb_url else []),
        "liveNow": live,
    }


def browse(browse_id, continuation=""):
    """youtubei/v1/browse — kişisel feed (FEsubscriptions vb.)."""
    token = os.environ.get("WHISPER_YT_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("Access token yok — giriş gerekli.")
    key = _get_innertube_key()
    ctx = {"context": {"client": dict(INNERTUBE_CLIENT)}}
    if continuation:
        ctx["continuation"] = continuation
    else:
        ctx["browseId"] = browse_id
    data, err = _post_json(f"{YTI_BROWSE}?key={key}", ctx, access_token=token)
    if err or not data:
        raise RuntimeError(f"YouTube feed alınamadı: {err}")
    videos = []
    next_cont = ""
    for node in _walk(data):
        vr = node.get("videoRenderer")
        if isinstance(vr, dict):
            card = _vr_to_card(vr)
            if card:
                videos.append(card)
            continue
        cmd = node.get("continuationCommand")
        if isinstance(cmd, dict) and cmd.get("token"):
            next_cont = cmd["token"]  # en sondaki geçerli
    emit("feed", kind="youtube", browse_id=browse_id,
         videos=videos, continuation=next_cont,
         instance="youtube.com")


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=[
        "device_code", "poll", "refresh", "browse", "me", "revoke",
    ])
    ap.add_argument("--client-id", default="")
    ap.add_argument("--browse-id", default="FEsubscriptions")
    ap.add_argument("--continuation", default="")
    ap.add_argument("--expires-in", type=int, default=1800)
    ap.add_argument("--interval", type=int, default=5)
    args = ap.parse_args()

    # Browse ID beyaz liste — rastgele içerik yerine bilinen kişisel akışlar
    allowed_browse = {"FEsubscriptions", "FEwhat_to_watch", "FElibrary",
                      "FEhistory", "VLWL", "VLLL"}
    try:
        if args.command == "device_code":
            if not args.client_id:
                raise RuntimeError("--client-id gerekli.")
            device_code(args.client_id)
        elif args.command == "poll":
            if not args.client_id:
                raise RuntimeError("--client-id gerekli.")
            poll(args.client_id, expires_in=args.expires_in, interval=args.interval)
        elif args.command == "refresh":
            refresh(args.client_id)
        elif args.command == "browse":
            bid = args.browse_id.strip()
            if bid not in allowed_browse:
                raise RuntimeError(f"Desteklenmeyen browse_id: {bid}")
            browse(bid, continuation=args.continuation)
        elif args.command == "me":
            token = os.environ.get("WHISPER_YT_ACCESS_TOKEN", "")
            user = _fetch_me(token) if token else None
            emit("me", user_name=(user or {}).get("name", ""))
        elif args.command == "revoke":
            revoke()
    except Exception as e:
        emit("error", message=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
