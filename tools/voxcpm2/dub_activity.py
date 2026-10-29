"""Report real pending generation without changing its timeout or outcome."""
import asyncio
import json
import time


async def observe(awaitable, *, group, attempt, limit, interval=10, emit=print, stage='synthesis'):
    began = time.monotonic()

    def report(finished=False):
        emit('DUB_ACTIVITY ' + json.dumps(dict(stage=stage, group=group,
             attempt=attempt, elapsed=round(time.monotonic()-began, 1), limit=limit,
             finished=finished)), flush=True)

    async def pulse():
        while True:
            await asyncio.sleep(interval)
            report()

    report()
    heartbeat = asyncio.create_task(pulse())
    try:
        return await awaitable
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)
        report(True)
