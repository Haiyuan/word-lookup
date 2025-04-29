import socket
import subprocess
import sys
import time
from pathlib import Path

HOST = "127.0.0.1"
PORT = 5050

word = sys.argv[1] if len(sys.argv) > 1 else "hello"

def send_word(word):
    try:
        s = socket.create_connection((HOST, PORT), timeout=1)
        s.sendall(word.encode("utf-8"))
        s.close()
        return True
    except:
        return False

home = str(Path.home())
python_path = f"{home}/myenv/bin/python3"
script_path = "/Applications/word-lookup/word-lookup-py/lookup_app.py"

if not send_word(word):
    subprocess.Popen([python_path, script_path])
    time.sleep(1.2)
    send_word(word)