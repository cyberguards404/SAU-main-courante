# 📱 Accès aux mêmes données PC ↔ Téléphone

## Le problème
Vous créez des templates sur le PC, mais ils n'apparaissent pas sur le téléphone distant.

## La solution
Le téléphone et le PC doivent partager **les mêmes templates via le serveur collaboratif**.

---

## ✅ Étapes simples

### 1️⃣ Sur votre PC - Démarrer les serveurs

**Option A - Facile (recommandé):**
```bash
bash start-servers.sh
```

**Option B - Manuel:**
```bash
# Terminal 1
python3 server.py

# Terminal 2 (dans un autre terminal)
python3 -m http.server 8000
```

✅ Vous devez voir:
- Serveur collaboratif sur port **8001**
- Serveur web sur port **8000**

### 2️⃣ Sur le PC - Créer les templates

1. Allez à `http://localhost:8000`
2. Cliquez sur **"Templates"** (onglet en haut)
3. Créez votre structure:
   ```
   Secteur: "SAUV"
   ├── Box 1 (Sous-catégorie)
   │   ├── Groupe 1 (Sous-sous-catégorie)
   │   │   ├── ✓ Contrôle visuel
   │   │   ├── ✓ Contrôle fonctionnel
   │   │   └── ✓ Test
   │   └── Groupe 2...
   └── Box 2...
   ```

4. **Cliquez "Valider les changements"** → Les templates sont envoyés au serveur

✅ Vous devez voir: **"Serveur collaboratif"** en vert 🟢 en haut à gauche

### 3️⃣ Trouvez l'adresse IP de votre PC

**Linux/Mac:**
```bash
hostname -I
# ou
ifconfig | grep "inet "
```

**Windows:**
```cmd
ipconfig
```

Cherchez une adresse du type: `192.168.1.XX` ou `10.x.x.x`

Exemple de résultat: `192.168.1.50`

### 4️⃣ Sur votre téléphone - Ouvrir l'app

1. **Connectez le téléphone au même WiFi que le PC**
2. Ouvrez un navigateur et allez à:
   ```
   http://[IP-DU-PC]:8000
   ```
   Exemple: `http://192.168.1.50:8000`

3. **Entrez votre nom** à la question "Entrez votre nom"
4. **Attendez 2 secondes** → L'app charge les templates du serveur
5. ✅ **Vous voyez "SAUV" dans Checklist !**

---

## 🔍 Dépannage

### Le téléphone affiche "Hors ligne" 🔴

**Problème:** Le téléphone ne peut pas atteindre le serveur collaboratif

**Solution:**
1. Assurez-vous que **DEUX serveurs tournent** sur le PC:
   - Port 8000 (HTTP)
   - Port 8001 (Collaboratif)
   
   ```bash
   # Vérifier que les deux portssont actifs:
   lsof -i :8000
   lsof -i :8001
   ```

2. Vérifiez que PC et téléphone sont sur **le même réseau WiFi**

3. Testez depuis le téléphone:
   ```
   Navigateur → http://[IP]:8001/api/operators
   ```
   Vous devez voir un JSON vide `[]` ou une liste

### Les templates du PC n'apparaissent pas 📦

**Vérifier la synchronisation:**

1. **Sur le PC**, vérifiez que vous voyez **"Serveur collaboratif"** 🟢 (pas "Hors ligne" 🔴)

2. **Sur le PC**, dans "Templates", cliquez **"Valider les changements"**
   - Cela sauve les templates sur le serveur

3. **Sur le téléphone**, appuyez sur **F5** ou **Actualiser** pour recharger

4. **Si ça ne marche pas:**
   ```bash
   # Sur le PC, vérifier la base de données:
   sqlite3 main-courante.db
   SELECT COUNT(*) FROM app_state;
   # Vous devez avoir au moins 1 ligne
   
   SELECT data FROM app_state WHERE id='main';
   # Vous devez voir vos templates en JSON
   ```

### Le PC dit "Hors ligne" 🔴 (pas "Serveur collaboratif" 🟢)

**Vérifier qu'il y a bien 2 serveurs:**
```bash
# Voir les processus Python actifs:
ps aux | grep python3

# Vous devez voir:
# - python3 server.py
# - python3 -m http.server 8000
```

**Si absent, redémarrer:**
```bash
# Tuer tous les serveurs
pkill -f "python3"

# Relancer proprement
bash start-servers.sh
```

---

## 📊 Flux de synchronisation

```
PC (Navigateur)                  Téléphone (Navigateur)
═══════════════════════════════════════════════════════════
http://localhost:8000            http://192.168.1.50:8000
        ↓                                  ↓
  [Créer "SAUV"]             [Recharger la page]
        ↓                                  ↓
  Clic "Valider"              ["Entrez votre nom"]
        ↓                                  ↓
  saveState()                  initCollaboration()
        ↓                                  ↓
[http.server 8000]             [Connecte à 192.168.1.50:8001]
  localStorage                           ↓
        ↓                        /api/session/register
  hook sync envoie              ✓ Session créée
        ↓                                  ↓
[server.py 8001]               /api/state (GET)
  SQLite: app_state                       ↓
        ↓                        Données chargées ✓
  ✓ Templates sauvegardés              [Affiche SAUV!]
```

---

## 💡 Conseils

### Pour éviter les problèmes IP:
Créez un **raccourci/URL sur le téléphone**:
1. Allez à `http://[IP]:8000`
2. Menu → "Ajouter à l'écran d'accueil"
3. Accès rapide la prochaine fois!

### Vérifier la synchronisation automatique:
Faites un changement sur le PC:
1. Validez un template
2. Attendez 5 secondes
3. Rafraîchissez le téléphone
4. Vous devez voir la modification

### Nettoyer la base de données:
```bash
# Si ça devient bugué:
rm main-courante.db
# Relancer les serveurs - une nouvelle DB sera créée
```

---

## 🚀 Résumé rapide pour utilisation quotidienne

```bash
# Chaque jour sur le PC:
1. bash start-servers.sh
2. Créer/modifier templates dans "Templates"
3. Cliquer "Valider"

# Sur téléphone:
1. Connecter au même WiFi
2. Aller à http://[IP]:8000
3. Entrer le nom
4. ✓ Données du PC chargées!
```

---

## ⚠️ Important

- **Deux serveurs DOIVENT tourner** (8000 + 8001) sinon pas de sync
- **Même réseau WiFi** requis pour l'accès distant
- **Validez les templates** (avant le téléphone se connecte) sinon pas de données
- **Localhost ne marche que sur le PC même** - utilisez l'IP pour le téléphone
