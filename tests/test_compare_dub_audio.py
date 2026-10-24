import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np
import soundfile as sf
spec=importlib.util.spec_from_file_location('compare_dub_audio',Path(__file__).resolve().parents[1]/'tools'/'compare-dub-audio.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class CompareTests(unittest.TestCase):
    def test_unicode_windows_audio_path_is_opened_through_python_file_api(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'Çıktı'/'Örnek konuşma.wav';target.parent.mkdir()
            with target.open('wb') as stream:sf.write(stream,np.sin(np.arange(8000)*.1).astype('float32')*.05,8000,format='WAV')
            result=module.describe(target)
            self.assertEqual(result['name'],target.name)
            self.assertEqual(result['seconds'],1)
            self.assertGreater(result['rms'],0)
if __name__=='__main__':unittest.main()
