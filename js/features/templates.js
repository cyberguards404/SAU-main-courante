import {
  state,
  createSector,
  createCategory,
  createItemSubcategory,
  createTemplateItem,
  ensureActiveTemplate,
  ensureActiveChecklist,
  getSectorById,
  getCategoryById,
  getItemSubcategoryById,
  saveState,
} from "../core/state.js";
import { dom, escapeHtml } from "../core/dom.js";

let rerenderAll = () => {};

export function setTemplatesRenderHook(fn) {
  rerenderAll = fn;
}

function getActiveSector() {
  return getSectorById(state.activeTemplate.sectorId);
}

function getActiveCategory() {
  return getCategoryById(state.activeTemplate.sectorId, state.activeTemplate.categoryId);
}

function getActiveItemSubcategory() {
  return getItemSubcategoryById(
    state.activeTemplate.sectorId,
    state.activeTemplate.categoryId,
    state.activeTemplate.itemSubcategoryId,
  );
}

function duplicateTemplateItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => createTemplateItem(item?.label || "Item"));
}

function duplicateItemSubcategory(group, suffix = "(copie)") {
  const duplicated = createItemSubcategory(`${group?.name || "Sous-categorie"} ${suffix}`.trim());
  duplicated.items = duplicateTemplateItems(group?.items);
  return duplicated;
}

function duplicateCategory(category, suffix = "(copie)") {
  const duplicated = createCategory(`${category?.name || "Sous-categorie"} ${suffix}`.trim());
  duplicated.itemSubcategories = (Array.isArray(category?.itemSubcategories) ? category.itemSubcategories : []).map((group) =>
    duplicateItemSubcategory(group, ""),
  );

  if (duplicated.itemSubcategories.length === 0) {
    duplicated.itemSubcategories = [createItemSubcategory("General")];
  }

  return duplicated;
}

export function renderTemplates() {
  ensureActiveTemplate();
  const sectors = state.templates.sectors;
  const activeSector = getActiveSector();
  const activeCategory = getActiveCategory();
  const activeGroup = getActiveItemSubcategory();

  dom.templateSectorSelect.innerHTML = sectors
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
    .join("");
  dom.templateSectorSelect.value = activeSector?.id || "";
  dom.templateSectorName.value = activeSector?.name || "";

  const categories = activeSector?.categories || [];
  dom.templateCategorySelect.innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
  dom.templateCategorySelect.value = activeCategory?.id || "";
  dom.templateCategoryName.value = activeCategory?.name || "";

  const groups = activeCategory?.itemSubcategories || [];
  dom.templateItemSubcategorySelect.innerHTML = groups
    .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`)
    .join("");
  dom.templateItemSubcategorySelect.value = activeGroup?.id || "";
  dom.templateItemSubcategoryName.value = activeGroup?.name || "";

  dom.templateDefaultTime.value = activeSector?.planningDefaults.time || "";
  dom.templateDefaultRecurrenceType.value = activeSector?.planningDefaults.recurrenceType || "Aucune";
  dom.templateDefaultRecurrenceEvery.value = String(activeSector?.planningDefaults.recurrenceEvery || 1);
  dom.templateDefaultRecurrenceInfinite.checked = Boolean(activeSector?.planningDefaults.recurrenceInfinite);

  dom.templateItemsBody.innerHTML = "";
  if (!activeGroup) {
    dom.templateItemsBody.innerHTML = '<tr><td colspan="2">Aucun item template.</td></tr>';
    return;
  }

  activeGroup.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="template-row-input" type="text" data-template-item-id="${item.id}" value="${escapeHtml(item.label)}" /></td>
      <td><button type="button" class="secondary-btn" data-remove-template-item-id="${item.id}">Supprimer</button></td>
    `;
    dom.templateItemsBody.appendChild(tr);
  });
}

function removePlanningForSector(sectorId) {
  state.planning = state.planning.filter((p) => p.sectorId !== sectorId);
}

function removeChecklistDataForSector(sectorId) {
  Object.keys(state.checklistData).forEach((key) => {
    const plan = state.planning.find((p) => p.id === key.split("::")[0]);
    if (!plan || plan.sectorId === sectorId) {
      delete state.checklistData[key];
    }
  });
}

