"""Harmless parent/grandchild process tree for cancellation tests."""

import json
import os
import subprocess
import sys
import time


child = subprocess.Popen(
    [sys.executable, "-c", "import time; time.sleep(3600)"],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
print(json.dumps({"parent": os.getpid(), "child": child.pid}), flush=True)
while True:
    time.sleep(1)
