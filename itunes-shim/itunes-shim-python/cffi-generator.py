import cffi
import os
import sysconfig

os.chdir(os.environ['TEMP_FILES_DIR'])

ffibuilder = cffi.FFI()

with open(os.environ['SCRIPT_INPUT_FILE_1']) as infile:
    ffibuilder.embedding_api(infile.read())

# not really sure why i need this libdir
ffibuilder.set_source(
    'itunes_shim', '',
    library_dirs=[sysconfig.get_config_var('LIBDIR')])

with open(os.environ['SCRIPT_INPUT_FILE_2']) as infile:
    ffibuilder.embedding_init_code(infile.read())

ffibuilder.compile(target=os.environ['SCRIPT_OUTPUT_FILE_0'], verbose=True)
