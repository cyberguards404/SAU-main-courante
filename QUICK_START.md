# ⚡ QUICK START - 3 étapes (2 min)

## Sur PC

### 1. Lancer les serveurs (copier/coller)
```bash
cd /workspaces/SAU-main-courante
bash start-servers.sh
```
✅ Attendez que ça affiche "✅ Serveur actif!"

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
http://[IP]:8000
# L'application doit s'ouvrir directement
```

---

## 🚨 Bug = serveur non lancé?

```bash
# Vérifier que le serveur tourne:
lsof -i :8000

# S'il manque:
pkill -f python3
bash start-servers.sh
```

---

**C'est tout!** 🎉

Besoin d'aide → Lisez [SYNCHRONIZE_DATA.md](SYNCHRONIZE_DATA.md)
