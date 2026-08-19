"""
Whisper Altyazı - Backend Transcribe Script
RTX 4070 Ti için optimize edilmiş yüksek kaliteli altyazı çıkarma motoru.

Electron'dan argparse ile çağrılır. Her ilerleme/sonuç olayını stdout'a
JSON satırları olarak basar (NDJSON), böylece UI gerçek zamanlı takip edebilir.
"""

import argparse
import json
import os
import re
# PyTorch'u en bas başta yükle (DLL çakışmalarını önlemek için)
try:
    import torch
except ImportError:
    pass
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import warnings
from pathlib import Path


# UTF-8 stdout (Windows'ta Türkçe karakter sorunları için)
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)

# HuggingFace sembolik bağlantı uyarısı (Windows'ta gereksiz)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")  # tqdm "Loading weights" çubuklarını kapat
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
# torch/transformers'tan gelen önemsiz UserWarning'leri kapat
warnings.filterwarnings("ignore", category=UserWarning, module="huggingface_hub")
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning, module="transformers")
# tqdm'i tamamen kapat — stderr'e progress bar basmasın
try:
    from tqdm import tqdm as _tqdm_orig
    import functools as _ft
    _tqdm_orig.__init__ = _ft.partialmethod(_tqdm_orig.__init__, disable=True)
except Exception:
    pass


def emit(event_type, **payload):
    """Olayı stdout'a JSON satırı olarak yaz."""
    msg = {"type": event_type, **payload}
    print(json.dumps(msg, ensure_ascii=False), flush=True)


def log(message, level="info"):
    emit("log", level=level, message=message)


def find_ffmpeg():
    """
    ffmpeg binary'sinin TAM yolunu bul (PATH veya backend/bin).
    yt-dlp ffmpeg_location parametresi tam yol bekler; sadece komut adı yetmez.
    """
    script_dir = Path(__file__).parent
    # Önce yerel bin klasörlerinde ara
    local_candidates = [
        script_dir / "bin" / "ffmpeg.exe",
        script_dir.parent / "bin" / "ffmpeg.exe",
    ]
    for c in local_candidates:
        if c.exists():
            try:
                subprocess.run(
                    [str(c), "-version"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=True,
                )
                return str(c)
            except (FileNotFoundError, subprocess.CalledProcessError):
                continue

    # PATH'de ara — shutil.which TAM yolu döndürür
    found = shutil.which("ffmpeg")
    if found:
        try:
            subprocess.run(
                [found, "-version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return found
        except (FileNotFoundError, subprocess.CalledProcessError):
            pass

    return None


def download_youtube(url, output_dir, ffmpeg_path=None, clip_start=None, clip_end=None):
    """
    yt-dlp ile YouTube'dan ses indir (en yüksek kalite, wav formatında).

    clip_start ve clip_end'in İKİSİ de verilirse yalnızca o aralık indirilir
    (download_ranges) — uzun videodan kısa bölüm alırken tüm videoyu indirmekten
    kaçınır. Bu durumda çıktı 0'a sıfırlanır (dosya içi t=0 → orijinal clip_start).
    Tek sınır verilirse aralık indirme atlanır (çağıran taraf ffmpeg ile kırpar).
    Dönüş: (dosya_yolu, başlık, ranged_indi_mi)
    """
    try:
        import yt_dlp
    except ImportError:
        raise RuntimeError(
            "yt-dlp yüklü değil. Lütfen 'pip install yt-dlp' komutunu çalıştırın."
        )

    output_template = str(Path(output_dir) / "%(id)s.%(ext)s")
    ranged = clip_start is not None and clip_end is not None

    info_holder = {}

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            pct = (downloaded / total * 100) if total else 0
            emit(
                "download_progress",
                percent=round(pct, 1),
                speed=d.get("speed"),
                eta=d.get("eta"),
            )
        elif d.get("status") == "finished":
            emit("download_progress", percent=100.0)
            info_holder["filename"] = d.get("filename")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        # YouTube artık oynatıcı imzalarını harici bir JS çalışma zamanıyla
        # çözmeyi gerektiriyor. Node uygulamanın zaten zorunlu bağımlılığıdır;
        # yt-dlp-ejs ise install.bat ile yt-dlp[default] içinden kurulur.
        "js_runtimes": {"node": {}},
        "progress_hooks": [progress_hook],
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            }
        ],
    }
    if ranged:
        from yt_dlp.utils import download_range_func
        # force_keyframes_at_cuts: kesim noktasını örnek-hassas yapar ve çıktıyı 0'a sıfırlar
        ydl_opts["download_ranges"] = download_range_func(None, [(clip_start, clip_end)])
        ydl_opts["force_keyframes_at_cuts"] = True
        log(f"Yalnızca seçilen aralık indiriliyor: {clip_start:.1f}s → {clip_end:.1f}s")
    if ffmpeg_path:
        ffmpeg_dir = str(Path(ffmpeg_path).parent)
        ydl_opts["ffmpeg_location"] = ffmpeg_dir
        # ffprobe da gerekli (yt-dlp postprocessor için) — aynı klasörde olmalı
        ffprobe_path = Path(ffmpeg_dir) / "ffprobe.exe"
        if not ffprobe_path.exists():
            log(f"⚠ ffprobe bulunamadı: {ffprobe_path} — yt-dlp postprocess hata verebilir", "warn")
        log(f"yt-dlp için ffmpeg klasörü: {ffmpeg_dir}")

    log(f"YouTube'dan indiriliyor: {url}")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_id = info.get("id") or "audio"
        title = info.get("title") or video_id
        
        # Öncelikle yt-dlp'nin indirdiği/post-process ettiği nihai konumu tespit etmeye çalış
        wav_path = None
        requested_downloads = info.get("requested_downloads")
        if requested_downloads and len(requested_downloads) > 0:
            final_path = requested_downloads[0].get("filepath")
            if final_path and Path(final_path).exists():
                wav_path = Path(final_path)

        # Bulunamadıysa klasik uzantı taraması yap
        if not wav_path or not wav_path.exists():
            wav_path = Path(output_dir) / f"{video_id}.wav"
            if not wav_path.exists():
                for ext in ("m4a", "webm", "mp3", "opus", "mp4"):
                    alt = Path(output_dir) / f"{video_id}.{ext}"
                    if alt.exists():
                        wav_path = alt
                        break
        log(f"İndirme tamamlandı: {title}")
        return str(wav_path), title, ranged


def parse_timecode(value):
    """
    "90", "1:30", "01:02:03" veya "1:30.5" biçimindeki zamanı saniyeye çevirir.
    Boş/None → None. Geçersiz biçim → RuntimeError.
    """
    s = (value or "").strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) > 3:
        raise RuntimeError(f"Geçersiz zaman biçimi: '{value}' (örn: 90, 1:30 veya 01:02:03)")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        raise RuntimeError(f"Geçersiz zaman biçimi: '{value}' (örn: 90, 1:30 veya 01:02:03)")
    seconds = 0.0
    for n in nums:
        seconds = seconds * 60 + n
    if seconds < 0:
        raise RuntimeError(f"Zaman negatif olamaz: '{value}'")
    return seconds


