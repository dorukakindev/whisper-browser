#!/usr/bin/env python3
"""QA-109 fixture server: controlled OpenAI-compatible translation endpoint +
static media/subtitle/page/HLS serving with HTTP Range support.

Control plane (no auth, localhost only):
  GET  /ctl/mode?set=ok|e401|e403|e429|e500|e503|model_nf|timeout|hang|html|truncated|badjson|badids|missing_ids|extra_ids|wrong_whole|no_usage|zero_usage
  POST /ctl/push          body: JSON array of scripted response payloads (each = one chat.completions reply)
  GET  /ctl/requests      -> JSONL of provider request log
  POST /ctl/reset         -> clear script queue + request log + mode=ok
  GET  /ctl/state         -> {mode, queued, requests}
Anything else under /media /subs /page /hls serves files from qa-109/fixtures/.
"""
import json, mimetypes, os, re, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs', 'provider-requests.jsonl')
STATE = {'mode': 'ok', 'script': [], 'lock': threading.Lock()}

def log_request(entry):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with STATE['lock']:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

_VSHIFT = str.maketrans({'a': 'ı', 'e': 'i', 'i': 'e', 'o': 'ö', 'u': 'ü',
                         'A': 'I', 'E': 'İ', 'I': 'İ', 'O': 'Ö', 'U': 'Ü'})


def _mock_tr(text):
    """Turkish-looking surrogate: vowel-shifted tokens (names/numbers/markers
    verbatim) — quality gate must not read it as untranslated source text."""
    out = []
    for tok in str(text).split(' '):
        m = re.match(r"^(.*?)([.,!?…;:'\"”’\)\]}]*)$", tok)
        core, trail = m.group(1), m.group(2)
        if (not core or core[:1].isupper()
                or core.lower() in _ANCHOR_WORDS
                or re.fullmatch(r"[\d.,%+₺€$£\-–—/]*", core)
                or core.startswith(('(', '[', '♪'))):
            out.append(core + trail)
            continue
        out.append(core.translate(_VSHIFT) + trail)
    return ' '.join(out)


# Birim/ay/gün/para sözcükleri çeviri kapılarının demirlediği yazımlardır —
# fixture bunları verbatim bırakır (gerçek sağlayıcı da aynı karşılığı verir).
_ANCHOR_WORDS = frozenset(
    "km kilometer kilometers kilometre m meter meters metre kg kilogram "
    "kilograms g gram grams l liter liters litre litres mile miles mil "
    "hour hours hr hrs saat minute minutes min mins dakika second seconds "
    "sec secs saniye january february march april may june july august "
    "september october november december jan feb mar apr jun jul aug sep "
    "sept oct nov dec monday tuesday wednesday thursday friday saturday "
    "sunday dollar dollars euro euros pound pounds lira try tl usd eur gbp "
    "yen jpy cent cents percent one two three four five six seven eight "
    "nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
    "eighteen nineteen twenty thirty forty fifty sixty seventy eighty "
    "ninety hundred thousand million billion half quarter dozen".split())


def default_translate(payload):
    """Deterministic mock translator: word-reversed, preserves all anchors.
    Returns contract shape."""
    out_items, out_sentences = {}, {}
    items = {it['i']: it for it in payload.get('items', [])}
    groups = payload.get('sentence_groups') or []
    if not groups:  # legacy flat-items contract
        for it in payload.get('items', []):
            out_items[str(it['i'])] = _mock_tr(it.get('t', ''))
        return {'items': out_items}
    for g in groups:
        parts = {}
        whole_parts = []
        for cid in g['ids']:
            t = _mock_tr(items[cid]['t']) if cid in items else 'TR:?'
            parts[str(cid)] = t
            whole_parts.append(t)
        out_items.update(parts)
        out_sentences[str(g['ids'][0])] = ' '.join(whole_parts)
    return {'sentences': out_sentences, 'items': out_items}

