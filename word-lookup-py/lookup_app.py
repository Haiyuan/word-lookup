import sys
import os
import json
import socket
import threading
import urllib.parse
from pathlib import Path

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QLineEdit, QVBoxLayout, QWidget, QMenuBar,
    QDialog, QTableWidget, QTableWidgetItem, QPushButton, QHBoxLayout, QMessageBox
)
from PyQt6.QtGui import QAction, QGuiApplication, QKeyEvent
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEnginePage
from PyQt6.QtCore import QUrl, Qt, pyqtSignal, QObject

# ---------------------------
#  Network settings
# ---------------------------
HOST = "127.0.0.1"
PORT = 5050


# =========================================
#  Helper: cross‑thread signal for new word
# =========================================
class LookupSignal(QObject):
    word_received = pyqtSignal(str)


# =======================
#  Source manager dialog
# =======================
class SourceManager(QDialog):
    def __init__(self, parent, sources: dict[str, str]):
        super().__init__(parent)
        self.setWindowTitle("Manage Sources")
        self.sources = sources.copy()

        self.layout = QVBoxLayout(self)

        self.table = QTableWidget(self)
        self.table.setColumnCount(2)
        self.table.setHorizontalHeaderLabels(["Name", "URL Template"])
        self.layout.addWidget(self.table)

        button_layout = QHBoxLayout()
        self.add_button = QPushButton("Add")
        self.delete_button = QPushButton("Delete Selected")
        self.save_button = QPushButton("Save")
        button_layout.addWidget(self.add_button)
        button_layout.addWidget(self.delete_button)
        button_layout.addWidget(self.save_button)
        self.layout.addLayout(button_layout)

        self.add_button.clicked.connect(self.add_source)
        self.delete_button.clicked.connect(self.delete_source)
        self.save_button.clicked.connect(self.save_and_close)

        self.populate_table()

    # ------------------------- dialog helpers -------------------------
    def populate_table(self):
        self.table.setRowCount(0)
        for name, template in self.sources.items():
            row = self.table.rowCount()
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(name))
            self.table.setItem(row, 1, QTableWidgetItem(template))

    def add_source(self):
        row = self.table.rowCount()
        self.table.insertRow(row)
        self.table.setItem(row, 0, QTableWidgetItem("New Source"))
        self.table.setItem(row, 1, QTableWidgetItem("https://192.168.1.4:8443/dict.html?q={word}"))

    def delete_source(self):
        selected = self.table.currentRow()
        if selected >= 0:
            self.table.removeRow(selected)

    def save_and_close(self):
        new_sources: dict[str, str] = {}
        for row in range(self.table.rowCount()):
            name_item = self.table.item(row, 0)
            url_item = self.table.item(row, 1)
            if name_item and url_item:
                name = name_item.text().strip()
                url = url_item.text().strip()
                if name and url and "{word}" in url:
                    new_sources[name] = url
        if not new_sources:
            QMessageBox.warning(self, "Warning", "At least one valid source must exist.")
            return
        self.sources = new_sources
        self.accept()


