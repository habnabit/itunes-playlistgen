import os
import sysconfig

with open(os.environ['SCRIPT_OUTPUT_FILE_0'], 'w') as outfile:
    outfile.write(f"""
PYTHON_INCLUDEPY = {sysconfig.get_config_var('INCLUDEPY')}
PYTHON_LDVERSION = {sysconfig.get_config_var('LDVERSION')}
PYTHON_LIBDIR = {sysconfig.get_config_var('LIBDIR')}
""")