def probe_duration(media_path, ffmpeg_path):
    """ffprobe ile medya süresini (saniye) döndür; başarısızsa None."""
    ffprobe = Path(ffmpeg_path).parent / "ffprobe.exe"
    if not ffprobe.exists():
        found = shutil.which("ffprobe")
        if not found:
            return None
        ffprobe = Path(found)
    try:
        proc = subprocess.run(
            [str(ffprobe), "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(media_path)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        return float(proc.stdout.strip())
    except (ValueError, OSError):
        return None


def extract_audio(input_path, output_wav, ffmpeg_path, clip_start=None, clip_end=None, audio_track=-1):
    """
    ffmpeg ile videodan 16kHz mono WAV ses çıkar (isteğe bağlı zaman aralığı).

    audio_track >= 0 ise o ses akışı seçilir (`-map 0:a:N`, N = ses-göreli indeks).
    Filmlerde birden çok ses kanalı (orijinal dil / dublaj / yorum) olabilir; -1
    ffmpeg'in varsayılan kanalını kullanır.
    """
    log(f"Ses çıkarılıyor: {Path(input_path).name}")
    cmd = [
        ffmpeg_path,
        "-y",
        "-i", str(input_path),
    ]
    # -ss/-to girdiden SONRA: çıkış araması örnek-hassas (keyframe kaymasız)
    if clip_start is not None:
        cmd += ["-ss", str(clip_start)]
    if clip_end is not None:
        cmd += ["-to", str(clip_end)]
    if audio_track is not None and audio_track >= 0:
        cmd += ["-map", f"0:a:{audio_track}"]
    cmd += [
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(output_wav),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg hatası: {proc.stderr[-500:]}")
    # ffmpeg 0 dönse bile çıktı boş olabilir (ör. dosyada ses akışı yoksa)
    out = Path(output_wav)
    if not out.exists() or out.stat().st_size < 1000:
        raise RuntimeError(
            "Ses çıkarılamadı: çıktı boş. Dosyada ses akışı olmayabilir veya format desteklenmiyor."
        )
    log("Ses çıkarma tamamlandı")
    return output_wav


def format_srt_time(seconds):
    if seconds < 0:
        seconds = 0
    # Tamsayı ms aritmetiği: yuvarlama taşması saniyeye/dakikaya doğru taşar
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def format_vtt_time(seconds):
    if seconds < 0:
        seconds = 0
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def wrap_text(text, max_line_width=42, max_lines=2, language="tr", wrap_mode="sentence"):
    """
    Altyazıyı satırlara böl. Üç mod:

    wrap_mode="none": Hiç kırma, her altyazıyı tek satır olarak bırak.

    wrap_mode="sentence" (varsayılan): Cümle ortasında ASLA kırma. Yeni satır
    SADECE cümle sonu noktalama (. ! ?) görünce başlar. Tek cümle ne kadar
    uzunsa o kadar — tek satır olarak kalır.

    wrap_mode="balanced": Eski davranış — max_line_width'i aşan cümleleri
    dengeli iki satıra böler (Knuth-Plass tarzı puanlama).
    """
    text = text.strip()
    if not text:
        return text

    if wrap_mode == "none":
        return " ".join(text.split())

    if wrap_mode == "sentence":
        # Sadece cümle sonu noktalamalarda satır kır — cümleyi asla kesme
        words = text.split()
        if not words:
            return text
        lines = []
        current = []
        for w in words:
            current.append(w)
            if w.endswith(tuple(PUNCT_END)) and not is_abbreviation(w) and len(current) < len(words):
                lines.append(" ".join(current))
                current = []
        if current:
            lines.append(" ".join(current))
        # Tek bir cümle varsa zaten tek satır — kırma yok
        return "\n".join(lines)

    # ---- balanced modu ----
    if max_line_width <= 0 or len(text) <= max_line_width:
        return text

    balanced = balanced_two_line_break(text, max_line_width=max_line_width, language=language)
    if balanced is not None and balanced.count("\n") <= max_lines - 1:
        return balanced

    # Yedek: cümle sonu / virgül / kelime sınırı sıralamasıyla kaydır
    tokens = []
    for word in text.split():
        end = word[-1] if word else ""
        if end in PUNCT_END:
            tokens.append((word, 3))
        elif end in PUNCT_SOFT:
            tokens.append((word, 2))
        else:
            tokens.append((word, 0))

    lines = []
    current = []
    current_len = 0

    i = 0
    while i < len(tokens):
        word, weight = tokens[i]
        candidate = current_len + (1 if current else 0) + len(word)

        if candidate <= max_line_width:
            current.append(word)
            current_len = candidate
            if weight == 3 and i + 1 < len(tokens):
                lines.append(" ".join(current))
                current = []
                current_len = 0
            i += 1
        else:
            if current:
                lines.append(" ".join(current))
                current = []
                current_len = 0
            else:
                lines.append(word)
                i += 1

    if current:
        lines.append(" ".join(current))

    return "\n".join(lines)


PUNCT_END = ".!?…।。！？"
PUNCT_SOFT = ",;:،，؛"

# Nokta ile biten ama cümleyi BİTİRMEYEN kısaltmalar. "Mrs. Dolly" / "L.A. County"
# gibi yerlerde cümle bölmeyi engeller (sonraki kelime büyük harfle başladığı için
# aksi halde yeni cümle sanılıyordu).
ABBREVIATIONS = {
    # İngilizce unvan / kısaltma
    "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "rev", "gen", "col",
    "lt", "sgt", "capt", "cmdr", "det", "insp", "gov", "sen", "rep", "pres",
    "hon", "atty", "supt", "messrs", "mt", "ft", "ave", "blvd", "rd",
    "vs", "etc", "inc", "ltd", "co", "corp", "dept", "est", "approx",
    "e.g", "i.e", "a.m", "p.m", "ph.d", "m.d", "b.a", "m.a",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct",
    "nov", "dec",
    # Türkçe unvan / kısaltma
    "sn", "bay", "bn", "av", "doç", "yrd", "öğr", "gör", "arş", "müh",
    "vb", "örn", "bkz", "yy", "cad", "sok", "mah", "apt", "tel", "çev",
    "hz", "alb", "yzb", "tğm", "krş", "age",
}
# NOT: "no." bilinçli olarak listede yok — "Oh, no." gibi gerçek cümle sonları var.

# "L.A.", "U.S.", "J.F.K." gibi baş harf dizileri
_INITIALISM_RE = re.compile(r"^(?:[^\W\d_]\.){2,}$", re.UNICODE)
# "J." gibi tek baş harf (isim kısaltması)
_SINGLE_INITIAL_RE = re.compile(r"^[^\W\d_]\.$", re.UNICODE)
# "1." / "19." gibi sıra sayıları (Türkçe'de çok yaygın: "2. Dünya Savaşı")
_ORDINAL_RE = re.compile(r"^\d+\.$")

# Sıra sayısını noktayla yazan diller. İngilizcede "He died in 1935." gerçek bir cümle
# sonudur; Türkçede "2. Dünya Savaşı" değildir — bu yüzden kural dile bağlı.
_ORDINAL_LANGS = {"tr", "de", "cs", "da", "et", "fi", "hr", "hu", "is", "lv", "nb", "nn",
                  "no", "pl", "sk", "sl", "sv"}
_ordinal_as_abbrev = True  # transcribe() dil tespitinden sonra set_language_conventions ile ayarlar


def set_language_conventions(language):
    """Dile bağlı noktalama kurallarını ayarla (şimdilik sıra sayısı noktası)."""
    global _ordinal_as_abbrev
    _ordinal_as_abbrev = (language or "").lower().split("-")[0] in _ORDINAL_LANGS
    return _ordinal_as_abbrev


def is_abbreviation(word, ordinal=None):
    """
    Kelime nokta ile bitiyor ama cümle sonu DEĞİL mi? (kısaltma / baş harf / sıra sayısı)
    Etrafındaki tırnak-parantez temizlenir; "Mrs." → True, "man." → False.

    ordinal: "1935." gibi rakam+nokta sıra sayısı sayılsın mı? None ise dile göre
    (bkz. set_language_conventions). Metnin EN SONUNDAKİ kelime için çağıranlar
    ordinal=False verir — orada rakam+nokta neredeyse her zaman gerçek cümle sonudur.
    """
    w = (word or "").strip().strip("\"'“”‘’()[]«»")
    if not w.endswith("."):
        return False
    if ordinal is None:
        ordinal = _ordinal_as_abbrev
    if _INITIALISM_RE.match(w) or (ordinal and _ORDINAL_RE.match(w)):
        return True
    # Tek baş harf yalnızca BÜYÜK harfse kısaltmadır ("J. Edgar"); küçük harf değil
    if _SINGLE_INITIAL_RE.match(w) and w[0].isupper():
        return True
    return w[:-1].lower() in ABBREVIATIONS


def text_ends_sentence(text):
    """Metin gerçekten bir cümle sonu ile mi bitiyor? (kısaltma sayılmaz)"""
    t = (text or "").strip().rstrip("\"'“”‘’)]»")
    if not t:
        return False
    if not t.endswith(tuple(PUNCT_END)):
        return False
    last_word = t.split()[-1] if t.split() else t
    # Metin sonunda rakam+nokta sıra sayısı değil, cümle sonudur ("He died in 1935.")
    return not is_abbreviation(last_word, ordinal=False)


def _flush_chunk(words):
    if not words:
        return None
    # Bazı kelimelerin start/end'i None olabilir (faster-whisper nadiren); ilk geçerli
    # start ve son geçerli end'i kullan ki alt-parçalar segment geneline çökmesin.
    start = next((w.start for w in words if w.start is not None), None)
    end = next((w.end for w in reversed(words) if w.end is not None), None)
    text = "".join(w.word for w in words).strip()
    return (start, end, text)


def has_enough_punctuation(text, min_ratio=0.04):
    """
    Metinde yeterince cümle-sonu noktalama var mı?
    Whisper bazen noktalama üretmez — bu durumda zamanlama-bazlı bölmeye düşeriz.
    """
    if not text:
        return True
    words = text.split()
    if len(words) < 6:
        return True  # çok kısa metin için kontrol gereksiz
    # Cümle sonu noktalama ile biten (kısaltma olmayan) en az bir kelime varsa
    # cümle bölme kullan — "Mr. Smith and Mrs. Jones" tek başına yeterli sayılmaz
    end_count = sum(
        1 for w in words
        if w.rstrip(",;:").endswith(tuple(PUNCT_END)) and not is_abbreviation(w)
    )
    return end_count > 0


def punctuation_ratio(entries):
    """Bloklardaki kelimelerin kaçta kaçı cümle sonu noktalaması ile bitiyor? (kısaltma sayılmaz)"""
    words = []
    for item in entries:
        text = item[2] if isinstance(item, (list, tuple)) else item
        words.extend((text or "").split())
    if not words:
        return 0.0
    ends = sum(
        1 for w in words
        if w.rstrip("\"'“”’)]»").endswith(tuple(PUNCT_END)) and not is_abbreviation(w)
    )
    return ends / len(words)


def find_unpunctuated_spans(entries, min_words=80, min_dur=15.0, join_gap=10.0,
                            max_comma_ratio=0.015, max_cap_ratio=0.10):
    """
    Cümle sonu noktalaması olmayan uzun bölgelerin (start, end) aralıklarını bulur.
    Whisper uzun videolarda bir noktadan sonra noktalamayı tamamen bırakabiliyor;
    bu bölgeler cümle bölme için kullanılamaz hale geliyor.

    Uzun ama düzgün bir cümle ile gerçek çöküşü ayırmak için nokta yokluğu tek başına
    yetmez: gerçek çöküşte virgül ve büyük harf de kaybolur. Ölçülen örnekler —
    Popol Vuh çöküşü 0.000 virgül/kelime + %1 büyük harf, uzun-cümle vakası (Loch Ness)
    0.021 + %14, sağlam metin 0.068 + %90.

    min_words       : bir bölgeyi "çökmüş" saymak için gereken kesintisiz kelime sayısı
    min_dur         : bundan kısa aralıklar yeniden çevirmeye değmez (sn)
    join_gap        : birbirine bu kadar yakın aralıklar tek parça olarak birleştirilir (sn)
    max_comma_ratio : kelime başına virgül bundan fazlaysa metin sağlıklı sayılır
    max_cap_ratio   : büyük harfle başlayan blok oranı bundan fazlaysa sağlıklı sayılır
    """
    spans = []
    start = None
    words = 0
    last_end = None
    for s, e, t in entries:
        if start is None:
            start = float(s)
            words = 0
        words += len((t or "").split())
        last_end = float(e)
        if text_ends_sentence(t):
            if words >= min_words:
                spans.append((start, float(e)))
            start = None
            words = 0
    if start is not None and words >= min_words and last_end is not None:
        spans.append((start, last_end))

    # Yakın aralıkları birleştir, çok kısaları at
    merged = []
    for s, e in spans:
        if merged and s - merged[-1][1] <= join_gap:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    # Yalnızca gerçekten "çökmüş" görünenleri bırak (virgül + büyük harf de kaybolmuş)
    out = []
    for s, e in merged:
        if (e - s) < min_dur:
            continue
        inside = [x for x in entries if s <= (x[0] + x[1]) / 2 <= e]
        if not inside:
            continue
        n_words = sum(len((t or "").split()) for _, _, t in inside)
        commas = sum((t or "").count(",") for _, _, t in inside)
        caps = sum(1 for _, _, t in inside if (t or "").strip()[:1].isupper())
        if n_words and commas / n_words > max_comma_ratio:
            continue
        if caps / len(inside) > max_cap_ratio:
            continue
        out.append((s, e))
    return out


def _cut_wav(src_wav, dst_wav, start, end, ffmpeg_path):
    """WAV'dan [start, end) aralığını 16kHz mono olarak keser (örnek-hassas arama)."""
    cmd = [
        ffmpeg_path, "-y", "-i", str(src_wav),
        "-ss", f"{max(0.0, start):.3f}", "-to", f"{max(0.0, end):.3f}",
        "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst_wav),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg kesme hatası: {proc.stderr[-300:]}")
    out = Path(dst_wav)
    if not out.exists() or out.stat().st_size < 1000:
        raise RuntimeError("Kesilen ses boş çıktı")
    return str(dst_wav)


# Noktalamayı yeniden tetiklemek için örnek metin (initial_prompt olarak verilir)
PUNCT_PRIMER = {
    "tr": "Merhaba. Bu, düzgün noktalanmış bir metindir; virgüller, noktalar ve soru "
          "işaretleri içerir. Öyle değil mi? Evet, kesinlikle.",
    "en": "Hello. This is a properly punctuated transcript, with commas, periods, and "
          "question marks. Isn't it? Yes, indeed.",
}


def recover_punctuation_collapse(entries, all_words, model, wav_path, ffmpeg_path, common,
                                 args, language, time_offset, workdir,
                                 min_words=80, max_spans=8, max_ratio_of_audio=0.6):
    """
    Whisper'ın noktalamayı bıraktığı bölgeleri, "önceki bağlamı kullan" KAPALI olarak
    yeniden çevirip yerine koyar. Bağlam zinciri kırıldığı için model genelde
    noktalamaya geri döner. Yalnızca noktalama oranı gerçekten arttıysa kabul edilir —
    aksi halde eski bloklar korunur (asla kötüleştirmez).

    entries/all_words: orijinal zaman ekseninde (time_offset uygulanmış)
    Döner: (entries, all_words, düzeltilen_bölge_sayısı)
    """
    spans = find_unpunctuated_spans(entries, min_words=min_words)
    if not spans:
        return entries, all_words, 0

    audio_dur = max(0.001, entries[-1][1] - entries[0][0])
    total_span = sum(e - s for s, e in spans)
    if total_span > audio_dur * max_ratio_of_audio:
        log(
            f"Noktalama onarımı: bozuk bölge çok geniş ({total_span/60:.0f} dk / "
            f"{audio_dur/60:.0f} dk) — en uzun {max_spans} bölge işlenecek",
            "warn",
        )
    spans = sorted(spans, key=lambda sp: sp[1] - sp[0], reverse=True)[:max_spans]
    spans.sort()

    kw = dict(common)
    kw["condition_on_previous_text"] = False
    # Sözlük/kullanıcı prompt'u KORUNUR (özel isimler onarılan bölgede de doğru yazılsın);
    # noktalama örneği sona eklenir — sese en yakın bağlam o olur.
    primer = PUNCT_PRIMER.get((language or "en").lower().split("-")[0], PUNCT_PRIMER["en"])
    base_prompt = (common.get("initial_prompt") or "").strip()
    kw["initial_prompt"] = f"{base_prompt} {primer}".strip() if base_prompt else primer

    PAD = 2.0  # sn — modele giriş için kısa run-up
    fixed = 0
    for i, (span_start, span_end) in enumerate(spans, 1):
        try:
            emit("status", stage="transcribe",
                 text=f"Noktalama onarımı {i}/{len(spans)} ({span_start/60:.0f}. dakika)...")
            cut_start = max(0.0, span_start - time_offset - PAD)
            cut_end = max(cut_start + 1.0, span_end - time_offset)
            piece = _cut_wav(wav_path, str(Path(workdir) / f"fixpunct_{i}.wav"),
                             cut_start, cut_end, ffmpeg_path)

            seg_iter, _info = model.transcribe(piece, **kw)
            base = cut_start + time_offset  # parçanın orijinal eksendeki başlangıcı

            new_entries = []
            new_words = []
            for segment in seg_iter:
                if is_hallucination(segment.text):
                    continue
                if getattr(segment, "words", None):
                    _prev = segment.start
                    for w in segment.words:
                        ws = w.start if w.start is not None else _prev
                        we = w.end if w.end is not None else ws
                        _prev = we
                        new_words.append({
                            "word": w.word,
                            "start": round(ws + base, 3),
                            "end": round(we + base, 3),
                            "probability": round(getattr(w, "probability", 1.0), 3),
                        })
                for s, e, text in segment_to_chunks(segment, args):
                    if s is None:
                        s = segment.start
                    if e is None:
                        e = segment.end
                    cleaned = clean_text(text, language=language or "tr")
                    if not cleaned or is_hallucination(cleaned):
                        continue
                    # Bölge sınırına kırp: run-up'tan taşan blok eski bloklarla çakışmasın
                    ns, ne = s + base, e + base
                    if ne > span_start:
                        new_entries.append((max(ns, span_start), ne, cleaned))

            # Yalnızca bölgeye düşenleri al (run-up kısmı eski bloklarda kalsın)
            new_entries = [
                (s, e, t) for (s, e, t) in new_entries
                if span_start - 0.25 <= (s + e) / 2 <= span_end + 0.25
            ]
            if not new_entries:
                log(f"Noktalama onarımı {i}: yeni blok üretilemedi, eski hali korundu", "warn")
                continue

            old_entries = [(s, e, t) for (s, e, t) in entries if span_start <= (s + e) / 2 <= span_end]
            old_ratio = punctuation_ratio(old_entries)
            new_ratio = punctuation_ratio(new_entries)
            if new_ratio < old_ratio + 0.01:
                log(
                    f"Noktalama onarımı {i}: iyileşme yok "
                    f"(%{old_ratio*100:.1f} → %{new_ratio*100:.1f}), eski hali korundu",
                    "warn",
                )
                continue

            entries = [(s, e, t) for (s, e, t) in entries if not (span_start <= (s + e) / 2 <= span_end)]
            entries.extend(new_entries)
            entries.sort(key=lambda x: x[0])
            if new_words:
                all_words = [w for w in all_words
                             if not (span_start <= (w["start"] + w["end"]) / 2 <= span_end)]
                all_words.extend(w for w in new_words
                                 if span_start - 0.25 <= (w["start"] + w["end"]) / 2 <= span_end + 0.25)
                all_words.sort(key=lambda w: w["start"])
            fixed += 1
            log(
                f"Noktalama onarıldı {i}/{len(spans)}: "
                f"{format_srt_time(span_start)[:8]}–{format_srt_time(span_end)[:8]} "
                f"(%{old_ratio*100:.1f} → %{new_ratio*100:.1f} noktalama, {len(new_entries)} blok)",
                "success",
            )
        except Exception as e:
            log(f"Noktalama onarımı {i} başarısız: {e}", "warn")
        finally:
            try:
                Path(workdir, f"fixpunct_{i}.wav").unlink(missing_ok=True)
            except Exception:
                pass

    return entries, all_words, fixed


def _mean_volume_db(wav_path, start, end, ffmpeg_path):
    """[start, end) aralığının ortalama ses düzeyi (dBFS). Ölçülemezse None."""
    if end - start < 0.15:
        return None
    # -ss/-to girdiden ÖNCE olmalı: volumedetect bir FİLTREdir ve çıkış tarafı kırpmadan
    # önce çalışır — çıkış tarafına konursa ölçüm kırpılan sesi de içerir (yanlış sonuç).
    proc = subprocess.run(
        [ffmpeg_path, "-hide_banner",
         "-ss", f"{max(0.0, start):.2f}", "-to", f"{end:.2f}", "-i", str(wav_path),
         "-vn", "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    m = re.search(r"mean_volume:\s*(-?(?:inf|[\d.]+)) dB", proc.stderr or "")
    if not m:
        return None
    val = m.group(1)
    # Tam dijital sessizlikte ffmpeg "-inf dB" yazar — sayıya çevrilemez, en sessiz kabul et
    return -120.0 if "inf" in val else float(val)


# Whisper'ın jenerik/müzik üzerine ürettiği tipik kapanış uydurmaları. Yalnızca
# videonun EN SON bloğunda ve yapısal koşullar sağlanınca kanıt sayılır — film
# ortasındaki gerçek "Teşekkürler." replikleri etkilenmez.
TRAILING_HALLUCINATION_PHRASES = re.compile(
    r"^\s*(thank\s*you|thanks|thank\s*u|bye(\s*bye)?|goodbye|the\s*end|fin|"
    r"teşekkürler|teşekkür\s*ederim|sağ\s*olun|görüşürüz|hoşça\s*kal(ın)?|son)"
    r"\s*[.!…]*\s*$",
    re.IGNORECASE,
)


def drop_trailing_hallucination(entries, all_words, wav_path, ffmpeg_path, time_offset,
                                max_words=2, max_chars=25, prob_thr=0.5, quiet_margin_db=8.0):
    """
    Videonun EN SONUNDAKİ uydurma tek-iki kelimelik bloğu atar
    (jenerik/sessizlik üzerine gelen "Dude.", "The absurdity." gibi artefaktlar).

    Yanlışlıkla gerçek bir kapanış repliğini silmemek için üç yapısal koşul birlikte
    aranır — son blok olacak, en fazla `max_words` kelime olacak, bir ÖNCEKİ blok tam
    cümleyle bitmiş olacak (yani bu blok bir cümlenin devamı değil) — ve ayrıca en az bir
    kanıt gerekir:
      - metin tipik kapanış uydurması ("Thank you.", "The End", "Teşekkürler."), VEYA
      - kelime güven ortalaması `prob_thr` altında, VEYA
      - o aralığın sesi son bloklara göre `quiet_margin_db` dB daha sessiz
    Kanıt yoksa blok korunur. Atılan blok loga yazılır.
    """
    if len(entries) < 3:
        return entries
    s, e, text = entries[-1]
    words = (text or "").split()
    if len(words) > max_words or len(text) > max_chars:
        return entries
    if not text_ends_sentence(entries[-2][2]):
        return entries  # bu blok önceki cümlenin devamı → gerçek metin

    reason = None

    # Kanıt 1: bilinen kapanış uydurması kalıbı
    if TRAILING_HALLUCINATION_PHRASES.match(text.strip()):
        reason = "tipik kapanış uydurması"

    # Kanıt 2: kelime güveni
    if reason is None:
        probs = [w.get("probability", 1.0) for w in (all_words or [])
                 if s - 0.05 <= (w["start"] + w["end"]) / 2 <= e + 0.05]
        if probs:
            avg_p = sum(probs) / len(probs)
            if avg_p < prob_thr:
                reason = f"düşük güven ({avg_p:.2f})"

    # Kanıt 3: aralığın sesi komşularına göre belirgin sessiz
    if reason is None and wav_path and ffmpeg_path:
        try:
            ref_start = max(0.0, entries[-6][0] if len(entries) >= 6 else entries[0][0])
            here = _mean_volume_db(wav_path, s - time_offset, e - time_offset, ffmpeg_path)
            ref = _mean_volume_db(wav_path, ref_start - time_offset,
                                  entries[-2][1] - time_offset, ffmpeg_path)
            if here is not None and ref is not None and here <= ref - quiet_margin_db:
                reason = f"ses {ref - here:.0f} dB daha sessiz"
        except Exception:
            pass

    if reason is None:
        return entries
    log(f"Kapanış halüsinasyonu atıldı ({reason}): \"{text}\"", "warn")
    return entries[:-1]


def longest_unpunctuated_run(entries):
    """Blok sınırlarını aşan en uzun cümle-sonu noktalamasız kelime dizisi."""
    longest = 0
    current = 0
    for _start, _end, text in entries:
        for word in (text or "").split():
            current += 1
            longest = max(longest, current)
            if word.rstrip("'\"”’)]}").endswith(tuple(PUNCT_END)) and not is_abbreviation(word):
                current = 0
    return longest


def split_segment_by_timing(segment, min_gap=0.5, target_chars=110,
                            hard_max_chars=200, max_words=22):
    """
    Noktalama yokken kelime arası duraksamaları kullanarak böler.
    Yarım saniyeden uzun boşluklar → büyük olasılıkla cümle sınırı.

    Bağlaç heuristiği: "ve, ama, ancak, çünkü, fakat, and, but, because, so..."
    gibi bağlaçlar geldiğinde de bölmek için iyi adaylar (yardımcı sinyal).
    """
    words = getattr(segment, "words", None)
    if not words:
        return [(segment.start, segment.end, segment.text.strip())]

    CONJUNCTIONS = {
        "ve", "ama", "ancak", "fakat", "lakin", "çünkü", "zira", "yani",
        "ki", "ile", "de", "da", "ise", "veya", "ya", "hem",
        "and", "but", "or", "so", "because", "as", "when", "then",
        "however", "although", "if", "while", "since", "that",
    }

    chunks = []
    current = []
    current_chars = 0

    for i, w in enumerate(words):
        current.append(w)
        current_chars += len(w.word)

        # Sonraki kelimeye olan boşluk
        next_gap = 0
        if i + 1 < len(words):
            w_next = words[i + 1]
            if w_next.start is not None and w.end is not None:
                next_gap = w_next.start - w.end
        next_word = words[i + 1].word.strip().lower() if i + 1 < len(words) else ""
        next_word_clean = next_word.lstrip("'\",.!?;:").rstrip("'\",.!?;:")

        is_big_pause = next_gap >= min_gap and current_chars >= 30
        is_conj_pause = (
            next_gap >= min_gap * 0.6
            and next_word_clean in CONJUNCTIONS
            and current_chars >= 50
        )
        too_long = current_chars >= hard_max_chars
        many_words = len(current) >= max_words and current_chars >= target_chars

        if is_big_pause or is_conj_pause or too_long or many_words:
            chunk = _flush_chunk(current)
            if chunk:
                chunks.append(chunk)
            current = []
            current_chars = 0

    chunk = _flush_chunk(current)
    if chunk:
        chunks.append(chunk)

    return chunks if chunks else [(segment.start, segment.end, segment.text.strip())]


def _is_false_sentence_end(words, idx):
    """
    Whisper bazen cümle ortasında yanlış nokta koyar veya kısaltmaları nokta sanır.
    Tespit kriterleri:
      1. Kısaltma kontrolü (Mrs., Mr., Dr., L.A., U.S., vb.): sonraki kelime büyük
         harf olsa bile (özel isim / kurum) kesinlikle cümle sonu DEĞİLDİR.
      2. Yanlış nokta kontrolü: sonraki kelime KÜÇÜK harfle başlıyorsa ve arada
         kısa duraksama (< 600ms) varsa yanlış noktadır.
    """
    # Kısaltma / baş harf / sıra sayısı → nokta cümleyi bitirmiyor ("Mrs. Dolly")
    if is_abbreviation(words[idx].word):
        return True
    if idx + 1 >= len(words):
        return False

    w_curr = words[idx]
    next_w_raw = words[idx + 1].word.strip()
    if not next_w_raw:
        return False
    next_clean = next_w_raw.lstrip("'\"([{")
    if not next_clean:
        return False
    first_char = next_clean[0]

    # Büyük harfle başlayan kelime = gerçek cümle başı → yanlış nokta DEĞİL
    if first_char.isupper():
        return False

    w_next = words[idx + 1]
    if w_next.start is None or w_curr.end is None:
        gap = 0.0
    else:
        gap = w_next.start - w_curr.end

    # Küçük harfle başlıyor → muhtemelen yanlış nokta (cümle ortası)
    if first_char.islower() and gap < 0.6:
        return True

    return False


def _best_subtitle_cut(words, max_chars, language="en"):
    """Bir kelime dizisini doğal ve güvenli bir yerde ikiye ayıracak indeksi seç."""
    if len(words) < 2:
        return None

    no_break_after = NO_BREAK_AFTER_TR if language == "tr" else NO_BREAK_AFTER_EN
    continuation_starts = {
        "and", "or", "but", "because", "which", "that", "with", "without",
        "of", "to", "for", "from", "as", "than", "while", "when", "where",
        "ve", "veya", "ama", "fakat", "çünkü", "ki", "ile", "için",
    }
    best = None
    total = 0
    for i in range(len(words) - 1):
        total += len(words[i].word)
        if total > max_chars:
            break
        # Çok erken kesip "One of the" türü öksüz blok üretme.
        if total < max_chars * 0.52:
            continue

        current = words[i].word.strip()
        nxt = words[i + 1].word.strip().lstrip("'\"")
        current_clean = current.rstrip(",.;:!?…").lower()
        next_clean = nxt.rstrip(",.;:!?…").lower()
        gap = 0.0
        if words[i].end is not None and words[i + 1].start is not None:
            gap = max(0.0, words[i + 1].start - words[i].end)

        # Doluluğu temel al; virgül/duraksama güçlü artı, dilbilgisel olarak
        # bağımlı kelimeleri ayırmak güçlü eksi.
        score = (total / max_chars) * 10.0
        if current.endswith(tuple(PUNCT_SOFT)):
            score += 8.0
        if gap >= 0.45:
            score += 7.0
        elif gap >= 0.25:
            score += 3.0
        if current_clean in no_break_after:
            score -= 10.0
        if next_clean in continuation_starts:
            score -= 9.0
        if best is None or score > best[0]:
            best = (score, i)

    if best is not None:
        return best[1]

    # Çok kısa/olağandışı dizide son güvenli kelime sınırına düş.
    total = 0
    fallback = 0
    for i in range(len(words) - 1):
        total += len(words[i].word)
        if total > max_chars:
            break
        fallback = i
    return fallback


def _split_long_sentence(sent_words, soft_max_chars, language):
    """
    Tam bir cümleyi ≤ soft_max_chars parçalara ayırır — kesim yerini
    _best_subtitle_cut seçer (virgül/duraksama artı, bağımlı kelime eksi).
    Cümle zaten sığıyorsa tek parça döner.
    """
    pieces = []
    rest = list(sent_words)
    while rest:
        if sum(len(w.word) for w in rest) <= soft_max_chars or len(rest) < 2:
            pieces.append(rest)
            break
        cut_at = _best_subtitle_cut(rest, soft_max_chars, language=language)
        if cut_at is None or cut_at >= len(rest) - 1:
            pieces.append(rest)
            break
        pieces.append(rest[: cut_at + 1])
        rest = rest[cut_at + 1 :]
    return pieces


def split_segment_sentence(segment, hard_max_chars=220, soft_max_chars=84, **kwargs):
    """
    Cümle-öncelikli bölme.
    Bir altyazı bloğu = bir cümle. Sadece cümle sonu noktalama (. ! ? …) görünce
    yeni bloğa geçer. soft_max_chars'tan uzun cümleler okunabilirlik için
    _best_subtitle_cut ile doğal noktalardan (virgül, duraksama) alt bloklara
    ayrılır; hard_max_chars hiç noktalama gelmeyen diziler için son güvenlik ağıdır.

    Yanlış nokta koruması: Whisper bazen cümle ortasına nokta atar (örn.
    "thinking about. or watching"). _is_false_sentence_end ile bunlar tespit edilip
    yok sayılır — sonraki kelime küçük harfle başlıyor veya bağlaçsa. Kısaltmalar
    (Mrs., L.A., 2.) is_abbreviation ile cümle sonu sayılmaz.
    """
    words = getattr(segment, "words", None)
    if not words:
        return [(segment.start, segment.end, segment.text.strip())]

    chunks = []
    current = []
    current_len = 0
    language = "tr" if any(ch in segment.text.lower() for ch in "çğıöşü") else "en"

    def flush_sentence(sent_words):
        # Tam cümle çok uzunsa doğal noktalardan alt bloklara ayır
        for piece in _split_long_sentence(sent_words, soft_max_chars, language):
            chunk = _flush_chunk(piece)
            if chunk:
                chunks.append(chunk)

    for i, w in enumerate(words):
        current.append(w)
        word_str = w.word.strip()
        current_len += len(w.word)

        ends_sentence = word_str.endswith(tuple(PUNCT_END))

        if ends_sentence:
            # Yanlış nokta kontrolü: sonraki kelime küçük harf/bağlaç ise atla
            if _is_false_sentence_end(words, i):
                continue
            flush_sentence(current)
            current = []
            current_len = 0
            continue

        # Olağandışı tek kelime/ölçüm durumunda sert sınır son güvenlik ağıdır.
        if current_len >= hard_max_chars:
            cut_at = _best_subtitle_cut(current, hard_max_chars, language=language)
            if cut_at is None:
                cut_at = len(current) - 1
            head = current[: cut_at + 1]
            tail = current[cut_at + 1 :]
            chunk = _flush_chunk(head)
            if chunk:
                chunks.append(chunk)
            current = list(tail)
            current_len = sum(len(w.word) for w in current)
            continue

    if current:
        flush_sentence(current)

    return chunks if chunks else [(segment.start, segment.end, segment.text.strip())]


# Türkçe ve İngilizce için "sonrasında satır kırılmamalı" kelime listesi
NO_BREAK_AFTER_EN = {
    "a", "an", "the", "of", "to", "in", "on", "at", "for", "by", "from", "with",
    "and", "but", "or", "nor", "so", "yet", "as", "is", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "can", "shall",
    "my", "your", "his", "her", "its", "our", "their", "this", "that",
    "these", "those", "any", "some", "every", "all", "no",
}

NO_BREAK_AFTER_TR = {
    "ve", "ile", "ya", "veya", "veyahut", "ki", "de", "da", "ise", "mi", "mı",
    "mu", "mü", "için", "gibi", "kadar", "ama", "fakat", "ancak", "lakin",
    "çünkü", "zira", "yani", "bir", "bu", "şu", "o", "her", "hiç", "bazı",
    "ben", "sen", "biz", "siz", "onlar", "kendi",
}


def balanced_two_line_break(text, max_line_width=42, language="tr"):
    """
    Bir cümleyi en dengeli iki satıra böler:
      1. Önce noktalama yerinde bölmeyi dener (en sondaki cümle/virgül noktası)
      2. Sonra dilbilimsel olarak güvenli (NO_BREAK_AFTER setinde olmayan) kelimelerde böler
      3. Son çare olarak ortaya en yakın yerde böler
    İki satır da max_line_width'e sığmalı; sığmazsa 3+ satıra düşer.
    """
    text = text.strip()
    if not text:
        return text
    if len(text) <= max_line_width:
        return text

    words = text.split()

    # Toplam max_line_width * 2 sığıyor mu? Sığmazsa wrap_text'e bırak
    total_chars = sum(len(w) for w in words) + len(words) - 1
    if total_chars > max_line_width * 2:
        return None  # çağıran tarafa "iki satıra sığmıyor" sinyali

    no_break = NO_BREAK_AFTER_TR if language == "tr" else NO_BREAK_AFTER_EN

    # Her olası kesim noktasını puanla
    def score_split(i):
        """i = ilk satırda i kelime, ikinci satırda kalan. Geçersizse None döner."""
        line1 = " ".join(words[:i])
        line2 = " ".join(words[i:])
        if len(line1) > max_line_width or len(line2) > max_line_width:
            return None  # geçersiz: satır sığmıyor
        last_word = words[i - 1].rstrip(",.!?;:…").lower()
        # Noktalama varsa puan +
        score = 0
        if is_abbreviation(words[i - 1]):
            score -= 60  # "Mrs." ile ismi arasında satır kırma
        elif words[i - 1].endswith(tuple(PUNCT_END)):
            score += 100
        elif words[i - 1].endswith(tuple(PUNCT_SOFT)):
            score += 50
        # Dilbilimsel cezalar
        if last_word in no_break:
            score -= 30
        # Dengeli olmasına puan
        balance = abs(len(line1) - len(line2))
        score -= balance * 0.3
        return score

    # Geçerlilik (None) ile tercih (skor) ayrı tutulur: cezalı ama geçerli bölme
    # de orta-nokta yedeğine yeğlenir.
    best_i = -1
    best_score = None
    for i in range(1, len(words)):
        s = score_split(i)
        if s is None:
            continue
        if best_score is None or s > best_score:
            best_score = s
            best_i = i

    if best_i < 1:
        # Hiçbir geçerli kesim yok — orta noktaya en yakın olanı dene
        mid = len(words) // 2
        line1 = " ".join(words[:mid])
        line2 = " ".join(words[mid:])
        if len(line1) <= max_line_width and len(line2) <= max_line_width:
            return f"{line1}\n{line2}"
        return None

    return f"{' '.join(words[:best_i])}\n{' '.join(words[best_i:])}"


def segment_to_chunks(segment, args):
    """
    Bir Whisper segmentini seçili bölme stratejisine göre (start, end, text)
    parçalarına ayırır. Ana döngü ve noktalama-onarım geçişi aynı mantığı kullansın diye
    ayrı fonksiyon.
    """
    if args.split_mode == "sentence":
        # Önce noktalamayı kontrol et — yoksa zamanlama yedeğine geç
        if has_enough_punctuation(segment.text):
            return split_segment_sentence(
                segment,
                hard_max_chars=args.hard_max_chars,
                soft_max_chars=args.max_chars,
            )
        # Whisper noktalama üretmedi → kelime duraksamalarını kullan
        return split_segment_by_timing(
            segment,
            min_gap=args.timing_gap,
            target_chars=args.max_chars,
            hard_max_chars=args.hard_max_chars,
        )
    if args.split_mode == "timing":
        return split_segment_by_timing(
            segment,
            min_gap=args.timing_gap,
            target_chars=args.max_chars,
            hard_max_chars=args.hard_max_chars,
        )
    if args.split_mode == "smart":
        return split_segment_by_punctuation(segment, max_chars=args.max_chars)
    return [(segment.start, segment.end, segment.text.strip())]


def split_segment_by_punctuation(segment, max_chars=84):
    """
    Eski 'agresif' bölme — geriye dönük uyum için tutuldu. Karakter sınırına
    ulaşınca cümle ortasında da bölebilir.
    """
    words = getattr(segment, "words", None)
    text = segment.text.strip()
    if not words or len(text) <= max_chars:
        return [(segment.start, segment.end, text)]

    chunks = []
    current_words = []
    current_text_len = 0

    for w in words:
        word_str = w.word
        current_words.append(w)
        current_text_len += len(word_str)
        ends_sentence = (
            word_str.strip().endswith(tuple(PUNCT_END))
            and not is_abbreviation(word_str)
        )
        ends_soft = word_str.strip().endswith(tuple(PUNCT_SOFT))

        too_long = current_text_len >= max_chars
        if ends_sentence or (ends_soft and current_text_len >= max_chars * 0.7) or too_long:
            chunk = _flush_chunk(current_words)
            if chunk:
                chunks.append(chunk)
            current_words = []
            current_text_len = 0

    chunk = _flush_chunk(current_words)
    if chunk:
        chunks.append(chunk)

    return chunks if chunks else [(segment.start, segment.end, text)]


def write_srt(entries, output_path, max_line_width=42, max_lines=2, language="tr", wrap_mode="sentence"):
    # utf-8-sig (BOM): Windows oynatıcıları (WMP, bazı TV'ler) BOM'suz SRT'de
    # Türkçe karakterleri yanlış kodlamayla açabiliyor
    with open(output_path, "w", encoding="utf-8-sig") as f:
        for i, (start, end, text) in enumerate(entries, 1):
            wrapped = wrap_text(text, max_line_width, max_lines, language=language, wrap_mode=wrap_mode)
            f.write(f"{i}\n")
            f.write(f"{format_srt_time(start)} --> {format_srt_time(end)}\n")
            f.write(f"{wrapped}\n\n")


def write_vtt(entries, output_path, max_line_width=42, max_lines=2, language="tr", wrap_mode="sentence"):
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, (start, end, text) in enumerate(entries, 1):
            wrapped = wrap_text(text, max_line_width, max_lines, language=language, wrap_mode=wrap_mode)
            f.write(f"{format_vtt_time(start)} --> {format_vtt_time(end)}\n")
            f.write(f"{wrapped}\n\n")


def write_txt(entries, output_path):
    with open(output_path, "w", encoding="utf-8") as f:
        for _, _, text in entries:
            f.write(text.strip() + "\n")


def _ass_time(seconds):
    if seconds < 0:
        seconds = 0
    # Tamsayı santisaniye aritmetiği: yuvarlama taşması doğru taşar
    cs_total = int(round(seconds * 100))
    hours, rem = divmod(cs_total, 360_000)
    minutes, rem = divmod(rem, 6_000)
    secs, cs = divmod(rem, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"


# Sabit konuşmacı renk paleti (ASS BGR formatında)
SPEAKER_COLORS = [
    "&H00FFFFFF",  # beyaz (varsayılan)
    "&H0066FFFF",  # sarı
    "&H00FF9966",  # mavi
    "&H006699FF",  # turuncu
    "&H0099FF66",  # yeşil
    "&H00FF66CC",  # pembe
    "&H006666FF",  # kırmızı
    "&H00CCCCCC",  # gri
]


def write_ass(entries, output_path, max_line_width=80, language="tr",
              wrap_mode="sentence", speakers=None):
    """
    Aegisub ASS formatı. Konuşmacı varsa renk verir.
    `speakers`: entry index → konuşmacı etiketi haritası.
    """
    speakers = speakers or {}
    unique_speakers = sorted(set(speakers.values()))
    speaker_styles = {sp: f"Speaker{i}" for i, sp in enumerate(unique_speakers)}

    header = [
        "[Script Info]",
        "Title: Whisper Altyazı",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,80,80,60,1",
    ]
    for sp, style_name in speaker_styles.items():
        idx = unique_speakers.index(sp) + 1
        color = SPEAKER_COLORS[idx % len(SPEAKER_COLORS)]
        header.append(
            f"Style: {style_name},Arial,56,{color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,80,80,60,1"
        )

    header += [
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    # ASS de BOM ile (Aegisub/SubtitleEdit varsayılanı)
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(header) + "\n")
        for i, (start, end, text) in enumerate(entries):
            sp = speakers.get(i)
            # ASS konuşmacıyı RENK + Name alanıyla ayırır; SRT/VTT/TXT için metne eklenen
            # "[SPEAKER_xx] " önekini burada kaldır (çift etiketlemeyi önle).
            if sp and text.startswith(f"[{sp}] "):
                text = text[len(f"[{sp}] "):]
            wrapped = wrap_text(text, max_line_width, 2, language=language, wrap_mode=wrap_mode)
            # ASS'de { } override-tag baslangicidir; metindeki gercek suslu parantezleri
            # tam-genislik Unicode esleriyle degistir ki render bozulmasin
            wrapped = wrapped.replace("{", "｛").replace("}", "｝")
            wrapped = wrapped.replace("\n", "\\N")
            style = speaker_styles.get(sp, "Default") if sp else "Default"
            name = sp if sp else ""
            f.write(
                f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},{style},{name},0,0,0,,{wrapped}\n"
            )


def write_json(entries, output_path, info=None, speakers=None, all_words=None):
    """Ham veri JSON çıktısı — kelime zaman damgaları dahil."""
    speakers = speakers or {}
    payload = {
        "version": 1,
        "language": getattr(info, "language", None) if info else None,
        "language_probability": (
            round(getattr(info, "language_probability", 0), 4) if info else None
        ),
        "duration": round(getattr(info, "duration", 0), 3) if info else None,
        "segments": [],
    }
    n_words = len(all_words) if all_words else 0
    cursor = 0  # ileri-yönlü imleç — kelime eşlemesini O(n) tutar
    for i, (start, end, text) in enumerate(entries):
        seg = {
            "id": i + 1,
            "start": round(start, 3),
            "end": round(end, 3),
            "text": text,
            "speaker": speakers.get(i),
        }
        if n_words:
            # Bu segmentin zaman aralığına düşen kelimeleri ekle
            while cursor < n_words and all_words[cursor]["start"] < start - 0.05:
                cursor += 1
            j = cursor
            seg_words = []
            while j < n_words and all_words[j]["start"] <= end + 0.05:
                seg_words.append(all_words[j])
                j += 1
            if seg_words:
                seg["words"] = seg_words
        payload["segments"].append(seg)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


# Whisper'ın yaygın halüsinasyonları — eğitim verisindeki YouTube/altyazı
# kalıplarından kaynaklanır. "Bag of Hallucinations" yaklaşımı:
# https://arxiv.org/pdf/2501.11378
HALLUCINATION_PATTERNS = [
    # Türkçe
    re.compile(r"^\s*altyaz[ıi]\s*(çeviris[iy]?|:).*$", re.IGNORECASE),
    re.compile(r"^\s*beni\s+takip\s+et.*$", re.IGNORECASE),
    re.compile(r"^\s*kanal[ıa]?\s+abone\s+ol.*$", re.IGNORECASE),
    re.compile(r"^\s*abone\s+olmay[ıi]?\s+unutmay[ıi]n.*$", re.IGNORECASE),
    re.compile(r"^\s*videoyu\s+be[ğg]enmeyi.*$", re.IGNORECASE),
    re.compile(r"^\s*izledi[ğg]iniz\s+için\s+te[şs]ekk[üu]rler.*$", re.IGNORECASE),
    # İngilizce
    re.compile(r"^\s*subtitles?\s*(by|:).*$", re.IGNORECASE),
    re.compile(r"^\s*amara\.org.*$", re.IGNORECASE),
    re.compile(r"^\s*thanks?\s+for\s+watching.*$", re.IGNORECASE),
    re.compile(r"^\s*don't\s+forget\s+to\s+(like|subscribe).*$", re.IGNORECASE),
    re.compile(r"^\s*like\s+(and|&)\s+subscribe.*$", re.IGNORECASE),
    re.compile(r"^\s*please\s+(like|subscribe).*$", re.IGNORECASE),
    re.compile(r"^\s*see\s+you\s+(next\s+time|in\s+the\s+next).*$", re.IGNORECASE),
    re.compile(r"^\s*hit\s+the\s+bell.*$", re.IGNORECASE),
    re.compile(r"^\s*copyright.*$", re.IGNORECASE),
    re.compile(r"^\s*transcri(ption|bed)\s+by.*$", re.IGNORECASE),
    re.compile(r"^\s*captions?\s+(by|:).*$", re.IGNORECASE),
    re.compile(r"^\s*www\.[^\s]+\s*$", re.IGNORECASE),
    re.compile(r"^\s*https?://.*$"),
    # Boş ses göstergeleri
    re.compile(r"^\s*\[.*?\]\s*$"),
    re.compile(r"^\s*\(.*?\)\s*$"),
    re.compile(r"^\s*♪+\s*$"),
    re.compile(r"^\s*[.…\s]+$"),
]


def has_repetition_loop(text, max_repeat=3):
    """
    Aynı kelimenin/n-gram'ın 3+ kez ardışık tekrarını yakalar.
    Whisper tekrar döngüsüne girdiğinde "evet evet evet evet..." gibi.
    """
    words = text.split()
    if len(words) < max_repeat:
        return False

    # Tek kelime tekrarı
    for n in (1, 2, 3, 4):
        if len(words) < n * max_repeat:
            continue
        for i in range(len(words) - n * max_repeat + 1):
            chunk = words[i : i + n]
            ok = True
            for k in range(1, max_repeat):
                if words[i + k * n : i + (k + 1) * n] != chunk:
                    ok = False
                    break
            if ok:
                return True
    return False


def collapse_repetition(text):
    """Tekrar eden ardışık kelime/öbek kalıplarını sıkıştırır (en fazla 2 kez)."""
    words = text.split()
    if len(words) < 4:
        return text
    out = []
    i = 0
    while i < len(words):
        # En uzun pattern'ı dene
        collapsed = False
        for n in (4, 3, 2, 1):
            if i + n * 3 > len(words):
                continue
            chunk = words[i : i + n]
            count = 1
            j = i + n
            while j + n <= len(words) and words[j : j + n] == chunk:
                count += 1
                j += n
            if count >= 3:
                # En fazla 2 kez tut
                out.extend(chunk)
                out.extend(chunk)
                i = j
                collapsed = True
                break
        if not collapsed:
            out.append(words[i])
            i += 1
    return " ".join(out)


def is_hallucination(text):
    t = text.strip()
    if not t:
        return True
    for pat in HALLUCINATION_PATTERNS:
        if pat.match(t):
            return True
    # Aynı kelimenin/cümlenin 5+ kez ardışık tekrarı
    words = t.split()
    if len(words) >= 5 and len(set(words)) == 1:
        return True
    return False


# ===== Türkçe metin temizleme =====

_TR_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.!?;:…])")
_TR_MULTIPLE_SPACES = re.compile(r"\s{2,}")
_TR_ELLIPSIS = re.compile(r"\.{3,}")
# HTML/XML benzeri etiketleri yakala: <br/>, <br />, <i>, </b>, <font ...>
_HTML_TAG = re.compile(r"<[^>]+/?>")
# HTML karakter referansları: &nbsp;, &amp;, &#39;
_HTML_ENTITY = re.compile(r"&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);")
_HTML_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&apos;": "'", "&#39;": "'",
}


def strip_html(text):
    """HTML/XML etiketlerini ve entity'lerini kaldır."""
    if not text:
        return text
    # Önce yaygın entity'leri çöz
    for k, v in _HTML_ENTITIES.items():
        text = text.replace(k, v)
    # Bilinen etiketleri çıkar
    text = _HTML_TAG.sub(" ", text)
    # Kalan & entity'lerini at
    text = _HTML_ENTITY.sub("", text)
    return text


def clean_text(text, language="tr"):
    """
    Genel temizlik:
      - HTML/XML etiketlerini (<br />, <i> vb.) ve entity'leri kaldır
      - Noktalama öncesi boşlukları kaldır (TDK/Netflix Türkçe)
      - Birden çok boşluğu teke indir
      - "..." karakterini tek karakterli ellipsis (…) ile değiştir
      - Tekrar döngülerini sıkıştır
    """
    if not text:
        return text
    text = strip_html(text)
    text = _TR_SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = _TR_ELLIPSIS.sub("…", text)
    text = _TR_MULTIPLE_SPACES.sub(" ", text)
    text = text.strip()
    if has_repetition_loop(text):
        text = collapse_repetition(text)
    return text


def resolve_device_and_compute(device_arg, compute_type_arg, warn_list=None):
    """
    Sistemdeki GPU durumuna göre en uygun device ve compute_type'ı belirler.
    CUDA seçilmiş ama yoksa CPU'ya fallback yapar ve compute_type'ı ayarlar.
    """
    cuda_available = False
    try:
        import torch
        cuda_available = torch.cuda.is_available()
    except ImportError:
        try:
            import ctranslate2
            cuda_available = ctranslate2.get_cuda_device_count() > 0
        except Exception:
            pass

    device = device_arg
    compute_type = compute_type_arg

    if device == "auto":
        if cuda_available:
            device = "cuda"
            log("Otomatik cihaz seçimi: CUDA (GPU) kullanılacak.")
        else:
            device = "cpu"
            log("Otomatik cihaz seçimi: CUDA bulunamadı, CPU kullanılacak.", "warn")
            if warn_list is not None:
                warn_list.append("Otomatik cihaz seçimi: GPU bulunamadı, işlem CPU üzerinde yürütülecek (daha yavaş).")
    elif device == "cuda" and not cuda_available:
        device = "cpu"
        msg = "⚠ Cihaz CUDA seçildi fakat CUDA destekli GPU veya sürücü bulunamadı! İşlem CPU'ya düşürülüyor."
        log(msg, "warn")
        if warn_list is not None:
            warn_list.append("Seçilen CUDA cihazı sistemde mevcut değil! İşlem CPU üzerinde yürütülecek.")

    # CPU için compute_type düzeltmesi (float16/int8_float16 CPU'da desteklenmez)
    if device == "cpu" and compute_type in ("float16", "int8_float16"):
        log(f"İşlemci (CPU) modunda '{compute_type}' desteklenmez. 'int8' kullanılacak.", "warn")
        compute_type = "int8"

    return device, compute_type



def run_diarization(wav_path, hf_token, min_speakers=None, max_speakers=None):
    """
    pyannote.audio ile konuşmacı tanıma.
    Dönüş: [(start, end, speaker_label), ...]
    """
    try:
        from pyannote.audio import Pipeline
    except ImportError:
        raise RuntimeError(
            "pyannote.audio yüklü değil. Konuşmacı tanıma için 'pip install pyannote.audio' "
            "ve HuggingFace token'ı gerekli."
        )

    try:
        import torch
    except ImportError:
        torch = None

    if not hf_token:
        raise RuntimeError(
            "HuggingFace token gerekli. https://hf.co/settings/tokens adresinden alın "
            "ve pyannote/speaker-diarization-3.1 modelini kabul edin."
        )

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1", use_auth_token=hf_token
    )
    if torch is not None and torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))

    kwargs = {}
    if min_speakers:
        kwargs["min_speakers"] = min_speakers
    if max_speakers:
        kwargs["max_speakers"] = max_speakers

    diarization = pipeline(wav_path, **kwargs)
    spans = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        spans.append((turn.start, turn.end, speaker))

    # pyannote pipeline'ını GPU'dan boşalt (sürecin VRAM tepe noktasını düşür)
    try:
        del pipeline, diarization
        import gc
        gc.collect()
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    return spans


