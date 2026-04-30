#!/bin/bash

# Script pour démarrer le serveur unique

echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Main courante - Démarrage du serveur"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Arrêter les anciens serveurs
echo "⏹️  Arrêt des serveurs précédents..."
pkill -f "python3.*server.py" 2>/dev/null
pkill -f "python3.*http.server" 2>/dev/null

# Créer le dossier logs
mkdir -p logs

# Démarrer le serveur unique
echo ""
echo "🌐 Lancement du serveur unique (port 8000)..."
python3 server.py > logs/server.log 2>&1 &
SERVER_PID=$!

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Erreur: Le serveur n'a pas démarré"
    tail logs/server.log
    exit 1
fi
echo "   ✓ PID $SERVER_PID"

# Afficher les infos
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Serveur actif!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  📍 Interface + API:    http://localhost:8000"
echo ""
echo "  🌍 Sur réseau local:"
echo "     Trouver votre IP:   hostname -I  (ou ipconfig)"
echo "     Puis ouvrir:        http://[IP]:8000"
echo ""
echo "  📋 Logs:"
echo "     Serveur: logs/server.log"
echo ""
echo "  🛑 Pour arrêter:"
echo "     kill $SERVER_PID"
echo "     ou: pkill -f 'python3'"
echo ""
echo "  ℹ️  Plus d'infos:"
echo "     cat REMOTE_ACCESS.md"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

# Afficher les logs en continu
echo "📺 Logs en direct (CTRL+C pour quitter):"
echo ""
tail -f logs/server.log &
TAIL_PID=$!

# Attendre
wait $SERVER_PID

# Cleanup
kill $TAIL_PID 2>/dev/null
echo ""
echo "🛑 Serveurs arrêtés."
