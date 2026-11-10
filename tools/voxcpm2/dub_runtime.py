"""Private process-local timing and bounded warm-engine ownership."""
import asyncio
from contextlib import contextmanager, nullcontext
import hashlib
import json
import time

class Phases:
    def __init__(self, clock=time.monotonic):
        self.clock, self.started, self.seconds = clock, clock(), {}
    @contextmanager
    def measure(self, name):
        began = self.clock()
        try:
            yield
        finally:
            self.seconds[name] = self.seconds.get(name, 0) + max(0, self.clock()-began)
            print('DUB_STAGE '+json.dumps({'stage':name,'seconds':round(self.seconds[name],4)}), flush=True)
    def snapshot(self):
        return {**{key+'_seconds':round(value,4) for key,value in self.seconds.items()},
                'wall_seconds':round(self.clock()-self.started,4)}

def measured(args, name):
    meter=getattr(args,'phases',None)
    return meter.measure(name) if meter else nullcontext()


async def reference_call(args, stage, awaitable):
    """Report the exact bounded reference RPC, including a silent engine wait."""
    from dub_lifecycle import bounded_call, EngineStalled
    began = time.monotonic()
    def report(state):
        print('DUB_REFERENCE_ACTIVITY '+json.dumps({'stage':stage,'state':state,
              'elapsed':round(time.monotonic()-began,2),'limit':args.ready_timeout}),flush=True)
    async def heartbeat():
        while True:
            await asyncio.sleep(5)
            report('waiting')
    report('start')
    pulse=asyncio.create_task(heartbeat())
    state='finished'
    try:
        with measured(args,stage):
            return await bounded_call(awaitable,args.ready_timeout)
    except EngineStalled as error:
        state='timeout'
        labels={'reference_encode':('Reference encoding','Referans ses kodlama'),
                'reference_prompt':('Reference prompt preparation','Referans konuşma örneği hazırlığı'),
                'reference_remove':('Previous prompt release','Önceki konuşma örneğinin bırakılması')}
        en,tr=labels.get(stage,('Reference preparation','Referans hazırlığı'))
        failure=EngineStalled(en+' timed out; completed speech is preserved. / '+tr+' zaman aşımına uğradı; tamamlanan ses korunur.')
        failure.stage=stage
        raise failure from error
    except BaseException:
        state='failed'
        raise
    finally:
        pulse.cancel()
        await asyncio.gather(pulse,return_exceptions=True)
        report(state)

def capacity(free, total, requested, maximum=.8):
    """Conservative cold-start advisory; never override engine KV safety checks."""
    if total<=0 or free<0 or free>total:
        return requested, maximum
    gib=1024**3
    usable=max(0,free-.6*gib)
    parallel=8 if usable>=10*gib else 4 if usable>=8*gib else 2 if usable>=6.5*gib else 1
    # This is an upper fraction of total VRAM, not a fraction of free VRAM.
    # Too small a fraction can put the model itself above its KV-cache budget.
    budget=min(maximum,max(.1,usable/total))
    return min(requested,parallel),round(budget,3)

def choose_capacity(args):
    import torch
    free,total=torch.cuda.mem_get_info()
    # Sıcak motor sonraki işler için de boyutlanır: kullanıcının yapılandırdığı eşzamanlılık esas alınır, bu işin eksik-grup sınırı değil.
    requested=getattr(args,'configured_concurrency',getattr(args,'requested_concurrency',args.eszamanli))
    parallel,budget=capacity(free,total,requested,args.gpu_mem)
    if free<5.5*1024**3:
        raise RuntimeError('GPU memory busy: less than 5.5 GiB free; finish another GPU job and retry. The reference is unchanged.')
    args.eszamanli=parallel
    print('DUB_CAPACITY '+json.dumps({'requested':requested,'concurrency':parallel,'freeMiB':round(free/1024**2),'totalMiB':round(total/1024**2),'budget':budget}),flush=True)
    print('DUB_CONCURRENCY '+str(parallel),flush=True)
    return parallel,budget

