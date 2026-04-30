#!/usr/bin/env python3
"""Serveur unique pour l'application main courante.

- Sert les fichiers statiques du projet
- Expose l'API collaborative sous /api/*
- Utilise une seule origine pour éviter CORS, mixed content et les problèmes github.dev
"""

import json
import os
import sqlite3
import traceback
import uuid
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "main-courante.db")


def init_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS app_state (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS operator_sessions (
            session_id TEXT PRIMARY KEY,
            operator_name TEXT NOT NULL,
            operator_role TEXT,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            operator_name TEXT NOT NULL,
            action TEXT NOT NULL,
            data_type TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        )
        """
    )

    conn.commit()
    conn.close()


class RequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory or BASE_DIR, **kwargs)

    def end_headers(self):
        # Eviter les scripts obsoletes en environnement codespaces/navigateurs caches.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {format % args}")

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self._set_cors_headers()
            self.end_headers()
            return
        super().do_OPTIONS()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_get(parsed)
            return

        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self._send_json(404, {"error": "Not Found"})
            return
        self._handle_api_post(parsed)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON")

    def _handle_api_get(self, parsed):
        try:
            if parsed.path == "/api/state":
                self._get_state()
                return
            if parsed.path == "/api/operators":
                self._get_operators()
                return
            if parsed.path == "/api/audit":
                self._get_audit(parsed)
                return
            self._send_json(404, {"error": "Not Found"})
        except Exception as error:
            traceback.print_exc()
            self._send_json(500, {"error": str(error)})

    def _handle_api_post(self, parsed):
        try:
            data = self._read_json_body()
            if parsed.path == "/api/session/register":
                self._register_session(data)
                return
            if parsed.path == "/api/state":
                self._save_state(data)
                return
            if parsed.path == "/api/audit":
                self._log_audit(data)
                return
            self._send_json(404, {"error": "Not Found"})
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            traceback.print_exc()
            self._send_json(500, {"error": str(error)})

    def _get_state(self):
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM app_state WHERE id = 'main'")
        result = cursor.fetchone()
        conn.close()

        if not result:
            self._send_json(200, {})
            return

        try:
            state = json.loads(result[0])
        except json.JSONDecodeError:
            state = {}
        self._send_json(200, state)

    def _get_operators(self):
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT session_id, operator_name, operator_role, last_seen
            FROM operator_sessions
            WHERE datetime(last_seen) > datetime('now', '-5 minutes')
            ORDER BY last_seen DESC
            """
        )
        operators = cursor.fetchall()
        conn.close()

        payload = [
            {
                "session_id": row[0],
                "name": row[1],
                "role": row[2],
                "last_seen": row[3],
            }
            for row in operators
        ]
        self._send_json(200, payload)

    def _get_audit(self, parsed):
        query = parse_qs(parsed.query)
        limit = int(query.get("limit", [100])[0])

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, session_id, operator_name, action, data_type, timestamp, details
            FROM audit_log
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        )
        logs = cursor.fetchall()
        conn.close()

        payload = [
            {
                "id": row[0],
                "session_id": row[1],
                "operator_name": row[2],
                "action": row[3],
                "data_type": row[4],
                "timestamp": row[5],
                "details": row[6],
            }
            for row in logs
        ]
        self._send_json(200, payload)

    def _register_session(self, data):
        session_id = str(uuid.uuid4())
        operator_name = data.get("name", "Operateur inconnu")
        operator_role = data.get("role", "")

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO operator_sessions (session_id, operator_name, operator_role)
            VALUES (?, ?, ?)
            """,
            (session_id, operator_name, operator_role),
        )
        conn.commit()
        conn.close()

        self._send_json(
            200,
            {
                "session_id": session_id,
                "message": f"Session enregistree pour {operator_name}",
            },
        )

    def _save_state(self, data):
        state_data = data.get("state", {})

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO app_state (id, data, updated_at)
            VALUES ('main', ?, CURRENT_TIMESTAMP)
            """,
            (json.dumps(state_data),),
        )
        conn.commit()
        conn.close()

        self._send_json(200, {"message": "Etat sauvegarde avec succes"})

    def _log_audit(self, data):
        session_id = data.get("session_id", "unknown")
        operator_name = data.get("operator_name", "Inconnu")
        action = data.get("action", "unknown")
        data_type = data.get("data_type", "")
        details = data.get("details", "")

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO audit_log (session_id, operator_name, action, data_type, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, operator_name, action, data_type, details),
        )
        conn.commit()
        conn.close()

        self._send_json(200, {"message": "Action enregistree"})


def run_server(port=8000):
    init_db()
    handler = partial(RequestHandler, directory=BASE_DIR)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"\nServeur unique demarre sur http://0.0.0.0:{port}")
    print(f"Base de donnees: {DB_FILE}")
    print("UI + API sur la meme origine")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrete.")
        httpd.shutdown()


if __name__ == "__main__":
    run_server(8000)