export function bindTemplatesEvents() {
  dom.templateSectorSelect.addEventListener("change", () => {
    state.activeTemplate.sectorId = dom.templateSectorSelect.value;
    state.activeTemplate.categoryId = "";
    state.activeTemplate.itemSubcategoryId = "";
    ensureActiveTemplate();
    renderTemplates();
    saveState();
  });

  dom.templateSectorName.addEventListener("input", () => {
    const sector = getActiveSector();
    if (!sector) return;
    sector.name = dom.templateSectorName.value;
    rerenderAll();
    saveState();
  });

  dom.createTemplateSectorBtn.addEventListener("click", () => {
    const name = dom.newTemplateSector.value.trim();
    if (!name) return;
    const sector = createSector(name);
    state.templates.sectors.push(sector);
    state.activeTemplate.sectorId = sector.id;
    state.activeTemplate.categoryId = sector.categories[0].id;
    state.activeTemplate.itemSubcategoryId = sector.categories[0].itemSubcategories[0].id;
    dom.newTemplateSector.value = "";
    rerenderAll();
    saveState();
  });

  dom.templateCategorySelect.addEventListener("change", () => {
    state.activeTemplate.categoryId = dom.templateCategorySelect.value;
    state.activeTemplate.itemSubcategoryId = "";
    ensureActiveTemplate();
    renderTemplates();
    saveState();
  });

  dom.templateCategoryName.addEventListener("input", () => {
    const category = getActiveCategory();
    if (!category) return;
    category.name = dom.templateCategoryName.value;
    rerenderAll();
    saveState();
  });

  dom.createTemplateCategoryBtn.addEventListener("click", () => {
    const name = dom.newTemplateCategory.value.trim();
    const sector = getActiveSector();
    if (!name || !sector) return;
    const category = createCategory(name);
    sector.categories.push(category);
    state.activeTemplate.categoryId = category.id;
    state.activeTemplate.itemSubcategoryId = category.itemSubcategories[0].id;
    dom.newTemplateCategory.value = "";
    rerenderAll();
    saveState();
  });

  dom.templateItemSubcategorySelect.addEventListener("change", () => {
    state.activeTemplate.itemSubcategoryId = dom.templateItemSubcategorySelect.value;
    renderTemplates();
    saveState();
  });

  dom.templateItemSubcategoryName.addEventListener("input", () => {
    const group = getActiveItemSubcategory();
    if (!group) return;
    group.name = dom.templateItemSubcategoryName.value;
    rerenderAll();
    saveState();
  });

  dom.createTemplateItemSubcategoryBtn.addEventListener("click", () => {
    const name = dom.newTemplateItemSubcategory.value.trim();
    const category = getActiveCategory();
    if (!name || !category) return;
    const group = createItemSubcategory(name);
    category.itemSubcategories.push(group);
    state.activeTemplate.itemSubcategoryId = group.id;
    dom.newTemplateItemSubcategory.value = "";
    rerenderAll();
    saveState();
  });

  [dom.templateDefaultTime, dom.templateDefaultRecurrenceType, dom.templateDefaultRecurrenceEvery, dom.templateDefaultRecurrenceInfinite].forEach((el) => {
    el.addEventListener("input", () => {
      const sector = getActiveSector();
      if (!sector) return;
      sector.planningDefaults.time = dom.templateDefaultTime.value;
      sector.planningDefaults.recurrenceType = dom.templateDefaultRecurrenceType.value;
      sector.planningDefaults.recurrenceEvery = Math.max(1, Number(dom.templateDefaultRecurrenceEvery.value) || 1);
      sector.planningDefaults.recurrenceInfinite = dom.templateDefaultRecurrenceInfinite.checked;
      saveState();
    });
  });

  dom.duplicateTemplateCategoryBtn.addEventListener("click", () => {
    const sector = getActiveSector();
    const category = getActiveCategory();
    if (!sector || !category) return;

    const duplicated = duplicateCategory(category);
    sector.categories.push(duplicated);
    state.activeTemplate.categoryId = duplicated.id;
    state.activeTemplate.itemSubcategoryId = duplicated.itemSubcategories[0]?.id || "";
    rerenderAll();
    saveState();
  });

  dom.duplicateTemplateItemSubcategoryBtn.addEventListener("click", () => {
    const category = getActiveCategory();
    const group = getActiveItemSubcategory();
    if (!category || !group) return;

    const duplicated = duplicateItemSubcategory(group);
    category.itemSubcategories.push(duplicated);
    state.activeTemplate.itemSubcategoryId = duplicated.id;
    rerenderAll();
    saveState();
  });

  dom.deleteTemplateItemSubcategoryBtn.addEventListener("click", () => {
    const category = getActiveCategory();
    if (!category) return;
    category.itemSubcategories = category.itemSubcategories.filter((g) => g.id !== state.activeTemplate.itemSubcategoryId);
    if (category.itemSubcategories.length === 0) {
      category.itemSubcategories.push(createItemSubcategory("General"));
    }
    state.activeTemplate.itemSubcategoryId = category.itemSubcategories[0].id;
    rerenderAll();
    saveState();
  });

  dom.deleteTemplateCategoryBtn.addEventListener("click", () => {
    const sector = getActiveSector();
    if (!sector) return;
    sector.categories = sector.categories.filter((c) => c.id !== state.activeTemplate.categoryId);
    if (sector.categories.length === 0) {
      sector.categories.push(createCategory("Sous-categorie 1"));
    }
    state.activeTemplate.categoryId = sector.categories[0].id;
    state.activeTemplate.itemSubcategoryId = sector.categories[0].itemSubcategories[0].id;
    rerenderAll();
    saveState();
  });

  dom.deleteTemplateSectorBtn.addEventListener("click", () => {
    const removedSectorId = state.activeTemplate.sectorId;
    state.templates.sectors = state.templates.sectors.filter((s) => s.id !== removedSectorId);
    if (state.templates.sectors.length === 0) {
      state.templates.sectors.push(createSector("Secteur 1"));
    }
    removePlanningForSector(removedSectorId);
    removeChecklistDataForSector(removedSectorId);
    ensureActiveTemplate();
    ensureActiveChecklist();
    rerenderAll();
    saveState();
  });

  dom.addTemplateItemBtn.addEventListener("click", () => {
    const label = dom.newTemplateItem.value.trim();
    const group = getActiveItemSubcategory();
    if (!label || !group) return;
    group.items.push(createTemplateItem(label));
    dom.newTemplateItem.value = "";
    renderTemplates();
    saveState();
  });

  dom.templateItemsBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const group = getActiveItemSubcategory();
    if (!group) return;
    const itemId = target.dataset.templateItemId;
    const item = group.items.find((i) => i.id === itemId);
    if (!item) return;
    item.label = target.value;
    saveState();
  });

  dom.templateItemsBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const itemId = target.getAttribute("data-remove-template-item-id");
    if (!itemId) return;
    const group = getActiveItemSubcategory();
    if (!group) return;
    group.items = group.items.filter((i) => i.id !== itemId);
    renderTemplates();
    saveState();
  });
}
