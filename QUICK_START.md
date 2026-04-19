# ⚡ QUICK START - 3 étapes (2 min)

## Sur PC

### 1. Lancer les serveurs (copier/coller)
```bash
cd /workspaces/SAU-main-courante
bash start-servers.sh
```
✅ Attendez que ça affiche "✅ Serveurs actifs!"

### 2. Créer templates
- Allez à: http://localhost:8000
- Onglet "Templates" 
- Créez secteur "SAUV" + Box 1, 2, 3...
- Cliquez **"Valider les changements"**
- Vérifiez: "Serveur collaboratif" 🟢 en haut à gauche

### 3. Trouver votre IP
```bash
# Copier-coller dans un autre terminal:
hostname -I
```
Résultat: `192.168.1.50` (par exemple)

---

## Sur Téléphone

### 1. Connecter au même WiFi que PC

### 2. Ouvrir navigateur
```
http://192.168.1.50:8000
```
(remplacer 192.168.1.50 par votre IP)

### 3. Entrer nom + utiliser!
- Boîte "Entrez votre nom" → Votre nom
- ✓ Templates du PC s'affichent!
- Allez à "Checklist" → "Secteurs"
- Vous voyez "SAUV" !

---

## ✅ Vérification

**Sur PC:**
```bash
# Si vous voyez "Serveur collaboratif" 🟢 en haut:
# → OK! Les données se synchronisent
```

**Sur téléphone:**
```
http://[IP]:8001/api/operators
# Vous devez voir du JSON (une liste)
```

---

## 🚨 Bug = 2 serveurs manquants?

```bash
# Vérifier les deux serveurs tournent:
lsof -i :8000
lsof -i :8001

# Si l'un manque:
pkill -f python3
bash start-servers.sh
```

---

**C'est tout!** 🎉

Besoin d'aide → Lisez [SYNCHRONIZE_DATA.md](SYNCHRONIZE_DATA.md)
