"""Bounded cancellation for a worker whose cancel acknowledgement can stall."""
import asyncio


class EngineStalled(RuntimeError):
    pass


async def bounded_call(awaitable, timeout, cancel_grace=3):
    task = asyncio.ensure_future(awaitable)
    def consume(done):
        if not done.cancelled():
            done.exception()
    task.add_done_callback(consume)
    async def cancel():
        task.cancel()
        finished, _ = await asyncio.wait({task}, timeout=cancel_grace)
        if not finished:
            # nano-vLLM awaits its cancel RPC in the generator's finally block.
            # A second cancellation releases that await if its worker is dead.
            task.cancel()
            await asyncio.wait({task}, timeout=cancel_grace)
    try:
        finished, _ = await asyncio.wait({task}, timeout=timeout)
        if finished:
            return task.result()
        await cancel()
        raise EngineStalled('Ses motoru yanit zamanini asti; tamamlanan parcalar korunarak yeniden baslatilacak.')
    except asyncio.CancelledError:
        await cancel()
        raise


async def stop_server(server, timeout=15):
    try:
        await bounded_call(server.stop(), timeout)
    except BaseException as error:
        # Only processes owned by this server, never a machine-wide Python kill.
        cleanup_error = None
        for worker in getattr(server, 'servers', []):
            try:
                proc = getattr(worker, 'process', None)
                if proc is not None and proc.is_alive():
                    proc.terminate()
                    await asyncio.to_thread(proc.join, 2)
                    if proc.is_alive():
                        proc.kill()
                        await asyncio.to_thread(proc.join, 2)
                    if proc.is_alive():
                        raise EngineStalled('Voice engine worker did not stop / Ses motoru alt süreci durmadı.')
            except Exception as failure:
                # A denied/stuck child must not leave the remaining owned
                # workers running. Keep the failure until all were attempted;
                # EngineSession retains this server for another cleanup retry.
                if cleanup_error is None:
                    cleanup_error = failure
        if isinstance(error, (asyncio.CancelledError, KeyboardInterrupt, SystemExit)):
            raise
        if cleanup_error is not None:
            raise cleanup_error from error
        print('DUB_WARNING server_shutdown_timeout', flush=True)
