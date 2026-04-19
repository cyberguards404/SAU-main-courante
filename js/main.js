import {
  state,
  loadState,
  saveState,
  setSaveHook,
  ensureActiveTemplate,
  ensureActiveChecklist,
} from "./core/state.js";
import { dom } from "./core/dom.js";
import { bindTemplatesEvents, renderTemplates, setTemplatesRenderHook } from "./features/templates.js";
import {
  bindPlanningEvents,
  renderPlanning,
  setPlanningRenderHook,
} from "./features/planning.js";
import {
  bindChecklistEvents,
  renderChecklist,
  setChecklistRenderHook,
  getChecklistCompletionSummary,
  resetChecklistNavigation,
} from "./features/checklist.js";
import { bindSignatureEvents, renderSignature } from "./features/signature.js";
import { bindPhotosEvents, renderPhotos } from "./features/photos.js";
import { initCollaboration, saveStateToServer, logAction, setOnStateSync } from "./features/collaboration.js";

window.__SAU_APP_READY = true;

function renderLayout() {
  const mobile = state.layout === "mobile";
  dom.appLayout.classList.toggle("mobile-layout", mobile);
  dom.appLayout.classList.toggle("desktop-layout", !mobile);
  dom.displayModeToggle.textContent = mobile ? "Mode PC" : "Mode smartphone";
}

function renderViewTabs() {
  const panels = Array.from(document.querySelectorAll(".view-panel"));
  const hasActivePanel = panels.some((panel) => panel.getAttribute("data-view-panel") === state.activeView);
  if (!hasActivePanel) {
    state.activeView = "checklist";
  }

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.getAttribute("data-view-panel") === state.activeView);
  });

  dom.viewTabs.querySelectorAll("button[data-view-tab]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-view-tab") === state.activeView);
  });
}

function renderDayInfo() {
  dom.dayDate.value = state.day.date;
  dom.dayOwner.value = state.day.owner;
  dom.dayNotes.value = state.day.notes;
}

function renderSuivi() {
  const { total, validated } = getChecklistCompletionSummary();
  dom.completionText.textContent = `${validated} / ${total} verifications planifiees validees`;
}

function rerenderAll() {
  ensureActiveTemplate();
  ensureActiveChecklist();
  renderLayout();
  renderViewTabs();
  renderDayInfo();
  renderPlanning();
  renderTemplates();
  renderChecklist();
  renderSignature();
  renderPhotos();
  renderSuivi();
}

function bindGlobalEvents() {
  dom.viewTabs.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const next = target.getAttribute("data-view-tab");
    if (!next) return;
    state.activeView = next;
    if (next === "checklist") {
      resetChecklistNavigation();
      renderChecklist();
    }
    renderViewTabs();
    saveState();
  });

  dom.displayModeToggle.addEventListener("click", () => {
    state.layout = state.layout === "desktop" ? "mobile" : "desktop";
    renderLayout();
    saveState();
  });

  [
    [dom.dayDate, "date"],
    [dom.dayOwner, "owner"],
    [dom.dayNotes, "notes"],
  ].forEach(([el, key]) => {
    el.addEventListener("input", () => {
      state.day[key] = el.value;
      saveState();
    });
  });

  dom.exportDataBtn.addEventListener("click", () => {
    const fileName = `main-courante-${state.day.date || "export"}.json`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  dom.printReportBtn.addEventListener("click", () => window.print());
}

function init() {
  loadState();
  ensureActiveTemplate();
  ensureActiveChecklist();

  setTemplatesRenderHook(rerenderAll);
  setPlanningRenderHook(rerenderAll);
  setChecklistRenderHook(rerenderAll);

  bindGlobalEvents();
  bindTemplatesEvents();
  bindPlanningEvents();
  bindChecklistEvents();
  bindSignatureEvents();
  bindPhotosEvents();

  // Initialiser la collaboration
  initializeCollaboration();

  rerenderAll();
  saveState();
}

async function initializeCollaboration() {
  // Demander le nom et le rôle de l'opérateur
  const operatorName = prompt("Entrez votre nom:", localStorage.getItem("operator_name") || "");
  
  if (!operatorName) {
    console.warn("Pas de nom d'opérateur fourni, mode hors ligne");
    return;
  }

  localStorage.setItem("operator_name", operatorName);
  const operatorRole = localStorage.getItem("operator_role") || "";

  try {
    // Enregistrer le callback pour fusionner les données du serveur
    setOnStateSync((serverState) => {
      console.log("📥 Fusion des données du serveur...");
      
      // Fusionner intelligemment les données du serveur
      // Priorité au serveur pour les templates (plus à jour)
      if (serverState.templates && serverState.templates.sectors) {
        state.templates = serverState.templates;
        console.log("✓ Templates mis à jour depuis le serveur");
      }
      
      // Fusionner aussi planning et checklistData
      if (serverState.planning && Array.isArray(serverState.planning)) {
        state.planning = serverState.planning;
        console.log("✓ Planifications mises à jour depuis le serveur");
      }
      
      if (serverState.checklistData && typeof serverState.checklistData === "object") {
        Object.assign(state.checklistData, serverState.checklistData);
        console.log("✓ Données checklist mises à jour depuis le serveur");
      }
      
      // Re-sauvegarder localement
      saveState();
      
      // Re-rendre l'interface
      rerenderAll();
    });
    
    await initCollaboration(operatorName, operatorRole);
    console.log("Collaboration initialisée");
    
    // Enregistrer le hook de synchronisation serveur
    setSaveHook((appState) => {
      // Synchroniser asynchrone avec le serveur sans bloquer
      saveStateToServer(appState).catch(() => {
        // Silencieusement échouer si le serveur n'est pas disponible
      });
    });
  } catch (error) {
    console.error("Impossible de se connecter au serveur collaboratif:", error);
    console.log("Continuant en mode hors ligne...");
  }
}

init();
