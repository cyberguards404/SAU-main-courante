# Mini Serveur Collaboratif - Guide d'Utilisation

## Vue d'ensemble

Le mini serveur collaboratif permet à **plusieurs opérateurs** de travailler simultanément sur les mêmes vérifications checklists. Les données sont synchronisées en temps réel entre tous les clients connectés.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Opérateurs (Navigateurs)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Opérateur 1  │  │ Opérateur 2  │  │ Opérateur 3  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                     ┌────────┴────────┐
                     │  HTTP (port)    │
         ┌───────────┼────────┬────────┴───────────┐
         │           │        │                    │
  ┌──────▼────┐  ┌──▼──┐  ┌──▼──┐          ┌──────▼──┐
  │ HTTP 8000  │  │Port │  │Port │    ...   │ SQLite  │
  │(Interface) │  │8001 │  │8001 │          │  DB     │
  └────────────┘  └─────┘  └─────┘          └─────────┘
       (statique)  (API Collab)  (API Collab) (Persistance)
```

## Démarrage des serveurs

### 1. Serveur Collaboratif (Port 8001)
```bash
python3 server.py
```

Affiche:
```
Serveur collaboratif démarré sur http://0.0.0.0:8001
Base de données: main-courante.db

Endpoints disponibles:
  GET  /api/state       - Récupérer l'état de l'application
  POST /api/state       - Sauvegarder l'état
  GET  /api/operators   - Lister les opérateurs actifs
  POST /api/session/register - Enregistrer une session
  GET  /api/audit       - Récupérer l'historique d'audit
  POST /api/audit       - Enregistrer une action d'audit
```

### 2. Serveur Web (Port 8000)
```bash
python3 -m http.server 8000
```

Accédez à: **http://localhost:8000**

## Utilisation

### Première connexion
1. Ouvrez `http://localhost:8000` dans votre navigateur
2. Une boîte de dialogue vous demande: **"Entrez votre nom"**
3. Entrez votre nom (ex: "Marie", "Denis", "Ahmed")
4. Vous êtes maintenant connecté à une session collaborative !

### Indicateurs d'opérateurs
En haut à gauche du header, vous verrez une section **"Opérateurs actifs"** affichant:
- 🟢 Point vert animé (pulsation) = opérateur actif
- Nom de l'opérateur
- Fonction/rôle (si configurée)
- Heure dernière activité

La liste est rafraîchie toutes les 10 secondes et affiche les opérateurs vus dans les dernières 5 minutes.

### Mode déconnecté
Si le serveur collaboratif n'est pas disponible:
- L'app continue de fonctionner normalement
- Les données sont stockées localement (localStorage)
- Vous serez notifié dans la console: "Mode hors ligne"

## API REST

### POST /api/session/register
**Enregistrer une nouvelle session d'opérateur**

Request:
```json
{
  "name": "Marie Dupont",
  "role": "Chef de poste"
}
```

Response:
```json
{
  "session_id": "uuid-xxx-xxx",
  "message": "Session enregistrée pour Marie Dupont"
}
```

### GET /api/state
**Récupérer l'état complet de l'application**

Response:
```json
{
  "layout": "desktop",
  "activeView": "checklist",
  "day": { "date": "2026-04-19", "owner": "Marie", "notes": "" },
  "templates": { ... },
  "planning": [ ... ],
  "checklistData": { ... },
  ...
}
```

### POST /api/state
**Sauvegarder l'état de l'application**

Request:
```json
{
  "session_id": "uuid-xxx-xxx",
  "operator_name": "Marie Dupont",
  "state": { ... } // État complet de l'app
}
```

Response:
```json
{
  "message": "État sauvegardé avec succès"
}
```

### GET /api/operators
**Lister les opérateurs actifs (dernières 5 minutes)**

Response:
```json
[
  {
    "session_id": "uuid-xxx-xxx",
    "name": "Marie Dupont",
    "role": "Chef de poste",
    "last_seen": "2026-04-19T18:35:42.123456"
  },
  {
    "session_id": "uuid-yyy-yyy",
    "name": "Denis Martin",
    "role": "Opérateur",
    "last_seen": "2026-04-19T18:35:30.654321"
  }
]
```

### POST /api/audit
**Enregistrer une action dans l'historique d'audit**

Request:
```json
{
  "session_id": "uuid-xxx-xxx",
  "operator_name": "Marie Dupont",
  "action": "modify_checklist_item",
  "data_type": "checklist_item",
  "details": "Item: 'Controle visuel Box 1', Status: 'valide'"
}
```

### GET /api/audit?limit=50
**Récupérer l'historique d'audit**

