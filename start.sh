#!/bin/bash

# Script pour démarrer les deux serveurs
# Usage: ./start.sh
# ou: bash start.sh

echo "🚀 Démarrage du système collaboratif..."
echo ""

# Vérifier si Python est disponible
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 n'est pas installé"
    exit 1
fi

# Arrêter les serveurs existants
echo "🔧 Vérification des ports..."
PORT_8000=$(lsof -i :8000 2>/dev/null | grep LISTEN | awk '{print $2}')
PORT_8001=$(lsof -i :8001 2>/dev/null | grep LISTEN | awk '{print $2}')

if [ ! -z "$PORT_8000" ]; then
    echo "⚠️  Port 8000 utilisé par PID $PORT_8000, suppression..."
    kill -9 $PORT_8000 2>/dev/null
    sleep 1
fi

if [ ! -z "$PORT_8001" ]; then
    echo "⚠️  Port 8001 utilisé par PID $PORT_8001, suppression..."
    kill -9 $PORT_8001 2>/dev/null
    sleep 1
fi

# Créer des répertoires si nécessaire
mkdir -p logs

# Démarrer le serveur collaboratif en arrière-plan
echo ""
echo "📡 Démarrage du serveur collaboratif (port 8001)..."
python3 server.py > logs/server.log 2>&1 &
SERVER_PID=$!
echo "   PID: $SERVER_PID"

# Attendre que le serveur soit prêt
sleep 2

# Vérifier que le serveur est bien démarré
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Erreur: Le serveur collaboratif n'a pas pu démarrer"
    cat logs/server.log
    exit 1
fi

# Démarrer le serveur web en arrière-plan
echo "🌐 Démarrage du serveur web (port 8000)..."
python3 -m http.server 8000 > logs/http.log 2>&1 &
HTTP_PID=$!
echo "   PID: $HTTP_PID"

# Attendre un peu
sleep 2

# Afficher le résumé
echo ""
echo "✅ Systèmes démarrés avec succès!"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Interface Web:     http://localhost:8000"
echo "  API Collaborative: http://localhost:8001"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 Logs:"
echo "   Serveur collaboratif: logs/server.log"
echo "   Serveur web:         logs/http.log"
echo ""
echo "🛑 Pour arrêter les serveurs:"
echo "   kill $SERVER_PID  # Serveur collaboratif"
echo "   kill $HTTP_PID    # Serveur web"
echo "   ou: pkill -f 'python3'"
echo ""
echo "📚 Documentation:"
echo "   cat COLLABORATION.md"
echo ""
echo "💡 Ouvrir dans le navigateur:"
echo '   $BROWSER http://localhost:8000'
echo ""

# Garder le script en cours d'exécution
wait
