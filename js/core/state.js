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
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: createId(),
    time: defaults.time || "",
    plannedDate: defaults.plannedDate || today,
    sectorId,
    recurrenceType: normalizeRecurrenceType(defaults.recurrenceType),
    recurrenceEvery: Math.max(1, Number(defaults.recurrenceEvery) || 1),
    recurrenceInfinite: Boolean(defaults.recurrenceInfinite),
    iteration: 1,
    status: "A faire",
    validatedAt: "",
    validationSignature: null,
    validatedDates: [],
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

export function normalizeRecurrenceType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized || normalized === "aucune") return "Aucune";
  if (["quotidienne", "quotidien", "journaliere", "daily"].includes(normalized)) return "Quotidienne";
  if (["hebdomadaire", "hebdomadaires", "weekly"].includes(normalized)) return "Hebdomadaire";
  if (["mensuelle", "mensuel", "monthly"].includes(normalized)) return "Mensuelle";
  return "Aucune";
}

function normalizeCommandPlannedAt(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (localMatch) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dedupeAndOrderCommands(commands) {
  if (!Array.isArray(commands)) return [];

  const deduped = [];
  const seenKeys = new Set();
  const sorted = [...commands].sort((a, b) => {
    const aTime = a.plannedAt ? new Date(a.plannedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.plannedAt ? new Date(b.plannedAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  sorted.forEach((command) => {
    const seriesKey = command.seriesId || command.id;
    const plannedAtKey = command.plannedAt || "";
    const dedupeKey = `${seriesKey}::${plannedAtKey}`;
    if (plannedAtKey && seenKeys.has(dedupeKey)) {
      return;
    }
    if (plannedAtKey) {
      seenKeys.add(dedupeKey);
    }
    deduped.push(command);
  });

  const iterationBySeries = new Map();
  return deduped.map((command) => {
    const seriesKey = command.seriesId || command.id;
    const nextIteration = (iterationBySeries.get(seriesKey) || 0) + 1;
    iterationBySeries.set(seriesKey, nextIteration);
    return {
      ...command,
      iteration: nextIteration,
    };
  });
}

export function createCommandItem(initial = {}) {
  const recurrenceEvery = Math.max(1, Number(initial.recurrenceEvery) || 1);
  const recurrenceWeekdays = Array.isArray(initial.recurrenceWeekdays)
    ? [...new Set(initial.recurrenceWeekdays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
    : [];
  const seriesId = initial.seriesId || createId();
  const rawStatus = String(initial.status || "").trim();
  const status = rawStatus === "Terminee"
    ? "Terminee"
    : "A realiser";
  return {
    id: initial.id || createId(),
    seriesId,
    iteration: Math.max(1, Number(initial.iteration) || 1),
    title: initial.title || "",
    category: initial.category || "",
    assignee: initial.assignee || "",
    plannedAt: normalizeCommandPlannedAt(initial.plannedAt || ""),
    priority: initial.priority || "Normale",
    status,
    recurrenceType: normalizeRecurrenceType(initial.recurrenceType),
    recurrenceEvery,
    recurrenceWeekdays,
    recurrenceInfinite: Boolean(initial.recurrenceInfinite),
    notes: initial.notes || "",
    validatedAt: initial.validatedAt || "",
    validationSignature: initial.validationSignature && typeof initial.validationSignature === "object"
      ? {
          signerName: initial.validationSignature.signerName || "",
          signerRole: initial.validationSignature.signerRole || "",
          imageData: initial.validationSignature.imageData || "",
          signedAt: initial.validationSignature.signedAt || initial.validatedAt || "",
        }
      : null,
    createdAt: initial.createdAt || new Date().toISOString(),
    updatedAt: initial.updatedAt || new Date().toISOString(),
  };
}

export function createCrisisAction(initial = {}) {
  const rawEntryType = String(initial.entryType || initial.status || "").trim();
  const allowedEntryTypes = ["Information", "Decision", "Action", "Alerte"];
  let entryType = allowedEntryTypes.includes(rawEntryType) ? rawEntryType : "Information";
  if (rawEntryType === "Planifiee" || rawEntryType === "Realisee") {
    entryType = "Action";
  }
  return {
    id: initial.id || createId(),
    functionKey: initial.functionKey || "main-courante",
    title: initial.title || "",
    owner: initial.owner || "",
    dueAt: initial.dueAt || "",
    notes: initial.notes || "",
    entryType,
    createdAt: initial.createdAt || new Date().toISOString(),
    updatedAt: initial.updatedAt || new Date().toISOString(),
  };
}

export function createCrisisContext(initial = {}) {
  const now = new Date();
  const nextBrief = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    mode: initial.mode || "",
    subcategory: initial.subcategory || "",
    level: initial.level || "",
    coordinator: initial.coordinator || "",
    trigger: initial.trigger || "",
    objective: initial.objective || "",
    summary: initial.summary || "",
    openedAt: initial.openedAt || now.toISOString(),
    nextBriefAt: initial.nextBriefAt || nextBrief.toISOString(),
  };
}

export function createDefaultCrisisSubcategories() {
  return {
    HET: [
      "Tension moderee",
      "Tension severe",
      "Saturation accueil",
    ],
    "Plan blanc": [
      "Afflux massif de victimes",
      "Evenement NRBC",
      "Panne majeure / indisponibilite technique",
    ],
  };
}

export function createDefaultCrisisActionCatalog() {
  const subcategories = createDefaultCrisisSubcategories();
  const domains = ["anticipation", "logistique", "flux-patients", "communication"];
  return Object.fromEntries(Object.entries(subcategories).map(([mode, items]) => [
    mode,
    Object.fromEntries(items.map((subcategory) => [
      subcategory,
      Object.fromEntries(domains.map((domain) => [domain, []])),
    ])),
  ]));
}

export function normalizeCrisisSubcategories(catalog) {
  const defaults = createDefaultCrisisSubcategories();
  const source = catalog && typeof catalog === "object" ? catalog : {};
  return Object.fromEntries(Object.keys(defaults).map((mode) => {
    const items = Array.isArray(source[mode]) ? source[mode] : defaults[mode];
    const normalizedItems = [...new Set(items
      .map((item) => String(item || "").trim())
      .filter(Boolean))];
    return [mode, normalizedItems];
  }));
}

export function normalizeCrisisActionCatalog(catalog, subcategoriesCatalog = createDefaultCrisisSubcategories()) {
  const domains = ["anticipation", "logistique", "flux-patients", "communication"];
  const source = catalog && typeof catalog === "object" ? catalog : {};
  return Object.fromEntries(Object.entries(subcategoriesCatalog).map(([mode, subcategories]) => [
    mode,
    Object.fromEntries(subcategories.map((subcategory) => {
      const bucket = source?.[mode]?.[subcategory] && typeof source[mode][subcategory] === "object"
        ? source[mode][subcategory]
        : {};
      return [
        subcategory,
        Object.fromEntries(domains.map((domain) => {
          const items = Array.isArray(bucket[domain]) ? bucket[domain] : [];
          return [
            domain,
            [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))],
          ];
        })),
      ];
    })),
  ]));
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
  commands: [],
  crisis: {
    context: createCrisisContext(),
    actions: [],
    subcategories: createDefaultCrisisSubcategories(),
    actionCatalog: createDefaultCrisisActionCatalog(),
  },
};

function isValidDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateKey(value) {
  if (!isValidDateKey(value)) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toDateKey(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addPlanningRecurrenceDate(dateKey, recurrenceType, recurrenceEvery) {
  const base = parseDateKey(dateKey);
  if (!base) return "";
  const next = new Date(base);
  const normalizedRecurrenceType = normalizeRecurrenceType(recurrenceType);
  const step = Math.max(1, Number(recurrenceEvery) || 1);
  if (normalizedRecurrenceType === "Quotidienne") {
    next.setDate(next.getDate() + step);
  } else if (normalizedRecurrenceType === "Hebdomadaire") {
    next.setDate(next.getDate() + (step * 7));
  } else if (normalizedRecurrenceType === "Mensuelle") {
    next.setMonth(next.getMonth() + step);
  } else {
    return "";
  }
  return toDateKey(next);
}

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
        recurrenceType: normalizeRecurrenceType(sector?.planningDefaults?.recurrenceType),
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
  const fallbackPlanningDate = isValidDateKey(state.day?.date) ? state.day.date : new Date().toISOString().slice(0, 10);
  state.planning = state.planning.map((item) => ({
    id: item?.id || createId(),
    time: item?.time || "",
    plannedDate: isValidDateKey(item?.plannedDate) ? item.plannedDate : fallbackPlanningDate,
    sectorId: item?.sectorId || "",
    recurrenceType: normalizeRecurrenceType(item?.recurrenceType),
    recurrenceEvery: Math.max(1, Number(item?.recurrenceEvery) || 1),
    recurrenceInfinite: Boolean(item?.recurrenceInfinite),
    iteration: Math.max(1, Number(item?.iteration) || 1),
    status: item?.status || "A faire",
    validatedAt: item?.validatedAt || "",
    validationSignature: item?.validationSignature && typeof item.validationSignature === "object"
      ? {
          signerName: item.validationSignature.signerName || "",
          signerRole: item.validationSignature.signerRole || "",
          imageData: item.validationSignature.imageData || "",
          signedAt: item.validationSignature.signedAt || item.validatedAt || "",
        }
      : null,
    validatedDates: Array.isArray(item?.validatedDates) ? item.validatedDates : [],
  }));

  const today = new Date().toISOString().slice(0, 10);
  const isDayChanged = state.day.date !== today;
  if (isDayChanged) {
    const closedAt = new Date().toISOString();
    const planningSnapshot = [...state.planning];
    const nextPlanningItems = [];
    const plannedKeys = new Set(
      planningSnapshot
        .filter((entry) => entry?.sectorId)
        .map((entry) => `${entry.sectorId}::${entry.time || ""}::${entry.recurrenceType || "Aucune"}::${entry.plannedDate || ""}::${Math.max(1, Number(entry.iteration) || 1)}`),
    );

    planningSnapshot.forEach((item) => {
      if (!item?.sectorId) return;

      if (!item.validatedAt) {
        item.status = "Terminee";
        item.validatedAt = closedAt;
        item.validationSignature = {
          signerName: "Cloture automatique 24h",
          signerRole: "Systeme",
          imageData: "",
          signedAt: closedAt,
        };
      }

      const canRecur = item.recurrenceType !== "Aucune" && item.recurrenceInfinite;
      if (!canRecur) return;

      let cursorDate = isValidDateKey(item.plannedDate) ? item.plannedDate : state.day.date;
      let nextIteration = Math.max(1, Number(item.iteration) || 1) + 1;

      // Rattraper les occurrences manquantes jusqu'au jour courant.
      for (let guard = 0; guard < 730; guard += 1) {
        const nextDate = addPlanningRecurrenceDate(cursorDate, item.recurrenceType, item.recurrenceEvery);
        if (!nextDate || nextDate > today) break;

        const key = `${item.sectorId}::${item.time || ""}::${item.recurrenceType || "Aucune"}::${nextDate}::${nextIteration}`;
        if (!plannedKeys.has(key)) {
          nextPlanningItems.push({
            id: createId(),
            time: item.time,
            plannedDate: nextDate,
            sectorId: item.sectorId,
            recurrenceType: item.recurrenceType,
            recurrenceEvery: item.recurrenceEvery,
            recurrenceInfinite: item.recurrenceInfinite,
            iteration: nextIteration,
            status: "A faire",
            validatedAt: "",
            validationSignature: null,
          });
          plannedKeys.add(key);
        }

        cursorDate = nextDate;
        nextIteration += 1;
      }
    });

    state.planning.push(...nextPlanningItems);

    // Nouvelle journee: repartir avec une checklist vide.
    state.checklistData = {};
    state.activeChecklist = { sectorId: "", categoryId: "", itemSubcategoryId: "", planningId: "" };
    state.day.date = today;
    state.day.notes = "";
    state.day.items = [];
  }

  if (!state.checklistData || typeof state.checklistData !== "object") state.checklistData = {};
  if (!Array.isArray(state.photos)) state.photos = [];
  if (!Array.isArray(state.commands)) state.commands = [];
  state.commands = dedupeAndOrderCommands(state.commands.map((command) => createCommandItem(command)));

  if (!state.crisis || typeof state.crisis !== "object") {
    state.crisis = {
      context: createCrisisContext(),
      actions: [],
      subcategories: createDefaultCrisisSubcategories(),
      actionCatalog: createDefaultCrisisActionCatalog(),
    };
  }
  state.crisis.context = createCrisisContext(state.crisis.context);
  state.crisis.subcategories = normalizeCrisisSubcategories(state.crisis.subcategories);
  state.crisis.actionCatalog = normalizeCrisisActionCatalog(state.crisis.actionCatalog, state.crisis.subcategories);
  if (!Array.isArray(state.crisis.actions)) {
    state.crisis.actions = [];
  }
  state.crisis.actions = state.crisis.actions
    .map((action) => createCrisisAction(action))
    .filter((action) => action.title.trim().length > 0);

  const currentMode = state.crisis.context.mode === "Plan blanc" ? "Plan blanc" : "HET";
  const allowedSubcategories = state.crisis.subcategories[currentMode] || [];
  if (!allowedSubcategories.includes(state.crisis.context.subcategory || "")) {
    state.crisis.context.subcategory = allowedSubcategories[0] || "";
  }
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
