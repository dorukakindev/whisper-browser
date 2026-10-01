"""separate_dialogue.py sözleşme kilidi — subprocess zarf testi.

Modül kısa-kesit konuşma ayırma/tekil transkripsiyon işlemlerini stdin JSON
isteğiyle yapar; JS tarafı (src/browser-dialogue.js) yalnız stdout'taki tek
satırlık JSON zarfı okur — çıkış kodu kullanılmaz. Her hata yolunda stdout
tek satır {"ok": false, "error": ...} olmalı; traceback sızmamalı.
"""
import json
import os
import subprocess
import sys
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'separate_dialogue.py')


def run(payload):
    if isinstance(payload, dict):
        payload = json.dumps(payload)
    proc = subprocess.run([sys.executable, SCRIPT], input=payload, capture_output=True,
                          text=True, timeout=30)
    return proc


class SeparateDialogueContract(unittest.TestCase):
    def assert_error_envelope(self, proc, needle=None):
        self.assertEqual(proc.returncode, 0, proc.stderr[:400])
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        self.assertEqual(len(lines), 1, f'stdout tek satır olmalı: {proc.stdout[:300]!r}')
        body = json.loads(lines[0])
        self.assertIs(body.get('ok'), False, body)
        self.assertIsInstance(body.get('error'), str)
        self.assertNotIn('Traceback', proc.stdout + proc.stderr[:0])
        if needle:
            self.assertIn(needle, body['error'])
        return body

    def test_malformed_stdin_returns_envelope(self):
        self.assert_error_envelope(run('not-json'), 'Expecting value')

    def test_empty_stdin_returns_envelope(self):
        self.assert_error_envelope(run(''))

    def test_transcribe_missing_file_returns_envelope(self):
        body = self.assert_error_envelope(run({
            'operation': 'transcribe', 'audio': '/nonexistent-dir/x.wav',
            'model': 'tiny', 'start': 0}))
        self.assertIn('nonexistent', body['error'])

    def test_separate_without_engine_returns_envelope(self):
        body = self.assert_error_envelope(run({
            'operation': 'separate', 'audio': '/x.wav', 'toolDirectory': '/t',
            'output': '/o', 'models': '/m'}))
        self.assertTrue('audio_separator' in body['error'] or 'Konuşma' in body['error'])

    def test_error_is_single_json_line_not_traceback(self):
        proc = run({'operation': 'separate', 'audio': '/x.wav',
                    'toolDirectory': '/t', 'output': '/o', 'models': '/m'})
        self.assertNotIn('Traceback', proc.stdout)
        self.assertNotIn('File "', proc.stdout)


if __name__ == '__main__':
    unittest.main()