def assign_speakers(entries, diarization_spans):
    """
    Her altyazı segmentine en çok zaman örtüştüğü konuşmacıyı ata.
    Dönüş: {entry_index: speaker_label}
    """
    if not diarization_spans:
        return {}
    result = {}
    for i, (start, end, _text) in enumerate(entries):
        # Her konuşmacı için bu aralıkla örtüşme süresini bul
        overlaps = {}
        for ds, de, sp in diarization_spans:
            ov = max(0.0, min(end, de) - max(start, ds))
            if ov > 0:
                overlaps[sp] = overlaps.get(sp, 0.0) + ov
        if overlaps:
            result[i] = max(overlaps, key=overlaps.get)
    return result


def llm_postprocess(entries, args, warn_list=None):
    """
    Transcribe edilmiş altyazıları OpenAI uyumlu bir LLM'e gönderip düzeltir.
    Düzeltmeler: sansürlü küfürleri restore, eksik kelime tamamlama,
    halüsinasyon tespiti, bağlam bilinçli noktalama.

    entries: [(start, end, text), ...]
    return: aynı yapıda, metinleri güncellenmiş liste
    """
    if not entries:
        return entries

    try:
        from openai import OpenAI
    except ImportError:
        log("⚠ LLM düzeltme ATLANDI: openai paketi yüklü değil. 'pip install openai' çalıştırın.", "error")
        return entries

    if not args.llm_api_key:
        log("⚠ LLM düzeltme ATLANDI: API anahtarı boş. Gelişmiş ayarlar → 🤖 LLM ile düzeltme → API Key alanını doldurun.", "error")
        return entries

    log(f"🤖 LLM düzeltme BAŞLIYOR — {len(entries)} blok, model: {args.llm_model}, endpoint: {args.llm_base_url}")
    emit("status", stage="llm_postprocess", text=f"LLM düzeltiyor: {args.llm_model}")

    client = OpenAI(
        api_key=args.llm_api_key,
        base_url=args.llm_base_url,
        timeout=120,
    )

    # Düzeltme türlerini topla
    fixes = []
    if args.llm_fix_censorship:
        fixes.append("- Sansürlü küfürleri (f***, s**t, b***h vb.) bağlamdan tam haline geri yükle (fuck, shit, bitch). Hiçbir küfürü 'silme' veya değiştirme — TAM kelimeyi yaz.")
        fixes.append("- Eksik bırakılmış küfür veya argo kelimeleri bağlama göre tamamla (örn. 'Get the out of here' → 'Get the fuck out of here').")
    if args.llm_fix_hallucination:
        fixes.append("- Bariz halüsinasyonları (anlamsız uydurma kelimeler, bağlama uymayan ifadeler) gerçek kelimelere düzelt. Örn. 'edgifications' → 'petrifications', 'teleport' → 'Heliport' (eğer bağlamda mantıklı).")
        fixes.append("- Aynı kelimenin/ifadenin saçma şekilde tekrarlandığı satırları temizle veya kırp.")
    if args.llm_fix_punctuation:
        fixes.append("- Noktalama hatalarını düzelt. Cümle sonu olmayan yerde nokta varsa kaldır. Cümle başı harflerini büyüt.")
        fixes.append("- Boşluksuz birleşmiş kelimeleri ayır (örn. 'Hadigidelim' → 'Hadi gidelim').")
    if args.llm_fix_consistency:
        fixes.append("- Tutarsız yazılmış özel isimleri sabitle (aynı kişi farklı yazımlarsa, en yaygın olanı seç ve hepsini ona çevir).")
    if not fixes:
        log("Hiçbir düzeltme türü seçilmedi — atlandı", "warn")
        return entries

    # Sözlükteki özel isimleri LLM'e de bildir — yanlış duyulmuş yazımları düzeltir
    glossary_terms = [t.strip() for t in (getattr(args, "glossary", "") or "").split("|") if t.strip()]
    glossary_lines = []
    if glossary_terms:
        glossary_lines = [
            "",
            "ÖZEL İSİM SÖZLÜĞÜ (bu yazımları aynen kullan; benzer ama yanlış yazılmış halleri bunlara düzelt):",
            ", ".join(glossary_terms),
        ]

    system_prompt = "\n".join([
        "Sen profesyonel bir altyazı editörüsün. Transcribe edilmiş altyazıları minimal müdahalelerle düzelteceksin.",
        "",
        "KURALLAR:",
        "- Anlamı ASLA değiştirme. Sadece teknik düzeltmeler.",
        "- Kelime sayısı korunmalı (mümkün olduğunca). Yeni cümle/blok ekleme.",
        "- Her bloğun ZAMAN damgaları seninle ilgili DEĞİL — sadece metni düzelt.",
        "",
        "DÜZELTECEKLERIN:",
        *fixes,
        *glossary_lines,
        "",
        "ÇIKIŞ FORMATI (kesin):",
        'Sadece bir JSON nesnesi döndür: {"0":"düzeltilmiş metin","1":"düzeltilmiş metin",...}',
        "Anahtarlar input items dizisindeki indeks numaraları (0'dan başlar).",
        "BAŞKA HİÇ BİR ŞEY YOK — yorum yok, markdown yok, kod bloğu yok.",
        "Her input için TAM bir çıktı olmalı, eksik bırakma.",
        "Çevirmiyorsun — kaynak dilde KALMASI lazım, sadece düzelt.",
    ])

    CHUNK_SIZE = 30  # her API çağrısı için blok sayısı
    CONTEXT_LINES = 5

    out_texts = [e[2] for e in entries]  # başlangıçta orijinal metinler

    chunks = []
    for start in range(0, len(entries), CHUNK_SIZE):
        end = min(start + CHUNK_SIZE, len(entries))
        chunks.append((start, end))

    total_done = 0
    fail_count = 0
    last_emit_ts = time.time()

    def task(chunk_range):
        ci_start, ci_end = chunk_range
        # Önceki bağlam (orijinal, çevrilmemiş)
        ctx_start = max(0, ci_start - CONTEXT_LINES)
        prev_ctx = [entries[k][2] for k in range(ctx_start, ci_start)]
        items = [{"i": i - ci_start, "t": entries[i][2]} for i in range(ci_start, ci_end)]
        payload = {"items": items}
        if prev_ctx:
            payload["context_before"] = prev_ctx

        try:
            resp = client.chat.completions.create(
                model=args.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            # response_format desteklenmiyorsa (Ollama, LM Studio veya bazı API'lerde 400 hatası) fallback yap
            err_str = str(e).lower()
            if "response_format" in err_str or "response_type" in err_str or "400" in err_str:
                log("⚠ LLM JSON modu desteklenmiyor, normal modda yeniden deneniyor...", "warn")
                resp = client.chat.completions.create(
                    model=args.llm_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    temperature=0.1,
                )
            else:
                raise
        content = (resp.choices[0].message.content or "").strip()
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # ```json``` fence varsa temizle
            cleaned = re.sub(r"^```(?:json)?\s*", "", content)
            cleaned = re.sub(r"\s*```\s*$", "", cleaned)
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError:
                raise RuntimeError("LLM JSON yanıtı parse edilemedi")

        if not isinstance(data, dict):
            # Model bir dizi/başka tip döndürdü — chunk başarısız say (sessiz geçme)
            raise RuntimeError("LLM yanıtı beklenen JSON nesnesi değil")

        # Sonuçları orijinal index'lere geri yaz
        for local_i, item in enumerate(items):
            key = str(item["i"])
            if key not in data or not isinstance(data.get(key), str):
                continue
            new = data[key].strip()
            if not new:
                continue
            orig = entries[ci_start + local_i][2]
            ow, nw = len(orig.split()), len(new.split())
            # Aşırı kelime sayısı sapması = muhtemel yeniden yazım/halüsinasyon → orijinali koru.
            # Ama sansür açma ("Get the out"→"Get the fuck out") ve birleşik kelime ayırma
            # ("Hadigidelim"→"Hadi gidelim") kelime sayısını artırır; bu durumlarda KARAKTER
            # sayısı benzer kalır. Karakter sapması da büyükse gerçek yeniden yazımdır → reddet.
            oc, nc = len(orig), len(new)
            words_off = ow >= 3 and (nw > ow * 2 or nw < ow * 0.5)
            chars_off = oc >= 1 and (nc > oc * 1.6 or nc < oc * 0.6)
            if words_off and chars_off:
                continue
            out_texts[ci_start + local_i] = new
        return ci_end - ci_start

    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=args.llm_workers) as ex:
        futures = {ex.submit(task, ch): ch for ch in chunks}
        for fut in as_completed(futures):
            ch = futures[fut]
            try:
                n = fut.result()
                total_done += n
            except Exception as e:
                fail_count += (ch[1] - ch[0])
                log(f"LLM chunk {ch[0]}-{ch[1]} hatası: {e}", "warn")

            now = time.time()
            if now - last_emit_ts > 0.3 or (total_done + fail_count) >= len(entries):
                pct = (total_done + fail_count) / len(entries) * 100.0
                emit("llm_progress", percent=round(pct, 1),
                     done=total_done, failed=fail_count, total=len(entries))
                last_emit_ts = now

    # Kaç bloğun metni gerçekten değişti?
    changed_count = sum(1 for i, (_, _, orig) in enumerate(entries) if out_texts[i] != orig)

    if fail_count:
        log(f"⚠ LLM düzeltme TAMAMLANDI ama {fail_count}/{len(entries)} blokta hata oldu (orijinal kullanıldı). {changed_count} blok düzeltildi.", "warn")
        if warn_list is not None:
            warn_list.append(f"{fail_count}/{len(entries)} blok LLM ile düzeltilemedi (orijinal metin korundu).")
    elif changed_count == 0:
        log(f"✓ LLM düzeltme TAMAMLANDI — {len(entries)} blok işlendi, hiçbir değişiklik yapılmadı (metin zaten temizdi).", "success")
    else:
        log(f"✓ LLM düzeltme TAMAMLANDI — {len(entries)} blok işlendi, {changed_count} blok düzeltildi.", "success")

    # Güncellenmiş entries döndür
    return [(s, e, out_texts[i]) for i, (s, e, _) in enumerate(entries)]