def chat_completion(content_obj, model, usage='normal'):
    content = content_obj if isinstance(content_obj, str) else json.dumps(content_obj, ensure_ascii=False)
    msg = {'id': 'chatcmpl-fixture', 'object': 'chat.completion', 'created': int(time.time()),
           'model': model or 'fixture-model',
           'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}]}
    if usage == 'normal':
        msg['usage'] = {'prompt_tokens': 111, 'completion_tokens': 22, 'total_tokens': 133}
    elif usage == 'zero':
        msg['usage'] = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    return msg

def parse_payload(messages):
    for m in reversed(messages or []):
        if m.get('role') != 'user':
            continue
        try:
            return json.loads(m.get('content', ''))
        except Exception:
            continue
    return {}

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'qa109-fixture/1.0'

    def log_message(self, *a):  # quiet
        pass

    # ---------- helpers ----------
    def _send(self, code, body=b'', ctype='text/plain; charset=utf-8', extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('content-type', ctype)
        self.send_header('content-length', str(len(body)))
        self.send_header('cache-control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _json(self, code, obj, extra=None):
        self._send(code, json.dumps(obj, ensure_ascii=False), 'application/json', extra)

    def _file(self, path):
        if not os.path.isfile(path):
            return self._send(404, 'not found: ' + path)
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if path.endswith('.m3u8'):
            ctype = 'application/vnd.apple.mpegurl'
        elif path.endswith('.vtt'):
            ctype = 'text/vtt'
        elif path.endswith(('.ts', '.m4s')):
            ctype = 'video/mp2t'
        rng = self.headers.get('range')
        start, end = 0, size - 1
        code = 200
        if rng:
            m = re.match(r'bytes=(\d*)-(\d*)', rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                if m.group(2):
                    end = min(int(m.group(2)), size - 1)
                if m.group(1) == '':
                    start = max(0, size - int(m.group(2))); end = size - 1
                if start > end or start >= size:
                    return self._send(416, 'bad range', extra={'content-range': f'bytes */{size}'})
                code = 206
        length = end - start + 1
        self.send_response(code)
        self.send_header('content-type', ctype)
        self.send_header('content-length', str(length))
        self.send_header('accept-ranges', 'bytes')
        if code == 206:
            self.send_header('content-range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command == 'HEAD':
            return
        with open(path, 'rb') as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # ---------- routing ----------
    def do_GET(self):
        u = self.path.split('?', 1)
        path, qs = u[0], (u[1] if len(u) > 1 else '')
        if path == '/ctl/mode':
            m = dict(p.split('=', 1) for p in qs.split('&') if '=' in p).get('set', 'ok')
            STATE['mode'] = m
            return self._json(200, {'mode': m})
        if path == '/ctl/requests':
            try:
                data = open(LOG, encoding='utf-8').read()
            except FileNotFoundError:
                data = ''
            return self._send(200, data, 'application/x-ndjson')
        if path == '/ctl/state':
            with STATE['lock']:
                return self._json(200, {'mode': STATE['mode'], 'queued': len(STATE['script'])})
        if path == '/ctl/reset':
            with STATE['lock']:
                STATE['mode'] = 'ok'; STATE['script'] = []
            open(LOG, 'w').close()
            return self._json(200, {'ok': True})
        if path == '/ctl/metrics':
            try:
                lines = [json.loads(l) for l in open(LOG, encoding='utf-8')]
            except FileNotFoundError:
                lines = []
            return self._json(200, {'total': len(lines), 'models': sorted({l.get('model') for l in lines}),
                                    'groups': sum(l.get('groups', 0) for l in lines)})
        if path.startswith('/delay/'):
            sec = float(path.split('/')[-1] or 1)
            time.sleep(min(sec, 30))
            return self._send(200, f'delayed {sec}s')
        for prefix in ('/media/', '/subs/', '/page/', '/hls/'):
            if path.startswith(prefix):
                return self._file(os.path.join(ROOT, path.lstrip('/')))
        return self._send(404, 'qa109 fixture: unknown ' + path)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        n = int(self.headers.get('content-length') or 0)
        body = self.rfile.read(n) if n else b''
        if path == '/ctl/push':
            try:
                arr = json.loads(body)
                assert isinstance(arr, list)
                with STATE['lock']:
                    STATE['script'].extend(arr)
                return self._json(200, {'queued': len(STATE['script'])})
            except Exception as e:
                return self._json(400, {'error': str(e)})
        if path == '/ctl/reset':
            return self.do_GET()
        if path == '/v1/chat/completions' or path.endswith('/chat/completions'):
            return self._chat(body)
        if path == '/ctl/echo':
            return self._send(200, body, 'application/json')
        return self._send(404, 'unknown POST ' + path)

    def _chat(self, body):
        try:
            req = json.loads(body)
        except Exception:
            return self._json(400, {'error': {'message': 'bad json', 'type': 'invalid_request_error'}})
        payload = parse_payload(req.get('messages'))
        entry = {'ts': round(time.time(), 3), 'model': req.get('model'),
                 'items': len(payload.get('items', [])), 'groups': len(payload.get('sentence_groups') or []),
                 'ids': [g.get('ids') for g in (payload.get('sentence_groups') or [])],
                 'sg': [{'ids': g.get('ids'), 'source': g.get('source')} for g in (payload.get('sentence_groups') or [])],
                 'item_texts': [it.get('t') for it in payload.get('items', [])],
                 'has_context': bool(payload.get('context_before') or payload.get('context_after')),
                 'response_format': req.get('response_format'),
                 'system_head': (req.get('messages') or [{}])[0].get('content', '')[:80]}
        with STATE['lock']:
            scripted = STATE['script'].pop(0) if STATE['script'] else None
            mode = STATE['mode']
        # --- error modes (istek yine sayılır: E13 sayaç eşleşmesi) ---
        if mode in ('e401', 'e403', 'e429', 'e500', 'e503', 'model_nf',
                    'html', 'timeout', 'hang'):
            entry['mode'] = mode
            log_request(entry)
        if mode == 'e401':
            return self._json(401, {'error': {'message': 'Invalid API key', 'type': 'invalid_api_key', 'code': 401}})
        if mode == 'e403':
            return self._json(403, {'error': {'message': 'Forbidden', 'type': 'permission_error', 'code': 403}})
        if mode == 'e429':
            return self._json(429, {'error': {'message': 'Rate limit', 'type': 'rate_limit_error', 'code': 429}},
                              extra={'retry-after': '2'})
        if mode == 'e500':
            return self._json(500, {'error': {'message': 'Internal error', 'type': 'server_error'}})
        if mode == 'e503':
            return self._send(503, 'Service Unavailable')
        if mode == 'model_nf':
            return self._json(404, {'error': {'message': 'model_not_found: fixture-x', 'type': 'invalid_request_error', 'code': 'model_not_found'}})
        if mode == 'html':
            return self._send(502, '<html><body>Bad Gateway — nginx/1.22</body></html>', 'text/html')
        if mode == 'timeout':
            time.sleep(90)  # client timeout will fire first
        if mode == 'hang':
            self.close_connection = True
            return  # drop connection
        if mode == 'slow':
            entry['mode'] = mode
            time.sleep(3)
        entry['mode'] = mode
        entry['scripted'] = bool(scripted)
        if scripted is not None:
            log_request(entry)
            if isinstance(scripted, dict) and scripted.get('_sleep'):
                time.sleep(scripted['_sleep'])
                scripted = {k: v for k, v in scripted.items() if k != '_sleep'}
            if isinstance(scripted, dict) and scripted.get('_http'):
                return self._send(scripted['_http'], scripted.get('body', ''), scripted.get('ctype', 'text/plain'))
            content = scripted.get('content', scripted) if isinstance(scripted, dict) else scripted
            return self._json(200, chat_completion(content, req.get('model'),
                                                   scripted.get('usage', 'normal') if isinstance(scripted, dict) else 'normal'))
        # --- malformed-response modes ---
        if mode == 'badjson':
            log_request(entry)
            return self._json(200, chat_completion('{not json at all', req.get('model')))
        if mode == 'truncated':
            log_request(entry)
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"choices":[{"message":{"content":"{"items":')
            self.close_connection = True
            return
        if mode == 'no_usage':
            log_request(entry)
            return self._json(200, chat_completion(default_translate(payload), req.get('model'), usage='none'))
        if mode == 'zero_usage':
            log_request(entry)
            return self._json(200, chat_completion(default_translate(payload), req.get('model'), usage='zero'))
        if mode == 'badids':
            log_request(entry)
            ans = default_translate(payload)
            ans['items'] = {k + 'x': v for k, v in ans['items'].items()}
            ans['sentences'] = {k + 'x': v for k, v in ans['sentences'].items()}
            return self._json(200, chat_completion(ans, req.get('model')))
        if mode == 'wrong_whole':
            log_request(entry)
            ans = default_translate(payload)
            for k in ans.get('sentences', {}):
                ans['sentences'][k] = 'TAMAMEN FARKLI BÜTÜN.'
            return self._json(200, chat_completion(ans, req.get('model')))
        log_request(entry)
        return self._json(200, chat_completion(default_translate(payload), req.get('model')))


def main(port=8788):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    open(LOG, 'a').close()
    srv = ThreadingHTTPServer(('127.0.0.1', port), H)
    print(f'fixture server on http://127.0.0.1:{port}', flush=True)
    srv.serve_forever()

if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8788)
