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
import hashlib
import hmac
import secrets
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "main-courante.db")
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"{salt}${derived.hex()}"


def verify_password(password, stored_hash):
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, expected = stored_hash.split("$", 1)
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, expected)


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

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS training_content (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        INSERT OR IGNORE INTO training_content (id, data)
        VALUES ('main', '{"categories": [], "attempts": []}')
        """
    )

    cursor.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_ADMIN_USERNAME,))
    if cursor.fetchone() is None:
        cursor.execute(
            """
            INSERT INTO users (id, username, full_name, role, password_hash, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (
                str(uuid.uuid4()),
                DEFAULT_ADMIN_USERNAME,
                "Administrateur principal",
                "admin",
                hash_password(DEFAULT_ADMIN_PASSWORD),
            ),
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

    def _get_bearer_token(self):
        header = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if not header.startswith(prefix):
            return ""
        return header[len(prefix):].strip()

    def _get_authenticated_user(self, required_role=None):
        token = self._get_bearer_token()
        if not token:
            raise PermissionError("Authentification requise")

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT users.id, users.username, users.full_name, users.role, users.is_active
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.token = ?
            """,
            (token,),
        )
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE auth_sessions SET last_seen = CURRENT_TIMESTAMP WHERE token = ?",
                (token,),
            )
            conn.commit()
        conn.close()

        if not row:
            raise PermissionError("Session invalide")
        if not bool(row[4]):
            raise PermissionError("Utilisateur desactive")

        user = {
            "id": row[0],
            "username": row[1],
            "full_name": row[2],
            "role": row[3],
            "is_active": bool(row[4]),
        }
        if required_role and user["role"] != required_role:
            raise PermissionError("Acces refuse")
        return user

    def _handle_api_get(self, parsed):
        try:
            if parsed.path == "/api/auth/me":
                self._get_auth_me()
                return
            if parsed.path == "/api/state":
                self._get_state()
                return
            if parsed.path == "/api/users":
                self._get_users()
                return
            if parsed.path == "/api/training":
                self._get_training()
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
            if parsed.path == "/api/auth/login":
                self._login(data)
                return
            if parsed.path == "/api/auth/logout":
                self._logout()
                return
            if parsed.path == "/api/session/register":
                self._register_session(data)
                return
            if parsed.path == "/api/users":
                self._create_user(data)
                return
            if parsed.path == "/api/users/toggle-active":
                self._toggle_user_active(data)
                return
            if parsed.path == "/api/training":
                self._save_training(data)
                return
            if parsed.path == "/api/training/attempt":
                self._save_training_attempt(data)
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

    def _get_auth_me(self):
        try:
            user = self._get_authenticated_user()
            self._send_json(200, {"user": user})
        except PermissionError as error:
            self._send_json(401, {"error": str(error)})

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

    def _get_users(self):
        try:
            self._get_authenticated_user(required_role="admin")
        except PermissionError as error:
            self._send_json(403, {"error": str(error)})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, username, full_name, role, is_active, created_at
            FROM users
            ORDER BY full_name COLLATE NOCASE ASC
            """
        )
        rows = cursor.fetchall()
        conn.close()

        payload = [
            {
                "id": row[0],
                "username": row[1],
                "full_name": row[2],
                "role": row[3],
                "is_active": bool(row[4]),
                "created_at": row[5],
            }
            for row in rows
        ]
        self._send_json(200, payload)

    def _get_training(self):
        try:
            self._get_authenticated_user()
        except PermissionError as error:
            self._send_json(401, {"error": str(error)})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM training_content WHERE id = 'main'")
        row = cursor.fetchone()
        conn.close()

        if not row:
            self._send_json(200, {"categories": [], "attempts": []})
            return

        try:
            payload = json.loads(row[0])
        except json.JSONDecodeError:
            payload = {"categories": [], "attempts": []}
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

    def _login(self, data):
        username = str(data.get("username", "")).strip().lower()
        password = str(data.get("password", ""))
        if not username or not password:
            self._send_json(400, {"error": "Identifiants requis"})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, username, full_name, role, password_hash, is_active
            FROM users
            WHERE lower(username) = ?
            """,
            (username,),
        )
        row = cursor.fetchone()
        if not row or not bool(row[5]) or not verify_password(password, row[4]):
            conn.close()
            self._send_json(401, {"error": "Identifiants invalides"})
            return

        token = secrets.token_hex(32)
        cursor.execute(
            "INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)",
            (token, row[0]),
        )
        conn.commit()
        conn.close()

        self._send_json(
            200,
            {
                "token": token,
                "user": {
                    "id": row[0],
                    "username": row[1],
                    "full_name": row[2],
                    "role": row[3],
                    "is_active": bool(row[5]),
                },
            },
        )

    def _logout(self):
        token = self._get_bearer_token()
        if token:
            conn = sqlite3.connect(DB_FILE, timeout=10)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
            conn.commit()
            conn.close()
        self._send_json(200, {"message": "Deconnecte"})

    def _create_user(self, data):
        try:
            self._get_authenticated_user(required_role="admin")
        except PermissionError as error:
            self._send_json(403, {"error": str(error)})
            return

        username = str(data.get("username", "")).strip().lower()
        full_name = str(data.get("full_name", "")).strip()
        role = str(data.get("role", "apprenant")).strip().lower() or "apprenant"
        password = str(data.get("password", ""))
        if not username or not full_name or not password:
            self._send_json(400, {"error": "Nom complet, identifiant et mot de passe requis"})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO users (id, username, full_name, role, password_hash, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (str(uuid.uuid4()), username, full_name, role, hash_password(password)),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            self._send_json(409, {"error": "Identifiant deja utilise"})
            return
        conn.close()
        self._send_json(201, {"message": "Utilisateur cree"})

    def _toggle_user_active(self, data):
        try:
            actor = self._get_authenticated_user(required_role="admin")
        except PermissionError as error:
            self._send_json(403, {"error": str(error)})
            return

        user_id = str(data.get("user_id", "")).strip()
        is_active = bool(data.get("is_active"))
        if not user_id:
            self._send_json(400, {"error": "Utilisateur cible requis"})
            return
        if actor["id"] == user_id and not is_active:
            self._send_json(400, {"error": "Vous ne pouvez pas vous desactiver"})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (1 if is_active else 0, user_id))
        if not is_active:
            cursor.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        self._send_json(200, {"message": "Utilisateur mis a jour"})

    def _save_training(self, data):
        try:
            actor = self._get_authenticated_user()
        except PermissionError as error:
            self._send_json(401, {"error": str(error)})
            return

        if actor["role"] not in {"admin", "formateur"}:
            self._send_json(403, {"error": "Acces reserve aux admins et formateurs"})
            return

        categories = data.get("categories", [])
        if not isinstance(categories, list):
            self._send_json(400, {"error": "Format categories invalide"})
            return

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM training_content WHERE id = 'main'")
        row = cursor.fetchone()
        existing_attempts = []
        if row:
            try:
                existing_payload = json.loads(row[0])
                if isinstance(existing_payload.get("attempts"), list):
                    existing_attempts = existing_payload.get("attempts", [])
            except json.JSONDecodeError:
                existing_attempts = []

        payload = {
            "categories": categories,
            "attempts": existing_attempts,
            "updated_by": actor["full_name"],
            "updated_at": datetime.now().isoformat(),
        }
        cursor.execute(
            """
            INSERT OR REPLACE INTO training_content (id, data, updated_at)
            VALUES ('main', ?, CURRENT_TIMESTAMP)
            """,
            (json.dumps(payload),),
        )
        conn.commit()
        conn.close()
        self._send_json(200, {"message": "Contenu de formation mis a jour"})

    def _save_training_attempt(self, data):
        try:
            actor = self._get_authenticated_user()
        except PermissionError as error:
            self._send_json(401, {"error": str(error)})
            return

        attempt = {
            "id": str(uuid.uuid4()),
            "user_id": actor["id"],
            "user_name": actor["full_name"],
            "course_id": str(data.get("course_id", "")),
            "course_title": str(data.get("course_title", "")),
            "score": int(data.get("score", 0)),
            "total": int(data.get("total", 0)),
            "points": int(data.get("points", 0)),
            "completed_at": datetime.now().isoformat(),
        }

        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM training_content WHERE id = 'main'")
        row = cursor.fetchone()
        payload = {"categories": [], "attempts": []}
        if row:
            try:
                payload = json.loads(row[0])
            except json.JSONDecodeError:
                payload = {"categories": [], "attempts": []}

        attempts = payload.get("attempts", []) if isinstance(payload.get("attempts"), list) else []
        attempts.append(attempt)
        payload["attempts"] = attempts[-500:]
        cursor.execute(
            """
            INSERT OR REPLACE INTO training_content (id, data, updated_at)
            VALUES ('main', ?, CURRENT_TIMESTAMP)
            """,
            (json.dumps(payload),),
        )
        conn.commit()
        conn.close()
        self._send_json(200, {"message": "Tentative enregistree", "attempt": attempt})

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