# ===== WhisperX motoru (opsiyonel) =====
# WhisperX dict tabanlı çıktı verir; aşağıdaki hafif sınıflar onu faster-whisper
# segment/word arayüzüne uydurur, böylece bölme/temizleme/yazma boru hattı değişmez.
class _WxWord:
    __slots__ = ("word", "start", "end", "probability")

    def __init__(self, word, start, end, probability=1.0):
        self.word = word
        self.start = start
        self.end = end
        self.probability = probability


class _WxSegment:
    __slots__ = ("start", "end", "text", "words")

    def __init__(self, start, end, text, words=None):
        self.start = start
        self.end = end
        self.text = text
        self.words = words


class _WxInfo:
    __slots__ = ("language", "language_probability", "duration")

    def __init__(self, language, language_probability, duration):
        self.language = language
        self.language_probability = language_probability
        self.duration = duration


def _wrap_whisperx_segment(s):
    """WhisperX dict segmentini faster-whisper benzeri nesneye çevir."""
    seg_start = float(s.get("start") or 0.0)
    seg_end = float(s.get("end") or seg_start)
    text = (s.get("text") or "").strip()
    words = []
    prev_end = seg_start
    for w in (s.get("words") or []):
        wt = (w.get("word") or "").strip()
        if not wt:
            continue
        ws = w.get("start")
        we = w.get("end")
        # Hizalama bazı kelimelere (sayı, noktalama) zaman damgası atamayabilir
        if ws is None:
            ws = prev_end
        if we is None:
            we = ws
        prob = w.get("score")
        if prob is None:
            prob = w.get("probability", 1.0)
        # faster-whisper konvansiyonu: kelime metni baştaki boşlukla gelir
        words.append(_WxWord(" " + wt, float(ws), float(we), float(prob or 1.0)))
        prev_end = float(we)
    return _WxSegment(seg_start, seg_end, text, words or None)


