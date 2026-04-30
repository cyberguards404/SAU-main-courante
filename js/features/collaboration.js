/**
 * Module de synchronisation collaborative
 * Permet à plusieurs opérateurs de travailler sur les mêmes vérifications
 */

function detectServerUrl() {
  return window.location.origin;
}
let SERVER_URL = detectServerUrl();
let sessionId = null;
let operatorName = null;
let operatorRole = null;
let syncInterval = null;
const SYNC_INTERVAL_MS = 5000; // Synchroniser toutes les 5 secondes
let onStateSync = null;

/**
 * Enregistrer le callback quand les données sont synchronisées du serveur
 */
export function setOnStateSync(callback) {
  onStateSync = callback;
}

/**
 * Initialiser la session et se connecter au serveur
 */
export async function initCollaboration(name, role = "") {
  operatorName = name;
  operatorRole = role;

  try {
    // Récupérer ou créer une session
    const response = await fetch(`${SERVER_URL}/api/session/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: operatorName,
        role: operatorRole,
      }),
    });

    if (!response.ok) throw new Error("Impossible de créer une session");

    const data = await response.json();
    sessionId = data.session_id;

    console.log(`✓ Session créée: ${sessionId} (${operatorName})`);
    updateServerStatus(true);

    // Essayer de charger l'état du serveur au démarrage
    await syncStateFromServer();

    // Démarrer la synchronisation périodique
    startAutoSync();

    return sessionId;
  } catch (error) {
    console.error("Erreur initialisation collaboration:", error);
    updateServerStatus(false);
    throw error;
  }
}

/**
 * Sauvegarder l'état complet sur le serveur
 */
export async function saveStateToServer(state) {
  if (!sessionId) {
    console.warn("Session non initialisée, sauvegarde locale uniquement");
    return false;
  }

  try {
    const response = await fetch(`${SERVER_URL}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        operator_name: operatorName,
        state: state,
      }),
    });

    if (!response.ok) throw new Error("Erreur serveur");

    console.log("✓ État sauvegardé sur le serveur");
    return true;
  } catch (error) {
    console.error("Erreur sauvegarde serveur:", error);
    return false;
  }
}

/**
 * Récupérer l'état du serveur
 */
export async function getStateFromServer() {
  try {
    const response = await fetch(`${SERVER_URL}/api/state`);
    if (!response.ok) throw new Error("Erreur serveur");

    const state = await response.json();
    console.log("✓ État récupéré du serveur");
    return state;
  } catch (error) {
    console.error("Erreur récupération serveur:", error);
    return null;
  }
}

/**
 * Synchroniser l'état depuis le serveur (chargement initial)
 */
async function syncStateFromServer() {
  try {
    const serverState = await getStateFromServer();
    
    // Si on a reçu des données du serveur et qu'elles sont valides
    if (serverState && typeof serverState === "object" && Object.keys(serverState).length > 0) {
      console.log("💾 Données trouvées sur le serveur, chargement...");
      
      // Appeler le callback pour que main.js mette à jour l'état global
      if (onStateSync && typeof onStateSync === "function") {
        onStateSync(serverState);
      }
      
      return true;
    } else {
      console.log("ℹ️  Aucune donnée sur le serveur (première utilisation)");
      return false;
    }
  } catch (error) {
    console.error("Erreur synchronisation initiale:", error);
    return false;
  }
}

/**
 * Enregistrer une action dans l'audit
 */
export async function logAction(action, dataType, details = "") {
  if (!sessionId) return;

  try {
    await fetch(`${SERVER_URL}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        operator_name: operatorName,
        action: action,
        data_type: dataType,
        details: details,
      }),
    });
  } catch (error) {
    console.error("Erreur audit:", error);
  }
}

/**
 * Récupérer les opérateurs actifs
 */
export async function getActiveOperators() {
  try {
    const response = await fetch(`${SERVER_URL}/api/operators`);
    if (!response.ok) throw new Error("Erreur serveur");

    return await response.json();
  } catch (error) {
    console.error("Erreur récupération opérateurs:", error);
    return [];
  }
}

/**
 * Récupérer l'historique d'audit
 */
export async function getAuditLog(limit = 50) {
  try {
    const response = await fetch(`${SERVER_URL}/api/audit?limit=${limit}`);
    if (!response.ok) throw new Error("Erreur serveur");

    return await response.json();
  } catch (error) {
    console.error("Erreur récupération audit:", error);
    return [];
  }
}

/**
 * Mettre à jour l'affichage de la liste des opérateurs
 */
async function updateOperatorsList() {
  return [];
}

/**
 * Démarrer la synchronisation automatique
 */
function startAutoSync() {
  if (syncInterval) clearInterval(syncInterval);

  // Synchroniser au démarrage
  syncInterval = setInterval(async () => {
    // Optionnel : vérifier les mises à jour du serveur
    // et mettre à jour le client si nécessaire
  }, SYNC_INTERVAL_MS);

  console.log(`Synchronisation automatique toutes les ${SYNC_INTERVAL_MS / 1000}s`);
}

/**
 * Arrêter la synchronisation
 */
export function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Obtenir l'ID de session actuel
 */
export function getSessionId() {
  return sessionId;
}

/**
 * Obtenir le nom de l'opérateur actuel
 */
export function getOperatorName() {
  return operatorName;
}

/**
 * Helper: Échapper HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Mettre à jour l'affichage du statut serveur
 */
function updateServerStatus(connected) {
  try {
    const statusEl = document.getElementById("serverStatus");
    if (!statusEl) return;

    if (connected) {
      statusEl.textContent = "Serveur collaboratif";
      statusEl.classList.add("connected");
    } else {
      statusEl.textContent = "Hors ligne";
      statusEl.classList.remove("connected");
    }
  } catch (error) {
    console.error("Erreur mise à jour statut:", error);
  }
}