class EngineSession:
    def __init__(self):
        self.loop=asyncio.new_event_loop()
        self.server=None
        self.key=None
        self.reference=None
        self.loaded=None
        self.verifier=None
        self.verifier_python=None
        self.stuck_verifiers=[]
    def run(self, coroutine):
        return self.loop.run_until_complete(coroutine)
    async def acquire(self, args, model, factory, ref_bytes, prompt):
        from dub_lifecycle import bounded_call
        requested=getattr(args,'requested_concurrency',args.eszamanli)
        key=(model,args.steps,args.batch_tokens,args.max_model_len,args.gpu_mem)
        if self.server is not None and self.key==key:
            args.eszamanli=min(requested,self.loaded['concurrency'])
            print('DUB_ENGINE '+json.dumps({'reused':True,'concurrency':args.eszamanli}),flush=True)
            return self.server
        await self.reset()
        if self.stuck_verifiers:
            from dub_lifecycle import EngineStalled
            raise EngineStalled('Verifier cleanup is pending; completed speech remains recoverable.')
        parallel,budget=choose_capacity(args)
        args.eszamanli=min(parallel,requested)   # bu işin kabul sınırı (tek kuyruk için kısılmış) korunur; sunucu tam kapasiteyle yüklenir
        self.server=factory(model,devices=[0],inference_timesteps=args.steps,max_num_seqs=parallel,
            max_num_batched_tokens=args.batch_tokens,max_model_len=args.max_model_len,
            gpu_memory_utilization=budget,enforce_eager=False)
        self.key=key
        self.loaded={'concurrency':parallel}
        await bounded_call(self.server.wait_for_ready(),args.ready_timeout)
        print('DUB_ENGINE '+json.dumps({'reused':False,'concurrency':parallel}),flush=True)
        return self.server
    async def prepare_reference(self,args,wav,prompt):
        from dub_lifecycle import bounded_call
        key=(hashlib.sha256(wav).hexdigest(),prompt)
        if self.reference and self.reference[0]==key:
            print('DUB_REFERENCE_CACHE '+json.dumps({'reused':True}),flush=True)
            return self.reference[1:]
        # Latents describe the waveform, not its transcript/conditioning mode.
        # Editing the transcript must replace the continuation prompt, but it
        # need not run the unchanged voice through the encoder again.
        previous = self.reference
        same_wave = previous is not None and previous[0][0] == key[0]
        if self.reference and self.reference[2]:
            await reference_call(args,'reference_remove',self.server.remove_prompt(self.reference[2]))
        self.reference=None
        lat=previous[1] if same_wave else await reference_call(args,'reference_encode',self.server.encode_latents(wav,'wav'))
        pid=await reference_call(args,'reference_prompt',self.server.add_prompt(wav,'wav',prompt)) if prompt else None
        self.reference=(key,lat,pid)
        print('DUB_REFERENCE_CACHE '+json.dumps({'reused':False,'latentsReused':same_wave}),flush=True)
        return lat,pid
    async def get_verifier(self, python, factory):
        if self.verifier is not None and (self.verifier_python!=str(python) or getattr(self.verifier,'unavailable',False)):
            await self.verifier.close()
            self.verifier=None
        if self.verifier is None:
            self.verifier=factory(python)
            self.verifier_python=str(python)
        return self.verifier
    async def reset(self):
        from dub_lifecycle import stop_server
        server=self.server
        self.server=None;self.key=None;self.reference=None;self.loaded=None
        verifier=self.verifier;self.verifier=None;self.verifier_python=None
        pending=([verifier] if verifier is not None else [])+list(self.stuck_verifiers);self.stuck_verifiers=[]
        try:
            for item in pending:
                try: await item.close()
                except Exception as error:
                    # Kapanışı doğrulanamayan doğrulayıcı sahipsiz bırakılmaz; sonraki reset/close yeniden dener ve özgün hata maskelenmez.
                    self.stuck_verifiers.append(item)
                    print('DUB_WARNING verifier_close_failed '+type(error).__name__,flush=True)
        finally:
            if server is not None:
                try:
                    await stop_server(server)
                except BaseException:
                    # Keep the exact owned engine reachable for another reset.
                    # key/loaded stay invalid: it cannot be reused for synthesis
                    # or replaced by a new GPU engine before a confirmed stop.
                    self.server=server
                    raise
    def close(self):
        try:self.run(self.reset())
        finally:self.loop.close()
