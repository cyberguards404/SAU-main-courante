# Accès à distance - Guide d'installation

## Problème
Vous ne pouvez pas accéder à l'application depuis un téléphone distant parce que:
1. Le serveur écoute sur `localhost:8000` (uniquement local)
2. Il n'y a pas de synchronisation des données du serveur au démarrage
3. Le smartphone distant n'a pas les templates

## Solution complète

### Étape 1: Déterminer votre adresse IP serveur

Sur votre PC (serveur):
```bash
# Linux / Mac
hostname -I
# ou
ifconfig | grep "inet "

# Windows
ipconfig
```

Cherchez une adresse du type `192.168.x.x` ou `10.x.x.x` (réseau local)
Exemple: `192.168.1.50`

### Étape 2: Modifier la configuration du serveur

Éditez `server.py` et changez:
```python
def run_server(port=8001):
    """Lancer le serveur"""
    init_db()
    server_address = ("0.0.0.0", port)  # ← Écoute sur toutes les interfaces
```

⚠️ C'est déjà correct ! `0.0.0.0` signifie "écouter sur toutes les interfaces réseau"

### Étape 3: Démarrer les deux serveurs

**Terminal 1: Serveur collaboratif**
```bash
cd /path/to/SAU-main-courante
python3 server.py
# ✓ Serveur collaboratif démarré sur http://0.0.0.0:8001
```

**Terminal 2: Serveur web**
```bash
cd /path/to/SAU-main-courante
python3 -m http.server 8000
# Serving HTTP on 0.0.0.0 port 8000
```

### Étape 4: Accéder depuis votre téléphone

Avant de commencer, vous devez avoir créé les templates sur le **PC** :
1. Ouvrez `http://localhost:8000` sur votre PC
2. Allez à l'onglet **"Templates"**
3. Créez votre structure:
   - Secteur (ex: "SAUV" pour Sauvegarde)
   - Sous-catégories (Box 1, Box 2, etc.)
   - Sous-sous-catégories avec items de checklist
4. Cliquez "Valider les changements"
5. Les données sont sauvegardées sur le serveur

**Puis sur votre téléphone:**
1. Connectez-vous au même réseau WiFi que votre PC
2. Ouvrez le navigateur et allez à:
   ```
   http://192.168.1.50:8000
   ```
   (Remplacez `192.168.1.50` par votre adresse IP réelle)

3. Une boîte vous demande votre nom → entrez-le
4. L'app se connecte au serveur collaboratif
5. **Les templates du PC s'affichent** ✓
6. Vous pouvez maintenant remplir la checklist sur votre téléphone

### Étape 5: Configuration côté téléphone (optionnel)

Si vous travaillez régulièrement à distance, vous pouvez:

1. **Ajouter le URL à l'écran d'accueil** (iOS/Android)
   - Ouvrez dans le navigateur: `http://192.168.1.50:8000`
   - Appuyez sur le menu ("⋮" ou partage)
   - "Ajouter à l'écran d'accueil"

2. **Mode application complète** (si le navigateur supporte)
   - L'app détecte `apple-mobile-web-app-capable` dans le HTML
   - L'interface s'affiche en plein écran sans la barre du navigateur

## Scénario d'utilisation complet

```
PC (Serveur)                    Téléphone distant
═══════════════════════════════════════════════════════

1. Lance les serveurs:
   - python3 server.py (port 8001)
   - python3 -m http.server 8000
   
2. Créé les templates:
   - Onglet "Templates"
   - secteur "SAUV"
   - sous-cat "Box 1", "Box 2"
   - items: "Contrôle visuel", etc.
   
3. Valide les changements
                                4. Se connecte à:
                                   http://192.168.1.50:8000
                                
                                5. Demande nom: "Marie"
                                
                                6. App charge templates
                                   du serveur
                                   
                                7. Voit "SAUV" dans planification
                                
                                8. Fait la checklist
                                   √ Valide items
                                   √ Ajoute commentaires
                                   √ Prend photos
                                
9. Bascule à l'onglet
   "Suivi" et voit:
   - Marie active
   - progression en temps réel
                                
10. Valide la vérification
    signature numérique
```

## Ma vérification "SAUV" n'apparaît pas!

### Diagnostic

