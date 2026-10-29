import asyncio
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_activity import observe
class Activity795(unittest.TestCase):
 def test_verification_reports_stage_and_completion_without_hiding_failures(self):
  for cancel in (False,True):
   rows=[]
   async def work():
    if cancel:raise asyncio.CancelledError()
    raise ValueError('controlled failure')
   async def run():
    with self.assertRaises(asyncio.CancelledError if cancel else ValueError):
     await observe(work(),group=61,attempt=2,limit=120,stage='verification',emit=lambda line,**_:rows.append(json.loads(line[13:])))
   asyncio.run(run())
   self.assertEqual([row['finished'] for row in rows],[False,True])
   self.assertTrue(all(row['stage']=='verification' and row['group']==61 for row in rows))
if __name__=='__main__':unittest.main()
