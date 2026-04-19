import {
  state,
  createChecklistItem,
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
    photoDataUrl: item.photoDataUrl || "",
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
  return state.checklistData[key];
}

function collectSectorAnomalies(planId, sector) {
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

function getGroupProgress(planId, categoryId, group) {
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
    dom.subChecklistBody.innerHTML = '<tr><td colspan="4">Aucune checklist active.</td></tr>';
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
    dom.subChecklistBody.innerHTML = '<tr><td colspan="4">Aucune checklist active.</td></tr>';
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

  if (items.length === 0) {
    dom.subChecklistBody.innerHTML = '<tr><td colspan="4">Aucun item.</td></tr>';
  } else {
    items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
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
        </td>
        <td>${escapeHtml(item.label)}</td>
        <td><textarea class="item-comment" rows="1" data-item-id="${item.id}" data-field="comment">${escapeHtml(item.comment)}</textarea></td>
        <td>
          <div class="item-photo-actions">
            <label class="photo-input-label" title="Ajouter photo">
              <input type="file" accept="image/*" capture="environment" data-photo-item-id="${item.id}" />
              📷
            </label>
            ${item.photoDataUrl ? `<img src="${item.photoDataUrl}" class="item-photo-preview" alt="Photo" />` : ""}
            ${item.photoDataUrl ? `<button type="button" class="secondary-btn" data-remove-photo-id="${item.id}">✕</button>` : ""}
          </div>
        </td>
      `;
      dom.subChecklistBody.appendChild(tr);
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
    state.activeChecklist.sectorId = button.getAttribute("data-sector-id") || "";
    state.activeChecklist.planningId = "";
    state.activeChecklist.categoryId = "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("category");
    renderChecklist();
    saveState();
  });

  dom.plannedCategoriesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
    saveState();
  });

  dom.itemSubcategoryList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-item-subcategory-id]");
    if (!button) return;
    state.activeChecklist.itemSubcategoryId = button.getAttribute("data-item-subcategory-id") || "";
    setChecklistStep("items");
    renderChecklist();
    saveState();
  });

  dom.backToSectorsBtn.addEventListener("click", () => {
    state.activeChecklist.categoryId = "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("sector");
    renderChecklist();
    saveState();
  });

  dom.backToCategoriesBtn.addEventListener("click", () => {
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("category");
    renderChecklist();
    saveState();
  });

  dom.backToItemSubcategoriesBtn.addEventListener("click", () => {
    setChecklistStep("itemSubcategory");
    renderChecklist();
    saveState();
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
    }
  });

  // Navigation rapide vers les sous-catégories (affichée à l'étape itemSubcategory)
  dom.categoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
    saveState();
  });

  // Navigation rapide vers les sous-catégories (affichée à l'étape items)
  dom.itemsCategoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-category-id]");
    if (!button) return;
    state.activeChecklist.categoryId = button.getAttribute("data-category-id") || "";
    state.activeChecklist.itemSubcategoryId = "";
    setChecklistStep("itemSubcategory");
    renderChecklist();
    saveState();
  });

  // Navigation rapide vers les sous-sous-catégories (affichée à l'étape items)
  dom.itemsSubcategoriesQuickNav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-item-subcategory-id]");
    if (!button) return;
    state.activeChecklist.itemSubcategoryId = button.getAttribute("data-item-subcategory-id") || "";
    setChecklistStep("items");
    renderChecklist();
    saveState();
  });
}

export function getChecklistCompletionSummary() {
  const plans = state.planning.filter((p) => p.sectorId);
  const validated = plans.filter((p) => p.validatedAt).length;
  return { total: plans.length, validated };
}
