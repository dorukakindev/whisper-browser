"""Sınırlı browser karesi OCR ve yerel altyazı embedding araması.

Tek JSON isteğini stdin'den alır, tek JSON yanıtı stdout'a yazar.
"""
import base64
import io
import json
import math
import sys

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CUES = 10000
MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def ocr_frame(request):
    try:
        from PIL import Image
        import numpy as np
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise RuntimeError("OCR bağımlılığı eksik. backend/requirements-browser-tools.txt paketlerini kurun.") from exc
    raw = request.get("imageBase64", "")
    if not isinstance(raw, str) or len(raw) > MAX_IMAGE_BYTES * 4 // 3 + 16:
        raise ValueError("Kare verisi geçersiz veya çok büyük.")
    try:
        data = base64.b64decode(raw.split(",", 1)[-1], validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Kare base64 biçimi geçersiz.") from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Kare 8 MB sınırını aşıyor.")
    with Image.open(io.BytesIO(data)) as img:
        if img.width * img.height > 16_000_000:
            raise ValueError("Kare çözünürlüğü çok büyük.")
        img = img.convert("RGB")
        crop = request.get("crop")
        if crop:
            x, y, w, h = (crop.get(key) for key in ("x", "y", "width", "height"))
            if not all(isinstance(v, int) for v in (x, y, w, h)) or x < 0 or y < 0 or w < 1 or h < 1 or x + w > img.width or y + h > img.height:
                raise ValueError("Seçilen kare bölgesi geçersiz.")
            img = img.crop((x, y, x + w, y + h))
        result, _ = RapidOCR()(np.asarray(img))
    lines = [{"text": str(row[1]), "score": float(row[2])} for row in (result or [])]
    return {"text": "\n".join(line["text"] for line in lines), "lines": lines}


_SEMANTIC_MODEL = None


def _semantic_model():
    # P79-04: sürekli çalışan araç sürecinde model bir kez yüklenir; her
    # sorguda yeni süreç + model yüklemesi saniyeler süren gecikme üretiyordu.
    global _SEMANTIC_MODEL
    if _SEMANTIC_MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError("Anlamsal arama bağımlılığı eksik. backend/requirements-browser-tools.txt paketlerini kurun.") from exc
        try:
            _SEMANTIC_MODEL = SentenceTransformer(MODEL, device="cpu")
        except Exception as exc:
            raise RuntimeError("Anlamsal model yüklenemedi; ilk kullanımda model indirmesi ve internet bağlantısı gerekebilir.") from exc
    return _SEMANTIC_MODEL


def semantic_search(request):
    try:
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("Anlamsal arama bağımlılığı eksik. backend/requirements-browser-tools.txt paketlerini kurun.") from exc
    query = request.get("query", "")
    cues = request.get("cues", [])
    if not isinstance(query, str) or not query.strip() or len(query) > 500 or not isinstance(cues, list) or len(cues) > MAX_CUES:
        raise ValueError("Arama sorgusu veya altyazı sayısı geçersiz.")
    rows = []
    for index, cue in enumerate(cues):
        if not isinstance(cue, dict):
            continue
        body = " ".join(str(cue.get(key) or "")[:600] for key in ("text", "translation")).strip()
        if body:
            rows.append((index, cue, body))
    if not rows:
        return {"hits": []}
    vectors = _semantic_model().encode(
        [query] + [row[2] for row in rows], normalize_embeddings=True,
        batch_size=32, show_progress_bar=False)
    scores = np.asarray(vectors[1:]) @ np.asarray(vectors[0])
    limit = min(20, max(1, int(request.get("limit", 8))))
    ranked = sorted(range(len(rows)), key=lambda i: (-float(scores[i]), rows[i][0]))[:limit]
    return {"hits": [{"index": rows[i][0], "start": rows[i][1].get("start"), "end": rows[i][1].get("end"),
                      "text": rows[i][1].get("text", ""), "translation": rows[i][1].get("translation", ""),
                      "score": round(float(scores[i]), 5)} for i in ranked]}


def _dispatch(request):
    if not isinstance(request, dict):
        raise ValueError("İstek biçimi geçersiz.")
    operation = request.get("operation")
    if operation == "ocr":
        return ocr_frame(request)
    if operation == "semantic":
        return semantic_search(request)
    raise ValueError("Bilinmeyen medya işlemi.")


def serve():
    # P79-04: satır başına bir JSON istek, satır başına bir JSON yanıt.
    # Electron tarafı süreci canlı tutar; model ilk semantic istekte yüklenip
    # sonraki sorgularda yeniden kullanılır.
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if len(line.encode("utf-8")) > 24 * 1024 * 1024:
            print(json.dumps({"ok": False, "error": "Medya isteği çok büyük."}, ensure_ascii=False), flush=True)
            continue
        try:
            request = json.loads(line)
            result = _dispatch(request)
            print(json.dumps({"ok": True, **result}, ensure_ascii=False), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), flush=True)


def main():
    try:
        raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
        if len(raw) > 24 * 1024 * 1024:
            raise ValueError("Medya isteği çok büyük.")
        request = json.loads(raw)
        result = _dispatch(request)
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        serve()
    else:
        main()
