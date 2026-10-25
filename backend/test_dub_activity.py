import asyncio
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_activity import observe
from dub_lifecycle import bounded_call, EngineStalled


class ActivityTests(unittest.IsolatedAsyncioTestCase):
    async def test_reports_pending_group_and_stops_after_success(self):
        events = []
        async def generate():
            await asyncio.sleep(.035)
            return 'completed audio'
        result = await observe(generate(), group=61, attempt=2, limit=180,
                               interval=.01, emit=lambda s, **kw: events.append(json.loads(s[13:])))
        self.assertEqual(result, 'completed audio')
        self.assertGreaterEqual(len(events), 2)
        self.assertTrue(all(e['group'] == 61 and e['attempt'] == 2 for e in events))
        size = len(events)
        await asyncio.sleep(.025)
        self.assertEqual(size, len(events))

    async def test_existing_timeout_still_cancels_generation_and_heartbeat(self):
        events = []
        cancelled = []
        async def generate():
            try:
                await asyncio.sleep(5)
            finally:
                cancelled.append(True)
        with self.assertRaises(EngineStalled):
            await bounded_call(observe(generate(), group=61, attempt=1, limit=180,
                                      interval=.01, emit=lambda s, **kw: events.append(s)), .035, .02)
        self.assertEqual(cancelled, [True])
        size = len(events)
        await asyncio.sleep(.025)
        self.assertEqual(size, len(events))


if __name__ == '__main__':
    unittest.main()
