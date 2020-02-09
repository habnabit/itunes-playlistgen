import cffi
import os

os.chdir(os.environ['TEMP_FILES_DIR'])

ffibuilder = cffi.FFI()

with open(os.environ['SCRIPT_INPUT_FILE_1']) as infile:
    ffibuilder.embedding_api(infile.read())

ffibuilder.set_source('itunes_shim', '')

with open(os.environ['SCRIPT_INPUT_FILE_2']) as infile:
    ffibuilder.embedding_init_code(infile.read())

ffibuilder.emit_c_code(os.environ['SCRIPT_OUTPUT_FILE_0'])