def _wx_free_gpu():
    try:
        import gc
        gc.collect()
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def run_whisperx(args, wav_path, need_words=True, initial_prompt=None, language=None, device="cuda", compute_type="float16"):
    """
    WhisperX motoru: faster-whisper transkripsiyon + wav2vec2 zorunlu hizalama
    (kelime zaman damgaları <100ms). Çıktıyı faster-whisper boru hattıyla uyumlu
    (segments_iter, info) döndürür. Diarization mevcut motor-bağımsız yol ile yapılır.
    """
    try:
        import whisperx
    except ImportError:
        raise RuntimeError(
            "WhisperX yüklü değil. 'install-whisperx.bat' çalıştırın veya 'pip install whisperx' deneyin."
        )

    # WhisperX/CTranslate2 int8_float16'yı doğrudan desteklemez → int8'e indir
    if compute_type == "int8_float16":
        compute_type = "int8"

    emit("status", stage="load_model", text=f"WhisperX modeli yükleniyor: {args.model}")
    log(f"WhisperX yükleniyor: {args.model} ({compute_type}) — ilk kullanımda model + hizalama indirilir")

    if args.temperature_fallback:
        temperatures = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    else:
        temperatures = [float(args.temperature)]

    asr_options = {
        "beam_size": args.beam_size,
        "best_of": args.best_of,
        "patience": args.patience,
        "length_penalty": args.length_penalty,
        "repetition_penalty": args.repetition_penalty,
        "no_repeat_ngram_size": args.no_repeat_ngram_size,
        "temperatures": temperatures,
        "compression_ratio_threshold": args.compression_ratio_threshold,
        "log_prob_threshold": args.log_prob_threshold,
        "no_speech_threshold": args.no_speech_threshold,
        "condition_on_previous_text": args.condition_on_previous,
        "initial_prompt": initial_prompt,
    }
    try:
        model = whisperx.load_model(
            args.model, device, compute_type=compute_type,
            language=language, asr_options=asr_options,
        )
    except Exception as e:
        low = str(e).lower()
        if any(k in low for k in ("cublas", "cudnn", "cuda", "gpu", "libcu")):
            raise RuntimeError(
                f"WhisperX GPU'da yüklenemedi: {e}\n"
                "Cihaz=CPU veya Hesaplama tipi=int8 deneyin, ya da install-whisperx.bat'i yeniden çalıştırın."
            )
        raise

    audio = whisperx.load_audio(wav_path)
    emit("status", stage="transcribe", text="WhisperX transkripsiyon...")
    result = model.transcribe(audio, batch_size=args.batch_size)
    detected = result.get("language") or language or "en"
    log(f"WhisperX dil: {detected}, {len(result.get('segments', []))} ham segment")

    # Transkripsiyon modelini boşalt (hizalama modeline VRAM aç)
    try:
        del model
    except Exception:
        pass
    _wx_free_gpu()

    # Zorunlu hizalama (kelime zaman damgaları) — yalnızca gerektiğinde
    if need_words and result.get("segments"):
        try:
            emit("status", stage="transcribe", text="WhisperX hizalama (kelime zaman damgaları)...")
            model_a, metadata = whisperx.load_align_model(language_code=detected, device=device)
            result = whisperx.align(
                result["segments"], model_a, metadata, audio, device,
                return_char_alignments=False,
            )
            del model_a
            _wx_free_gpu()
        except Exception as e:
            log(f"WhisperX hizalama atlandı (dil={detected}): {e}", "warn")

    info = _WxInfo(language=detected, language_probability=1.0, duration=len(audio) / 16000.0)
    segments = [_wrap_whisperx_segment(s) for s in result.get("segments", [])]
    return iter(segments), info


def _norm_for_dedupe(text):
    """Tekrar karşılaştırması için metni normalize et (küçük harf, boşluk/noktalama sadeleştir)."""
    t = (text or "").lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t.strip(" .,!?…:;-\"'")


def dedupe_consecutive(entries, max_gap=2.0):
    """
    Ardışık AYNI metinli altyazıları tek bloğa birleştirir (Whisper tekrar/kekeleme
    artefaktı: aynı satırın 2-3 kez, biri sıfır süreli olarak çıkması).
    Birleşen blok ilk başlangıç → son bitiş aralığını kaplar. Yalnızca aralarındaki
    boşluk max_gap'ten küçükse (uzaktaki gerçek tekrarları — "Hayır. ... Hayır." — korur).
    entries: [(start, end, text), ...] zamana göre sıralı varsayılır.
    """
    if len(entries) < 2:
        return entries
    out = []
    for s, e, t in entries:
        s = float(s); e = float(e)
        if out and _norm_for_dedupe(out[-1][2]) == _norm_for_dedupe(t):
            prev = out[-1]
            gap = s - prev[1]
            if gap <= max_gap:
                # Zaman aralığını genişlet, daha uzun (daha eksiksiz) metni koru
                prev[1] = max(prev[1], e)
                if len(t.strip()) > len(prev[2].strip()):
                    prev[2] = t
                continue
        out.append([s, e, t])
    return [(o[0], o[1], o[2]) for o in out]


def merge_short_entries(entries, min_chars=16, min_dur=1.0, max_gap=0.6, max_chars=84, max_dur=6.5):
    """
    1) Tamamlanmamış cümleleri (sonunda . ! ? … olmayan) ve
    2) Çok kısa altyazı parçalarını (az karakter VEYA kısa süre)
    komşu altyazıyla birleştirir.
    Yalnızca aradaki boşluk küçükse (gap <= max_gap) ve birleşim karakter/süre sınırını aşmıyorsa.
    Flaş eden veya gereksiz yere parçalanmış altyazıları azaltır.
    entries: [(start, end, text), ...] — zamana göre sıralı varsayılır.
    """
    if len(entries) < 2:
        return entries
    out = []
    for s, e, txt in entries:
        s = float(s)
        e = float(e)
        txt = (txt or "").strip()
        if not out:
            out.append([s, e, txt])
            continue
        prev = out[-1]
        prev_ends_sentence = text_ends_sentence(prev[2])
        if prev_ends_sentence:
            out.append([s, e, txt])
            continue

        gap = s - prev[1]
        if prev[2] and txt:
            combined = (prev[2] + " " + txt).strip()
        else:
            combined = prev[2] or txt

        fits = (
            -0.15 <= gap <= max_gap
            and len(combined) <= max_chars
            and (e - prev[0]) <= max_dur
        )
        if fits:
            prev[1] = max(prev[1], e)
            prev[2] = combined
        else:
            out.append([s, e, txt])
    return [(o[0], o[1], o[2]) for o in out]


def merge_incomplete_sentences(entries, max_gap=2.5, max_chars=84, max_dur=7.0, max_parts=6):
    """
    Yarım kalmış cümleleri (nokta/soru/ünlem ile bitmeyen blokları) sonraki blokla
    birleştirir. Belgesel anlatımında seslendirmen dramatik duraksamalarla konuşur;
    Whisper her duraksamada yeni segment üretir ve cümle parça parça bölünür:
        "A Christmas Day gathering" / "led to the death of this man"
    Bu parçalar tek blokta toplanır — karakter/süre sınırını aşmadığı sürece.

    Birleştirme koşulları:
      - Önceki blok cümle sonu noktalama ile BİTMİYOR (kısaltma da bitirmez: "Mrs.")
      - Aradaki boşluk max_gap'ten küçük (uzun sessizlik = ayrı sahne/konu)
      - Birleşim karakter (max_chars) ve süre (max_dur) sınırına sığıyor
      - Sonraki blok diyalog tiresi / şarkı-efekt işaretiyle başlamıyor
    entries: [(start, end, text), ...] — zamana göre sıralı varsayılır.
    """
    if len(entries) < 2:
        return entries

    DIALOG_STARTS = ("-", "—", "–", "[", "(", "♪", "*")
    out = []
    parts = []  # out ile paralel: her blokta kaç parça birleşti
    for s, e, txt in entries:
        s = float(s)
        e = float(e)
        txt = (txt or "").strip()
        if not txt:
            continue
        if not out:
            out.append([s, e, txt])
            parts.append(1)
            continue
        prev = out[-1]
        gap = s - prev[1]
        combined = (prev[2] + " " + txt).strip()
        can_merge = (
            not text_ends_sentence(prev[2])
            and not prev[2].startswith(DIALOG_STARTS)
            and not txt.startswith(DIALOG_STARTS)
            and -0.05 <= gap <= max_gap
            and len(combined) <= max_chars
            and (e - prev[0]) <= max_dur
            and parts[-1] < max_parts
        )
        if can_merge:
            prev[1] = e
            prev[2] = combined
            parts[-1] += 1
        else:
            out.append([s, e, txt])
            parts.append(1)
    return [(o[0], o[1], o[2]) for o in out]


def normalize_timings(entries, min_dur=0.8, max_dur=7.0, min_gap=0.08, max_cps=20.0):
    """
    Profesyonel altyazı zamanlama normalizasyonu (Netflix/BBC tarzı).
    Yalnızca bitiş zamanlarını ayarlar (başlangıçları kaydırmaz → zincirleme kayma yok):
      - Çakışmaları gider, ardışık altyazılar arası minimum boşluk bırakır
      - Çok kısa süreleri uzatır (flaş altyazıları önler)
      - Çok uzun süreleri kırpar (max_dur)
      - Okuma hızını (CPS) düşürmek için yer varsa süreyi uzatır
    entries: [(start, end, text), ...] — zamana göre sıralı varsayılır.
    """
    if not entries:
        return entries

    out = [[float(s), float(e), t] for (s, e, t) in entries]
    n = len(out)
    for i in range(n):
        s, e, t = out[i]
        if e < s:
            e = s
        next_start = out[i + 1][0] if i + 1 < n else None
        ceiling = (next_start - min_gap) if next_start is not None else None

        # Maksimum süre
        if e - s > max_dur:
            e = s + max_dur

        # Minimum süre — yer varsa uzat
        if e - s < min_dur:
            target = s + min_dur
            if ceiling is not None:
                target = min(target, ceiling)
            if target > e:
                e = target

        # Okuma hızı (CPS) — metin uzunsa süreyi uzatmaya çalış (max_dur ve boşlukla sınırlı)
        text_len = len((t or "").strip())
        if max_cps > 0 and text_len > 0:
            need = text_len / max_cps
            if (e - s) < need:
                target = s + min(need, max_dur)
                if ceiling is not None:
                    target = min(target, ceiling)
                if target > e:
                    e = target

        # Çakışma / minimum boşluk — sonrakine taşma
        if ceiling is not None and e > ceiling:
            e = ceiling
        # Süre sıfır/negatif kalmasın
        if e <= s:
            e = s + 0.05
        # Son bir kez çakışma kontrolü (süre düzeltmesi sonrası next_start'ı aştıysak)
        # — istenen min_gap'i koru, sabit 0.01 değil (boşluk daralması yaşanmasın)
        if next_start is not None and e >= next_start:
            e = max(s + 0.01, next_start - min_gap)

        out[i][1] = e

    return [(s, e, t) for (s, e, t) in out]


