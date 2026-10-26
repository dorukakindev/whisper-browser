"""Owned stdin worker. No network listener, credentials or arbitrary imports."""
import json
import multiprocessing
import sys
import traceback

MAX_REQUEST_CHARS = 200000


def read_request(stream):
    # readline(limit) bounds allocation before JSON decoding; never read an
    # arbitrarily large pipe line and only then check its length.
    line = stream.readline(MAX_REQUEST_CHARS + 1)
    if not line:
        return None
    if len(line) > MAX_REQUEST_CHARS:
        raise ValueError('Worker request too large')
    request = json.loads(line)
    if not isinstance(request, dict):
        raise ValueError('Invalid worker request object')
    if request.get('shutdown') is True:
        return request
    identity = request.get('id')
    if (not isinstance(identity, str) or not identity or len(identity) > 128
            or any(ord(char) < 32 for char in identity)):
        raise ValueError('Invalid worker request id')
    argv = request.get('args')
    if not isinstance(argv, list) or not all(isinstance(arg, str) for arg in argv):
        raise ValueError('Invalid worker request args')
    return request


def main():
    # Windows pipes otherwise decode JSON paths with the locale code page.
    sys.stdin.reconfigure(encoding='utf-8',errors='strict')
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    runtime=EngineSession()
    try:
        while True:
            try:
                request = read_request(sys.stdin)
            except (ValueError, TypeError) as error:
                print('DUB_WORKER_ERROR '+str(error), file=sys.stderr, flush=True)
                return 1  # A request without a trustworthy id cannot be acknowledged.
            if request is None or request.get('shutdown') is True:
                break
            code=0
            try:
                argv=request['args']
                if not isinstance(argv,list) or not all(isinstance(x,str) for x in argv):
                    raise ValueError('Invalid worker request')
                code=reader.main(argv,runtime=runtime) or 0
            except BaseException as error:
                traceback.print_exc(file=sys.stderr)
                try:
                    runtime.run(runtime.reset())
                except BaseException:
                    traceback.print_exc(file=sys.stderr)
                    return 1  # Never accept another job on an unreset engine.
                code=error.code if isinstance(error,SystemExit) and isinstance(error.code,int) else 1
            print('DUB_WORKER_DONE '+json.dumps({'id':request['id'],'code':code}),flush=True)
    finally:
        runtime.close()

if __name__=='__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main() or 0)