Response:
```json
[
  {
    "id": 1,
    "session_id": "uuid-xxx-xxx",
    "operator_name": "Marie Dupont",
    "action": "modify_checklist_item",
    "data_type": "checklist_item",
    "timestamp": "2026-04-19T18:35:42.123456",
    "details": "Item: 'Controle visuel Box 1', Status: 'valide'"
  },
  ...
]
```

## Base de données SQLite

Fichier: `main-courante.db`

### Tables

#### app_state
```sql
CREATE TABLE app_state (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Stocke l'état complet de l'application synchronisé par tous les clients.

#### operator_sessions
```sql
CREATE TABLE operator_sessions (
  session_id TEXT PRIMARY KEY,
  operator_name TEXT NOT NULL,
  operator_role TEXT,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Enregistre les sessions des opérateurs et les met à jour à chaque activation.

#### audit_log
```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  action TEXT NOT NULL,
  data_type TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);
```
Historique complet de qui a fait quoi et quand.

## Synchronisation des données

### Flux entrant (client → serveur)
1. L'utilisateur effectue une action dans l'app (ex: valide un item de checklist)
2. `saveState()` est appelé (localStorage local)
3. Un hook de synchronisation envoie les données au serveur `/api/state`
4. Le serveur sauvegarde en SQLite

### Flux sortant (serveur → clients)
**À implémenter pour synchronisation temps réel:**
- Les clients pourraient utiliser WebSockets ou polling
- Actuellement, on utilise localStorage pour les clients
- La synchronisation est asynchrone et non-bloquante

## Scénarios d'utilisation

### Scénario 1: Deux opérateurs sur le même secteur
```
Opérateur 1 (Marie)              Opérateur 2 (Denis)
─────────────────────────────────────────────────────
1. Se connecte
   Session: uuid-111             
   Vu dans opérateurs

                                2. Se connecte
                                   Session: uuid-222
                                   Voit Marie dans opérateurs

3. Valide item "Box 1"
   → Serveur: /api/state
   → Serveur: /api/audit
   
4. Voit progression updated              Rafraîchissement prochain
   (il faut qu'il valide item           5. Rafraîchit page ou attend
    "Box 2" après)                         5s de sync automatique
                                        6. Voit que Denis a validé
```

### Scénario 2: Audit complet
```bash
# Récupérer les 100 dernières actions
curl "http://localhost:8001/api/audit?limit=100"

# Filtrer par opérateur en post-processing
grep "Denis Martin" audit.json
```

### Scénario 3: Récupération après déconnexion
```
Opérateur (Marie)
─────────────────
1. Déconnectée du serveur (offline)
2. Continue de travailler localement (localStorage)
3. Reconnecte au serveur
4. Ses données sont envoyées (fusion possible selon stratégie)
5. Reçoit l'état serveur
```

## Notes de sécurité et limitations

### Limitations actuelles
- **Pas d'authentification**: Tout utilisateur peut utiliser le serveur
- **Pas de chiffrement**: Les données transitent en HTTP
- **Pas de contrôle d'accès**: Pas de permissions par opérateur
- **Pas de WebSocket**: La synchronisation est asynchrone/polling (pas temps réel instantané)
- **Fusion de données simplifiée**: Le dernier write gagne (last-write-wins pattern)

### Recommandations
- Utilisez sur un **réseau local** (LAN, pas internet)
- Pour production, ajoutez:
  - HTTPS/TLS
  - Authentification (JWT, OAuth)
  - Permissions par rôle (RBAC)
  - WebSockets pour temps réel
  - Validation des données
  - Rate limiting

## Dépannage

### Le serveur ne démarre pas
```bash
# Port déjà utilisé?
lsof -i :8001
lsof -i :8000

# Kill les processus
kill -9 <PID>
```

### Les données ne se synchronisent pas
1. Assurez-vous que les deux serveurs tournent:
   ```bash
   curl http://localhost:8000      # Web
   curl http://localhost:8001/api/operators  # Collab
   ```

2. Vérifiez la console du navigateur (F12) pour les erreurs

3. Vérifiez le fichier `main-courante.db`:
   ```bash
   sqlite3 main-courante.db ".tables"
   sqlite3 main-courante.db "SELECT COUNT(*) FROM operator_sessions;"
   ```

### Réinitialiser les données
```bash
rm main-courante.db
# Redémarrer server.py
```

## Roadmap future

- [ ] WebSockets pour synchronisation temps réel
- [ ] Authentification avec JWT
- [ ] Permissions par rôle
- [ ] Résolution de conflits en temps réel
- [ ] HTTPS en production
- [ ] Backup automatique
- [ ] Notifications temps réel (habituel à base d'événements)
- [ ] Undo/Redo distribué
- [ ] Compression des états volumineux
