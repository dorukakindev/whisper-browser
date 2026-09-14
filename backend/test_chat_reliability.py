"""Gerçek sohbet işlevi, kontrollü sağlayıcı; ağ veya gerçek anahtar kullanmaz."""
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import transcribe as T
from test_transcribe import _fake_openai, _chat_args


class ChatReliabilityTests(unittest.TestCase):
    def invoke(self, replies, checkpoint=None):
        calls, events, settings = [], [], []

        class Client:
            def __init__(self, **kw):
                settings.append(kw)
                self.chat = types.SimpleNamespace(completions=self)

            def create(self, **kw):
                calls.append(kw)
                item = replies.pop(0)
                if isinstance(item, Exception):
                    raise item
                return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=item))])

        with tempfile.TemporaryDirectory() as folder:
            payload = Path(folder) / 'chat.json'
            payload.write_text(json.dumps({'question': 'Bu sahnede ne konuşuluyor?', 'context': {'transcript_evidence': {'evidence': [{'id': 'T1', 'metin': 'Merhaba'}]}}}), encoding='utf-8')
            with _fake_openai(Client), patch.object(T, 'emit', lambda kind, **kw: events.append((kind, kw))), patch.object(T.time, 'sleep'), patch.object(T, 'cancellation_checkpoint', checkpoint or (lambda *_: None)):
                try:
                    T.chat_about_video(_chat_args(payload))
                    error = None
                except (Exception, T.PipelineCancelled) as caught:
                    error = caught
        return calls, events, settings, error

    def test_answer_citations_and_modality_rules(self):
        calls, events, settings, error = self.invoke(['Merhaba [T1]'])
        self.assertIsNone(error)
        self.assertEqual([event[0] for event in events], ['chat', 'done'])
        self.assertEqual(settings[0]['timeout'], 30)
        self.assertEqual(settings[0]['max_retries'], 0)
        prompt = calls[0]['messages'][0]['content']
        self.assertIn('Goruntu, kare veya ses verilmedi', prompt)
        self.assertIn('[T1]', prompt)

    def test_auth_error_is_not_retried_or_exposed(self):
        calls, events, _, error = self.invoke([RuntimeError('401 invalid_api_key provider-private-text')])
        self.assertEqual(len(calls), 1)
        self.assertFalse(events)
        self.assertIn('kimlik', str(error))
        self.assertNotIn('provider-private-text', str(error))

    def test_transient_failure_recovers(self):
        calls, events, _, error = self.invoke([TimeoutError('timed out'), 'Yanıt [T1]'])
        self.assertIsNone(error)
        self.assertEqual(len(calls), 2)
        self.assertEqual(events[0][0], 'chat')

    def test_empty_reply_does_not_emit_success(self):
        _, events, _, error = self.invoke([''] * 8)
        self.assertFalse(events)
        self.assertIn('boş yanıt', str(error))

    def test_cancelled_response_is_not_published(self):
        def checkpoint(stage, point):
            if point == 'after':
                raise T.PipelineCancelled('llm', 'after')
        calls, events, _, error = self.invoke(['Geç yanıt'], checkpoint)
        self.assertIsInstance(error, T.PipelineCancelled)
        self.assertFalse(events)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