def compute_quality_report(entries, max_cps=20.0, max_dur=7.0, min_dur=0.8):
    """
    Altyazı kalite metrikleri (pür fonksiyon; zamana göre sıralı entries varsayar).
    Yazımdan hemen önce çağrılır — kullanıcıya "her şey yolunda mı" özeti verir.
    Konuşmacı etiketi ([SPEAKER_00] ...) CPS hesabında metin dışı sayılır.
    """
    n = len(entries)
    report = {
        "blocks": n,
        "cps_violations": 0,   # okuma hızı max_cps'i aşan blok sayısı
        "overlaps": 0,         # bir sonrakiyle çakışan blok sayısı
        "too_long": 0,         # max_dur'u aşan blok
        "too_short": 0,        # min_dur'un altında kalan blok
        "max_cps": 0.0,        # gözlenen en yüksek okuma hızı
        "longest_dur": 0.0,    # en uzun blok süresi (sn)
        "longest_at": 0.0,     # o bloğun başlangıç zamanı (sn)
    }
    if n == 0:
        return report
    for i, (s, e, t) in enumerate(entries):
        dur = max(0.001, float(e) - float(s))
        text = (t or "").strip()
        text_len = len(re.sub(r"^\[[^\]]+\]\s*", "", text))  # konuşmacı etiketini çıkar
        cps = text_len / dur
        if cps > report["max_cps"]:
            report["max_cps"] = round(cps, 1)
        if max_cps > 0 and cps > max_cps:
            report["cps_violations"] += 1
        if dur > report["longest_dur"]:
            report["longest_dur"] = round(dur, 2)
            report["longest_at"] = round(float(s), 2)
        if dur > max_dur + 0.05:
            report["too_long"] += 1
        if dur < min_dur - 0.05:
            report["too_short"] += 1
        if i + 1 < n and float(e) > float(entries[i + 1][0]) + 0.001:
            report["overlaps"] += 1
    return report


# ===== Checkpoint / kaldığı yerden devam =====
# faster-whisper akışı ortadan devam ettiremez; çözüm: işlenen blokları periyodik
# olarak diske yaz, çökme olursa sesi son güvenli noktadan (clip-start mekaniği)
# yeniden çıkar ve korunan blokları yenilerle birleştir. Yalnızca yerel dosya +
# kırpma yokken çalışır (film senaryosu). NOT: kelime zaman damgaları checkpoint'e
# yazılmaz — devam sonrası JSON çıktısında devam-öncesi kısım kelimesiz kalabilir.

def _checkpoint_path(input_path):
    """Girdinin yanına deterministik checkpoint yolu."""
    return str(input_path) + ".whisper.ckpt.json"


def job_signature(args):
    """
    Checkpoint yalnızca transkripsiyon çıktısını etkileyen ayarlar AYNIYSA geçerlidir.
    Bunlardan biri değişmişse (ör. model, dil, ses kanalı) baştan başlanır.
    """
    return {
        "model": args.model,
        "engine": args.engine,
        "language": args.language,
        "task": args.task,
        "split_mode": args.split_mode,
        "audio_track": args.audio_track,
        "hard_max_chars": args.hard_max_chars,
    }


def write_checkpoint(path, signature, entries, last_time):
    """Checkpoint'i atomik yaz (önce .tmp, sonra replace) — yazım anında çökme bozmasın."""
    data = {
        "version": 1,
        "signature": signature,
        "last_time": round(float(last_time), 3),
        "entries": [[round(float(s), 3), round(float(e), 3), t] for (s, e, t) in entries],
    }
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass  # yazılamıyorsa (salt-okunur klasör) sessizce devam et


