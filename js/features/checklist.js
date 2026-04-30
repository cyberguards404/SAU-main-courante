import {
  state,
  createChecklistItem,
  createTicket,
  ensureActiveChecklist,
  getSectorById,
  getCategoryById,
  getItemSubcategoryById,
  saveState,
} from "../core/state.js";
import { dom, escapeHtml } from "../core/dom.js";
import { getPlannedSectors, getPlanningBySector, validatePlanning } from "./planning.js";

let rerenderAll = () => {};
let checklistStep = "sector";
const openCommentItemIds = new Set();

export function setChecklistRenderHook(fn) {
  rerenderAll = fn;
}

export function resetChecklistNavigation() {
  setChecklistStep("sector");
}

function getCurrentPlan() {
  return state.planning.find((p) => p.id === state.activeChecklist.planningId) || null;
}

function getSectorMetaKey(planId) {
  return `${planId}::meta::sector`;
}

function getCategoryMetaKey(planId, categoryId) {
  return `${planId}::meta::category::${categoryId}`;
}

function getMetaObject(key) {
  if (!key) return {};
  if (!state.checklistData[key] || typeof state.checklistData[key] !== "object" || Array.isArray(state.checklistData[key])) {
    state.checklistData[key] = {};
  }
  return state.checklistData[key];
}

function getChecklistKey() {
  const plan = getCurrentPlan();
  if (!plan || !state.activeChecklist.categoryId || !state.activeChecklist.itemSubcategoryId) return "";
  return `${plan.id}::${state.activeChecklist.categoryId}::${state.activeChecklist.itemSubcategoryId}`;
}

