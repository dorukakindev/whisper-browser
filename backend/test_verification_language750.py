import sys,unittest,asyncio,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_quality import verification_request
from test_audit527 import extracted
from types import SimpleNamespace
import contextlib,io

class VerificationLanguageTests(unittest.TestCase):
    def test_turkish_hint_is_conservative_and_does_not_include_target_words(self):
        self.assertEqual(verification_request('voice.wav','İşte buradayız.'),{'path':'voice.wav','language':'tr'})
        self.assertEqual(verification_request('voice.wav','şimdi'),{'path':'voice.wav','language':'tr'})
        for text in ['Hello world.','Guten Tag, über Öl.','Ça va bien.','Merhaba.']:
            self.assertEqual(verification_request('voice.wav',text),{'path':'voice.wav'})

    def test_actual_speech_verifier_transport_and_language_evidence(self):
        async def scenario():
            writes=[]
            async def drain(): pass
            async def readline(): return json.dumps({'text':'İşte buradayız.','language':'tr'}).encode()+b'\n'
            cls=extracted('SpeechVerifier',dict(asyncio=asyncio,json=json,speech_check=lambda *args:{'review':False}))
            verifier=cls('fixture');verifier.proc=SimpleNamespace(stdin=SimpleNamespace(write=writes.append,drain=drain),stdout=SimpleNamespace(readline=readline))
            with contextlib.redirect_stdout(io.StringIO()): result=await verifier.check('voice.wav','İşte buradayız.')
            self.assertEqual(json.loads(writes[0]),{'path':'voice.wav','language':'tr'})
            self.assertEqual(result['requestedLanguage'],'tr');self.assertEqual(result['recognizedLanguage'],'tr')
        asyncio.run(scenario())

if __name__=='__main__': unittest.main()
