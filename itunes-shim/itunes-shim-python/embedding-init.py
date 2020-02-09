import sys
from itunes_shim import ffi

@ffi.def_extern()
def set_argv(argc, argv):
    sys.argv[:] = [ffi.string(argv[i]).decode('utf-8') for i in range(argc)]

@ffi.def_extern()
def run_python(size, source):
    try:
        exec(bytes(source[0:size]).decode('utf-8'))
    except SystemExit as e:
        return e.code
    else:
        return 0
