"""NDJSON protokolü için JSON uyumlu, sonlu değer yardımcıları."""

import json
import math


def finite_json_value(value):
    """NaN/Infinity değerlerini geçerli JSON'daki null karşılığına çevir."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: finite_json_value(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite_json_value(child) for child in value]
    return value


def json_dumps_finite(payload):
    """Bir NDJSON olayını standart dışı sayılara izin vermeden kodla."""
    return json.dumps(
        finite_json_value(payload),
        ensure_ascii=False,
        allow_nan=False,
    )
