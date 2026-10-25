"""Report real pending generation without changing its timeout or outcome."""
import asyncio
import json
import time


async def observe(awaitable, *, group, attempt, limit, interval=10, emit=print):
    began = time.monotonic()

    def report():
        emit('DUB_ACTIVITY ' + json.dumps(dict(stage='synthesis', group=group,
             attempt=attempt, elapsed=round(time.monotonic()-began, 1), limit=limit)), flush=True)

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
