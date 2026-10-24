import sys
import unittest
import copy
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from assistant_stream import stream_answer, PartialAnswerError, clean_pool, run_tool


def chunk(text='', calls=None):
    return NS(choices=[NS(delta=NS(content=text, tool_calls=calls))])


def tool(name, arguments, ident='call1'):
    return NS(index=0, id=ident, function=NS(name=name, arguments=arguments))


class Client:
    def __init__(self, *responses):
        self.responses, self.requests = list(responses), []
        self.chat = NS(completions=NS(create=self.create))

    def create(self, **kwargs):
        self.requests.append(copy.deepcopy(kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class Unsupported(Exception):
    status_code = 400


class StreamTests(unittest.TestCase):
    def run_answer(self, client, context=None, checkpoint=lambda: None):
        events = []
        result = stream_answer(client, [{'role': 'system', 'content': 'Fixture'}, {'role': 'user', 'content': 'Explain'}],
                               {'model': 'fixture'}, lambda kind, **payload: events.append((kind, payload)), checkpoint, context)
        return result, events

    def test_stream_and_closed_resource(self):
        class Stream:
            closed = False
            def __iter__(self): return iter([chunk('İstanbul '), chunk('güzel.')])
            def close(self): self.closed = True
        stream = Stream()
        result, events = self.run_answer(Client(stream))
        self.assertEqual(result[0], 'İstanbul güzel.')
        self.assertEqual(''.join(e['text'] for kind, e in events if kind == 'chat_delta'), result[0])
        self.assertTrue(stream.closed)

    def test_partial_disconnect_does_not_retry(self):
        def broken():
            yield chunk('Keep this answer')
            raise TimeoutError('fixture disconnect')
        client, events = Client(broken()), []
        with self.assertRaises(PartialAnswerError):
            stream_answer(client, [{'role': 'system', 'content': 'Fixture'}], {}, lambda k, **p: events.append(p), lambda: None)
        self.assertEqual(len(client.requests), 1)
        self.assertEqual(''.join(e['text'] for e in events), 'Keep this answer')

    def test_token_limit_keeps_partial_without_false_completion(self):
        ending = chunk()
        ending.choices[0].finish_reason = 'length'
        client, events = Client([chunk('Received prefix'), ending]), []
        with self.assertRaises(PartialAnswerError):
            stream_answer(client, [{'role': 'system', 'content': 'Fixture'}], {}, lambda k, **p: events.append(p), lambda: None)
        self.assertEqual(len(client.requests), 1)
        self.assertEqual(''.join(e['text'] for e in events), 'Received prefix')

    def test_tool_and_stream_compatibility(self):
        client = Client(Unsupported('tools unsupported'), Unsupported('stream unsupported'), NS(choices=[NS(message=NS(content='Fallback'))]))
        result, _ = self.run_answer(client, {'enabled': True, 'rows': [{'id': 'U0', 'start': 1, 'end': 2, 'text': 'hello'}]})
        self.assertEqual(result[0], 'Fallback')
        self.assertNotIn('tools', client.requests[1])
        self.assertNotIn('stream', client.requests[2])

    def test_external_tool_loop_returns_real_evidence_and_proposal_only(self):
        row = {'id': 'U7', 'start': 90, 'end': 94, 'text': 'İstanbul sahnesi', 'translation': 'Istanbul scene'}
        client = Client([chunk(calls=[tool('search_subtitles', '{"query":"Istanbul"}')])],
                        [chunk(calls=[tool('seek_to_time', '{"source_id":"U7"}', 'call2')])], [chunk('See [U7].')])
        (answer, proposals, evidence), events = self.run_answer(client, {'enabled': True, 'rows': [row], 'time': 92})
        self.assertEqual(answer, 'See [U7].')
        self.assertEqual(proposals[0]['source']['start'], 90)
        self.assertEqual(evidence, [row])
        self.assertEqual(client.requests[1]['messages'][-1]['role'], 'tool')
        self.assertIn('proposed', client.requests[2]['messages'][-1]['content'])

    def test_invalid_sources_and_unknown_tools_never_execute(self):
        pool = clean_pool([{'id': 'U1', 'start': 1, 'end': 2, 'text': 'yes'}, {'id': 'U2', 'start': float('inf'), 'end': 9}])
        proposals, evidence = [], {}
        for name, args in [('seek_to_time', {'source_id': 'U99'}), ('shell', {'command': 'anything'})]:
            self.assertIn('error', run_tool(name, args, pool, 0, proposals, evidence))
        self.assertEqual(proposals, [])
        self.assertEqual(len(pool), 1)

    def test_cancellation_keeps_partial_and_closes(self):
        class PipelineCancelled(Exception): pass
        class Stream:
            closed = False
            def __iter__(self):
                yield chunk('Partial')
                raise PipelineCancelled()
            def close(self): self.closed = True
        stream, events = Stream(), []
        with self.assertRaises(PipelineCancelled):
            stream_answer(Client(stream), [{'role': 'system', 'content': 'Fixture'}], {}, lambda k, **p: events.append(p), lambda: None)
        self.assertEqual(events[0]['text'], 'Partial')
        self.assertTrue(stream.closed)

    def test_openai_sdk_reads_real_sse_transport_utf8(self):
        # Local controlled HTTP fixture, not an external provider or local AI model.
        import json
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        try:
            from openai import OpenAI
        except ImportError:
            self.skipTest('OpenAI SDK is not installed in this test environment')
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.end_headers()
                for text in ['İstanbul ', 'sesli yanıtı.']:
                    body = {'id': 'fixture', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'fixture',
                            'choices': [{'index': 0, 'delta': {'content': text}, 'finish_reason': None}]}
                    self.wfile.write(('data: '+json.dumps(body, ensure_ascii=False)+'\n\n').encode('utf8'))
                    self.wfile.flush()
                self.wfile.write(b'data: [DONE]\n\n')
        server = HTTPServer(('127.0.0.1', 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with OpenAI(api_key='fixture-only', base_url=f'http://127.0.0.1:{server.server_port}/v1', max_retries=0, timeout=3) as client:
                result, events = self.run_answer(client)
            self.assertEqual(result[0], 'İstanbul sesli yanıtı.')
            self.assertTrue(requests[0]['stream'])
            self.assertEqual(''.join(payload['text'] for _, payload in events), result[0])
        finally:
            server.shutdown(); server.server_close(); worker.join(timeout=2)


if __name__ == '__main__': unittest.main()
