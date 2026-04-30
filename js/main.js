import {
  state,
  createId,
  loadState,
  saveState,
  setSaveHook,
  ensureActiveTemplate,
  ensureActiveChecklist,
} from "./core/state.js";
import { dom, escapeHtml } from "./core/dom.js";
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
  collectSectorAnomalies,
} from "./features/checklist.js";
import { bindSignatureEvents, renderSignature } from "./features/signature.js";
import { initCollaboration, saveStateToServer, logAction, setOnStateSync } from "./features/collaboration.js";

let pendingServerSyncTimer = null;
let serverSyncInFlight = false;

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

  if (!Array.isArray(state.day.items)) state.day.items = [];
  if (!dom.dayItemsList) return;

  dom.dayItemsList.innerHTML = "";
  if (state.day.items.length === 0) {
    dom.dayItemsList.innerHTML = '<p class="muted-text">Aucun item de main courante.</p>';
    return;
  }

  state.day.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = `mc-item-row ${item.done ? "is-done" : ""}`;
    row.innerHTML = `
      <label class="mc-item-check">
        <input type="checkbox" data-day-item-toggle-id="${item.id}" ${item.done ? "checked" : ""} />
        <span>${escapeHtml(item.label)}</span>
      </label>
      <button type="button" class="secondary-btn icon-btn" data-day-item-remove-id="${item.id}" title="Supprimer">✕</button>
    `;
    dom.dayItemsList.appendChild(row);
  });
}

function computeChecklistGlobalProgress() {
  const plans = state.planning.filter((p) => p.sectorId);
  let total = 0;
  let done = 0;

  plans.forEach((plan) => {
    const sector = state.templates.sectors.find((s) => s.id === plan.sectorId);
    if (!sector) return;

    sector.categories.forEach((category) => {
      category.itemSubcategories.forEach((group) => {
        const key = `${plan.id}::${category.id}::${group.id}`;
        const savedItems = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : null;
        const source = savedItems || (Array.isArray(group.items) ? group.items : []);
        total += source.length;
        done += source.filter((item) => item.status === "valide" || item.status === "non-valide" || item.done).length;
      });
    });
  });

  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function renderDashboard() {
  if (!dom.dashboardSummary) return;

  const planned = state.planning.filter((p) => p.sectorId);
  const plannedDone = planned.filter((p) => p.validatedAt || p.status === "Terminee").length;
  const planningPct = planned.length > 0 ? Math.round((plannedDone / planned.length) * 100) : 0;

  const verif = computeChecklistGlobalProgress();
  const dayItems = Array.isArray(state.day.items) ? state.day.items : [];
  const dayItemsDone = dayItems.filter((item) => item.done).length;
  const dayItemsPct = dayItems.length > 0 ? Math.round((dayItemsDone / dayItems.length) * 100) : 0;

  dom.dashboardSummary.innerHTML = `
    <div class="dashboard-kpi-card">
      <h4>Commandes programmees</h4>
      <p class="dashboard-kpi-value">${plannedDone} / ${planned.length}</p>
      <div class="dashboard-kpi-bar"><span style="width:${planningPct}%"></span></div>
      <small>${planningPct}% de completude</small>
    </div>
    <div class="dashboard-kpi-card">
      <h4>Verifications journalieres</h4>
      <p class="dashboard-kpi-value">${verif.done} / ${verif.total}</p>
      <div class="dashboard-kpi-bar"><span style="width:${verif.pct}%"></span></div>
      <small>${verif.pct}% de completude</small>
    </div>
    <div class="dashboard-kpi-card">
      <h4>Items main courante</h4>
      <p class="dashboard-kpi-value">${dayItemsDone} / ${dayItems.length}</p>
      <div class="dashboard-kpi-bar"><span style="width:${dayItemsPct}%"></span></div>
      <small>${dayItemsPct}% de completude</small>
    </div>
  `;

  if (dom.dashboardNotes) {
    const notes = state.day.notes?.trim();
    dom.dashboardNotes.textContent = notes ? notes : "Aucune note.";
  }

  if (dom.dashboardItems) {
    dom.dashboardItems.innerHTML = "";
    if (dayItems.length === 0) {
      dom.dashboardItems.innerHTML = '<p class="muted-text">Aucun item de main courante.</p>';
    } else {
      dayItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = `mc-item-row ${item.done ? "is-done" : ""}`;
        row.innerHTML = `
          <span>${escapeHtml(item.label)}</span>
          <span class="badge ${item.done ? "badge-ok" : "badge-pending"}">${item.done ? "Fait" : "A faire"}</span>
        `;
        dom.dashboardItems.appendChild(row);
      });
    }
  }
}