def read_checkpoint(path, signature):
    """
    Geçerli + imzası eşleşen checkpoint'i (entries, last_time) olarak döndür.
    Yoksa/bozuksa/imza uymuyorsa None.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or data.get("version") != 1:
        return None
    if data.get("signature") != signature:
        return None  # ayarlar değişmiş → temiz başla
    last_time = data.get("last_time")
    raw = data.get("entries")
    if not isinstance(raw, list) or last_time is None:
        return None
    entries = []
    for item in raw:
        try:
            s, e, t = item
            entries.append((float(s), float(e), t))
        except (ValueError, TypeError):
            continue
    if not entries:
        return None
    return entries, float(last_time)


def merge_resumed_entries(old_entries, new_entries, boundary):
    """
    Korunan (old) + yeni üretilen entries'i birleştir. Sınır (boundary) = yeniden
    transkripsiyonun başladığı nokta: old'da sınırı AŞAN bloklar atılır (yeni taraf
    onları yeniden üretti), new'de sınırdan belirgin ÖNCE başlayanlar atılır.
    Böylece geri-alma (backoff) penceresinde örtüşme/çift kayıt oluşmaz.
    """
    kept_old = [(s, e, t) for (s, e, t) in old_entries if e <= boundary + 0.1]
    kept_new = [(s, e, t) for (s, e, t) in new_entries if s >= boundary - 0.5]
    return kept_old + kept_new


def transcribe(args):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper yüklü değil. Lütfen install.bat'i çalıştırın."
        )

    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        raise RuntimeError(
            "ffmpeg bulunamadı. Lütfen ffmpeg'i PATH'e ekleyin veya backend/bin/ klasörüne koyun."
        )

    workdir = tempfile.mkdtemp(prefix="whisper_altyazi_")

    try:
        warn_list = []  # done event'ine taşınacak kısmi-başarısızlık uyarıları
        device, compute_type = resolve_device_and_compute(args.device, args.compute_type, warn_list)

        # Zaman aralığı kırpmasını EN BAŞTA doğrula — geçersizse YouTube indirmesini
        # boşa harcamadan hemen hata ver. Zaman damgaları orijinal videoya hizalanır.
        clip_start = parse_timecode(args.clip_start)
        clip_end = parse_timecode(args.clip_end)
        if clip_start is not None and clip_end is not None and clip_end <= clip_start:
            raise RuntimeError("Zaman aralığı geçersiz: bitiş, başlangıçtan büyük olmalı.")
        time_offset = clip_start or 0.0
        if clip_start is not None or clip_end is not None:
            log(f"Zaman aralığı: {clip_start if clip_start is not None else 0:.1f}s → "
                f"{f'{clip_end:.1f}s' if clip_end is not None else 'son'}")

        # Checkpoint / kaldığı yerden devam — yalnızca yerel dosya + kırpma yokken.
        # Checkpoint varsa sesi o noktadan çıkarmak için clip_start'ı içeriden set ederiz.
        user_clipped = clip_start is not None or clip_end is not None
        resume_from = None
        resumed_entries = []
        ckpt_sig = job_signature(args)
        ckpt_path = _checkpoint_path(args.input) if (args.input and not user_clipped) else None
        if args.resume and ckpt_path:
            ck = read_checkpoint(ckpt_path, ckpt_sig)
            if ck:
                resumed_entries, last_time = ck
                # Sınırı 2 sn geri al: son bloklar yeniden yazılır → hem sonuna ulaşmış
                # checkpoint'te "boş ses" hatası olmaz, hem sınır temiz birleşir.
                resume_from = max(0.0, last_time - 2.0)
                clip_start = resume_from   # sesi bu noktadan çıkar (aşağıdaki ex_start)
                time_offset = resume_from  # yeni segmentleri orijinal eksene taşı
                log(f"⏯ Checkpoint bulundu — ~{resume_from:.0f}. saniyeden devam ediliyor "
                    f"({len(resumed_entries)} blok korunuyor). Baştan başlamak için "
                    f"'Çökme sonrası devam'ı kapatın.", "success")

        # 1) Girdi: YouTube URL mi yoksa yerel dosya mı?
        youtube_ranged = False  # aralık doğrudan indirme sırasında uygulandı mı?
        if args.youtube:
            emit("status", stage="download", text="YouTube'dan indiriliyor...")
            source_path, title, youtube_ranged = download_youtube(
                args.youtube, workdir, ffmpeg_path,
                clip_start=clip_start, clip_end=clip_end,
            )
            base_name = re.sub(r'[\\/:*?"<>|]', "_", title).strip()[:120] or "altyazi"
        else:
            source_path = args.input
            base_name = Path(source_path).stem or "altyazi"
            if not Path(source_path).exists():
                raise RuntimeError(f"Girdi dosyası bulunamadı: {source_path}")

        # 2) Ses çıkar. Aralık YouTube indirmesinde uygulandıysa burada tekrar kırpma
        #    (indirilen dosya zaten 0'a sıfırlanmış); aksi halde ffmpeg ile kırp.
        emit("status", stage="extract", text="Ses çıkarılıyor...")
        wav_path = str(Path(workdir) / "audio.wav")
        ex_start = None if youtube_ranged else clip_start
        ex_end = None if youtube_ranged else clip_end
        # Ses kanalı seçimi yalnızca yerel dosyada anlamlı (YouTube tek akış indirir)
        ex_track = -1 if args.youtube else args.audio_track
        extract_audio(source_path, wav_path, ffmpeg_path, clip_start=ex_start, clip_end=ex_end, audio_track=ex_track)

        # Güvenlik: aralık indirme beklendiği gibi çalışmadıysa (eski yt-dlp, canlı yayın)
        # çıkarılan ses tüm videoyu kapsıyor olabilir → ffmpeg ile yerelden kırp (yedek).
        if youtube_ranged and clip_end is not None:
            expected = clip_end - (clip_start or 0.0)
            actual = probe_duration(wav_path, ffmpeg_path)
            if actual is not None and actual > expected * 1.5 + 5.0:
                log("Aralıklı indirme uygulanmamış görünüyor — ffmpeg ile kırpılıyor (yedek).", "warn")
                extract_audio(source_path, wav_path, ffmpeg_path, clip_start=clip_start, clip_end=clip_end, audio_track=ex_track)

        # 3-4) Transkripsiyon hazırlığı (tüm motorlar için ortak)
        # Detaylı VAD ayarları
        vad_parameters = {
            "threshold": args.vad_threshold,
            "min_speech_duration_ms": args.vad_min_speech_ms,
            "min_silence_duration_ms": args.vad_min_silence_ms,
            "speech_pad_ms": args.vad_speech_pad_ms,
        }
        if args.vad_max_speech_s and args.vad_max_speech_s > 0:
            vad_parameters["max_speech_duration_s"] = args.vad_max_speech_s

        language = None if args.language in (None, "", "auto") else args.language

        # initial_prompt ile sözlük (hotwords) birleştir
        # Kullanıcı prompt vermemişse, Whisper'ın noktalama üretmesini sağlayan
        # varsayılan bir prompt ekle. İyi noktalanmış bir metin verirsek Whisper
        # decoder'ı bunu taklit ederek noktalama üretmeye devam eder.
        _PUNCTUATION_PROMPT = {
            "en": "Hello, welcome. This is a transcription with proper punctuation, capitalization, and formatting.",
            "tr": "Merhaba, hoş geldiniz. Bu, doğru noktalama ve büyük harflerle yazılmış bir transkripsiyon.",
        }
        prompt_parts = []
        if args.initial_prompt:
            prompt_parts.append(args.initial_prompt.strip())
        else:
            # Dil biliniyorsa o dildeki prompt'u, yoksa İngilizce'yi kullan
            lang_key = args.language if args.language not in (None, "", "auto") else "en"
            prompt_parts.append(_PUNCTUATION_PROMPT.get(lang_key, _PUNCTUATION_PROMPT["en"]))
        if args.glossary:
            terms = [t.strip() for t in args.glossary.split("|") if t.strip()]
            if terms:
                prompt_parts.append(", ".join(terms) + ".")
        initial_prompt = " ".join(prompt_parts) if prompt_parts else None

        # Temperature: tek değer mi yoksa fallback listesi mi?
        if args.temperature_fallback:
            temperature = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
        else:
            temperature = float(args.temperature)

        # word_timestamps yalnızca bölme (split) veya JSON çıktısı gerektiğinde gerekir;
        # varsayılan (split none + srt) için kapatmak transkripsiyonu hızlandırır
        _fmts = [f.strip().lower() for f in (args.formats or "srt").split(",")]
        need_words = (args.split_mode != "none") or ("json" in _fmts)

        model = None      # faster/batched yolunda atanır; diarization öncesi serbest bırakılır
        batched = None
        common = None     # faster/batched decode parametreleri (noktalama onarımı yeniden kullanır)
        if args.engine == "whisperx":
            segments_iter, info = run_whisperx(
                args, wav_path, need_words=need_words,
                initial_prompt=initial_prompt, language=language,
                device=device, compute_type=compute_type,
            )
        else:
            # faster-whisper modeli yükle (sıralı veya batched)
            emit("status", stage="load_model",
                 text=f"Model yükleniyor: {args.model} ({compute_type})")
            log(f"Model yükleniyor: {args.model} — ilk kez kullanılıyorsa indirme birkaç dakika sürebilir")
            load_start = time.time()
            try:
                model = WhisperModel(args.model, device=device, compute_type=compute_type)
            except Exception as e:
                msg = str(e)
                low = msg.lower()
                if any(k in low for k in ("cublas", "cudnn", "cuda", "gpu", "libcu")):
                    raise RuntimeError(
                        f"Model GPU'da yüklenemedi: {msg}\n"
                        "Olası çözümler: (1) Uygulamayı start.bat ile başlatın (cuDNN/cuBLAS PATH'e eklenir), "
                        "(2) install.bat'i yeniden çalıştırın, "
                        "(3) Gelişmiş ayarlar'dan Cihaz=CPU veya Hesaplama tipi=int8 deneyin."
                    )
                raise
            log(f"Model yüklendi ({time.time() - load_start:.1f}s)")

            emit("status", stage="transcribe", text="Transkripsiyon başladı...")
            log(
                f"Decoding [{args.engine}]: beam={args.beam_size}, best_of={args.best_of}, "
                f"temp={'auto' if args.temperature_fallback else args.temperature}, "
                f"rep_penalty={args.repetition_penalty}, "
                f"log_prob_thr={args.log_prob_threshold}, "
                f"no_speech_thr={args.no_speech_threshold}"
            )

            common = dict(
                language=language,
                task=args.task,
                beam_size=args.beam_size,
                best_of=args.best_of,
                patience=args.patience,
                length_penalty=args.length_penalty,
                repetition_penalty=args.repetition_penalty,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                temperature=temperature,
                compression_ratio_threshold=args.compression_ratio_threshold,
                log_prob_threshold=args.log_prob_threshold,
                no_speech_threshold=args.no_speech_threshold,
                condition_on_previous_text=args.condition_on_previous,
                initial_prompt=initial_prompt,
                word_timestamps=need_words,
                vad_filter=args.vad_filter,
                vad_parameters=vad_parameters,
            )

            if args.engine == "faster-batched":
                try:
                    from faster_whisper import BatchedInferencePipeline
                except ImportError:
                    raise RuntimeError(
                        "Batched mod için faster-whisper>=1.1 gerekli. install.bat'i güncel sürümle çalıştırın."
                    )
                batched = BatchedInferencePipeline(model=model)
                # Batched mod conditioning desteklemez ve VAD'a dayanır
                bkw = {k: v for k, v in common.items() if k != "condition_on_previous_text"}
                bkw["vad_filter"] = True
                bkw["batch_size"] = args.batch_size
                log(f"Batched mod: batch_size={args.batch_size} (VAD zorunlu açık)")
                segments_iter, info = batched.transcribe(wav_path, **bkw)
            else:
                segments_iter, info = model.transcribe(wav_path, **common)

        set_language_conventions(info.language)

        emit(
            "language",
            code=info.language,
            probability=round(info.language_probability, 3),
            duration=round(info.duration, 2),
        )

        total_duration = max(info.duration, 0.001)
        entries = []
        all_words = []  # tüm kelime damgaları (JSON için)
        last_emit = 0.0
        last_ckpt = time.time()
        CKPT_INTERVAL = 20.0  # sn — checkpoint yazma sıklığı (çökme kaybını sınırlar)

        for segment in segments_iter:
            # Halüsinasyonları filtrele
            if is_hallucination(segment.text):
                log(f"Halüsinasyon atlandı: {segment.text.strip()[:60]}", "warn")
                continue

            # Kelime listesini toparla (diarization + JSON için global)
            # faster-whisper bazı tokenlarda start/end=None döndürebilir — None + offset
            # çökerdi; segment sınırlarına/komşuya düşerek koru.
            if getattr(segment, "words", None):
                _prev_end = segment.start
                for w in segment.words:
                    ws = w.start if w.start is not None else _prev_end
                    we = w.end if w.end is not None else ws
                    _prev_end = we
                    all_words.append({
                        "word": w.word,
                        "start": round(ws + time_offset, 3),
                        "end": round(we + time_offset, 3),
                        "probability": round(getattr(w, "probability", 1.0), 3),
                    })

            # Bölme stratejisi
            chunks = segment_to_chunks(segment, args)

            for start, end, text in chunks:
                if is_hallucination(text):
                    continue
                cleaned = clean_text(text, language=info.language or "tr")
                if not cleaned or is_hallucination(cleaned):
                    continue
                # None zaman damgası (nadir) → segment sınırlarına düş; aksi halde
                # alttaki offset/normalize/format adımları çökerdi.
                if start is None:
                    start = segment.start
                if end is None:
                    end = segment.end
                # Kırpma kullanıldıysa zamanları orijinal videoya göre kaydır
                start += time_offset
                end += time_offset
                entries.append((start, end, cleaned))
                emit(
                    "segment",
                    index=len(entries),
                    start=round(start, 3),
                    end=round(end, 3),
                    text=cleaned,
                )

            # İlerleme yayını
            now = time.time()
            if now - last_emit > 0.25:
                pct = min(100.0, (segment.end / total_duration) * 100.0)
                emit("progress", percent=round(pct, 1), current=round(segment.end, 2), total=round(total_duration, 2))
                last_emit = now

            # Periyodik checkpoint (yalnızca yerel dosya + devam açıkken).
            # Snapshot birleştirilmiş yazılır ki devam-üstüne-devam'da örtüşme birikmesin.
            if ckpt_path and args.resume and (now - last_ckpt) > CKPT_INTERVAL:
                snapshot = merge_resumed_entries(resumed_entries, entries, resume_from) if resumed_entries else list(entries)
                write_checkpoint(ckpt_path, ckpt_sig, snapshot, segment.end + time_offset)
                last_ckpt = now

        emit("progress", percent=100.0, current=round(total_duration, 2), total=round(total_duration, 2))

        # Noktalama çöküşü onarımı — model HÂLÂ yüklüyken (VRAM boşaltmadan önce).
        # Whisper uzun videolarda noktalamayı bırakabiliyor; "önceki bağlamı kullan"
        # açıkken bozuk metin bağlam olarak geri beslendiği için sona kadar sürüyor.
        # Bozuk bölgeleri conditioning KAPALI yeniden çevirip yerine koyarız.
        if (args.fix_punctuation_collapse and entries and model is not None
                and common is not None and args.engine != "whisperx"):
            try:
                entries, all_words, n_fixed = recover_punctuation_collapse(
                    entries, all_words, model, wav_path, ffmpeg_path, common, args,
                    info.language or language, time_offset, workdir,
                    min_words=args.collapse_min_words,
                )
                if n_fixed:
                    log(f"Noktalama onarımı: {n_fixed} bölge yeniden çevrildi", "success")
                    emit("preview_refresh", segments=[
                        {"index": i + 1, "start": round(s, 3), "end": round(e, 3), "text": t}
                        for i, (s, e, t) in enumerate(entries)
                    ])
            except Exception as e:
                log(f"Noktalama onarımı atlandı: {e}", "warn")

        # Transkripsiyon modelini diarization'dan ÖNCE VRAM'den boşalt. Aksi halde büyük
        # model (~3GB) + pyannote (~2-3GB) aynı anda yüklenip 12GB GPU'da OOM verebilir.
        # (WhisperX kendi içinde temizliyor; burada yalnızca faster/batched yolu.)
        if batched is not None or model is not None:
            try:
                del batched
                del model
            except Exception:
                pass
            _wx_free_gpu()

        # Devam modu: korunan (checkpoint) + yeni blokları birleştir.
        # Yeni entries zaten time_offset ile orijinal eksene taşındı.
        if resumed_entries:
            n_new = len(entries)
            entries = merge_resumed_entries(resumed_entries, entries, resume_from or 0.0)
            log(f"Devam birleştirme: {len(resumed_entries)} korunan + {n_new} yeni = {len(entries)} blok")

        if not entries:
            raise RuntimeError("Hiç altyazı segmenti üretilemedi (ses çok sessiz veya konuşmasız olabilir).")

        # Altyazıları zaman damgasına göre sırala (Whisper çıktıları nadiren de olsa sırasız gelebilir)
        entries.sort(key=lambda x: x[0])

        # Ardışık tekrarları temizle (kısa parça birleştirmeden ÖNCE — yoksa birleştirme
        # dup'ları yan yana ekleyip kötüleştirir)
        if args.dedupe:
            n0 = len(entries)
            entries = dedupe_consecutive(entries)
            if len(entries) != n0:
                log(f"Tekrar temizleme: {n0} → {len(entries)} blok")

        # Yarım kalmış cümleleri birleştir (kısa parça birleştirmeden ÖNCE — önce cümle
        # bütünlüğü kurulur, kalan flaş parçalar sonraki adımda toplanır)
        if args.merge_incomplete:
            n0 = len(entries)
            # Blok hedefi bölme ile aynı: max_chars (bölücü de cümleleri bu boya
            # ayırdığından birleştirme daha uzun blok üretmemeli)
            entries = merge_incomplete_sentences(
                entries,
                max_gap=args.incomplete_gap,
                max_chars=args.max_chars,
                max_dur=args.max_duration,
            )
            if len(entries) != n0:
                log(f"Yarım cümle birleştirme: {n0} → {len(entries)} blok")

        # Çok kısa parçaları komşusuyla birleştir (LLM/diarization öncesi — temiz birleşim)
        if args.merge_short:
            n0 = len(entries)
            entries = merge_short_entries(entries)
            if len(entries) != n0:
                log(f"Kısa parça birleştirme: {n0} → {len(entries)} blok")

        # Kapanış halüsinasyonu (jenerik üzerine gelen tek-iki kelimelik uydurma blok)
        if args.drop_trailing_hallucination:
            entries = drop_trailing_hallucination(
                entries, all_words, wav_path, ffmpeg_path, time_offset,
            )

        # LLM post-processing (opsiyonel — DeepSeek vb.)
        if args.llm_postprocess:
            try:
                entries = llm_postprocess(entries, args, warn_list)
            except Exception as e:
                log(f"❌ LLM düzeltme HATA verdi: {type(e).__name__}: {e}", "error")
                import traceback as _tb
                log(_tb.format_exc(), "error")
                warn_list.append("LLM düzeltme çalıştırılamadı (orijinal metin korundu).")
        else:
            log("ℹ LLM düzeltme kapalı", "info")

        # Whisper bazı bölümlerde noktalama modundan çıkıp dakikalarca küçük harfli,
        # noktasız metin üretebilir. Sessizce "kaliteli" saymak yerine kullanıcıya
        # bunun metin düzeltmesi gerektirdiğini açıkça bildir.
        unpunctuated_words = longest_unpunctuated_run(entries)
        if unpunctuated_words >= 80:
            warning = (
                f"Noktalama uyarısı: {unpunctuated_words} kelimelik kesintisiz bir bölüm bulundu. "
                "Daha temiz sonuç için LLM ile düzeltme → Noktalama seçeneğini açın."
            )
            log(f"⚠ {warning}", "warn")
            warn_list.append(warning)

        # Konuşmacı tanıma (opsiyonel)
        speakers_map = {}
        if args.diarize:
            try:
                emit("status", stage="diarize", text="Konuşmacılar tanımlanıyor...")
                log("Diarization başladı (pyannote.audio)")
                spans = run_diarization(
                    wav_path,
                    hf_token=args.hf_token,
                    min_speakers=args.min_speakers or None,
                    max_speakers=args.max_speakers or None,
                )
                # Diarization kırpılmış ses üzerinde çalışır — entries ile aynı eksene getir
                if time_offset:
                    spans = [(s + time_offset, e + time_offset, sp) for (s, e, sp) in spans]
                speakers_map = assign_speakers(entries, spans)
                unique = sorted(set(speakers_map.values()))
                log(f"{len(unique)} konuşmacı tespit edildi: {', '.join(unique)}", "success")

                # Metnin başına konuşmacı etiketi ekle (SRT/VTT/TXT için)
                if args.label_speakers and speakers_map:
                    labeled = []
                    for i, (s, e, t) in enumerate(entries):
                        sp = speakers_map.get(i)
                        if sp:
                            labeled.append((s, e, f"[{sp}] {t}"))
                        else:
                            labeled.append((s, e, t))
                    entries = labeled
            except Exception as e:
                log(f"Diarization başarısız: {e}", "error")
                warn_list.append("Konuşmacı tanıma başarısız oldu (etiketler eklenmedi).")

        # Profesyonel zamanlama normalizasyonu (okuma hızı / min-max süre / boşluk)
        if args.fix_timings:
            entries = normalize_timings(
                entries,
                min_dur=args.min_duration,
                max_dur=args.max_duration,
                min_gap=args.min_gap,
                max_cps=args.max_cps,
            )
            log(f"Zamanlama düzeltildi (maks {args.max_cps:.0f} CPS, min {args.min_duration:.2f}s, boşluk {args.min_gap:.2f}s)")

        # Önizlemeyi nihai metinle tazele (birleştirme/LLM/diarization/zamanlama/devam değişmiş olabilir)
        if (args.merge_short or args.merge_incomplete or args.llm_postprocess
                or args.diarize or args.fix_timings or args.drop_trailing_hallucination
                or args.fix_punctuation_collapse or resumed_entries):
            emit("preview_refresh", segments=[
                {"index": i + 1, "start": round(s, 3), "end": round(e, 3), "text": t}
                for i, (s, e, t) in enumerate(entries)
            ])

        # Kalite raporu (yazımdan önce nihai entries üzerinde) — kullanıcıya özet
        if args.quality_report:
            qr = compute_quality_report(
                entries, max_cps=args.max_cps,
                max_dur=args.max_duration, min_dur=args.min_duration,
            )
            emit("quality_report", **qr)
            log(
                f"Kalite: {qr['blocks']} blok · {qr['cps_violations']} hızlı okuma · "
                f"{qr['overlaps']} çakışma · en uzun blok {qr['longest_dur']:.1f}s "
                f"(en yüksek {qr['max_cps']:.0f} KPS)",
                "success" if (qr['cps_violations'] == 0 and qr['overlaps'] == 0) else "warn",
            )

        # 5) Çıktıyı yaz
        emit("status", stage="write", text="Altyazı dosyası yazılıyor...")
        if args.output_dir:
            output_dir = Path(args.output_dir)
        elif args.input:
            output_dir = Path(args.input).parent
        else:
            # YouTube + çıktı klasörü seçilmedi: sistem temp'ine değil İndirilenler'e yaz
            downloads = Path.home() / "Downloads"
            output_dir = downloads if downloads.exists() else Path.home()
            log(f"Çıktı klasörü seçilmedi — buraya yazılıyor: {output_dir}", "warn")
        output_dir.mkdir(parents=True, exist_ok=True)

        formats = args.formats.split(",") if args.formats else ["srt"]
        output_files = []
        lang = info.language or "tr"
        # Dil kodu eki: oynatıcılar video.tr.srt'yi dil etiketiyle otomatik yükler.
        # translate görevinde çıktı her zaman İngilizce'dir.
        if args.lang_suffix:
            suffix_code = "en" if args.task == "translate" else (info.language or "")
            name_suffix = f".{suffix_code}" if suffix_code else ""
        else:
            name_suffix = ""
        for fmt in formats:
            fmt = fmt.strip().lower()
            out_path = output_dir / f"{base_name}{name_suffix}.{fmt}"
            if fmt == "srt":
                write_srt(entries, out_path, args.max_line_width, args.max_lines, language=lang, wrap_mode=args.wrap_mode)
            elif fmt == "vtt":
                write_vtt(entries, out_path, args.max_line_width, args.max_lines, language=lang, wrap_mode=args.wrap_mode)
            elif fmt == "txt":
                write_txt(entries, out_path)
            elif fmt == "ass":
                write_ass(entries, out_path, max_line_width=args.max_line_width, language=lang, wrap_mode=args.wrap_mode, speakers=speakers_map)
            elif fmt == "json":
                write_json(entries, out_path, info=info, speakers=speakers_map, all_words=all_words)
            else:
                log(f"Bilinmeyen format atlandı: {fmt}", "warn")
                continue
            output_files.append(str(out_path))
            log(f"Yazıldı: {out_path}")

        # Başarıyla tamamlandı → checkpoint'i sil (stale kalıp sonraki işi yanıltmasın)
        if ckpt_path and os.path.exists(ckpt_path):
            try:
                os.remove(ckpt_path)
            except OSError:
                pass

        emit("done", files=output_files, segments=len(entries), language=info.language, warnings=warn_list)

    finally:
        # Geçici çalışma klasörünü tümüyle temizle (indirilen ses, audio.wav vb.)
        shutil.rmtree(workdir, ignore_errors=True)
        if os.path.isdir(workdir):
            # Silinemedi (büyük olasılıkla model/ffmpeg dosya kilidi) — disk birikmesini görünür kıl
            log(f"Geçici klasör tamamen silinemedi: {workdir}", "warn")


def reexport_from_json(args):
    """
    Daha önce üretilmiş JSON çıktısından SRT/VTT/TXT/ASS'yi yeniden yazar —
    transkripsiyonu (GPU işini) tekrarlamadan. args.input bir .json dosyasıdır.
    Bölme/zamanlama değiştirilmez; yalnızca seçili formatlar + satır kaydırma uygulanır.
    """
    src = Path(args.input)
    if not src.exists():
        raise RuntimeError(f"JSON dosyası bulunamadı: {src}")
    try:
        with open(src, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except Exception as e:
        raise RuntimeError(f"JSON okunamadı/çözümlenemedi: {e}")

    segments = data.get("segments")
    if not isinstance(segments, list) or not segments:
        raise RuntimeError("JSON içinde 'segments' bulunamadı — bu, uygulamanın JSON çıktısı olmalı.")

    entries = []
    speakers_map = {}
    all_words = []
    for i, seg in enumerate(segments):
        try:
            s = float(seg.get("start"))
            e = float(seg.get("end"))
        except (TypeError, ValueError):
            continue
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        idx = len(entries)
        entries.append((s, e, text))
        if seg.get("speaker"):
            speakers_map[idx] = seg["speaker"]
        for w in (seg.get("words") or []):
            all_words.append(w)

    if not entries:
        raise RuntimeError("JSON'da yazılabilir segment yok.")

    lang = data.get("language") or "tr"
    set_language_conventions(lang)
    info = _WxInfo(language=lang, language_probability=data.get("language_probability") or 1.0,
                  duration=data.get("duration") or 0.0)

    emit("language", code=lang, probability=round(float(info.language_probability or 1.0), 3),
         duration=round(float(info.duration or 0.0), 2))
    emit("preview_refresh", segments=[
        {"index": i + 1, "start": round(s, 3), "end": round(e, 3), "text": t}
        for i, (s, e, t) in enumerate(entries)
    ])

    output_dir = Path(args.output_dir) if args.output_dir else src.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    base_name = src.stem
    # JSON adı "video.tr" gibiyse ".tr" dil ekini gövdeden ayıkla (tekrar eklenmesin)
    if base_name.endswith(f".{lang}"):
        base_name = base_name[: -(len(lang) + 1)]

    emit("status", stage="write", text="Formatlar yeniden yazılıyor...")
    formats = args.formats.split(",") if args.formats else ["srt"]
    name_suffix = f".{lang}" if (args.lang_suffix and lang) else ""
    output_files = []
    for fmt in formats:
        fmt = fmt.strip().lower()
        out_path = output_dir / f"{base_name}{name_suffix}.{fmt}"
        if fmt == "srt":
            write_srt(entries, out_path, args.max_line_width, args.max_lines, language=lang, wrap_mode=args.wrap_mode)
        elif fmt == "vtt":
            write_vtt(entries, out_path, args.max_line_width, args.max_lines, language=lang, wrap_mode=args.wrap_mode)
        elif fmt == "txt":
            write_txt(entries, out_path)
        elif fmt == "ass":
            write_ass(entries, out_path, max_line_width=args.max_line_width, language=lang, wrap_mode=args.wrap_mode, speakers=speakers_map)
        elif fmt == "json":
            write_json(entries, out_path, info=info, speakers=speakers_map, all_words=all_words)
        else:
            log(f"Bilinmeyen format atlandı: {fmt}", "warn")
            continue
        output_files.append(str(out_path))
        log(f"Yazıldı: {out_path}")

    emit("done", files=output_files, segments=len(entries), language=lang, warnings=[])


# ===== Altyazı senkronlama (mevcut SRT'yi videoya hizala) =====
# Bağımsız araç: elde hazır ama kayık bir SRT varsa, videonun konuşma-aktivite
# ritmiyle (enerji-VAD) altyazının gösterim ritmini FFT çapraz-korelasyonuyla
# hizalar. SABİT kaymayı (ör. "3 sn geç") çözer — sürüklenme/framerate düzeltmesi
# YOK (o durum için harici ffsubsync gerekir). Kaynak dosyanın üstüne YAZMAZ;
# yeni bir <ad>.synced.srt üretir.

def srt_time_to_seconds(s):
    """'01:02:03,500' veya '01:02:03.500' → saniye (float)."""
    s = s.strip().replace(",", ".")
    h, m, rest = s.split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)


_SRT_TIMING = re.compile(
    r"(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})"
)


def parse_srt(text):
    """SRT metnini [(start, end, text)] listesine çevir (iç satır sonlarını korur)."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    entries = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.split("\n")
        timing_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if timing_idx is None:
            continue
        m = _SRT_TIMING.search(lines[timing_idx])
        if not m:
            continue
        try:
            start = srt_time_to_seconds(m.group(1))
            end = srt_time_to_seconds(m.group(2))
        except (ValueError, IndexError):
            continue
        txt = "\n".join(lines[timing_idx + 1:]).strip()
        entries.append((start, end, txt))
    return entries


