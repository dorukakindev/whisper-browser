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


def semantic_search(request):
    try:
        from sentence_transformers import SentenceTransformer
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
    try:
        model = SentenceTransformer(MODEL, device="cpu")
        vectors = model.encode([query] + [row[2] for row in rows], normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    except Exception as exc:
        raise RuntimeError("Anlamsal model yüklenemedi; ilk kullanımda model indirmesi ve internet bağlantısı gerekebilir.") from exc
    scores = np.asarray(vectors[1:]) @ np.asarray(vectors[0])
    limit = min(20, max(1, int(request.get("limit", 8))))
    ranked = sorted(range(len(rows)), key=lambda i: (-float(scores[i]), rows[i][0]))[:limit]
    return {"hits": [{"index": rows[i][0], "start": rows[i][1].get("start"), "end": rows[i][1].get("end"),
                      "text": rows[i][1].get("text", ""), "translation": rows[i][1].get("translation", ""),
                      "score": round(float(scores[i]), 5)} for i in ranked]}


def main():
    try:
        raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
        if len(raw) > 24 * 1024 * 1024:
            raise ValueError("Medya isteği çok büyük.")
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise ValueError("İstek biçimi geçersiz.")
        operation = request.get("operation")
        if operation == "ocr":
            result = ocr_frame(request)
        elif operation == "semantic":
            result = semantic_search(request)
        else:
            raise ValueError("Bilinmeyen medya işlemi.")
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return


if __name__ == "__main__":
    main()
