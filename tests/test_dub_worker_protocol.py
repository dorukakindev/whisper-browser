import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import types
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
import dub_worker
from dub_worker import read_request, MAX_REQUEST_CHARS

class ProtocolTests(unittest.TestCase):
    def test_valid_request_and_shutdown(self):
        payload={'id':'1','args':['Türkçe yol.srt','--steps','15']}
        self.assertEqual(read_request(io.StringIO(json.dumps(payload))),payload)
        self.assertTrue(read_request(io.StringIO('{"shutdown":true}'))['shutdown'])
        self.assertIsNone(read_request(io.StringIO('')))
    def test_invalid_protocol_cannot_get_a_trusted_id(self):
        for value in ['{','[]','null','{"id":1,"args":[]}','{"id":"1","args":[1]}','{"id":"","args":[]}']:
            with self.assertRaises((ValueError,TypeError)):
                read_request(io.StringIO(value))
    def test_limit_is_applied_while_reading(self):
        stream=io.StringIO('x'*(MAX_REQUEST_CHARS*3))
        with self.assertRaisesRegex(ValueError,'too large'):
            read_request(stream)
        self.assertEqual(stream.tell(),MAX_REQUEST_CHARS+1)

class MainTests(unittest.TestCase):
    def test_reset_failure_exits_instead_of_accepting_next_job(self):
        class Stream(io.StringIO):
            def reconfigure(self,**kwargs):pass
        class Runtime:
            closed=False
            def reset(self):return None
            def run(self,value):raise RuntimeError('reset failed')
            def close(self):self.closed=True
        runtime=Runtime()
        def failed_reader(*args,**kwargs):raise ValueError('generation failed')
        modules={'altyazi_oku':types.SimpleNamespace(main=failed_reader),'dub_runtime':types.SimpleNamespace(EngineSession=lambda:runtime)}
        output=io.StringIO()
        with patch.dict(sys.modules,modules),patch.object(sys,'stdin',Stream('{"id":"1","args":[]}\n{"id":"2","args":[]}\n')),patch.object(sys,'stdout',output),patch.object(sys,'stderr',io.StringIO()):
            code=dub_worker.main()
        self.assertEqual(code,1)
        self.assertTrue(runtime.closed)
        self.assertNotIn('DUB_WORKER_DONE',output.getvalue())

    def test_done_contains_bounded_request_diagnostic_tail(self):
        class Stream(io.StringIO):
            def reconfigure(self, **kwargs): pass
        class Runtime:
            def reset(self): return None
            def run(self, value): pass
            def close(self): pass
        def reader(*args, **kwargs):
            sys.stderr.write('x'*40000+'\nRequest failure')
            raise ValueError('controlled failure')
        output=io.StringIO()
        with patch.dict(sys.modules,{'altyazi_oku':types.SimpleNamespace(main=reader),'dub_runtime':types.SimpleNamespace(EngineSession=Runtime)}),patch.object(sys,'stdin',Stream('{"id":"1","args":[]}\n')),patch.object(sys,'stdout',output),patch.object(sys,'stderr',io.StringIO()):
            dub_worker.main()
        done=json.loads(next(line[16:] for line in output.getvalue().splitlines() if line.startswith('DUB_WORKER_DONE ')))
        self.assertEqual(done['id'],'1');self.assertEqual(done['code'],1)
        self.assertLessEqual(len(done['stderr']),32768)
        self.assertIn('controlled failure',done['stderr'])

if __name__=='__main__':unittest.main()
