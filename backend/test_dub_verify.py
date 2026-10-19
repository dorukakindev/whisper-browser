"""CPU verifier framing and errors, without model downloads."""
import contextlib
import io
import json
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import dub_verify


class VerifierTests(unittest.TestCase):
    def run_worker(self, source):
        calls=[]
        class Model:
            def __init__(self, name, **options): calls.append((name,options))
            def transcribe(self, path, **options):
                calls.append((path,options))
                if path == 'broken.wav': raise RuntimeError('private native error')
                return iter([SimpleNamespace(text=' Merhaba dünya. ')]),None
        output=io.StringIO()
        with patch.dict(sys.modules,{'faster_whisper':SimpleNamespace(WhisperModel=Model)}), \
                patch.object(sys,'stdin',io.StringIO(source)),contextlib.redirect_stdout(output):
            dub_verify.main()
        return [json.loads(line) for line in output.getvalue().splitlines()],calls

    def test_uses_cached_cpu_model_and_emits_one_response_per_request(self):
        rows,calls=self.run_worker(json.dumps({'path':'Türkçe.wav'})+'\n')
        self.assertEqual(rows,[{'text':'Merhaba dünya.'}])
        self.assertEqual(calls[0],('small',{'device':'cpu','compute_type':'int8','local_files_only':True}))
        self.assertEqual(calls[1][0],'Türkçe.wav')
        self.assertTrue(calls[1][1]['vad_filter'])
        self.assertFalse(calls[1][1]['condition_on_previous_text'])

    def test_bad_input_or_audio_does_not_leak_native_details_or_break_next_request(self):
        rows,_=self.run_worker('invalid json\n'+json.dumps({'path':'broken.wav'})+'\n'+json.dumps({'path':'good.wav'})+'\n')
        self.assertEqual(rows,[{'error':'verification_unavailable'},
                               {'error':'verification_unavailable'},{'text':'Merhaba dünya.'}])


if __name__ == '__main__': unittest.main()
