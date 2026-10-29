"""Safety checks only; never starts a model or consumes GPU resources."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import sys
import tempfile
from types import SimpleNamespace
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools/voxcpm2"))

spec = importlib.util.spec_from_file_location("accept_dub", Path(__file__).resolve().parents[1] / "tools/voxcpm2/accept_dub.py")
accept = importlib.util.module_from_spec(spec)
spec.loader.exec_module(accept)


class AcceptanceGate(unittest.TestCase):
    def sample(self, free=10000, kind="C+G"):
        return f'<nvidia_smi_log><gpu><product_name>Test GPU</product_name><fb_memory_usage><free>{free} MiB</free><total>12282 MiB</total></fb_memory_usage><processes><process_info><pid>42</pid><type>{kind}</type></process_info></processes></gpu></nvidia_smi_log>'

    def test_compute_busy_and_low_memory_fail_closed(self):
        self.assertFalse(accept.readiness(self.sample(kind="C"))["ready"])
        self.assertFalse(accept.readiness(self.sample(free=8191))["ready"])
        self.assertFalse(accept.readiness(self.sample(kind="unknown"))["ready"])
        self.assertTrue(accept.readiness(self.sample())["ready"])
        no_inventory = self.sample().split("<processes>")[0] + "</gpu></nvidia_smi_log>"
        self.assertFalse(accept.readiness(no_inventory)["ready"])
        with self.assertRaises((ValueError, AttributeError)):
            accept.readiness("<nvidia_smi_log/>")

    def test_busy_run_does_not_create_files_or_import_engine(self):
        with patch.object(accept, "inspect_gpu", return_value={"ready": False}), patch.object(accept.tempfile, "mkdtemp", side_effect=AssertionError("must not create run")):
            self.assertEqual(accept.main(["--run"]), 2)

    def test_final_audio_loss_or_unavailable_verifier_never_passes(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as folder:
            wav = Path(folder) / "final.wav"
            sf.write(wav, np.full(1000, .1, dtype=np.float32), 16000)
            expected = "Bu bir yarış değil. Kimseyi geride bırakmak istemiyoruz."
            def reply(text):
                def respond(*a, **k):
                    self.assertEqual(json.loads(k['input']),{'path':str(wav),'language':'tr'})
                    return SimpleNamespace(returncode=0, stdout=json.dumps({"text": text}))
                return respond
            self.assertTrue(accept.verify_final(wav, "unused", expected, runner=reply(expected))["passed"])
            lost = accept.verify_final(wav, "unused", expected, runner=reply("Bu bir yarış."))
            self.assertFalse(lost["passed"])
            self.assertTrue(lost["verification"]["lost_negation"])
            unavailable = accept.verify_final(wav, "unused", expected, runner=reply(None))
            self.assertFalse(unavailable["passed"])
            self.assertEqual(unavailable["verification"]["status"], "unavailable")
            sf.write(wav, np.zeros(1000, dtype=np.float32), 16000)
            self.assertFalse(accept.verify_final(wav, "unused", expected, runner=reply(expected))["passed"])


if __name__ == "__main__":
    unittest.main()