def shift_srt_entries(entries, offset):
    """Tüm zaman damgalarına offset (sn) ekle; negatif zamanı 0'a kırp."""
    out = []
    for s, e, t in entries:
        out.append((max(0.0, s + offset), max(0.0, e + offset), t))
    return out


def write_srt_raw(entries, output_path):
    """Metni AYNEN koruyarak SRT yaz (senkron: yalnızca zaman değişir, sarma yok)."""
    with open(output_path, "w", encoding="utf-8-sig") as f:
        for i, (start, end, text) in enumerate(entries, 1):
            f.write(f"{i}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text}\n\n")


def build_binary_signal(spans, nbins, hz):
    """spans [(start,end,...)] → nbins uzunluğunda 0/1 dizisi (blok gösterilen binler 1)."""
    import numpy as np
    sig = np.zeros(nbins, dtype=np.float32)
    for span in spans:
        s, e = span[0], span[1]
        i0 = max(0, int(s * hz))
        i1 = min(nbins, int(e * hz) + 1)
        if i1 > i0:
            sig[i0:i1] = 1.0
    return sig


def audio_energy_signal(wav_path, hz=50):
    """
    16kHz mono WAV → bin başına RMS enerjisinden 0/1 konuşma-aktivite dizisi.
    Silero VAD kullanmaz (sürüm bağımsız olsun diye); korelasyon için ritim yeter.
    Dönüş: (signal, hz).
    """
    import wave
    import numpy as np
    with wave.open(wav_path, "rb") as wf:
        sr = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
    samples = np.frombuffer(raw, dtype=np.int16)
    if samples.size == 0:
        return np.zeros(0, dtype=np.float32), hz
    bin_len = max(1, int(sr / hz))
    nbins = samples.size // bin_len
    if nbins == 0:
        return np.zeros(0, dtype=np.float32), hz
    trimmed = samples[:nbins * bin_len].astype(np.float32).reshape(nbins, bin_len)
    rms = np.sqrt((trimmed ** 2).mean(axis=1) + 1e-9)
    # Adaptif eşik: gürültü tabanının (medyan) üstü + tepe enerjinin küçük payı
    thr = np.median(rms) * 1.5 + rms.max() * 0.02
    return (rms > thr).astype(np.float32), hz


def best_offset(ref_sig, sub_sig, hz, max_shift_sec=60.0):
    """
    ref (ses aktivitesi) ile sub (altyazı gösterimi) dizileri arasındaki en iyi
    kaymayı FFT çapraz-korelasyonuyla bul. Dönüş: altyazıya EKLENECEK offset (sn)
    (pozitif = altyazıyı ileri al). Pür fonksiyon — birim testine uygun.
    """
    import numpy as np
    ref = np.asarray(ref_sig, dtype=np.float64)
    sub = np.asarray(sub_sig, dtype=np.float64)
    if ref.size == 0 or sub.size == 0:
        return 0.0
    n = max(ref.size, sub.size)
    size = 1
    while size < 2 * n:
        size *= 2
    a = np.zeros(size)
    b = np.zeros(size)
    a[:ref.size] = ref - ref.mean()
    b[:sub.size] = sub - sub.mean()
    corr = np.fft.irfft(np.fft.rfft(a) * np.conj(np.fft.rfft(b)), n=size)
    max_lag = min(int(max_shift_sec * hz), size // 2 - 1)
    idx = np.concatenate([np.arange(0, max_lag + 1), np.arange(size - max_lag, size)])
    best = int(idx[int(np.argmax(corr[idx]))])
    lag = best if best <= size // 2 else best - size
    return lag / float(hz)


def sync_subtitles(args):
    """Videoyu referans alıp mevcut SRT'yi sabit kaymadan hizalar; .synced.srt yazar."""
    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        raise RuntimeError("ffmpeg bulunamadı. PATH'e ekleyin veya backend/bin/ klasörüne koyun.")
    try:
        import numpy as np  # noqa: F401
    except ImportError:
        raise RuntimeError("Senkron için numpy gerekli. install.bat'i çalıştırın.")

    if not args.input or not Path(args.input).exists():
        raise RuntimeError(f"Video bulunamadı: {args.input}")
    srt_path = Path(args.sync_srt or "")
    if not srt_path.exists():
        raise RuntimeError(f"Altyazı dosyası bulunamadı: {srt_path}")

    text = srt_path.read_text(encoding="utf-8-sig", errors="replace")
    spans = parse_srt(text)
    if not spans:
        raise RuntimeError("Altyazıda geçerli blok bulunamadı (SRT değil mi?).")

    workdir = tempfile.mkdtemp(prefix="whisper_sync_")
    try:
        emit("status", stage="extract", text="Video sesi çıkarılıyor...")
        wav = str(Path(workdir) / "audio.wav")
        extract_audio(args.input, wav, ffmpeg_path)

        emit("status", stage="sync", text="Ses aktivitesi analiz ediliyor...")
        HZ = 50
        ref_sig, hz = audio_energy_signal(wav, HZ)
        if ref_sig.size == 0:
            raise RuntimeError("Ses analiz edilemedi (boş ses).")
        sub_sig = build_binary_signal(spans, ref_sig.size, hz)

        emit("status", stage="sync", text="Kayma hesaplanıyor (korelasyon)...")
        offset = best_offset(ref_sig, sub_sig, hz, max_shift_sec=args.sync_max_shift)
        log(f"Tespit edilen kayma: {offset:+.2f} sn "
            f"(altyazı {'ileri' if offset >= 0 else 'geri'} alındı)",
            "success")

        shifted = shift_srt_entries(spans, offset)
        out_path = srt_path.with_name(srt_path.stem + ".synced.srt")
        emit("status", stage="write", text="Senkronlu altyazı yazılıyor...")
        write_srt_raw(shifted, out_path)
        log(f"Yazıldı: {out_path}")
        warn = []
        if abs(offset) >= args.sync_max_shift - 0.05:
            warn.append("Kayma üst sınıra ulaştı — sonuç güvenilir olmayabilir, gözden geçirin.")
        emit("done", files=[str(out_path)], segments=len(shifted), language="",
             warnings=warn, sync_offset=round(offset, 2))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Whisper Altyazı Backend")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--input", help="Yerel video/ses dosyası")
    src.add_argument("--youtube", help="YouTube URL'si")

    parser.add_argument("--output-dir", help="Çıktı klasörü", default=None)
    parser.add_argument("--model", default="large-v3", help="Whisper modeli")
    parser.add_argument(
        "--engine",
        default="faster",
        choices=["faster", "faster-batched", "whisperx"],
        help="faster = faster-whisper (varsayılan), faster-batched = VAD batched (hızlı), whisperx = wav2vec2 hizalama",
    )
    parser.add_argument("--batch-size", type=int, default=16, help="faster-batched ve whisperx için batch boyutu")
    parser.add_argument("--audio-track", type=int, default=-1,
                        help="Yerel dosyada ses akışı indeksi (0'dan başlar; -1 = ffmpeg varsayılan kanalı)")
    parser.add_argument("--quality-report", type=lambda x: x.lower() == "true", default=True,
                        help="Yazımdan önce altyazı kalite metriklerini (KPS/çakışma/süre) bildir")
    parser.add_argument("--resume", type=lambda x: x.lower() == "true", default=True,
                        help="Çökme/iptal sonrası checkpoint'ten kaldığı yerden devam et (yalnızca yerel dosya, kırpma yok)")
    # Profesyonel altyazı zamanlama normalizasyonu (Netflix/BBC tarzı)
    parser.add_argument("--fix-timings", type=lambda x: x.lower() == "true", default=True,
                        help="Okuma hızı/min-max süre/boşluk normalizasyonu")
    parser.add_argument("--max-cps", type=float, default=20.0, help="Maksimum okuma hızı (karakter/saniye)")
    parser.add_argument("--min-duration", type=float, default=0.8, help="Minimum altyazı süresi (sn)")
    parser.add_argument("--max-duration", type=float, default=7.0, help="Maksimum altyazı süresi (sn)")
    parser.add_argument("--min-gap", type=float, default=0.08, help="Ardışık altyazılar arası minimum boşluk (sn)")
    parser.add_argument("--merge-short", type=lambda x: x.lower() == "true", default=True,
                        help="Çok kısa altyazı parçalarını komşusuyla birleştir")
    parser.add_argument("--drop-trailing-hallucination", type=lambda x: x.lower() == "true", default=True,
                        help="Videonun en sonundaki uydurma tek-iki kelimelik bloğu at (jenerik artefaktı)")
    parser.add_argument("--fix-punctuation-collapse", type=lambda x: x.lower() == "true", default=True,
                        help="Whisper'ın noktalamayı bıraktığı bölgeleri conditioning kapalı yeniden çevir")
    parser.add_argument("--collapse-min-words", type=int, default=80,
                        help="Noktalama çöküşü sayılması için gereken kesintisiz kelime sayısı")
    parser.add_argument("--merge-incomplete", type=lambda x: x.lower() == "true", default=True,
                        help="Cümle sonu noktalaması olmayan (yarım kalmış) blokları sonrakiyle birleştir")
    parser.add_argument("--incomplete-gap", type=float, default=2.5,
                        help="Yarım cümle birleştirmede izin verilen maksimum boşluk (sn)")
    parser.add_argument("--dedupe", type=lambda x: x.lower() == "true", default=True,
                        help="Ardışık aynı metinli altyazıları tek bloğa birleştir (tekrar artefaktı)")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu", "auto"])
    parser.add_argument(
        "--compute-type",
        default="float16",
        choices=["float16", "int8_float16", "int8", "float32"],
    )
    parser.add_argument("--language", default="auto", help="Dil kodu (örn. tr, en) veya 'auto'")
    parser.add_argument("--task", default="transcribe", choices=["transcribe", "translate"])
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--best-of", type=int, default=5)
    parser.add_argument("--vad-filter", type=lambda x: x.lower() == "true", default=False)
    parser.add_argument("--vad-threshold", type=float, default=0.5)
    # Detaylı VAD ayarları (faster-whisper defaults)
    parser.add_argument("--vad-min-speech-ms", type=int, default=0)
    parser.add_argument("--vad-min-silence-ms", type=int, default=2000)
    parser.add_argument("--vad-speech-pad-ms", type=int, default=400)
    parser.add_argument("--vad-max-speech-s", type=float, default=0, help="0 = sınırsız")
    # Decoding ince ayarları
    parser.add_argument("--temperature", type=float, default=0.0, help="Sıcaklık (deterministik=0.0)")
    parser.add_argument("--temperature-fallback", type=lambda x: x.lower() == "true", default=True,
                        help="Açıksa [0.0..1.0] dizisi fallback olarak denenir")
    parser.add_argument("--patience", type=float, default=1.0)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--repetition-penalty", type=float, default=1.0)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--compression-ratio-threshold", type=float, default=2.4)
    parser.add_argument("--log-prob-threshold", type=float, default=-1.0)
    parser.add_argument("--no-speech-threshold", type=float, default=0.6)
    parser.add_argument("--condition-on-previous", type=lambda x: x.lower() == "true", default=True)
    parser.add_argument("--initial-prompt", default="")
    parser.add_argument("--glossary", default="", help="Borularla ayrılmış kelime listesi (örn: 'Atatürk|Anthropic|Kubernetes')")
    # Zaman aralığı: videonun yalnızca bir bölümünü işle (örn. uzun videoda ayar denemesi)
    parser.add_argument("--clip-start", default="", help="İşlenecek aralığın başlangıcı (sn veya hh:mm:ss, boş = baştan)")
    parser.add_argument("--clip-end", default="", help="İşlenecek aralığın bitişi (sn veya hh:mm:ss, boş = sona kadar)")
    # Diarization
    parser.add_argument("--diarize", type=lambda x: x.lower() == "true", default=False)
    parser.add_argument("--hf-token", default="", help="HuggingFace token (pyannote için)")
    parser.add_argument("--min-speakers", type=int, default=0)
    parser.add_argument("--max-speakers", type=int, default=0)
    parser.add_argument("--label-speakers", type=lambda x: x.lower() == "true", default=True,
                        help="SRT/VTT/TXT'de altyazı başına [SPEAKER_XX] etiketi ekle")
    # LLM Post-processing (DeepSeek, OpenAI vb. — OpenAI uyumlu)
    parser.add_argument("--llm-postprocess", type=lambda x: x.lower() == "true", default=False)
    parser.add_argument("--llm-api-key", default="")
    parser.add_argument("--llm-base-url", default="https://api.deepseek.com",
                        help="OpenAI uyumlu endpoint (DeepSeek varsayılan)")
    parser.add_argument("--llm-model", default="deepseek-v4-flash")
    parser.add_argument("--llm-workers", type=int, default=4)
    parser.add_argument("--llm-fix-censorship", type=lambda x: x.lower() == "true", default=True)
    parser.add_argument("--llm-fix-hallucination", type=lambda x: x.lower() == "true", default=True)
    parser.add_argument("--llm-fix-punctuation", type=lambda x: x.lower() == "true", default=True)
    parser.add_argument("--llm-fix-consistency", type=lambda x: x.lower() == "true", default=False)
    parser.add_argument("--formats", default="srt", help="Virgül ayraçlı: srt,vtt,txt")
    parser.add_argument("--lang-suffix", type=lambda x: x.lower() == "true", default=False,
                        help="Dosya adına dil kodu ekle (video.tr.srt)")
    parser.add_argument("--max-line-width", type=int, default=80)
    parser.add_argument("--max-lines", type=int, default=2)
    parser.add_argument(
        "--wrap-mode",
        default="sentence",
        choices=["sentence", "balanced", "none"],
        help="sentence = sadece cümle sonunda satır kır, balanced = max_line_width'e göre dengeli 2 satır, none = kırma yok (tek satır)",
    )
    parser.add_argument("--max-chars", type=int, default=84, help="Yumuşak hedef: bir altyazı bloğunun maks. karakter sayısı")
    parser.add_argument(
        "--hard-max-chars",
        type=int,
        default=220,
        help="Cümle modu için sert sınır. Cümleler bu sınırı aşmadığı sürece bütün kalır. 220 = uzun doğal cümleler için yeterli, post-LLM bölme zaten birden çok cümleli blokları böler.",
    )
    parser.add_argument(
        "--split-mode",
        default="none",
        choices=["sentence", "timing", "smart", "none"],
        help="none = Whisper segmentlerini olduğu gibi bırak (varsayılan), sentence = cümle bazlı böl, timing = duraksamadan böl, smart = noktalama+karakter",
    )
    parser.add_argument("--timing-gap", type=float, default=0.5, help="Zamanlama-bazlı bölme için min duraksama (sn)")
    # JSON çıktısından yeniden dışa aktarma (transkripsiyon yok); --input bir .json'dur
    parser.add_argument("--reexport", type=lambda x: x.lower() == "true", default=False,
                        help="--input JSON'undan formatları yeniden yaz (GPU işi tekrarlamadan)")
    # Altyazı senkronlama (mevcut SRT'yi videoya hizala); --input video, --sync-srt altyazı
    parser.add_argument("--sync-subs", type=lambda x: x.lower() == "true", default=False,
                        help="Mevcut SRT'yi videoya (sabit kayma) hizala; .synced.srt yaz")
    parser.add_argument("--sync-srt", default="", help="Senkronlanacak SRT dosyası (--sync-subs ile)")
    parser.add_argument("--sync-max-shift", type=float, default=60.0,
                        help="Aranacak maksimum kayma (sn) — bu aralık dışındaki eşleşmeler yok sayılır")
    # Geriye dönük uyumluluk
    parser.add_argument("--smart-split", type=lambda x: x.lower() == "true", default=None,
                        help="(deprecated) --split-mode kullanın")

    args = parser.parse_args()

    # Geriye dönük uyumluluk: eski --smart-split bayrağı kullanıldıysa map et
    if args.smart_split is not None:
        args.split_mode = "smart" if args.smart_split else "none"

    # Gizli anahtarlar argv yerine ortam değişkeninden gelebilir (process listesinde görünmesin)
    if not args.hf_token:
        args.hf_token = os.environ.get("WHISPER_HF_TOKEN", "")
    if not args.llm_api_key:
        args.llm_api_key = os.environ.get("WHISPER_LLM_API_KEY", "")

    try:
        if args.sync_subs:
            sync_subtitles(args)
        elif args.reexport:
            reexport_from_json(args)
        else:
            transcribe(args)
    except Exception as e:
        emit("error", message=str(e), traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
