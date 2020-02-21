import Foundation
import iTunesLibrary

signal(SIGPIPE, SIG_IGN)
set_argv(CommandLine.argc, CommandLine.unsafeArgv)

var source = """
from playlistgen.playlistgen import main
main()
"""

let code = source.withUTF8({(buf) in
    run_python(buf.count, buf.baseAddress)
})

exit(code)