# ===============
#  Main window
# ===============
class LookupApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("My Lookup Tool")

        # --- sources ---
        app_support_dir = Path.home() / "Library" / "Application Support" / "word-lookup"
        app_support_dir.mkdir(parents=True, exist_ok=True)
        self.sources_file = app_support_dir / "sources.json"
        self.sources: dict[str, str] = self.load_sources()
        self.current_source = list(self.sources.keys())[0]

        # --- UI widgets ---
        self.search_bar = QLineEdit()
        self.search_bar.returnPressed.connect(self.lookup_word)

        self.browser = QWebEngineView()
        self.zoom_factor: float = 1.0
        self.browser.setZoomFactor(self.zoom_factor)

        layout = QVBoxLayout()
        layout.addWidget(self.search_bar)
        layout.addWidget(self.browser)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

        self.create_menu()
        self.position_window()

        # --- cross‑thread signal ---
        self.lookup_signal = LookupSignal()
        self.lookup_signal.word_received.connect(self._on_word_from_socket)
        self._start_server_thread()

        self.show()

    # ---------------- window position ----------------
    def position_window(self):
        screen = QGuiApplication.primaryScreen().availableGeometry()
        sw, sh = screen.width(), screen.height()
        ww, wh = int(sw / 4), int(sh * 0.95)
        x, y = sw - ww, int(sh * 0.025)
        self.setGeometry(x, y, ww, wh)

    # ---------------- menu ----------------
    def create_menu(self):
        menu_bar = QMenuBar(self)

        # --- sources submenu ---
        self.sources_menu = menu_bar.addMenu("Sources")
        self.update_sources_menu()

        # --- view submenu ---
        view_menu = menu_bar.addMenu("View")
        zoom_in    = QAction("Zoom In",  self, shortcut="Ctrl+=")
        zoom_out   = QAction("Zoom Out", self, shortcut="Ctrl+-")
        zoom_reset = QAction("Reset Zoom", self, shortcut="Ctrl+0")
        toggle_dev = QAction("Toggle DevTools", self, shortcut="Ctrl+Shift+I")

        zoom_in.triggered.connect(self.zoom_in)
        zoom_out.triggered.connect(self.zoom_out)
        zoom_reset.triggered.connect(self.zoom_reset)
        toggle_dev.triggered.connect(self.toggle_devtools)

        for act in (zoom_in, zoom_out, zoom_reset, toggle_dev):
            view_menu.addAction(act)

        self.setMenuBar(menu_bar)

    # --------------- key shortcuts ---------------
    def keyPressEvent(self, event: QKeyEvent):
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            if event.key() == Qt.Key.Key_Equal:
                self.zoom_in()
            elif event.key() == Qt.Key.Key_Minus:
                self.zoom_out()
            elif event.key() == Qt.Key.Key_0:
                self.zoom_reset()
        super().keyPressEvent(event)

    # --------------- zoom helpers ---------------
    def zoom_in(self):
        self.zoom_factor = min(3.0, self.zoom_factor + 0.1)
        self.browser.setZoomFactor(self.zoom_factor)

    def zoom_out(self):
        self.zoom_factor = max(0.25, self.zoom_factor - 0.1)
        self.browser.setZoomFactor(self.zoom_factor)

    def zoom_reset(self):
        self.zoom_factor = 1.0
        self.browser.setZoomFactor(self.zoom_factor)

    # --------------- devtools toggle ---------------
    def toggle_devtools(self):
        page = self.browser.page()
        if getattr(self, "_devtools_window", None):
            page.setDevToolsPage(None)
            self._devtools_window.close()
            self._devtools_window = None
            return

        profile = page.profile()
        dev_page = QWebEnginePage(profile, self)
        page.setDevToolsPage(dev_page)

        self._devtools_window = QWebEngineView(self)
        self._devtools_window.setWindowTitle("Developer Tools")
        self._devtools_window.setPage(dev_page)
        self._devtools_window.resize(900, 700)
        self._devtools_window.show()

        def _cleanup(_=None):
            page.setDevToolsPage(None)
            self._devtools_window = None
        self._devtools_window.destroyed.connect(_cleanup)

    # --------------- source management ---------------
    def update_sources_menu(self):
        self.sources_menu.clear()
        for name in self.sources:
            action = QAction(name, self)
            action.triggered.connect(lambda _checked, n=name: self.set_source(n))
            self.sources_menu.addAction(action)

        self.sources_menu.addSeparator()
        manage_action = QAction("Manage Sources", self)
        manage_action.triggered.connect(self.manage_sources)
        self.sources_menu.addAction(manage_action)

    def manage_sources(self):
        dialog = SourceManager(self, self.sources)
        if dialog.exec():
            self.sources = dialog.sources
            self.current_source = list(self.sources.keys())[0]
            self.update_sources_menu()
            self.lookup_word()
            self.save_sources()

    # --------------- sources persistence ---------------
    def load_sources(self) -> dict[str, str]:
        try:
            with open(self.sources_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and data:
                    return data
        except Exception as e:
            print(f"Failed to load sources.json: {e}")

        return {
            "StarDict": "https://192.168.1.4:8443/dict.html?q={word}",
            "Youdao": "https://www.youdao.com/w/eng/{word}/",
            "Wiktionary": "https://en.wiktionary.org/wiki/{word}",
            "Google Define": "https://www.google.com/search?q=define+{word}",
            

        }

    def save_sources(self):
        try:
            with open(self.sources_file, "w", encoding="utf-8") as f:
                json.dump(self.sources, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Failed to save sources.json: {e}")

    # --------------- word lookup ---------------
    def lookup_word(self):
        word = self.search_bar.text().strip()
        if word and self.current_source in self.sources:
            url_template = self.sources[self.current_source]
            encoded = urllib.parse.quote(word)
            self.browser.setUrl(QUrl(url_template.format(word=encoded)))

    def set_source(self, source_name: str):
        self.current_source = source_name
        self.lookup_word()

    # --------------- socket handling ---------------
    def _on_word_from_socket(self, word: str):
        # update UI safely in main thread
        self.search_bar.setText(word)
        self.lookup_word()
        self.activateWindow()
        self.raise_()

    def _start_server_thread(self):
        def run_server(sig: LookupSignal):
            serv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                serv.bind((HOST, PORT))
            except OSError:
                # Another instance is running — nothing to do
                print("Socket already in use; server thread not started.")
                return
            serv.listen()
            while True:
                conn, _ = serv.accept()
                with conn:
                    data = conn.recv(1024)
                    if data:
                        sig.word_received.emit(data.decode("utf-8"))

        th = threading.Thread(target=run_server, args=(self.lookup_signal,), daemon=True)
        th.start()


# ========================
#  Helper: send word then exit if daemon running
# ========================

def _try_send_word_to_daemon(word: str) -> bool:
    try:
        s = socket.create_connection((HOST, PORT), timeout=1)
        s.sendall(word.encode("utf-8"))
        s.close()
        return True
    except Exception:
        return False


# ========================
#  entry‑point
# ========================
if __name__ == "__main__":
    # If another instance exists, forward argument & quit
    arg_word = sys.argv[1] if len(sys.argv) > 1 else None
    if arg_word and _try_send_word_to_daemon(arg_word):
        sys.exit(0)

    # Otherwise, start main GUI (which launches its own server)
    app = QApplication(sys.argv)
    window = LookupApp()

    # If we started with word argument but daemon was not running
    if arg_word:
        window.lookup_word()
    sys.exit(app.exec())
