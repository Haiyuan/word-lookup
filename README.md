# Word-Lookup (Calibre-style)

A lightweight, cross-platform dictionary–lookup desktop app inspired by **Calibre’s “Lookup” pane**.  
It provides a small toolbar for choosing a source and typing a query, plus a live web view that renders
the result.  External scripts can push words into the window through a local TCP socket, replicating
Calibre’s “click-to-lookup” convenience.

---

## ✨  Features

| Feature | Details |
|---------|---------|
| **Multi-source** lookup | Add any site that accepts a word in its URL (e.g. Google Define, Cambridge, Youdao, Linguee…). |
| **Source Manager**      | Modal dialog to create / edit / delete sources. Persisted to `sources.json` in your user profile. |
| **CLI / Automation**    | `node triggerLookup.js "word"` sends text to the app over **127.0.0.1:5050**. |
| **Minimal footprint**   | No database, no heavyweight backend—just Electron + a tiny TCP server. |
| **DevTools on demand**  | Open Chromium DevTools for either the toolbar **or** the dictionary view. |

---

## 🚀  Getting started

```bash
# 1. Clone / download the repo, then inside the folder
npm install

# 2. Launch the GUI (run in background so you can keep your shell)
npm start &          # the ampersand is optional—omit on Windows cmd/PowerShell

# 3. Push a word from the CLI or any script
node triggerLookup.js "hello"

If the port 5050 is already in use (another instance still running),
the app logs Port 5050 already in use … Exiting and quits immediately.

⸻

🖱️  Using the app
	1.	Choose a source in the dropdown (or add your own via Sources → Manage…).
	2.	Type a word (or wait for a CLI push) and hit Go / Enter.
	3.	Results load in the lower pane.
	4.	Press ⌥⌘I (macOS) / Ctrl+Shift+I to toggle DevTools for the active pane.

⸻

🛠️  Managing sources
	•	Open Sources → Manage… from the menu.
	•	Each row is Name | URL template.
	•	Use {word} or %s as the placeholder.
	•	Example: https://www.google.com/search?q=define+{word}
	•	Add, Save, or Close—changes are written to sources.json under
$HOME/Library/Application Support/word-lookup (macOS) or the equivalent OS directory.

⸻

📡  Automating look-ups from other apps

Any language that can open a TCP socket can feed the lookup engine:

# quick Python example
import socket, sys
word = sys.argv[1] if len(sys.argv) > 1 else "hello"
with socket.create_connection(("127.0.0.1", 5050)) as s:
    s.sendall(word.encode("utf-8"))

Use this to integrate with PopClip, Hammerspoon, Alfred workflows, etc.

⸻

🧱  Project structure

.
├─ main.js            # Electron main process (window, menu, TCP server)
├─ renderer/
│  ├─ index.html      # Toolbar + web container
│  └─ renderer.js     # UI logic & IPC
├─ preload.js         # Secure bridge (contextBridge)
├─ triggerLookup.js   # Simple CLI client
└─ package.json



⸻

📝  License

MIT — do whatever you like, but attribution is appreciated.

Happy hacking & enjoy Calibre-style look-ups anywhere!

