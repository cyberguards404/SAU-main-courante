export const STORAGE_KEY = "main-courante-data";

export function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

export function createTemplateItem(label = "") {
  return { id: createId(), label };
}

export function createItemSubcategory(name = "Nouveau groupe") {
  return {
    id: createId(),
    name,
    items: [
      createTemplateItem(`Controle visuel - ${name}`),
      createTemplateItem(`Controle fonctionnel - ${name}`),
    ],
  };
}

export function createCategory(name = "Nouvelle sous-categorie") {
  return {
    id: createId(),
    name,
    itemSubcategories: [createItemSubcategory("General")],
  };
}

export function createSector(name = "Nouveau secteur") {
  return {
    id: createId(),
    name,
    planningDefaults: {
      time: "",
      recurrenceType: "Aucune",
      recurrenceEvery: 1,
      recurrenceInfinite: false,
    },
    categories: [createCategory("Sous-categorie 1")],
  };
}

export function createDefaultTemplates() {
  return {
    sectors: [
      {
        ...createSector("Boxes"),
        categories: [
          createCategory("Box 1"),
          createCategory("Box 2"),
          createCategory("Box 3"),
          createCategory("Box 4"),
        ],
      },
      {
        ...createSector("Secteurs"),
        categories: [
          createCategory("Secteur A"),
          createCategory("Secteur B"),
          createCategory("Secteur C"),
          createCategory("Secteur D"),
        ],
      },
    ],
  };
}

export function createPlanningItem(sectorId = "", defaults = {}) {
  return {
    id: createId(),
    time: defaults.time || "",
    sectorId,
    recurrenceType: defaults.recurrenceType || "Aucune",
    recurrenceEvery: Math.max(1, Number(defaults.recurrenceEvery) || 1),
    recurrenceInfinite: Boolean(defaults.recurrenceInfinite),
    iteration: 1,
    status: "A faire",
    validatedAt: "",
    validationSignature: null,
  };
}

export function createTicket(itemLabel, sectorName, categoryName, groupName, comment = "") {
  return {
    id: createId(),
    itemLabel,
    sectorName,
    categoryName,
    groupName,
    comment,
    notes: [],
    createdAt: new Date().toISOString(),
    status: "ouvert",
    closedAt: "",
  };
}

export function createChecklistItem(label = "") {
  return {
    id: createId(),
    label,
    status: "",
    comment: "",
    consumable: false,
    done: false,
    photoDataUrl: "",
    updatedAt: new Date().toISOString(),
  };
}

export const state = {
  layout: "desktop",
  activeView: "checklist",
  day: {
    date: new Date().toISOString().slice(0, 10),
    owner: "",
    notes: "",
    items: [],
  },
  templates: createDefaultTemplates(),
  activeTemplate: {
    sectorId: "",
    categoryId: "",
    itemSubcategoryId: "",
  },
  planning: [],
  checklistData: {},
  activeChecklist: {
    sectorId: "",
    categoryId: "",
    itemSubcategoryId: "",
    planningId: "",
  },
  signature: {
    signerName: "",
    signerRole: "",
    imageData: "",
    signedAt: "",
  },
  photos: [],
  tickets: [],
};

let saveHook = null;

