"""Harici süreç/ağ hatalarını gizli ayrıntı sızdırmadan Türkçe sınıflara dönüştürür."""

import re


def parse_ffmpeg_version(raw):
    match = re.search(r"\bff(?:mpeg|probe)\s+version\s+n?(\d+)(?:\.(\d+))?", str(raw or ""), re.I)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2) or 0)


def ffmpeg_version_supported(raw):
    version = parse_ffmpeg_version(raw)
    return version is not None and version[0] >= 4


def classify_ffmpeg_error(raw, operation="Medya işleme", returncode=None):
    text = str(raw or "")
    if re.search(r"no space left on device|disk full", text, re.I):
        return f"{operation} tamamlanamadı: diskte yeterli boş alan yok."
    if re.search(r"permission denied|access is denied|being used by another process", text, re.I):
        return f"{operation} tamamlanamadı: dosya kilitli veya yazma izni yok."
    if re.search(r"invalid data found|moov atom not found|could not find codec parameters", text, re.I):
        return f"{operation} tamamlanamadı: medya bozuk veya desteklenmeyen bir biçimde."
    if re.search(r"no such file or directory|error opening input|unable to open", text, re.I):
        return f"{operation} tamamlanamadı: girdi dosyası açılamadı."
    if re.search(r"stream map .* matches no streams|does not contain any stream|no audio", text, re.I):
        return f"{operation} tamamlanamadı: seçilen ses akışı dosyada bulunamadı."
    if re.search(r"no such filter|filter not found", text, re.I):
        return f"{operation} tamamlanamadı: gerekli ffmpeg filtresi bu derlemede yok."
    suffix = f" (ffmpeg çıkış kodu {returncode})" if returncode is not None else ""
    return f"{operation} ffmpeg tarafından tamamlanamadı{suffix}."


def classify_ytdlp_error(error):
    text = str(error or "")
    if re.search(r"confirm you(?:’|')re not a bot", text, re.I):
        return (
            "YouTube bu video için oturum doğrulaması istedi. Kaynak > YouTube bölümünden "
            "giriş yaptığınız tarayıcıyı seçip yeniden deneyin."
        )
    if re.search(r"could not copy.*cookie|cookie.*database.*(?:locked|copy)", text, re.I | re.S):
        return (
            "Tarayıcı cookie veritabanı okunamadı. Tarayıcıyı tamamen kapatıp yeniden "
            "deneyin veya Firefox oturumunu seçin."
        )
    if re.search(r"(?:http error\s*)?429|too many requests", text, re.I):
        return "YouTube çok fazla istek nedeniyle geçici bekleme istedi (HTTP 429). Daha sonra yeniden deneyin."
    if re.search(r"(?:http error\s*)?403|forbidden", text, re.I):
        return (
            "YouTube erişimi reddetti (HTTP 403). Oturum/cookie seçimini doğrulayın; "
            "geçici servis kısıtıysa daha sonra yeniden deneyin."
        )
    if re.search(r"requested format is not available|no video formats found", text, re.I):
        return "İstenen video veya ses biçimi bu içerikte bulunamadı."
    if re.search(r"unsupported url|not a valid url", text, re.I):
        return "Girilen bağlantı yt-dlp tarafından desteklenmiyor."
    if re.search(r"unable to download webpage|temporary failure in name resolution|name or service not known", text, re.I):
        return "YouTube sayfasına bağlanılamadı. Ağ ve DNS bağlantısını doğrulayın."
    if re.search(r"no space left on device|disk full", text, re.I):
        return "YouTube indirmesi tamamlanamadı: diskte yeterli boş alan yok."
    if re.search(r"permission denied|access is denied|being used by another process", text, re.I):
        return "YouTube indirmesi tamamlanamadı: çıktı dosyası kilitli veya yazma izni yok."
    if isinstance(error, (ValueError, RuntimeError)) and text.startswith((
        "İndirilen dosya bulunamadı",
        "YouTube indirme bilgisi alınamadı",
        "YouTube indirmesi tamamlandı",
    )):
        return text
    return "YouTube işlemi tamamlanamadı. Bağlantıyı ve seçilen oturum ayarını doğrulayıp yeniden deneyin."
