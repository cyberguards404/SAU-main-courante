#!/bin/bash

# Script pour démarrer les deux serveurs simultanement

echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Main courante - Démarrage des serveurs"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Arrêter les anciens serveurs
echo "⏹️  Arrêt des serveurs précédents..."
pkill -f "python3.*server.py" 2>/dev/null
pkill -f "python3.*http.server" 2>/dev/null
sleep 1

# Créer le dossier logs
mkdir -p logs

# Démarrer le serveur collaboratif
echo ""
echo "📡 Lancement du serveur collaboratif (port 8001)..."
python3 server.py > logs/server.log 2>&1 &
SERVER_PID=$!
sleep 2

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Erreur: Le serveur collaboratif n'a pas démarré"
    tail logs/server.log
    exit 1
fi
echo "   ✓ PID $SERVER_PID"

# Démarrer le serveur HTTP
echo ""
echo "🌐 Lancement du serveur web (port 8000)..."
python3 -m http.server 8000 > logs/http.log 2>&1 &
HTTP_PID=$!
sleep 1

if ! kill -0 $HTTP_PID 2>/dev/null; then
    echo "❌ Erreur: Le serveur web n'a pas démarré"
    tail logs/http.log
    exit 1
fi
echo "   ✓ PID $HTTP_PID"

# Afficher les infos
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Serveurs actifs!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  📍 Interface web:      http://localhost:8000"
echo "  📡 API collaborative:  http://localhost:8001/api/"
echo ""
echo "  🌍 Sur réseau local:"
echo "     Trouver votre IP:   hostname -I  (ou ipconfig)"
echo "     Puis ouvrir:        http://[IP]:8000"
echo ""
echo "  📋 Logs:"
echo "     Serveur collab: logs/server.log"
echo "     Serveur HTTP:   logs/http.log"
echo ""
echo "  🛑 Pour arrêter:"
echo "     kill $SERVER_PID $HTTP_PID"
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
wait $SERVER_PID $HTTP_PID

# Cleanup
kill $TAIL_PID 2>/dev/null
echo ""
echo "🛑 Serveurs arrêtés."
