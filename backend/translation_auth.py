"""Credential placeholder only for explicitly selected loopback providers."""
from urllib.parse import urlsplit


def translation_api_key(api_key, base_url):
    key = str(api_key or "").strip()
    if key:
        return key
    try:
        url = urlsplit(str(base_url or ""))
        if (url.scheme in ("http", "https") and not url.username and not url.password
                and url.hostname in ("localhost", "127.0.0.1", "::1")):
            # OpenAI's SDK requires a nonempty key even for keyless local servers.
            return "local-no-auth"
    except ValueError:
        pass
    return ""
