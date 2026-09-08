"""LLM postprocess için gerçek API kullanmayan yerel HTTP chaos matrisi."""

import contextlib
import io
import json
import socket
import sys
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import transcribe as T  # noqa: E402


SECRET = "SENTINEL-WHARD35-SECRET"
CHUNK_SIZES = (1, 7, 30)
SCENARIOS = (
    "valid_json", "fenced_json", "prose_json", "unicode_json",
    "duplicate_keys", "extra_key", "missing_last", "empty_last",
    "null_last", "numeric_last", "bool_last", "array_content_json",
    "malformed_content_json", "empty_content", "whitespace_content",
    "content_list", "no_choices", "message_missing", "excessive_growth",
    "excessive_shrink", "huge_response", "http_204",
    "http_200_invalid_json", "http_200_truncated", "connection_reset",
    "slowloris", "response_format_unsupported", "http_400_other",
    "http_401", "http_403", "http_408", "http_429", "http_500",
    "http_503", "rate_then_success", "delayed_valid",
)
MATRIX_METRICS = {}


class FakeClock:
    def __init__(self):
        self.delays = []

    def sleep(self, seconds):
        self.delays.append(seconds)


class ChaosState:
    def __init__(self):
        self.lock = threading.Lock()
        self.requests = []
        self.per_key = Counter()
        self.cancel_event = None

    def record(self, item):
        with self.lock:
            self.requests.append(item)
            key = (item["scenario"], item["idempotency"])
            self.per_key[key] += 1
            return self.per_key[key]

    def snapshot(self):
        with self.lock:
            return list(self.requests)


def _completion(content):
    return {
        "id": "chatcmpl-local-chaos",
        "object": "chat.completion",
        "created": 0,
        "model": "mock",
        "choices": [{
            "index": 0,
            "finish_reason": "stop",
            "message": {"role": "assistant", "content": content},
        }],
    }