function renderCommandesPanel() {
  if (!dom.commandsPlannedList || !dom.verificationsPlannedList) return;

  const commands = state.planning.filter((entry) => entry.sectorId);
  dom.commandsPlannedList.innerHTML = "";
  if (commands.length === 0) {
    dom.commandsPlannedList.innerHTML = '<p class="muted-text">Aucune commande prevue.</p>';
  } else {
    [...commands]
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
      .forEach((entry) => {
        const sector = state.templates.sectors.find((s) => s.id === entry.sectorId);
        const card = document.createElement("div");
        card.className = "commande-card";
        card.innerHTML = `
          <div class="commande-card-head">
            <strong>${escapeHtml(entry.time || "--:--")} - ${escapeHtml(sector?.name || "Secteur")}</strong>
            <span class="badge ${entry.validatedAt ? "badge-ok" : "badge-pending"}">${entry.validatedAt ? "Validee" : "A traiter"}</span>
          </div>
          <div class="commande-card-meta">
            <small>Recurrence: ${escapeHtml(entry.recurrenceType)} / pas ${Number(entry.recurrenceEvery) || 1}</small>
            <label>
              Statut
              <select data-command-status-id="${entry.id}">
                ${["A faire", "En cours", "Terminee"].map((s) => `<option value="${s}" ${entry.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </label>
          </div>
        `;
        dom.commandsPlannedList.appendChild(card);
      });
  }

  const sectors = state.templates.sectors.filter((sector) => commands.some((cmd) => cmd.sectorId === sector.id));
  dom.verificationsPlannedList.innerHTML = "";
  if (sectors.length === 0) {
    dom.verificationsPlannedList.innerHTML = '<p class="muted-text">Aucune verification journaliere prevue.</p>';
    return;
  }

  sectors.forEach((sector) => {
    let groupsCount = 0;
    let itemsCount = 0;
    sector.categories.forEach((category) => {
      groupsCount += category.itemSubcategories.length;
      category.itemSubcategories.forEach((group) => {
        itemsCount += group.items.length;
      });
    });

    const card = document.createElement("div");
    card.className = "commande-card";
    card.innerHTML = `
      <div class="commande-card-head">
        <strong>${escapeHtml(sector.name)}</strong>
      </div>
      <div class="commande-card-meta">
        <small>${sector.categories.length} sous-categorie(s)</small>
        <small>${groupsCount} sous-sous-categorie(s)</small>
        <small>${itemsCount} item(s) de verification</small>
      </div>
    `;
    dom.verificationsPlannedList.appendChild(card);
  });
}

function buildVerifCompletionStats(plan, sector) {
  if (!sector) return { done: 0, total: 0, pct: 0 };
  let done = 0;
  let total = 0;
  sector.categories.forEach((category) => {
    category.itemSubcategories.forEach((group) => {
      const key = `${plan.id}::${category.id}::${group.id}`;
      const items = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : group.items || [];
      total += items.length;
      done += items.filter((i) => i.status === "valide" || i.status === "non-valide" || i.done).length;
    });
  });
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function buildVerifItemDetails(plan, sector) {
  if (!sector) return [];
  const rows = [];
  sector.categories.forEach((category) => {
    category.itemSubcategories.forEach((group) => {
      const key = `${plan.id}::${category.id}::${group.id}`;
      const items = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : [];
      items.forEach((item) => {
        const status = item.status || (item.done ? "valide" : "");
        if (!status && !item.comment) return; // ne montrer que les items traités ou commentés
        rows.push({ category: category.name, group: group.name, label: item.label, status, comment: item.comment || "" });
      });
    });
  });
  return rows;
}

function renderSuivi() {
  const { total, validated } = getChecklistCompletionSummary();
  dom.completionText.textContent = `${validated} / ${total} verifications planifiees validees`;

  // Vérifications réalisées
  const allPlans = state.planning.filter((p) => p.sectorId);
  dom.suiviVerifications.innerHTML = "";

  if (allPlans.length === 0) {
    dom.suiviVerifications.innerHTML = '<p class="muted-text">Aucune verification planifiee ce jour.</p>';
  } else {
    allPlans.forEach((plan) => {
      const sector = state.templates.sectors.find((s) => s.id === plan.sectorId);
      const anomalies = sector ? collectSectorAnomalies(plan.id, sector) : [];
      const stats = buildVerifCompletionStats(plan, sector);
      const isValidated = Boolean(plan.validatedAt);
      const items = buildVerifItemDetails(plan, sector);

      const card = document.createElement("div");
      card.className = "suivi-verification-card";
      card.dataset.verifPlanId = plan.id;

      const itemRows = items.map((row) => {
        const statusClass = row.status === "valide" ? "status-valide" : row.status === "non-valide" ? "status-non-valide" : "status-pending";
        const statusLabel = row.status === "valide" ? "✓" : row.status === "non-valide" ? "✕" : "–";
        return `<tr class="${statusClass}">
          <td><span class="verifdetail-status">${statusLabel}</span></td>
          <td><span class="verifdetail-path">${escapeHtml(row.category)} / ${escapeHtml(row.group)}</span><br><strong>${escapeHtml(row.label)}</strong></td>
          <td>${row.comment ? `<span class="verifdetail-comment">${escapeHtml(row.comment)}</span>` : ""}</td>
        </tr>`;
      }).join("");

      card.innerHTML = `
        <div class="suivi-card-head" data-toggle-verifdetail="${plan.id}">
          <strong>${escapeHtml(sector?.name || plan.sectorId)}</strong>
          ${isValidated
            ? `<span class="badge ${anomalies.length > 0 ? "badge-issue" : "badge-ok"}">${anomalies.length > 0 ? anomalies.length + " anomalie(s)" : "OK"}</span>`
            : `<span class="badge badge-pending">En cours</span>`
          }
          <span class="verifdetail-pct">${stats.pct}% (${stats.done}/${stats.total})</span>
          ${isValidated ? `<small>Valide le ${new Date(plan.validatedAt).toLocaleString("fr-FR")}</small>` : ""}
          <button type="button" class="secondary-btn icon-btn verifdetail-toggle-btn" data-toggle-verifdetail="${plan.id}" title="Voir le detail">▼</button>
        </div>
        <div class="verifdetail-progress">
          <div class="verifdetail-bar" style="width:${stats.pct}%"></div>
        </div>
        <div class="verifdetail-body is-hidden" id="verifdetail-${plan.id}">
          ${items.length > 0
            ? `<table class="verifdetail-table"><tbody>${itemRows}</tbody></table>`
            : `<p class="muted-text">Aucun item renseigne.</p>`
          }
        </div>
      `;
      dom.suiviVerifications.appendChild(card);
    });
  }

  // Tickets
        ${isValidated && plan.validationSignature?.imageData ? `
          <div class="suivi-signature-wrap">
            <img src="${plan.validationSignature.imageData}" class="suivi-signature-preview" alt="Signature operateur" />
            <div>
              <small>Signature: ${escapeHtml(plan.validationSignature?.signerName || "Inconnu")}</small>
              ${plan.validationSignature?.signerRole ? `<small>Fonction: ${escapeHtml(plan.validationSignature.signerRole)}</small>` : ""}
            </div>
          </div>
        ` : ""}
  dom.suiviTickets.innerHTML = "";
  const tickets = Array.isArray(state.tickets) ? state.tickets : [];
  if (tickets.length === 0) {
    dom.suiviTickets.innerHTML = '<p class="muted-text">Aucun ticket cree.</p>';
  } else {
    [...tickets].reverse().forEach((ticket) => {
      if (!Array.isArray(ticket.notes)) ticket.notes = [];
      const notesHtml = ticket.notes.length > 0
        ? `<ul class="ticket-notes-list">${ticket.notes.map((n) => `<li><small>${new Date(n.at).toLocaleString("fr-FR")}</small> ${escapeHtml(n.text)}</li>`).join("")}</ul>`
        : "";

      const card = document.createElement("div");
      card.className = `suivi-ticket-card ${ticket.status === "clos" ? "ticket-clos" : "ticket-ouvert"}`;
      card.innerHTML = `
        <div class="suivi-card-head">
          <strong>${escapeHtml(ticket.itemLabel)}</strong>
          <span class="badge ${ticket.status === "clos" ? "badge-ok" : "badge-issue"}">${escapeHtml(ticket.status)}</span>
          <small>${escapeHtml(ticket.sectorName)}${ticket.categoryName ? " / " + escapeHtml(ticket.categoryName) : ""}${ticket.groupName ? " / " + escapeHtml(ticket.groupName) : ""}</small>
          <small>Ouvert le ${new Date(ticket.createdAt).toLocaleDateString("fr-FR")}</small>
        </div>
        ${ticket.comment ? `<p class="muted-text ticket-comment">Contexte : ${escapeHtml(ticket.comment)}</p>` : ""}
        ${notesHtml}
        ${ticket.status === "ouvert" ? `
          <div class="ticket-note-form">
            <textarea class="ticket-note-input" rows="2" placeholder="Ajouter une note de suivi..." data-ticket-note-id="${ticket.id}"></textarea>
            <div class="ticket-note-actions">
              <button type="button" class="secondary-btn" data-add-note-ticket-id="${ticket.id}">Ajouter note</button>
              <button type="button" class="secondary-btn ticket-close-btn" data-close-ticket-id="${ticket.id}">Clore le ticket</button>
            </div>
          </div>
        ` : `<small class="muted-text">Clos le ${new Date(ticket.closedAt).toLocaleDateString("fr-FR")}</small>`}
      `;
      dom.suiviTickets.appendChild(card);
    });
  }
}

function bindSuiviEvents() {
  const suiviSection = document.querySelector('[data-view-panel="suivi"]');
  if (!suiviSection) return;

  suiviSection.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Toggle détail vérification
    const toggleId = target.closest("[data-toggle-verifdetail]")?.getAttribute("data-toggle-verifdetail");
    if (toggleId) {
      const body = document.getElementById(`verifdetail-${toggleId}`);
      const btn = suiviSection.querySelector(`button[data-toggle-verifdetail="${toggleId}"]`);
      if (body) {
        const open = body.classList.toggle("is-hidden");
        if (btn) btn.textContent = open ? "▼" : "▲";
      }
      return;
    }

    // Ajouter note ticket
    const addNoteId = target.getAttribute("data-add-note-ticket-id");
    if (addNoteId) {
      if (!Array.isArray(state.tickets)) return;
      const ticket = state.tickets.find((t) => t.id === addNoteId);
      if (!ticket) return;
      const textarea = suiviSection.querySelector(`textarea[data-ticket-note-id="${addNoteId}"]`);
      const text = textarea instanceof HTMLTextAreaElement ? textarea.value.trim() : "";
      if (!text) return;
      if (!Array.isArray(ticket.notes)) ticket.notes = [];
      ticket.notes.push({ at: new Date().toISOString(), text });
      renderSuivi();
      saveState();
      return;
    }

    // Clore ticket
    const closeId = target.getAttribute("data-close-ticket-id");
    if (closeId) {
      if (!Array.isArray(state.tickets)) return;
      const ticket = state.tickets.find((t) => t.id === closeId);
      if (!ticket) return;
      ticket.status = "clos";
      ticket.closedAt = new Date().toISOString();
      renderSuivi();
      saveState();
      return;
    }
  });
}

function rerenderAll() {
  ensureActiveTemplate();
  ensureActiveChecklist();
  renderLayout();
  renderViewTabs();
  renderDayInfo();
  renderPlanning();
  renderCommandesPanel();
  renderTemplates();
  renderChecklist();
  renderSignature();
  renderDashboard();
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
      if (key === "notes") {
        renderDashboard();
      }
      saveState();
    });
  });

  if (dom.addDayItemBtn && dom.dayItemInput instanceof HTMLInputElement) {
    dom.addDayItemBtn.addEventListener("click", () => {
      const label = dom.dayItemInput.value.trim();
      if (!label) return;
      if (!Array.isArray(state.day.items)) state.day.items = [];
      state.day.items.push({ id: createId(), label, done: false, createdAt: new Date().toISOString() });
      dom.dayItemInput.value = "";
      renderDayInfo();
      renderDashboard();
      saveState();
    });

    dom.dayItemInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      dom.addDayItemBtn.click();
    });
  }

  if (dom.dayItemsList) {
    dom.dayItemsList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const removeId = target.getAttribute("data-day-item-remove-id");
      if (removeId) {
        state.day.items = (state.day.items || []).filter((item) => item.id !== removeId);
        renderDayInfo();
        renderDashboard();
        saveState();
        return;
      }

      const input = target.closest("input[data-day-item-toggle-id]");
      if (!(input instanceof HTMLInputElement)) return;
      const toggleId = input.getAttribute("data-day-item-toggle-id");
      if (!toggleId) return;
      const item = (state.day.items || []).find((entry) => entry.id === toggleId);
      if (!item) return;
      item.done = input.checked;
      renderDayInfo();
      renderDashboard();
      saveState();
    });
  }

  if (dom.commandsPlannedList) {
    dom.commandsPlannedList.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const commandId = target.getAttribute("data-command-status-id");
      if (!commandId) return;
      const command = state.planning.find((entry) => entry.id === commandId);
      if (!command) return;
      command.status = target.value;
      renderCommandesPanel();
      renderDashboard();
      saveState();
    });
  }

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
  bindSuiviEvents();

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
      // Débouncer la synchro pour éviter de saturer l'API lors des séries d'actions UI.
      if (pendingServerSyncTimer) {
        clearTimeout(pendingServerSyncTimer);
      }

      pendingServerSyncTimer = setTimeout(() => {
        if (serverSyncInFlight) return;
        serverSyncInFlight = true;
        saveStateToServer(appState)
          .catch(() => {
            // Silencieusement échouer si le serveur n'est pas disponible
          })
          .finally(() => {
            serverSyncInFlight = false;
          });
      }, 350);
    });
  } catch (error) {
    console.error("Impossible de se connecter au serveur collaboratif:", error);
    console.log("Continuant en mode hors ligne...");
  }
}

init();