export function setSaveHook(hook) {
  saveHook = hook;
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  
  // Appeler le hook de synchronisation (ex: envoyer au serveur)
  if (saveHook && typeof saveHook === "function") {
    try {
      saveHook(state);
    } catch (error) {
      // Ne pas bloquer si le hook échoue
      console.error("Erreur hook save:", error);
    }
  }
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(state, parsed);
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!state.templates || !Array.isArray(state.templates.sectors) || state.templates.sectors.length === 0) {
    state.templates = createDefaultTemplates();
  }

  state.templates.sectors = state.templates.sectors.map((sector) => {
    const safeSector = {
      id: sector?.id || createId(),
      name: sector?.name || "Nouveau secteur",
      planningDefaults: {
        time: sector?.planningDefaults?.time || "",
        recurrenceType: sector?.planningDefaults?.recurrenceType || "Aucune",
        recurrenceEvery: Math.max(1, Number(sector?.planningDefaults?.recurrenceEvery) || 1),
        recurrenceInfinite: Boolean(sector?.planningDefaults?.recurrenceInfinite),
      },
      categories: Array.isArray(sector?.categories) ? sector.categories : [],
    };

    safeSector.categories = safeSector.categories.map((category) => {
      const safeCategory = {
        id: category?.id || createId(),
        name: category?.name || "Nouvelle sous-categorie",
        itemSubcategories: Array.isArray(category?.itemSubcategories) ? category.itemSubcategories : [],
      };

      safeCategory.itemSubcategories = safeCategory.itemSubcategories.map((group) => ({
        id: group?.id || createId(),
        name: group?.name || "General",
        items: Array.isArray(group?.items)
          ? group.items.map((item) => ({
              id: item?.id || createId(),
              label: item?.label || "Item",
            }))
          : [],
      }));

      if (safeCategory.itemSubcategories.length === 0) {
        safeCategory.itemSubcategories = [createItemSubcategory("General")];
      }

      return safeCategory;
    });

    if (safeSector.categories.length === 0) {
      safeSector.categories = [createCategory("Sous-categorie 1")];
    }

    return safeSector;
  });

  if (!state.activeTemplate || typeof state.activeTemplate !== "object") {
    state.activeTemplate = { sectorId: "", categoryId: "", itemSubcategoryId: "" };
  }

  if (!state.activeChecklist || typeof state.activeChecklist !== "object") {
    state.activeChecklist = { sectorId: "", categoryId: "", itemSubcategoryId: "", planningId: "" };
  }

  if (!state.day || typeof state.day !== "object") {
    state.day = { date: new Date().toISOString().slice(0, 10), owner: "", notes: "", items: [] };
  }
  if (!Array.isArray(state.day.items)) state.day.items = [];
  state.day.items = state.day.items.map((item) => ({
    id: item?.id || createId(),
    label: item?.label || "",
    done: Boolean(item?.done),
    createdAt: item?.createdAt || new Date().toISOString(),
  })).filter((item) => item.label.trim().length > 0);

  if (!Array.isArray(state.planning)) state.planning = [];
  if (!state.checklistData || typeof state.checklistData !== "object") state.checklistData = {};
  if (!Array.isArray(state.photos)) state.photos = [];
}

export function getSectorById(sectorId) {
  return state.templates.sectors.find((s) => s.id === sectorId) || null;
}

export function getCategoryById(sectorId, categoryId) {
  const sector = getSectorById(sectorId);
  if (!sector) return null;
  return sector.categories.find((c) => c.id === categoryId) || null;
}

export function getItemSubcategoryById(sectorId, categoryId, itemSubcategoryId) {
  const category = getCategoryById(sectorId, categoryId);
  if (!category) return null;
  return category.itemSubcategories.find((g) => g.id === itemSubcategoryId) || null;
}

export function ensureActiveTemplate() {
  const firstSector = state.templates.sectors[0];
  if (!firstSector) return;

  const sector = getSectorById(state.activeTemplate.sectorId) || firstSector;
  const categories = Array.isArray(sector.categories) ? sector.categories : [];
  const category = categories.find((c) => c.id === state.activeTemplate.categoryId) || categories[0];
  if (!category) return;
  const groups = Array.isArray(category.itemSubcategories) ? category.itemSubcategories : [];
  const group = groups.find((g) => g.id === state.activeTemplate.itemSubcategoryId) || groups[0];
  if (!group) return;

  state.activeTemplate.sectorId = sector.id;
  state.activeTemplate.categoryId = category.id;
  state.activeTemplate.itemSubcategoryId = group.id;
}

export function ensureActiveChecklist() {
  const planned = state.planning.filter((p) => p.sectorId);
  if (planned.length === 0) {
    state.activeChecklist.sectorId = "";
    state.activeChecklist.planningId = "";
    state.activeChecklist.categoryId = "";
    state.activeChecklist.itemSubcategoryId = "";
    return;
  }

  if (!planned.some((p) => p.id === state.activeChecklist.planningId)) {
    state.activeChecklist.planningId = planned[0].id;
  }

  const activePlan = planned.find((p) => p.id === state.activeChecklist.planningId);
  state.activeChecklist.sectorId = activePlan ? activePlan.sectorId : planned[0].sectorId;

  const sector = getSectorById(state.activeChecklist.sectorId);
  if (!sector) return;

  if (!sector.categories.some((c) => c.id === state.activeChecklist.categoryId)) {
    state.activeChecklist.categoryId = sector.categories[0]?.id || "";
  }

  const category = getCategoryById(state.activeChecklist.sectorId, state.activeChecklist.categoryId);
  if (!category) return;

  if (!category.itemSubcategories.some((g) => g.id === state.activeChecklist.itemSubcategoryId)) {
    state.activeChecklist.itemSubcategoryId = category.itemSubcategories[0]?.id || "";
  }
}
