"""Safety checks only; never starts a model or consumes GPU resources."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
