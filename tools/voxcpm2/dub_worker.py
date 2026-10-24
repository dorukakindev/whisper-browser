"""Owned stdin worker. No network listener, credentials or arbitrary imports."""
import json
import multiprocessing
import sys
import traceback

def main():
    # Windows pipes otherwise decode JSON paths with the locale code page.
    sys.stdin.reconfigure(encoding='utf-8',errors='strict')
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    runtime=EngineSession()
    try:
        for line in sys.stdin:
            if len(line)>200000:
                raise ValueError('Worker request too large')
            request=json.loads(line)
            if request.get('shutdown'):
                break
            code=0
            try:
                argv=request['args']
                if not isinstance(argv,list) or not all(isinstance(x,str) for x in argv):
                    raise ValueError('Invalid worker request')
                code=reader.main(argv,runtime=runtime) or 0
            except BaseException as error:
                traceback.print_exc(file=sys.stderr)
                runtime.run(runtime.reset())
                code=error.code if isinstance(error,SystemExit) and isinstance(error.code,int) else 1
            print('DUB_WORKER_DONE '+json.dumps({'id':request['id'],'code':code}),flush=True)
    finally:
        runtime.close()

if __name__=='__main__':
    multiprocessing.freeze_support()
    main()