def _valid_map(payload):
    return {str(item["i"]): item["t"] + "!" for item in payload.get("items", [])}


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, _request, _client_address):
        pass


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, _format, *_args):
            pass

        def _send(self, status, body=b"", content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def _json(self, status, value):
            self._send(status, json.dumps(value, ensure_ascii=False).encode("utf-8"))

        def do_POST(self):
            scenario = self.path.strip("/").split("/")[0]
            length = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(length)
            try:
                request = json.loads(raw.decode("utf-8"))
                payload = json.loads(request["messages"][-1]["content"])
            except Exception:
                request, payload = {}, {"items": []}
            record = {
                "scenario": scenario,
                "idempotency": self.headers.get("Idempotency-Key", ""),
                "authorization": self.headers.get("Authorization", ""),
                "request": request,
                "payload": payload,
                "wire_bytes": len(raw),
            }
            attempt = state.record(record)

            if scenario == "connection_reset":
                try:
                    self.connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                self.connection.close()
                return
            if scenario == "slowloris":
                time.sleep(0.15)
            if scenario == "http_200_truncated":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", "10000")
                self.end_headers()
                self.wfile.write(b'{"id":"cut"')
                self.connection.close()
                return
            if scenario == "http_200_invalid_json":
                self._send(200, b"not-json")
                return
            if scenario == "http_204":
                self._send(204)
                return

            status_by_scenario = {
                "http_400_other": 400, "http_401": 401, "http_403": 403,
                "http_408": 408, "http_429": 429, "http_500": 500,
                "http_503": 503,
            }
            if scenario in status_by_scenario:
                self._json(status_by_scenario[scenario], {
                    "error": {"message": f"provider {scenario} echoed {SECRET}"},
                })
                return
            if scenario == "rate_then_success" and attempt == 1:
                self._json(429, {"error": {"message": f"rate limited {SECRET}"}})
                return
            if scenario == "response_format_unsupported" and "response_format" in request:
                self._json(400, {"error": {"message": f"response_format unsupported {SECRET}"}})
                return
            if scenario == "delayed_valid":
                time.sleep(0.08)
            if scenario == "cancel_after_read" and state.cancel_event is not None:
                state.cancel_event.set()

            mapping = _valid_map(payload)
            last_key = str(max((item.get("i", 0) for item in payload.get("items", [])), default=0))
            content = json.dumps(mapping, ensure_ascii=False)
            if scenario == "fenced_json":
                content = f"```json\n{content}\n```"
            elif scenario == "prose_json":
                content = f"Sonuç aşağıdadır. {content} Bitti."
            elif scenario == "unicode_json":
                content = json.dumps({key: f"Çağrı {key} düzeldi." for key in mapping}, ensure_ascii=False)
            elif scenario == "duplicate_keys":
                content = '{"0":"ilk","0":"ikinci"}'
            elif scenario == "extra_key":
                mapping["999999"] = "fazla"
                content = json.dumps(mapping)
            elif scenario == "missing_last":
                mapping.pop(last_key, None)
                content = json.dumps(mapping)
            elif scenario == "empty_last":
                mapping[last_key] = "   "
                content = json.dumps(mapping)
            elif scenario == "null_last":
                mapping[last_key] = None
                content = json.dumps(mapping)
            elif scenario == "numeric_last":
                mapping[last_key] = 7
                content = json.dumps(mapping)
            elif scenario == "bool_last":
                mapping[last_key] = True
                content = json.dumps(mapping)
            elif scenario == "array_content_json":
                content = "[]"
            elif scenario == "malformed_content_json":
                content = '{"0":"kesik"'
            elif scenario == "empty_content":
                content = ""
            elif scenario == "whitespace_content":
                content = "   \n\t"
            elif scenario == "excessive_growth":
                content = json.dumps({key: "yeniden " * 100 for key in mapping})
            elif scenario == "excessive_shrink":
                content = json.dumps({key: "x" for key in mapping})
            elif scenario == "huge_response":
                content = json.dumps({"0": "Y" * (T.LLM_POSTPROCESS_MAX_RESPONSE_BYTES + 1024)})

            envelope = _completion(content)
            if scenario == "content_list":
                envelope["choices"][0]["message"]["content"] = [{"type": "text", "text": "x"}]
            elif scenario == "no_choices":
                envelope["choices"] = []
            elif scenario == "message_missing":
                envelope["choices"][0].pop("message", None)
            self._json(200, envelope)

    return Handler


@contextlib.contextmanager
def chaos_server():
    state = ChaosState()
    server = QuietThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state, f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def make_entries(count, prefix="Cue"):
    return [
        (index * 1.25, index * 1.25 + 1.0, f"{prefix} {index} has words.")
        for index in range(count)
    ]


def make_args(base_url, scenario, chunk_size, clock=None, **overrides):
    values = {
        "llm_api_key": SECRET,
        "llm_base_url": f"{base_url}/{scenario}/v1",
        "llm_model": "mock-model",
        "llm_workers": 1,
        "llm_fix_censorship": False,
        "llm_fix_hallucination": False,
        "llm_fix_punctuation": True,
        "llm_fix_consistency": False,
        "glossary": "",
        "llm_chunk_size": chunk_size,
        "llm_context_lines": 5,
        "llm_timeout": 0.04 if scenario == "slowloris" else 1.0,
        "llm_max_retries": 2,
        "llm_sleep": (clock or FakeClock()).sleep,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def capture_call(entries, args):
    warnings = []
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        result = T.llm_postprocess(entries, args, warnings)
    events = [json.loads(line) for line in output.getvalue().splitlines() if line.strip()]
    return result, warnings, events


def cue_checksum(entries):
    return tuple((index, start, end) for index, (start, end, _text) in enumerate(entries))


def test_chaos_matrix_36_classes_x_3_chunk_sizes():
    with chaos_server() as (state, base_url):
        cases = 0
        durations_ms = []
        max_wire_bytes = 0
        for scenario in SCENARIOS:
            for chunk_size in CHUNK_SIZES:
                entries = make_entries(chunk_size)
                before = len(state.snapshot())
                started = time.perf_counter()
                result, warnings, events = capture_call(
                    entries, make_args(base_url, scenario, chunk_size))
                durations_ms.append((time.perf_counter() - started) * 1000)
                requests = state.snapshot()[before:]
                max_wire_bytes = max(
                    [max_wire_bytes] + [request["wire_bytes"] for request in requests])
                cases += 1

                assert len(result) == len(entries), (scenario, chunk_size, len(result))
                assert cue_checksum(result) == cue_checksum(entries), (scenario, chunk_size)
                assert all(isinstance(text, str) and text for _s, _e, text in result), scenario
                assert len(requests) <= 4, (scenario, chunk_size, len(requests))
                assert all(SECRET in req["authorization"] for req in requests), scenario
                event_blob = json.dumps(events, ensure_ascii=False)
                assert SECRET not in event_blob, (scenario, chunk_size, event_blob)
                terminal = [event for event in events
                            if event.get("type") == "llm_progress" and event.get("percent") == 100.0]
                assert len(terminal) == 1, (scenario, chunk_size, terminal)
                assert terminal[0]["done"] + terminal[0]["failed"] == len(entries)
                if terminal[0]["failed"]:
                    assert warnings, (scenario, chunk_size, terminal[0])
        assert cases == len(SCENARIOS) * len(CHUNK_SIZES) == 108
        ordered = sorted(durations_ms)
        MATRIX_METRICS.update({
            "cases": cases,
            "total_ms": round(sum(durations_ms), 1),
            "p95_ms": round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 1),
            "max_wire_bytes": max_wire_bytes,
        })


def test_payload_bound_primary_once_and_context_only():
    with chaos_server() as (state, base_url):
        entries = make_entries(65, prefix="Unique")
        result, warnings, _events = capture_call(
            entries, make_args(base_url, "valid_json", 30))
        requests = state.snapshot()
        assert not warnings
        assert cue_checksum(result) == cue_checksum(entries)
        primary = Counter()
        for request in requests:
            assert request["wire_bytes"] <= T.LLM_POSTPROCESS_MAX_REQUEST_BYTES
            payload = request["payload"]
            system_prompt = request["request"]["messages"][0]["content"]
            assert "GÜVENİLMEZ" in system_prompt and "context_before yalnız bağlamdır" in system_prompt
            assert len(payload.get("context_before", [])) <= T.LLM_POSTPROCESS_CONTEXT_LINES
            primary.update(item["t"] for item in payload["items"])
        assert primary == Counter(text for _s, _e, text in entries)

        huge = [(0.0, 1.0, "Z" * (T.LLM_POSTPROCESS_MAX_REQUEST_BYTES + 4096))]
        before = len(state.snapshot())
        fallback, huge_warnings, _events = capture_call(
            huge, make_args(base_url, "valid_json", 30))
        assert len(state.snapshot()) == before, "boyutu aşan tek cue ağa gönderildi"
        assert fallback == huge and huge_warnings


def test_retry_fake_time_and_idempotency_are_bounded():
    with chaos_server() as (state, base_url):
        clock = FakeClock()
        entries = make_entries(3)
        result, warnings, events = capture_call(
            entries, make_args(base_url, "rate_then_success", 3, clock=clock))
        requests = state.snapshot()
        assert not warnings and result != entries
        assert all(text.endswith("!") and not text.endswith("!!") for _s, _e, text in result), \
            "retry sonucu aynı chunk iki kez uygulanmış"
        assert len(requests) == 2
        assert len({request["idempotency"] for request in requests}) == 1
        assert clock.delays == [0.25], clock.delays
        assert any("1/2" in event.get("message", "") for event in events)

        clock2 = FakeClock()
        _result, warnings2, _events = capture_call(
            entries, make_args(base_url, "http_503", 3, clock=clock2))
        later = state.snapshot()[len(requests):]
        assert len(later) == 3
        assert clock2.delays == [0.25, 0.5]
        assert warnings2
        assert later[0]["idempotency"] != requests[0]["idempotency"], \
            "ayrı iş eski idempotency anahtarını yeniden kullandı"


def test_response_format_fallback_changes_mode_key_once():
    with chaos_server() as (state, base_url):
        entries = make_entries(2)
        result, warnings, events = capture_call(
            entries, make_args(base_url, "response_format_unsupported", 2))
        requests = state.snapshot()
        assert not warnings and result != entries
        assert len(requests) == 2
        assert requests[0]["idempotency"].endswith("-json")
        assert requests[1]["idempotency"].endswith("-plain")
        assert "response_format" in requests[0]["request"]
        assert "response_format" not in requests[1]["request"]
        assert sum("JSON modu desteklenmiyor" in event.get("message", "") for event in events) == 1


def test_cancel_after_response_is_atomic():
    with chaos_server() as (state, base_url):
        cancel_event = threading.Event()
        state.cancel_event = cancel_event
        entries = make_entries(4)
        original = list(entries)
        try:
            capture_call(entries, make_args(
                base_url, "cancel_after_read", 4, llm_cancel_event=cancel_event))
            raise AssertionError("iptal edilen çağrı sonuç döndürdü")
        except T.LLMPostprocessCancelled:
            pass
        assert entries == original
        assert len(state.snapshot()) == 1


def test_delayed_old_response_cannot_mix_with_new_job():
    with chaos_server() as (state, base_url):
        outputs = {}

        def run(name, scenario):
            entries = make_entries(3, prefix=name)
            outputs[name] = capture_call(entries, make_args(base_url, scenario, 3))[0]

        old = threading.Thread(target=run, args=("OLD", "delayed_valid"))
        new = threading.Thread(target=run, args=("NEW", "valid_json"))
        old.start()
        time.sleep(0.01)
        new.start()
        old.join(timeout=3)
        new.join(timeout=3)
        assert not old.is_alive() and not new.is_alive()
        assert all(text.startswith("OLD") for _s, _e, text in outputs["OLD"])
        assert all(text.startswith("NEW") for _s, _e, text in outputs["NEW"])
        keys = {request["idempotency"].rsplit("-", 1)[0] for request in state.snapshot()}
        assert len(keys) == 2


def test_nested_emit_redacts_registered_and_environment_secrets():
    previous = T.os.environ.get("WHISPER_LLM_API_KEY")
    T.os.environ["WHISPER_LLM_API_KEY"] = SECRET
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            T.emit("error", message=f"provider echoed {SECRET}",
                   nested={"traceback": [f"Bearer {SECRET}"]})
    finally:
        if previous is None:
            T.os.environ.pop("WHISPER_LLM_API_KEY", None)
        else:
            T.os.environ["WHISPER_LLM_API_KEY"] = previous
    assert SECRET not in output.getvalue()
    assert output.getvalue().count("[GİZLİ]") == 2


def _run():
    tests = [value for name, value in sorted(globals().items())
             if name.startswith("test_") and callable(value)]
    passed = 0
    failed = []
    for test in tests:
        try:
            test()
            passed += 1
            print(f"  PASS  {test.__name__}")
        except Exception as error:
            failed.append((test.__name__, error))
            print(f"  FAIL  {test.__name__}: {type(error).__name__}: {error}")
    print(f"\n{passed} geçti, {len(failed)} başarısız ({len(tests)} test; "
          f"{len(SCENARIOS) * len(CHUNK_SIZES)} chaos vaka)")
    if MATRIX_METRICS:
        print("  METRİK  chaos={cases} toplam={total_ms}ms p95={p95_ms}ms "
              "maks_http_gövde={max_wire_bytes}B".format(**MATRIX_METRICS))
    return not failed


if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