**1. Vérifier que le serveur est accessible**
```bash
# Du téléphone, essayez:
# (dans le navigateur)
http://192.168.1.50:8001/api/operators
# Devrait afficher une liste JSON (peut être vide)
```

**2. Vérifier que les templates existent sur le serveur**
```bash
# Sur le PC:
sqlite3 main-courante.db
SELECT data FROM app_state WHERE id='main';
# Cherchez "SAUV" dans le JSON
```

**3. Si le JSON est vide:**
- Les templates n'ont pas été créés
- Créez-les dans l'onglet "Templates" sur le PC
- Cliquez "Valider les changements"
- Essayez de rafraîchir le téléphone (F5)

**4. Si "SAUV" existe mais n'apparaît pas sur le téléphone:**
- Assurez-vous d'être dans l'onglet **"Checklist"**
- Vérifiez que du planning existe pour le jour
- Onglet **"Admin planification"**: créez une ligne pour le secteur "SAUV"
- Rafraîchissez le téléphone

### Résultat attendu

Après création et synchronisation:

```
┌─ Secteurs ────────────────┐
│ • SAUV    (3 vérifications)│  ← Apparaît ici
│                            │
└────────────────────────────┘
         ↓ clic
┌─ Sous-catégories SAUV ────┐
│ • Box 1    ✓              │  ← Statut vert/rouge
│ • Box 2                   │
│ • Box 3    ✗              │
└────────────────────────────┘
         ↓ clic
┌─ Items Box 1 ─────────────┐
│ [✓] Contrôle visuel       │  ← Remplir la checklist
│ [✕] Contrôle fonctionnel  │     avec photos/commentaires
│ [ ] Nettoyage            │
└────────────────────────────┘
```

## Dépannage réseau

### Le téléphone ne peut pas accéder au PC

**Problème: "Impossible d'accéder à 192.168.1.50"**

```bash
# Sur le PC, vérifiez que les ports écoutent:
lsof -i :8000
lsof -i :8001

# Si rien, relancez les serveurs
# Si le port est utilisé:
lsof -i :8000 | awk 'NR==2 {print $2}' | xargs kill -9
```

**Problème: "Réseau inaccessible"**
- Vérifiez que PC et téléphone sont sur le même WiFi
- Essayez ping depuis le téléphone:
  ```bash
  # Terminal sur PC (exécutez ping serveur)
  # Sur téléphone, essayez d'accéder à:
  http://[IP-DU-PC]:8000
  ```

**Problème: Pare-feu bloque**
- Windows: Autoriser Python dans le pare-feu
- Mac: Autoriser dans "Sécurité et confidentialité"
- Linux: `sudo ufw allow 8000 8001`

## Performance sur téléphone

### Si l'app est lente:

1. **Réduire la taille des photos**
   - Prenez des photos en HD standard (pas 4K)
   - La galerie photo sera plus rapide

2. **Désactiver la synchronisation temps réel**
   - Actuellement sync toutes les 5s
   - Modifiez dans `collaboration.js`:
     ```javascript
     const SYNC_INTERVAL_MS = 10000; // 10s au lieu de 5s
     ```

3. **Limiter l'historique d'audit**
   - La base SQLite peut grossir
   - Nettoyez:
     ```bash
     sqlite3 main-courante.db "DELETE FROM audit_log WHERE datetime(timestamp) < datetime('now', '-7 days');"
     ```

## Production (recommandations)

Pour une vraie utilisation en production:

1. **HTTPS obligatoire**
   - Utilisez nginx + Let's Encrypt
   - Ou Apache avec TLS

2. **Authentification**
   - Ajoutez des logins utilisateurs
   - JWT tokens pour l'API

3. **Monitorage**
   - Vérifiez que les serveurs tournent
   - Logs centralisés
   - Alertes si down

4. **Backup**
   - Sauvegardez `main-courante.db` quotidiennement
   - Gardez 30 jours d'historique

5. **Certificats SSL/TLS**
   - Installez un certificat valide
   - Configurez CORS correctement

## Notes de sécurité

⚠️ **Ne jamais exposer sur internet sans mesures de sécurité:**
- Pas de données sensibles en HTTP
- Ajoutez authentification
- Utilisez VPN pour accès distant
- Limitez les adresses IP autorisées (firewall)
