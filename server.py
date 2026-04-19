#!/usr/bin/env python3
"""
Mini serveur collaboratif pour main-courante
Permet plusieurs opérateurs de travailler sur les mêmes vérifications
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_FILE = "main-courante.db"

def init_db():
    """Initialiser la base de données"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Table pour les données principales
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS app_state (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table pour les sessions des opérateurs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operator_sessions (
            session_id TEXT PRIMARY KEY,
            operator_name TEXT NOT NULL,
            operator_role TEXT,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table pour l'audit (qui a modifié quoi et quand)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            operator_name TEXT NOT NULL,
            action TEXT NOT NULL,
            data_type TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

class RequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Désactiver les logs par défaut"""
        pass
    
    def _log(self, msg):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
    
    def _send_json(self, code, data):
        """Helper pour envoyer JSON"""
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            self._log(f"GET/POST {self.path} → {code}")
        except Exception as e:
            self._log(f"Erreur réponse: {e}")

    def do_OPTIONS(self):
        """Répondre au preflight CORS"""
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()
        self._log(f"OPTIONS {self.path} → 204")
    
    def do_GET(self):
        """Gérer les requêtes GET"""
        try:
            parsed_path = urlparse(self.path)
            path = parsed_path.path
            
            if path == "/api/state":
                self.get_state()
            elif path == "/api/operators":
                self.get_operators()
            elif path == "/api/audit":
                self.get_audit()
            else:
                self._send_json(404, {"error": "Not Found"})
        except Exception as e:
            self._log(f"Erreur GET: {e}")
            self._send_json(500, {"error": str(e)})
    
    def do_POST(self):
        """Gérer les requêtes POST"""
        try:
            parsed_path = urlparse(self.path)
            path = parsed_path.path
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""
            
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON"})
                return
            
            if path == "/api/session/register":
                self.register_session(data)
            elif path == "/api/state":
                self.save_state(data)
            elif path == "/api/audit":
                self.log_audit(data)
            else:
                self._send_json(404, {"error": "Not Found"})
        except Exception as e:
            self._log(f"Erreur POST: {e}")
            self._send_json(500, {"error": str(e)})
    
    def get_state(self):
        """Récupérer l'état complet de l'application"""
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM app_state WHERE id = 'main'")
            result = cursor.fetchone()
            conn.close()
            
            if result:
                try:
                    state = json.loads(result[0])
                except:
                    state = {}
            else:
                state = {}
            
            self._send_json(200, state)
        except Exception as e:
            self._log(f"Erreur get_state: {e}")
            self._send_json(500, {"error": str(e)})
    
    def get_operators(self):
        """Récupérer les opérateurs actifs"""
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT session_id, operator_name, operator_role, last_seen
                FROM operator_sessions
                WHERE datetime(last_seen) > datetime('now', '-5 minutes')
                ORDER BY last_seen DESC
            ''')
            operators = cursor.fetchall()
            conn.close()
            
            result = [
                {
                    "session_id": op[0],
                    "name": op[1],
                    "role": op[2],
                    "last_seen": op[3]
                }
                for op in operators
            ]
            
            self._send_json(200, result)
        except Exception as e:
            self._log(f"Erreur get_operators: {e}")
            self._send_json(500, {"error": str(e)})
    
    def get_audit(self):
        """Récupérer l'historique d'audit"""
        try:
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            limit = int(query_params.get("limit", [100])[0])
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, session_id, operator_name, action, data_type, timestamp, details
                FROM audit_log
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (limit,))
            logs = cursor.fetchall()
            conn.close()
            
            result = [
                {
                    "id": log[0],
                    "session_id": log[1],
                    "operator_name": log[2],
                    "action": log[3],
                    "data_type": log[4],
                    "timestamp": log[5],
                    "details": log[6]
                }
                for log in logs
            ]
            
            self._send_json(200, result)
        except Exception as e:
            self._log(f"Erreur get_audit: {e}")
            self._send_json(500, {"error": str(e)})
    
    def register_session(self, data):
        """Enregistrer une session d'opérateur"""
        try:
            session_id = str(uuid.uuid4())
            operator_name = data.get("name", "Opérateur inconnu")
            operator_role = data.get("role", "")
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO operator_sessions (session_id, operator_name, operator_role)
                VALUES (?, ?, ?)
            ''', (session_id, operator_name, operator_role))
            conn.commit()
            conn.close()
            
            response = {
                "session_id": session_id,
                "message": f"Session enregistrée pour {operator_name}"
            }
            
            self._send_json(200, response)
        except Exception as e:
            self._log(f"Erreur register_session: {e}")
            self._send_json(500, {"error": str(e)})
    
    def save_state(self, data):
        """Sauvegarder l'état de l'application"""
        try:
            state_data = data.get("state", {})
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT OR REPLACE INTO app_state (id, data, updated_at)
                VALUES ('main', ?, CURRENT_TIMESTAMP)
            ''', (json.dumps(state_data),))
            
            conn.commit()
            conn.close()
            
            response = {"message": "État sauvegardé avec succès"}
            self._send_json(200, response)
        except Exception as e:
            self._log(f"Erreur save_state: {e}")
            self._send_json(500, {"error": str(e)})
    
    def log_audit(self, data):
        """Enregistrer une action dans l'audit"""
        try:
            session_id = data.get("session_id", "unknown")
            operator_name = data.get("operator_name", "Inconnu")
            action = data.get("action", "unknown")
            data_type = data.get("data_type", "")
            details = data.get("details", "")
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO audit_log (session_id, operator_name, action, data_type, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (session_id, operator_name, action, data_type, details))
            conn.commit()
            conn.close()
            
            response = {"message": "Action enregistrée"}
            self._send_json(200, response)
        except Exception as e:
            self._log(f"Erreur log_audit: {e}")
            self._send_json(500, {"error": str(e)})


def run_server(port=8001):
    """Lancer le serveur"""
    init_db()
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"\n📡 Serveur collaboratif sur port {port}")
    print(f"   Base de données: {os.path.abspath(DB_FILE)}")
    print(f"\n   API: http://localhost:{port}/api/{'{'}state,operators,audit{'}'}") 
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Serveur arrêté.")
        httpd.shutdown()

if __name__ == "__main__":
    run_server(8001)