function ensureChecklistItems() {
  const key = getChecklistKey();
  if (!key) return [];

  if (!Array.isArray(state.checklistData[key])) {
    const group = getItemSubcategoryById(
      state.activeChecklist.sectorId,
      state.activeChecklist.categoryId,
      state.activeChecklist.itemSubcategoryId,
    );
    state.checklistData[key] = (group?.items || []).map((i) => createChecklistItem(i.label));
  }
  state.checklistData[key] = state.checklistData[key].map((item) => ({
    ...item,
    status: item.status || (item.done ? "valide" : ""),
    comment: item.comment || "",
    consumable: Boolean(item.consumable),
    photoDataUrl: item.photoDataUrl || "",
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
  return state.checklistData[key];
}

function collectPlanConsumables(planId, sector) {
  if (!planId || !sector) return [];

  const consumables = [];
  sector.categories.forEach((category) => {
    category.itemSubcategories.forEach((group) => {
      const key = `${planId}::${category.id}::${group.id}`;
      const items = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : [];
      items.filter((item) => item.consumable).forEach((item) => {
        consumables.push({
          itemId: item.id,
          label: item.label,
          category: category.name,
          group: group.name,
        });
      });
    });
  });

  return consumables;
}

function renderConsumablesList(container, countNode, consumables) {
  if (countNode) {
    countNode.textContent = String(consumables.length);
  }
  if (!container) return;

  container.innerHTML = "";
  if (consumables.length === 0) {
    container.innerHTML = '<p class="muted-text">Aucun consommable a reassort.</p>';
    return;
  }

  consumables.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "restock-item";
    row.innerHTML = `
      <div class="restock-item-copy">
        <strong>${escapeHtml(entry.label)}</strong>
        <small>${escapeHtml(entry.category)} / ${escapeHtml(entry.group)}</small>
      </div>
      <button type="button" class="secondary-btn icon-btn" data-remove-consumable-id="${entry.itemId}" title="Retirer du reassort">✕</button>
    `;
    container.appendChild(row);
  });
}

function updatePlanItem(planId, sector, itemId, updater) {
  if (!planId || !sector || !itemId || typeof updater !== "function") return false;

  for (const category of sector.categories) {
    for (const group of category.itemSubcategories) {
      const key = `${planId}::${category.id}::${group.id}`;
      const items = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : null;
      if (!items) continue;
      const item = items.find((entry) => entry.id === itemId);
      if (!item) continue;
      updater(item);
      item.updatedAt = new Date().toISOString();
      return true;
    }
  }

  return false;
}

export function collectSectorAnomalies(planId, sector) {
  if (!planId || !sector) return [];
  const anomalies = [];

  sector.categories.forEach((category) => {
    category.itemSubcategories.forEach((group) => {
      const key = `${planId}::${category.id}::${group.id}`;
      const items = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : [];
      items
        .filter((item) => item.status === "non-valide")
        .forEach((item) => {
          anomalies.push({
            categoryId: category.id,
            category: category.name,
            group: group.name,
            label: item.label,
            comment: item.comment,
          });
        });
    });
  });

  return anomalies;
}

function renderAnomalyList(container, anomalies, emptyLabel) {
  container.innerHTML = "";
  if (anomalies.length === 0) {
    container.innerHTML = `<p class="muted-text">${escapeHtml(emptyLabel)}</p>`;
    return;
  }

  anomalies.forEach((a) => {
    const line = document.createElement("div");
    line.className = "anomaly-item";
    line.innerHTML = `
      <strong>${escapeHtml(a.label)}</strong>
      <span>${escapeHtml(a.category)} / ${escapeHtml(a.group)}</span>
      ${a.comment ? `<small>${escapeHtml(a.comment)}</small>` : ""}
    `;
    container.appendChild(line);
  });
}

function renderCategoriesQuickNav(container, sector, currentCategoryId, planId) {
  container.innerHTML = "";
  if (!sector || !Array.isArray(sector.categories)) return;

  sector.categories.forEach((category) => {
    const progress = getCategoryProgress(planId, category);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-nav-btn";
    btn.dataset.categoryId = category.id;
    btn.classList.toggle("active", category.id === currentCategoryId);
    btn.classList.toggle("status-ok", progress.complete && !progress.hasAnomaly);
    btn.classList.toggle("status-issue", progress.complete && progress.hasAnomaly);
    btn.textContent = category.name;
    container.appendChild(btn);
  });
}

function renderItemSubcategoriesQuickNav(container, category, currentItemSubcategoryId, planId) {
  container.innerHTML = "";
  if (!category || !Array.isArray(category.itemSubcategories)) return;

  category.itemSubcategories.forEach((group) => {
    const progress = getGroupProgress(planId, category.id, group);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-nav-btn";
    btn.dataset.itemSubcategoryId = group.id;
    btn.classList.toggle("active", group.id === currentItemSubcategoryId);
    btn.classList.toggle("status-ok", progress.complete && !progress.hasAnomaly);
    btn.classList.toggle("status-issue", progress.complete && progress.hasAnomaly);
    btn.textContent = group.name;
    container.appendChild(btn);
  });
}

function normalizedStatus(item) {
  if (item?.status === "valide" || item?.status === "non-valide") return item.status;
  return item?.done ? "valide" : "";
}

export function getGroupProgress(planId, categoryId, group) {
  const key = `${planId}::${categoryId}::${group.id}`;
  const savedItems = Array.isArray(state.checklistData[key]) ? state.checklistData[key] : null;
  const sourceItems = savedItems || (Array.isArray(group.items) ? group.items.map((item) => ({ ...item, status: "" })) : []);
  const statuses = sourceItems.map((item) => normalizedStatus(item));
  const complete = statuses.length > 0 && statuses.every((status) => status === "valide" || status === "non-valide");
  const hasAnomaly = statuses.some((status) => status === "non-valide");
  return { complete, hasAnomaly };
}

function getCategoryProgress(planId, category) {
  const groups = Array.isArray(category.itemSubcategories) ? category.itemSubcategories : [];
  if (groups.length === 0) return { complete: false, hasAnomaly: false };
  const progress = groups.map((group) => getGroupProgress(planId, category.id, group));
  return {
    complete: progress.every((p) => p.complete),
    hasAnomaly: progress.some((p) => p.hasAnomaly),
  };
}

function setChecklistStep(step) {
  checklistStep = step;
}

function persistChecklistProgress() {
  const plan = getCurrentPlan();
  if (!plan) {
    saveState();
    return;
  }

  const sectorMeta = getMetaObject(getSectorMetaKey(plan.id));
  if (dom.sectorGeneralComment instanceof HTMLTextAreaElement) {
    sectorMeta.comment = dom.sectorGeneralComment.value;
  }

  if (state.activeChecklist.categoryId) {
    const categoryMeta = getMetaObject(getCategoryMetaKey(plan.id, state.activeChecklist.categoryId));
    if (dom.categoryComment instanceof HTMLTextAreaElement) {
      categoryMeta.comment = dom.categoryComment.value;
    }
  }

  if (state.activeChecklist.categoryId && state.activeChecklist.itemSubcategoryId) {
    ensureChecklistItems().forEach((item) => {
      item.updatedAt = item.updatedAt || new Date().toISOString();
    });
  }

  saveState();
}

function applyChecklistStepVisibility() {
  dom.checklistSectorStep.classList.toggle("is-hidden", checklistStep !== "sector");
  dom.checklistCategoryStep.classList.toggle("is-hidden", checklistStep !== "category");
  dom.checklistItemSubcategoryStep.classList.toggle("is-hidden", checklistStep !== "itemSubcategory");
  dom.checklistItemsStep.classList.toggle("is-hidden", checklistStep !== "items");
}

export function renderChecklist() {
  ensureActiveChecklist();
  applyChecklistStepVisibility();

  const sectors = getPlannedSectors();
  dom.todaySectorsList.innerHTML = "";

  if (sectors.length === 0) {
    setChecklistStep("sector");
    applyChecklistStepVisibility();
    dom.todaySectorsList.innerHTML = '<p class="muted-text">Aucune verification planifiee.</p>';
    dom.plannedCategoriesList.innerHTML = "";
    dom.itemSubcategoryList.innerHTML = "";
    dom.subChecklistBody.innerHTML = '<p class="muted-text">Aucune checklist active.</p>';
    dom.subChecklistCompletionText.textContent = "0 valide, 0 non valide sur 0";
    dom.sectorValidationStatus.textContent = "Aucune validation secteur.";
    dom.sectorGeneralComment.value = "";
    dom.categoryComment.value = "";
    renderAnomalyList(dom.sectorAnomalies, [], "Aucune anomalie secteur.");
    renderAnomalyList(dom.categoryAnomalies, [], "Aucune anomalie sous-categorie.");
    return;
  }

  sectors.forEach((sector) => {
    const count = getPlanningBySector(sector.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "selection-card";
    btn.dataset.sectorId = sector.id;
    btn.classList.toggle("active", sector.id === state.activeChecklist.sectorId);
    btn.innerHTML = `<strong>${escapeHtml(sector.name)}</strong><small>${count} verification(s)</small>`;
    dom.todaySectorsList.appendChild(btn);
  });

  if (checklistStep === "sector") {
    return;
  }

  if (!state.activeChecklist.sectorId || !sectors.some((s) => s.id === state.activeChecklist.sectorId)) {
    setChecklistStep("sector");
    applyChecklistStepVisibility();
    return;
  }

  const sector = getSectorById(state.activeChecklist.sectorId);
  const sectorPlans = getPlanningBySector(state.activeChecklist.sectorId);
  if (!sector || sectorPlans.length === 0) {
    setChecklistStep("sector");
    applyChecklistStepVisibility();
    dom.plannedCategoriesList.innerHTML = "";
    dom.itemSubcategoryList.innerHTML = "";
    dom.subChecklistBody.innerHTML = '<p class="muted-text">Aucune checklist active.</p>';
    return;
  }

  if (!sectorPlans.some((p) => p.id === state.activeChecklist.planningId)) {
    state.activeChecklist.planningId = sectorPlans[0].id;
  }

  dom.selectedSectorTitle.textContent = `Sous-categories pour ${sector.name}`;
  dom.plannedCategoriesList.innerHTML = "";

  const plan = getCurrentPlan();
  const sectorMeta = getMetaObject(getSectorMetaKey(plan?.id || ""));
  dom.validateSectorBtn.textContent = plan?.validatedAt ? "Revalider verification secteur" : "Valider verification secteur";
  dom.sectorValidationStatus.textContent = plan?.validatedAt
    ? `Validee le ${new Date(plan.validatedAt).toLocaleString("fr-FR")} - ${plan.validationSignature?.signerName || "signature manquante"}`
    : "En attente de validation secteur.";
  dom.sectorGeneralComment.value = sectorMeta.comment || "";
  renderAnomalyList(dom.sectorAnomalies, collectSectorAnomalies(plan?.id || "", sector), "Aucune anomalie secteur.");
  renderConsumablesList(
    dom.sectorConsumablesList,
    dom.sectorConsumablesCount,
    collectPlanConsumables(plan?.id || "", sector),
  );

  sector.categories.forEach((category) => {
    const progress = getCategoryProgress(plan?.id || "", category);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subpart-chip";
    btn.dataset.categoryId = category.id;
    btn.classList.toggle("active", category.id === state.activeChecklist.categoryId);
    btn.classList.toggle("status-ok", progress.complete && !progress.hasAnomaly);
    btn.classList.toggle("status-issue", progress.complete && progress.hasAnomaly);
    btn.textContent = category.name;
    dom.plannedCategoriesList.appendChild(btn);
  });

  if (checklistStep === "category") {
    return;
  }

  if (!state.activeChecklist.categoryId || !sector.categories.some((c) => c.id === state.activeChecklist.categoryId)) {
    setChecklistStep("category");
    applyChecklistStepVisibility();
    return;
  }

  const category = getCategoryById(state.activeChecklist.sectorId, state.activeChecklist.categoryId);
  if (!category) return;

  dom.selectedCategoryTitle.textContent = `Sous-sous-categories pour ${category.name}`;
  dom.itemSubcategoryList.innerHTML = "";

  const categoryMeta = getMetaObject(getCategoryMetaKey(plan?.id || "", category.id));
  dom.categoryComment.value = categoryMeta.comment || "";

  // Afficher la navigation rapide vers les sous-catégories
  renderCategoriesQuickNav(dom.categoriesQuickNav, sector, category.id, plan?.id || "");

  category.itemSubcategories.forEach((group) => {
    const progress = getGroupProgress(plan?.id || "", category.id, group);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subpart-chip";
    btn.dataset.itemSubcategoryId = group.id;
    btn.classList.toggle("active", group.id === state.activeChecklist.itemSubcategoryId);
    btn.classList.toggle("status-ok", progress.complete && !progress.hasAnomaly);
    btn.classList.toggle("status-issue", progress.complete && progress.hasAnomaly);
    btn.textContent = group.name;
    dom.itemSubcategoryList.appendChild(btn);
  });

  if (checklistStep === "itemSubcategory") {
    const categoryAnomalies = collectSectorAnomalies(plan?.id || "", sector).filter((a) => a.categoryId === category.id);
    renderAnomalyList(dom.categoryAnomalies, categoryAnomalies, "Aucune anomalie sous-categorie.");
    return;
  }

  if (
    !state.activeChecklist.itemSubcategoryId ||
    !category.itemSubcategories.some((g) => g.id === state.activeChecklist.itemSubcategoryId)
  ) {
    setChecklistStep("itemSubcategory");
    applyChecklistStepVisibility();
    return;
  }

  const group = getItemSubcategoryById(
    state.activeChecklist.sectorId,
    state.activeChecklist.categoryId,
    state.activeChecklist.itemSubcategoryId,
  );
  dom.selectedItemSubcategoryTitle.textContent = group ? `Items - ${group.name}` : "Items";

  // Afficher les navigations rapides
  renderCategoriesQuickNav(dom.itemsCategoriesQuickNav, sector, category.id, plan?.id || "");
  renderItemSubcategoriesQuickNav(dom.itemsSubcategoriesQuickNav, category, state.activeChecklist.itemSubcategoryId, plan?.id || "");

  const categoryAnomalies = collectSectorAnomalies(plan?.id || "", sector).filter((a) => a.categoryId === category.id);
  renderAnomalyList(dom.categoryAnomalies, categoryAnomalies, "Aucune anomalie sous-categorie.");

  const items = ensureChecklistItems();
  dom.subChecklistBody.innerHTML = "";

  const tickets = Array.isArray(state.tickets) ? state.tickets : [];
  const sectorNameForTickets = sector?.name || "";
  const categoryNameForTickets = category?.name || "";
  const groupNameForTickets = group?.name || "";

  if (items.length === 0) {
    dom.subChecklistBody.innerHTML = '<p class="muted-text">Aucun item.</p>';
  } else {
    items.forEach((item) => {
      const article = document.createElement("article");
      const commentOpen = openCommentItemIds.has(item.id);
      const hasComment = item.comment.trim().length > 0;
      const openTicket = tickets.find(
        (t) => t.status === "ouvert" && t.itemLabel === item.label && t.sectorName === sectorNameForTickets,
      );
      article.className = "checklist-list-item";
      article.innerHTML = `
        <div class="checklist-list-main">
          <div class="checklist-list-head">
            <div class="validation-toggle" role="group" aria-label="Validation item">
              <button
                type="button"
                class="validation-btn validation-yes ${item.status === "valide" ? "is-active" : ""}"
                data-set-status-id="${item.id}"
                data-status-value="valide"
                title="Valide"
              >
                ✓
              </button>
              <button
                type="button"
                class="validation-btn validation-no ${item.status === "non-valide" ? "is-active" : ""}"
                data-set-status-id="${item.id}"
                data-status-value="non-valide"
                title="Non valide"
              >
                ✕
              </button>
            </div>
            <div class="checklist-list-content">
              <div class="checklist-item-label">
                ${escapeHtml(item.label)}
                ${openTicket ? `<span class="ticket-badge" title="Ticket ouvert depuis le ${new Date(openTicket.createdAt).toLocaleDateString("fr-FR")}">🎫 Ticket ouvert</span>` : ""}
              </div>
              ${hasComment && !commentOpen ? `<div class="comment-preview">${escapeHtml(item.comment)}</div>` : ""}
            </div>
          </div>
          <div class="checklist-item-tools">
            <button type="button" class="secondary-btn item-action-btn ${commentOpen || hasComment ? "is-active" : ""}" data-toggle-comment-id="${item.id}">
              Commentaire
            </button>
            <button type="button" class="secondary-btn item-action-btn ${item.consumable ? "is-active" : ""}" data-toggle-consumable-id="${item.id}">
              Consommable
            </button>
            ${item.status === "non-valide" && !openTicket ? `<button type="button" class="secondary-btn item-action-btn item-action-btn--ticket" data-create-ticket-id="${item.id}" title="Creer un ticket de suivi">Creer ticket</button>` : ""}
            ${openTicket ? `<span class="item-ticket-ref">Ticket #${openTicket.id.slice(0, 6)}</span>` : ""}
            <div class="item-photo-actions">
              <label class="photo-input-label" title="Ajouter photo">
                <input type="file" accept="image/*" capture="environment" data-photo-item-id="${item.id}" />
                📷
              </label>
              ${item.photoDataUrl ? `<img src="${item.photoDataUrl}" class="item-photo-preview" alt="Photo" />` : ""}
              ${item.photoDataUrl ? `<button type="button" class="secondary-btn icon-btn" data-remove-photo-id="${item.id}">✕</button>` : ""}
            </div>
          </div>
        </div>
        ${commentOpen ? `<div class="checklist-comment-panel"><textarea class="item-comment" rows="2" data-item-id="${item.id}" data-field="comment" placeholder="Commentaire">${escapeHtml(item.comment)}</textarea></div>` : ""}
      `;
      dom.subChecklistBody.appendChild(article);
    });
  }

  const validated = items.filter((i) => i.status === "valide").length;
  const nonValidated = items.filter((i) => i.status === "non-valide").length;
  dom.subChecklistCompletionText.textContent = `${validated} valide, ${nonValidated} non valide sur ${items.length}`;
}

export function bindChecklistEvents() {
  dom.todaySectorsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-sector-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.sectorId = button.getAttribute("data-sector-id") || "";
    state.activeChecklist.planningId = "";
    state.activeChecklist.categoryId = "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("category");
    renderChecklist();
  });

  dom.plannedCategoriesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
  });

  dom.itemSubcategoryList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-item-subcategory-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.itemSubcategoryId = button.getAttribute("data-item-subcategory-id") || "";
    setChecklistStep("items");
    renderChecklist();
  });

  dom.backToSectorsBtn.addEventListener("click", () => {
    persistChecklistProgress();
    state.activeChecklist.categoryId = "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("sector");
    renderChecklist();
  });

  dom.backToCategoriesBtn.addEventListener("click", () => {
    persistChecklistProgress();
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("category");
    renderChecklist();
  });

  dom.backToItemSubcategoriesBtn.addEventListener("click", () => {
    persistChecklistProgress();
    setChecklistStep("itemSubcategory");
    renderChecklist();
  });

  dom.validateSectorBtn.addEventListener("click", () => {
    const plan = getCurrentPlan();
    if (!plan) return;
    const index = state.planning.findIndex((p) => p.id === plan.id);
    if (index < 0) return;
    validatePlanning(index);
  });

  dom.sectorGeneralComment.addEventListener("input", () => {
    const plan = getCurrentPlan();
    if (!plan) return;
    const meta = getMetaObject(getSectorMetaKey(plan.id));
    meta.comment = dom.sectorGeneralComment.value;
    saveState();
  });

  dom.categoryComment.addEventListener("input", () => {
    const plan = getCurrentPlan();
    if (!plan || !state.activeChecklist.categoryId) return;
    const meta = getMetaObject(getCategoryMetaKey(plan.id, state.activeChecklist.categoryId));
    meta.comment = dom.categoryComment.value;
    saveState();
  });

  dom.subChecklistBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const itemId = target.dataset.itemId;
    const field = target.dataset.field;
    if (!itemId || !field) return;
    const items = ensureChecklistItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    item[field] = target.value;
    item.updatedAt = new Date().toISOString();
    // Keep typing fluid in comment fields; avoid full rerender while user is writing.
    if (field !== "comment") {
      renderChecklist();
    }
    saveState();
  });

  dom.subChecklistBody.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const photoItemId = target.dataset.photoItemId;
    if (!photoItemId || !target.files || target.files.length === 0) return;
    const items = ensureChecklistItems();
    const item = items.find((i) => i.id === photoItemId);
    if (!item) return;

    const reader = new FileReader();
    reader.onload = () => {
      item.photoDataUrl = reader.result;
      item.updatedAt = new Date().toISOString();
      renderChecklist();
      saveState();
    };
    reader.readAsDataURL(target.files[0]);
  });

  dom.subChecklistBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const statusBtn = target.closest("button[data-set-status-id]");
    if (statusBtn instanceof HTMLButtonElement) {
      const itemId = statusBtn.getAttribute("data-set-status-id");
      const status = statusBtn.getAttribute("data-status-value") || "";
      if (!itemId) return;
      const items = ensureChecklistItems();
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      item.status = item.status === status ? "" : status;
      item.updatedAt = new Date().toISOString();
      renderChecklist();
      saveState();
      return;
    }

    const removePhotoId = target.getAttribute("data-remove-photo-id");
    if (removePhotoId) {
      const items = ensureChecklistItems();
      const item = items.find((i) => i.id === removePhotoId);
      if (!item) return;
      item.photoDataUrl = "";
      item.updatedAt = new Date().toISOString();
      renderChecklist();
      saveState();
      return;
    }

    const toggleCommentId = target.getAttribute("data-toggle-comment-id");
    if (toggleCommentId) {
      if (openCommentItemIds.has(toggleCommentId)) {
        openCommentItemIds.delete(toggleCommentId);
      } else {
        openCommentItemIds.add(toggleCommentId);
      }
      renderChecklist();
      return;
    }

    const toggleConsumableId = target.getAttribute("data-toggle-consumable-id");
    if (toggleConsumableId) {
      const items = ensureChecklistItems();
      const item = items.find((entry) => entry.id === toggleConsumableId);
      if (!item) return;
      item.consumable = !item.consumable;
      item.updatedAt = new Date().toISOString();
      renderChecklist();
      saveState();
      return;
    }

    const createTicketId = target.getAttribute("data-create-ticket-id");
    if (createTicketId) {
      const items = ensureChecklistItems();
      const item = items.find((entry) => entry.id === createTicketId);
      if (!item) return;
      const currentSector = state.activeChecklist.sectorId ? getSectorById(state.activeChecklist.sectorId) : null;
      const currentCategory = state.activeChecklist.categoryId
        ? getCategoryById(state.activeChecklist.sectorId, state.activeChecklist.categoryId)
        : null;
      const currentGroup = state.activeChecklist.itemSubcategoryId
        ? getItemSubcategoryById(
            state.activeChecklist.sectorId,
            state.activeChecklist.categoryId,
            state.activeChecklist.itemSubcategoryId,
          )
        : null;
      if (!Array.isArray(state.tickets)) state.tickets = [];
      state.tickets.push(
        createTicket(
          item.label,
          currentSector?.name || "",
          currentCategory?.name || "",
          currentGroup?.name || "",
          item.comment,
        ),
      );
      renderChecklist();
      saveState();
      return;
    }
  });

  dom.sectorConsumablesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeConsumableId = target.getAttribute("data-remove-consumable-id");
    if (!removeConsumableId) return;

    const plan = getCurrentPlan();
    const sector = state.activeChecklist.sectorId ? getSectorById(state.activeChecklist.sectorId) : null;
    if (!plan || !sector) return;

    const updated = updatePlanItem(plan.id, sector, removeConsumableId, (item) => {
      item.consumable = false;
    });
    if (!updated) return;

    renderChecklist();
    saveState();
  });

  // Navigation rapide vers les sous-catégories (affichée à l'étape itemSubcategory)
  dom.categoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
  });

  // Navigation rapide vers les sous-catégories (affichée à l'étape items)
  dom.itemsCategoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
  });

  // Navigation rapide vers les sous-sous-catégories (affichée à l'étape items)
  dom.itemsSubcategoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-item-subcategory-id]");
    if (!button) return;
    persistChecklistProgress();
    state.activeChecklist.itemSubcategoryId = button.getAttribute("data-item-subcategory-id") || "";
    setChecklistStep("items");
    renderChecklist();
  });
}

export function getChecklistCompletionSummary() {
  const plans = state.planning.filter((p) => p.sectorId);
  const validated = plans.filter((p) => p.validatedAt).length;
  return { total: plans.length, validated };
}
