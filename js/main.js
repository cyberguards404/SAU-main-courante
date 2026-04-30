import {
  state,
  createId,
  createCommandItem,
  createCrisisAction,
  createCrisisContext,
  createDefaultCrisisActionCatalog,
  createDefaultCrisisSubcategories,
  normalizeRecurrenceType,
  loadState,
  saveState,
  setSaveHook,
  ensureActiveTemplate,
  ensureActiveChecklist,
} from "./core/state.js?v=20260430-7";
import { dom, escapeHtml } from "./core/dom.js?v=20260430-7";
import { bindTemplatesEvents, renderTemplates, setTemplatesRenderHook } from "./features/templates.js?v=20260430-7";
import {
  bindPlanningEvents,
  renderPlanning,
  setPlanningRenderHook,
} from "./features/planning.js?v=20260430-7";
import {
  bindChecklistEvents,
  renderChecklist,
  setChecklistRenderHook,
  getChecklistCompletionSummary,
  resetChecklistNavigation,
  collectSectorAnomalies,
} from "./features/checklist.js?v=20260430-7";
import {
  login,
  logout,
  getCurrentUser,
  listUsers,
  createUser,
  toggleUserActive,
  getTrainingContent,
  saveTrainingContent,
  saveTrainingAttempt,
} from "./features/auth.js?v=20260430-7";
import { bindSignatureEvents, renderSignature } from "./features/signature.js?v=20260430-7";
import { initCollaboration, saveStateToServer, logAction, setOnStateSync } from "./features/collaboration.js?v=20260430-7";

let pendingServerSyncTimer = null;
let serverSyncInFlight = false;
let activeCommandTab = "validation";
let pendingCommandValidationId = "";
let currentUser = null;
let activeModule = "dashboard";
let appInitialized = false;
let managedUsers = [];
let trainingState = { categories: [], attempts: [] };
let activeQuiz = null;
let activeFormationTab = "learner";
let activeCrisisView = "dashboard";
let crisisSidebarCollapsed = false;
let trainingCatalogPage = 1;
let selectedEditorCourseId = "";
let activeLearningCourseId = "";
let selectedLearnerCategoryId = "";
let selectedLearnerChapterId = "";
let selectedLearnerCourseId = "";
let trainingSearchTerm = "";
let activeCreatorEditorTab = "course";
let dailyRolloverTimer = null;
const openCommandCommentIds = new Set();
let commandAgendaAnchor = new Date();
let commandAgendaSelectedDayKey = "";
let commandDebugTargetId = "";
let activeCommandSeriesId = "";

const WEEKDAY_LABELS = {
  0: "Dim",
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
};

const CRISIS_FUNCTION_LABELS = {
  dashboard: "Tableau de bord",
  "main-courante": "Main courante",
  anticipation: "Anticipation",
  logistique: "Logistique",
  "flux-patients": "Flux de patients",
  communication: "Communication",
};

const CRISIS_ACTION_DOMAIN_LABELS = {
  anticipation: "Anticipation",
  logistique: "Logistique",
  "flux-patients": "Flux de patients",
  communication: "Communication",
};

const CRISIS_MODE_PRESETS = {
  HET: {
    priorities: [
      "Arbitrer les flux d'entree et d'aval toutes les 30 minutes",
      "Dimensionner un renfort court sur tri / accueil / box critiques",
      "Proteger les filieres dependantes: imagerie, labo, UHCD, brancardage",
    ],
    rhythm: [
      "Point cellule toutes les 60 minutes",
      "Mise a jour des capacites de lits et sorties toutes les 30 minutes",
      "Message de situation a la direction et aux partenaires a H+1",
    ],
    anticipation: [
      "Verifier la tendance d'arrivees SAMU / adressees / consultations non programmees",
      "Identifier les patients bloquants pour examens ou aval dans les 2 prochaines heures",
      "Pre-positionner une solution de debordement court si la file augmente encore",
    ],
    mitigation: [
      "Pre-alerter cadres de garde et medecins de renfort mobilisables",
      "Preparer les ordres logistiques prioritaires avant rupture",
      "Tracer un point de situation partageable en moins de 5 lignes",
    ],
    logistics: [
      { title: "Brancards / fauteuils", detail: "Prevoir rotation rapide, nettoyage et tampon brancardage" },
      { title: "Oxygene / monitorage", detail: "Surveiller les points de rupture et capacites de secours" },
      { title: "Consommables voies veineuses", detail: "Reassort avance sur kits, cathlons, tubulures" },
    ],
    logisticsActions: [
      "Declencher le reassort rapide des references critiques",
      "Verifier la disponibilite d'une zone tampon exploitable en moins de 15 minutes",
      "Synchroniser nettoyage, brancardage et transport interne sur les flux bloquants",
    ],
    flow: [
      "Orienter les cas simples vers circuit court ou reevaluation differee",
      "Prioriser les examens qui conditionnent une hospitalisation ou sortie",
      "Mettre a jour le tableau des patients en attente toutes les 30 minutes",
    ],
    contacts: ["Cadre de garde", "Bed manager / aval", "SAMU / SMUR", "Direction de permanence", "Imagerie / laboratoire"],
  },
  "Plan blanc": {
    priorities: [
      "Installer la cellule de crise et fixer la cadence des points de situation",
      "Reconfigurer les capacites critiques et circuits securises",
      "Organiser les renforts, deprogrammations et liens avec la direction",
    ],
    rhythm: [
      "Point cellule toutes les 30 minutes en phase initiale",
      "Synthese structuree vers direction / SAMU / partenaires a chaque cycle",
      "Tableau de situation mis a jour en temps reel sur capacites, ressources et consignes",
    ],
    anticipation: [
      "Projeter l'impact sur les 6 prochaines heures en box, lits, imagerie et bloc",
      "Identifier les unites mobilisables et seuils de debordement",
      "Preparer les scenarios de renfort et decouplage des flux non critiques",
    ],
    mitigation: [
      "Declencher les chaines d'appel predefinies par fonction",
      "Affecter un referent par filiere critique avec proprietaire unique",
      "Formaliser les decisions avec echeance et responsable dans la main courante",
    ],
    logistics: [
      { title: "Capacites d'accueil", detail: "Box, salles tampons, zones d'attente securisees, lits d'aval mobilisables" },
      { title: "Moyens biomedicaux", detail: "Respirateurs, SAP, pousse-seringues, monitorage et autonomie electrique" },
      { title: "Ravitaillement", detail: "Pharmacie, dispositifs invasifs, O2, linge, restauration, transport" },
    ],
    logisticsActions: [
      "Verifier l'ouverture effective des capacites supplementaires decidees",
      "Demander l'etat exact des moyens critiques et des indisponibilites",
      "Tracer les arbitrages logistiques et les delais de mise a disposition",
    ],
    flow: [
      "Segmenter strictement les flux urgents, relatifs et differables",
      "Assurer une filiere evac / transferts / sorties rapides en continu",
      "Reevaluer la doctrine d'orientation a chaque point de situation",
    ],
    contacts: ["Direction de crise", "SAMU / ARS", "Cadres de pole", "Bloc / reanimation / imagerie", "Securite / logistique"],
  },
};

window.__SAU_APP_READY = true;

function renderModuleShell() {
  if (!dom.appShell || !dom.authScreen) return;
  const isAuthenticated = Boolean(currentUser);
  dom.authScreen.classList.toggle("is-hidden", isAuthenticated);
  dom.appShell.classList.toggle("is-hidden", !isAuthenticated);

  if (!isAuthenticated) return;

  if (dom.userGreeting) {
    dom.userGreeting.textContent = `${currentUser.full_name} (${currentUser.role})`;
  }
  if (dom.welcomeTitle) {
    dom.welcomeTitle.textContent = `Bienvenue ${currentUser.full_name}`;
  }

  const screens = {
    dashboard: dom.dashboardScreen,
    formation: dom.formationScreen,
    crise: dom.crisisScreen,
    logistiques: dom.logisticsScreen,
  };

  Object.entries(screens).forEach(([key, element]) => {
    if (!element) return;
    element.classList.toggle("is-hidden", key !== activeModule);
  });

  if (dom.dashboardMenuBtn) {
    dom.dashboardMenuBtn.classList.remove("is-hidden");
    dom.dashboardMenuBtn.setAttribute("aria-expanded", "false");
  }
  if (dom.dashboardMenu) {
    dom.dashboardMenu.classList.add("is-hidden");
  }

  if (dom.appHeaderSubtitle) {
    dom.appHeaderSubtitle.textContent = activeModule === "formation"
      ? "Plateforme SAU - espace Formation"
      : activeModule === "crise"
        ? "Plateforme SAU - espace Gestion de crise"
      : activeModule === "logistiques"
        ? "Plateforme SAU - espace Logistiques"
        : "Plateforme SAU - dashboard general";
  }

  if (dom.userManagementSection) {
    dom.userManagementSection.classList.toggle("is-hidden", currentUser.role !== "admin");
  }
}

function renderUsersList() {
  if (!dom.usersList) return;
  dom.usersList.innerHTML = "";

  if (!Array.isArray(managedUsers) || managedUsers.length === 0) {
    dom.usersList.innerHTML = '<p class="muted-text">Aucun utilisateur charge.</p>';
    return;
  }

  managedUsers.forEach((user) => {
    const card = document.createElement("div");
    card.className = "commande-card";
    card.innerHTML = `
      <div class="commande-card-head">
        <strong>${escapeHtml(user.full_name)}</strong>
        <span class="badge ${user.is_active ? "badge-ok" : "badge-issue"}">${user.is_active ? "Actif" : "Desactive"}</span>
      </div>
      <div class="commande-card-meta">
        <small>Identifiant: ${escapeHtml(user.username)}</small>
        <small>Role: ${escapeHtml(user.role)}</small>
        <small>Cree le: ${escapeHtml(new Date(user.created_at).toLocaleDateString("fr-FR"))}</small>
      </div>
      <div class="inline-actions">
        <button type="button" class="secondary-btn" data-toggle-user-id="${user.id}" data-toggle-user-active="${user.is_active ? "0" : "1"}" ${currentUser && currentUser.id === user.id ? "disabled" : ""}>
          ${user.is_active ? "Desactiver" : "Reactiver"}
        </button>
      </div>
    `;
    dom.usersList.appendChild(card);
  });
}

async function refreshUsers() {
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    managedUsers = await listUsers();
    if (dom.userManagementStatus) {
      dom.userManagementStatus.textContent = `${managedUsers.length} utilisateur(s) charge(s).`;
    }
    renderUsersList();
  } catch (error) {
    if (dom.userManagementStatus) {
      dom.userManagementStatus.textContent = error.message;
    }
  }
}

function setActiveModule(moduleName) {
  const allowedModules = ["dashboard", "formation", "crise", "logistiques"];
  activeModule = allowedModules.includes(moduleName) ? moduleName : "dashboard";
  if (activeModule === "crise") {
    activeCrisisView = isCrisisEventCreated() ? "dashboard" : "creation-evenement";
  }
  renderModuleShell();
}

function showLoginError(message) {
  if (!dom.loginError) return;
  dom.loginError.textContent = message;
  dom.loginError.classList.toggle("is-hidden", !message);
}

function trainingId() {
  return createId();
}

function isTrainingEditor() {
  return Boolean(currentUser && (currentUser.role === "admin" || currentUser.role === "formateur"));
}

function normalizeCourse(course) {
  const normalized = {
    id: course?.id || trainingId(),
    title: course?.title || "Cours sans titre",
    content: course?.content || "",
    questions: Array.isArray(course?.questions) ? course.questions.map((question) => ({
      id: question?.id || trainingId(),
      type: question?.type === "clinical" ? "clinical" : "standard",
      clinicalCase: question?.clinicalCase || "",
      text: question?.text || "",
      options: Array.isArray(question?.options) ? question.options.slice(0, 4) : ["", "", "", ""],
      correctIndex: Number.isInteger(Number(question?.correctIndex)) ? Number(question.correctIndex) : 0,
      explanation: question?.explanation || "",
    })) : [],
    blocks: Array.isArray(course?.blocks) ? course.blocks.map((block) => ({
      id: block?.id || trainingId(),
      type: block?.type === "quiz" ? "quiz" : "text",
      content: block?.content || "",
      questionId: block?.questionId || "",
    })) : [],
  };

  if (normalized.blocks.length === 0) {
    normalized.blocks.push({ id: trainingId(), type: "text", content: normalized.content || "Introduction du cours...", questionId: "" });
  }

  normalized.blocks.forEach((block) => {
    if (block.type === "quiz") {
      const exists = normalized.questions.some((question) => question.id === block.questionId);
      if (!exists) {
        block.questionId = normalized.questions[0]?.id || "";
      }
    }
  });

  return normalized;
}

function normalizeTrainingState(rawState) {
  const categories = Array.isArray(rawState?.categories) ? rawState.categories : [];
  const attempts = Array.isArray(rawState?.attempts) ? rawState.attempts : [];

  trainingState = {
    categories: categories.map((category) => ({
      id: category?.id || trainingId(),
      name: category?.name || "Categorie",
      chapters: Array.isArray(category?.chapters) ? category.chapters.map((chapter) => ({
        id: chapter?.id || trainingId(),
        name: chapter?.name || "Chapitre",
        courses: Array.isArray(chapter?.courses) ? chapter.courses.map((course) => normalizeCourse(course)) : [],
      })) : [],
    })),
    attempts,
  };
}

function setActiveFormationTab(tabName) {
  const allowed = ["learner", "creator"];
  activeFormationTab = allowed.includes(tabName) ? tabName : "learner";
}

function renderFormationTabs() {
  if (!dom.formationTabs || !dom.formationLearnerPanel || !dom.formationCreatorPanel) return;
  const creatorAllowed = isTrainingEditor();
  if (!creatorAllowed && activeFormationTab === "creator") {
    activeFormationTab = "learner";
  }

  dom.formationTabs.querySelectorAll("button[data-formation-tab]").forEach((button) => {
    const tab = button.getAttribute("data-formation-tab");
    if (tab === "creator") {
      button.classList.toggle("is-hidden", !creatorAllowed);
    }
    button.classList.toggle("active", tab === activeFormationTab);
  });

  dom.formationLearnerPanel.classList.toggle("is-hidden", activeFormationTab !== "learner");
  dom.formationCreatorPanel.classList.toggle("is-hidden", activeFormationTab !== "creator" || !creatorAllowed);
}

function setActiveCreatorEditorTab(tabName) {
  const allowed = ["course", "quiz"];
  activeCreatorEditorTab = allowed.includes(tabName) ? tabName : "course";
}

function renderCreatorEditorTabs() {
  if (!dom.creatorEditorTabs || !dom.creatorCourseEditorPanel || !dom.creatorQuizEditorPanel) return;
  dom.creatorEditorTabs.querySelectorAll("button[data-creator-editor-tab]").forEach((button) => {
    const tab = button.getAttribute("data-creator-editor-tab");
    button.classList.toggle("active", tab === activeCreatorEditorTab);
  });
  dom.creatorCourseEditorPanel.classList.toggle("is-hidden", activeCreatorEditorTab !== "course");
  dom.creatorQuizEditorPanel.classList.toggle("is-hidden", activeCreatorEditorTab !== "quiz");
}

function getAllCourses() {
  const rows = [];
  (trainingState.categories || []).forEach((category) => {
    (category.chapters || []).forEach((chapter) => {
      (chapter.courses || []).forEach((course) => {
        rows.push({ category, chapter, course });
      });
    });
  });
  return rows;
}

function getCourseById(courseId) {
  return getAllCourses().find((entry) => entry.course.id === courseId) || null;
}

function findByNameInsensitive(rows, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  return (rows || []).find((entry) => String(entry?.name || "").trim().toLowerCase() === target) || null;
}

function stripHtmlToText(value) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(value || "");
  return (wrapper.textContent || wrapper.innerText || "").trim();
}

function toEmbedVideoUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replaceAll("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) return url;
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }
    return "";
  } catch (_error) {
    return "";
  }
}

function applyRichCommand(command, value = null) {
  if (typeof document.execCommand !== "function") return;
  document.execCommand(command, false, value);
}

function getCourseQuizQuestions(course) {
  if (!course) return [];
  const mapById = new Map((course.questions || []).map((question) => [question.id, question]));
  const quizInBlocks = (course.blocks || [])
    .filter((block) => block.type === "quiz")
    .map((block) => mapById.get(block.questionId))
    .filter(Boolean);
  if (quizInBlocks.length > 0) return quizInBlocks;
  return course.questions || [];
}

function getCourseProgress(courseId) {
  const attempts = (trainingState.attempts || []).filter(
    (attempt) => attempt.user_id === currentUser?.id && attempt.course_id === courseId,
  );
  if (attempts.length === 0) return { pct: 0, hasAttempt: false };
  const bestPct = attempts.reduce((best, attempt) => {
    const total = Number(attempt.total) || 0;
    const score = Number(attempt.score) || 0;
    if (total <= 0) return best;
    const pct = Math.round((score / total) * 100);
    return Math.max(best, pct);
  }, 0);
  return { pct: Math.max(0, Math.min(100, bestPct)), hasAttempt: true };
}

function getLearnerFilteredCourses() {
  const term = trainingSearchTerm.trim().toLowerCase();
  return getAllCourses().filter(({ category, chapter, course }) => {
    if (selectedLearnerCategoryId && category.id !== selectedLearnerCategoryId) return false;
    if (selectedLearnerChapterId && chapter.id !== selectedLearnerChapterId) return false;
    if (selectedLearnerCourseId && course.id !== selectedLearnerCourseId) return false;
    if (!term) return true;
    const haystack = `${category.name} ${chapter.name} ${course.title} ${stripHtmlToText(course.content || "")}`.toLowerCase();
    return haystack.includes(term);
  });
}

function renderTrainingSelectors() {
  const categories = Array.isArray(trainingState.categories) ? trainingState.categories : [];

  const fillCategory = (select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    select.innerHTML = "";
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
  };

  fillCategory(dom.chapterCategorySelect);
  fillCategory(dom.courseCategorySelect);

  if (dom.courseChapterSelect instanceof HTMLSelectElement) {
    dom.courseChapterSelect.innerHTML = "";
    const category = categories.find((entry) => entry.id === dom.courseCategorySelect?.value) || categories[0];
    (category?.chapters || []).forEach((chapter) => {
      const option = document.createElement("option");
      option.value = chapter.id;
      option.textContent = chapter.name;
      dom.courseChapterSelect.appendChild(option);
    });
  }

  if (dom.questionCourseSelect instanceof HTMLSelectElement) {
    dom.questionCourseSelect.innerHTML = "";
    getAllCourses().forEach(({ category, chapter, course }) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${category.name} / ${chapter.name} / ${course.title}`;
      dom.questionCourseSelect.appendChild(option);
    });
    if (selectedEditorCourseId) {
      dom.questionCourseSelect.value = selectedEditorCourseId;
    }
  }

  if (dom.editorCourseSelect instanceof HTMLSelectElement) {
    dom.editorCourseSelect.innerHTML = "";
    getAllCourses().forEach(({ category, chapter, course }) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${category.name} / ${chapter.name} / ${course.title}`;
      dom.editorCourseSelect.appendChild(option);
    });
    if (selectedEditorCourseId) {
      dom.editorCourseSelect.value = selectedEditorCourseId;
    }
    if (!dom.editorCourseSelect.value && dom.editorCourseSelect.options.length > 0) {
      dom.editorCourseSelect.selectedIndex = 0;
      selectedEditorCourseId = dom.editorCourseSelect.value;
    }
  }

  if (dom.editorQuizQuestionSelect instanceof HTMLSelectElement) {
    dom.editorQuizQuestionSelect.innerHTML = "";
    const courseRow = getCourseById(selectedEditorCourseId);
    (courseRow?.course?.questions || []).forEach((question, index) => {
      const option = document.createElement("option");
      option.value = question.id;
      option.textContent = `${index + 1}. ${question.text}`;
      dom.editorQuizQuestionSelect.appendChild(option);
    });
  }

  if (dom.trainingLearnerChapterSelect instanceof HTMLSelectElement) {
    const chapterOptions = [];
    const seen = new Set();
    getAllCourses().forEach(({ category, chapter }) => {
      if (selectedLearnerCategoryId && category.id !== selectedLearnerCategoryId) return;
      if (seen.has(chapter.id)) return;
      seen.add(chapter.id);
      chapterOptions.push({
        id: chapter.id,
        label: `${category.name} / ${chapter.name}`,
      });
    });

    dom.trainingLearnerChapterSelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Tous les chapitres";
    dom.trainingLearnerChapterSelect.appendChild(allOption);

    chapterOptions.forEach((optionRow) => {
      const option = document.createElement("option");
      option.value = optionRow.id;
      option.textContent = optionRow.label;
      dom.trainingLearnerChapterSelect.appendChild(option);
    });

    const chapterExists = chapterOptions.some((entry) => entry.id === selectedLearnerChapterId);
    if (!chapterExists) {
      selectedLearnerChapterId = "";
    }
    dom.trainingLearnerChapterSelect.value = selectedLearnerChapterId;
  }

  if (dom.trainingLearnerCourseSelect instanceof HTMLSelectElement) {
    const filteredForCourseSelect = getAllCourses().filter(({ category, chapter }) => (
      (!selectedLearnerCategoryId || category.id === selectedLearnerCategoryId)
      && (!selectedLearnerChapterId || chapter.id === selectedLearnerChapterId)
    ));

    dom.trainingLearnerCourseSelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Tous les livres";
    dom.trainingLearnerCourseSelect.appendChild(allOption);

    filteredForCourseSelect.forEach(({ chapter, course }) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${chapter.name} / ${course.title}`;
      dom.trainingLearnerCourseSelect.appendChild(option);
    });

    const courseExists = filteredForCourseSelect.some(({ course }) => course.id === selectedLearnerCourseId);
    if (!courseExists) {
      selectedLearnerCourseId = "";
    }
    dom.trainingLearnerCourseSelect.value = selectedLearnerCourseId;
  }

  if (dom.trainingLearnerCategorySelect instanceof HTMLSelectElement) {
    dom.trainingLearnerCategorySelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Toutes les categories";
    dom.trainingLearnerCategorySelect.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      dom.trainingLearnerCategorySelect.appendChild(option);
    });

    const exists = categories.some((entry) => entry.id === selectedLearnerCategoryId);
    if (!exists) selectedLearnerCategoryId = "";
    dom.trainingLearnerCategorySelect.value = selectedLearnerCategoryId;
  }
}

function renderTrainingStats() {
  if (!dom.trainingStats) return;
  const categories = trainingState.categories || [];
  const chapters = categories.reduce((sum, category) => sum + (category.chapters || []).length, 0);
  const courses = getAllCourses();
  const questions = courses.reduce((sum, entry) => sum + (entry.course.questions || []).length, 0);
  const myAttempts = (trainingState.attempts || []).filter((attempt) => attempt.user_id === currentUser?.id);
  const totalPoints = myAttempts.reduce((sum, attempt) => sum + (Number(attempt.points) || 0), 0);
  const averageProgress = courses.length > 0
    ? Math.round(courses.reduce((sum, row) => sum + getCourseProgress(row.course.id).pct, 0) / courses.length)
    : 0;

  dom.trainingStats.innerHTML = `
    <div class="dashboard-kpi-card"><h4>Categories</h4><p class="dashboard-kpi-value">${categories.length}</p></div>
    <div class="dashboard-kpi-card"><h4>Chapitres</h4><p class="dashboard-kpi-value">${chapters}</p></div>
    <div class="dashboard-kpi-card"><h4>Cours</h4><p class="dashboard-kpi-value">${courses.length}</p></div>
    <div class="dashboard-kpi-card"><h4>Questions</h4><p class="dashboard-kpi-value">${questions}</p></div>
    <div class="dashboard-kpi-card"><h4>Mes points</h4><p class="dashboard-kpi-value">${totalPoints}</p></div>
    <div class="dashboard-kpi-card"><h4>Progression moyenne</h4><p class="dashboard-kpi-value">${averageProgress}%</p></div>
  `;
}

function renderTrainingSpotlight() {
  if (!dom.trainingSpotlight) return;
  const rows = getLearnerFilteredCourses();
  if (rows.length === 0) {
    dom.trainingSpotlight.innerHTML = '<p class="muted-text">Aucun parcours correspondant aux filtres.</p>';
    return;
  }

  const sorted = [...rows].sort((a, b) => getCourseProgress(b.course.id).pct - getCourseProgress(a.course.id).pct);
  const target = sorted.find((row) => getCourseProgress(row.course.id).pct < 100) || sorted[0];
  const progress = getCourseProgress(target.course.id);
  dom.trainingSpotlight.innerHTML = `
    <article class="mooc-spotlight">
      <p class="auth-eyebrow">${escapeHtml(target.category.name)} · ${escapeHtml(target.chapter.name)}</p>
      <h3>${escapeHtml(target.course.title)}</h3>
      <p>${escapeHtml(stripHtmlToText((target.course.blocks || []).map((block) => block.content || "").join(" ")).slice(0, 180) || "Cours pret a etre commence.")}</p>
      <div class="course-progress">
        <span class="course-progress-label">Progression actuelle: ${progress.pct}%</span>
        <div class="course-progress-track"><span class="course-progress-bar" style="width:${progress.pct}%"></span></div>
      </div>
      <div class="inline-actions">
        <button type="button" data-open-course-id="${target.course.id}">${progress.hasAttempt ? "Reprendre le cours" : "Commencer"}</button>
        <button type="button" class="secondary-btn" data-start-quiz-course-id="${target.course.id}">Lancer le quiz</button>
      </div>
    </article>
  `;
}

function renderTrainingCollections() {
  if (!dom.trainingCollections) return;
  const rows = getLearnerFilteredCourses();
  if (rows.length === 0) {
    dom.trainingCollections.innerHTML = '<p class="muted-text">Aucune collection disponible.</p>';
    return;
  }

  const byChapter = new Map();
  rows.forEach(({ category, chapter, course }) => {
    const key = `${category.id}::${chapter.id}`;
    if (!byChapter.has(key)) {
      byChapter.set(key, { category, chapter, courses: [] });
    }
    byChapter.get(key).courses.push(course);
  });

  dom.trainingCollections.innerHTML = "";
  [...byChapter.values()].forEach((group) => {
    const chapterProgress = group.courses.length > 0
      ? Math.round(group.courses.reduce((sum, course) => sum + getCourseProgress(course.id).pct, 0) / group.courses.length)
      : 0;
    const card = document.createElement("article");
    card.className = "collection-card";
    card.innerHTML = `
      <p class="auth-eyebrow">${escapeHtml(group.category.name)}</p>
      <h4>${escapeHtml(group.chapter.name)}</h4>
      <p class="muted-text">${group.courses.length} cours</p>
      <div class="course-progress">
        <span class="course-progress-label">Avancement chapitre: ${chapterProgress}%</span>
        <div class="course-progress-track"><span class="course-progress-bar" style="width:${chapterProgress}%"></span></div>
      </div>
    `;
    dom.trainingCollections.appendChild(card);
  });
}

function renderTrainingReader() {
  if (!dom.trainingReader || !dom.trainingReaderTitle || !dom.trainingReaderMeta || !dom.trainingReaderBlocks) return;
  const row = getCourseById(activeLearningCourseId);
  if (!row) {
    dom.trainingReader.classList.add("is-hidden");
    document.body.classList.remove("reader-open");
    dom.trainingReaderBlocks.innerHTML = "";
    return;
  }

  dom.trainingReader.classList.remove("is-hidden");
  document.body.classList.add("reader-open");
  dom.trainingReaderTitle.textContent = row.course.title;
  dom.trainingReaderMeta.textContent = `${row.category.name} / ${row.chapter.name}`;
  dom.trainingReaderBlocks.innerHTML = "";

  (row.course.blocks || []).forEach((block, index) => {
    const article = document.createElement("article");
    article.className = `reader-block ${block.type === "quiz" ? "reader-block-quiz" : "reader-block-text"}`;
    if (block.type === "quiz") {
      const question = (row.course.questions || []).find((entry) => entry.id === block.questionId);
      article.innerHTML = `
        <h4>Checkpoint Quiz #${index + 1}</h4>
        <p>${escapeHtml(question?.text || "Question indisponible")}</p>
        <button type="button" data-start-quiz-course-id="${row.course.id}">Repondre au quiz</button>
      `;
    } else {
      article.innerHTML = `
        <h4>Bloc ${index + 1}</h4>
        <div class="reader-content">${block.content || "<p>Contenu vide.</p>"}</div>
      `;
    }
    dom.trainingReaderBlocks.appendChild(article);
  });
}

function renderTrainingCatalog() {
  if (!dom.trainingCatalog) return;
  const rows = getLearnerFilteredCourses();
  dom.trainingCatalog.innerHTML = "";
  if (rows.length === 0) {
    dom.trainingCatalog.innerHTML = '<p class="muted-text">Aucun cours pour ce filtre.</p>';
    if (dom.trainingPageInfo) dom.trainingPageInfo.textContent = "Page 1 / 1";
    return;
  }

  const pageSize = dom.trainingPageSize instanceof HTMLSelectElement ? Math.max(1, Number(dom.trainingPageSize.value) || 6) : 6;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  trainingCatalogPage = Math.min(Math.max(1, trainingCatalogPage), totalPages);
  const offset = (trainingCatalogPage - 1) * pageSize;
  const slice = rows.slice(offset, offset + pageSize);

  slice.forEach(({ category, chapter, course }) => {
    const questionCount = getCourseQuizQuestions(course).length;
    const progress = getCourseProgress(course.id);
    const previewText = stripHtmlToText((course.blocks || [])
      .filter((block) => block.type === "text")
      .map((block) => block.content)
      .join(" "));
    const card = document.createElement("article");
    card.className = "module-card";
    card.innerHTML = `
      <p class="auth-eyebrow">${escapeHtml(category.name)} · ${escapeHtml(chapter.name)}</p>
      <h3>${escapeHtml(course.title)}</h3>
      <p>${escapeHtml(previewText.slice(0, 220) || "Contenu en cours de redaction.")}</p>
      <p class="muted-text">Quiz integres: ${questionCount} question(s)</p>
      <div class="course-progress">
        <span class="course-progress-label">Progression: ${progress.pct}%${progress.hasAttempt ? "" : " (pas encore commence)"}</span>
        <div class="course-progress-track"><span class="course-progress-bar" style="width:${progress.pct}%"></span></div>
      </div>
      <div class="inline-actions">
        <button type="button" data-open-course-id="${course.id}">Lire le cours</button>
        <button type="button" class="secondary-btn" data-start-quiz-course-id="${course.id}" ${questionCount === 0 ? "disabled" : ""}>Jouer le quiz</button>
      </div>
    `;
    dom.trainingCatalog.appendChild(card);
  });

  if (dom.trainingPageInfo) {
    dom.trainingPageInfo.textContent = `Page ${trainingCatalogPage} / ${totalPages}`;
  }
  if (dom.trainingPrevPageBtn) {
    dom.trainingPrevPageBtn.disabled = trainingCatalogPage <= 1;
  }
  if (dom.trainingNextPageBtn) {
    dom.trainingNextPageBtn.disabled = trainingCatalogPage >= totalPages;
  }
}

function renderQuiz() {
  if (!dom.quizPlayer || !dom.quizCourseTitle || !dom.quizProgress || !dom.quizQuestionText || !dom.quizOptions || !dom.quizFeedback) return;
  if (!activeQuiz) {
    dom.quizPlayer.classList.add("is-hidden");
    if (dom.quizCaseContext) {
      dom.quizCaseContext.classList.add("is-hidden");
      dom.quizCaseContext.innerHTML = "";
    }
    return;
  }

  dom.quizPlayer.classList.remove("is-hidden");
  const { course, index, answers } = activeQuiz;
  const questions = getCourseQuizQuestions(course);
  const question = questions[index];
  if (!question) {
    dom.quizQuestionText.textContent = "Quiz termine.";
    return;
  }

  dom.quizCourseTitle.textContent = `Quiz - ${course.title}`;
  dom.quizProgress.textContent = `Question ${index + 1} / ${questions.length}`;
  dom.quizQuestionText.textContent = question.text;
  dom.quizOptions.innerHTML = "";
  dom.quizFeedback.textContent = "";

  if (dom.quizCaseContext) {
    if (question.type === "clinical" && question.clinicalCase) {
      dom.quizCaseContext.classList.remove("is-hidden");
      dom.quizCaseContext.innerHTML = `
        <strong>Cas clinique</strong>
        <p>${escapeHtml(question.clinicalCase)}</p>
      `;
    } else {
      dom.quizCaseContext.classList.add("is-hidden");
      dom.quizCaseContext.innerHTML = "";
    }
  }

  (question.options || []).forEach((option, optionIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-btn quiz-option";
    button.textContent = option;
    button.setAttribute("data-quiz-option-index", String(optionIndex));
    if (typeof answers[index] !== "undefined") {
      button.disabled = true;
      if (optionIndex === question.correctIndex) {
        button.classList.add("quiz-option-correct");
      }
      if (optionIndex === answers[index] && optionIndex !== question.correctIndex) {
        button.classList.add("quiz-option-wrong");
      }
    }
    dom.quizOptions.appendChild(button);
  });

  if (typeof answers[index] !== "undefined") {
    const isCorrect = answers[index] === question.correctIndex;
    dom.quizFeedback.textContent = isCorrect
      ? `✅ Bonne reponse ! ${question.explanation || ""}`
      : `❌ Mauvaise reponse. ${question.explanation || ""}`;
  }
}

async function persistTraining() {
  await saveTrainingContent(trainingState.categories || []);
  renderTrainingSelectors();
  renderTrainingStats();
  renderTrainingSpotlight();
  renderTrainingCollections();
  renderTrainingCatalog();
  renderTrainingReader();
  renderEditorBlocks();
}

function renderFormationBuilder() {
  if (!dom.formationBuilder) return;
  dom.formationBuilder.classList.toggle("is-hidden", !isTrainingEditor());
}

function renderEditorBlocks() {
  if (!dom.editorBlocksList) return;
  const row = getCourseById(selectedEditorCourseId);
  const course = row?.course;
  dom.editorBlocksList.innerHTML = "";
  if (!course) {
    dom.editorBlocksList.innerHTML = '<p class="muted-text">Selectionnez un cours pour editer le document.</p>';
    return;
  }

  (course.blocks || []).forEach((block, index) => {
    const item = document.createElement("article");
    item.className = "editor-block-item";
    if (block.type === "text") {
      item.innerHTML = `
        <div class="section-header">
          <h4>Bloc texte #${index + 1}</h4>
          <div class="inline-actions">
            <button type="button" class="secondary-btn" data-move-block-id="${block.id}" data-move-dir="up">↑</button>
            <button type="button" class="secondary-btn" data-move-block-id="${block.id}" data-move-dir="down">↓</button>
            <button type="button" class="secondary-btn" data-delete-block-id="${block.id}">Supprimer</button>
          </div>
        </div>
        <div class="rich-toolbar" data-rich-toolbar-id="${block.id}">
          <button type="button" class="secondary-btn" data-editor-cmd="bold" data-editor-block-id="${block.id}"><strong>B</strong></button>
          <button type="button" class="secondary-btn" data-editor-cmd="italic" data-editor-block-id="${block.id}"><em>I</em></button>
          <button type="button" class="secondary-btn" data-editor-cmd="underline" data-editor-block-id="${block.id}"><u>U</u></button>
          <button type="button" class="secondary-btn" data-editor-cmd="insertUnorderedList" data-editor-block-id="${block.id}">Liste</button>
          <button type="button" class="secondary-btn" data-editor-cmd="blockquote" data-editor-block-id="${block.id}">Citation</button>
          <button type="button" class="secondary-btn" data-editor-cmd="link" data-editor-block-id="${block.id}">Lien</button>
          <button type="button" class="secondary-btn" data-editor-cmd="video" data-editor-block-id="${block.id}">Video</button>
        </div>
        <div class="editor-rich-text" contenteditable="true" data-block-rich-id="${block.id}">${block.content || "<p>Nouveau bloc...</p>"}</div>
      `;
    } else {
      const question = (course.questions || []).find((entry) => entry.id === block.questionId);
      item.innerHTML = `
        <div class="section-header">
          <h4>Bloc quiz #${index + 1}</h4>
          <div class="inline-actions">
            <button type="button" class="secondary-btn" data-move-block-id="${block.id}" data-move-dir="up">↑</button>
            <button type="button" class="secondary-btn" data-move-block-id="${block.id}" data-move-dir="down">↓</button>
            <button type="button" class="secondary-btn" data-delete-block-id="${block.id}">Supprimer</button>
          </div>
        </div>
        <p class="muted-text">Question liee: ${escapeHtml(question?.text || "Question introuvable")}</p>
      `;
    }
    dom.editorBlocksList.appendChild(item);
  });
}

function renderFormationModule() {
  renderFormationTabs();
  renderFormationBuilder();
  renderCreatorEditorTabs();
  renderTrainingSelectors();
  renderTrainingStats();
  renderTrainingSpotlight();
  renderTrainingCollections();
  renderTrainingCatalog();
  renderTrainingReader();
  renderEditorBlocks();
  renderQuiz();
}

function setActiveCrisisView(viewName) {
  const allowed = ["creation-evenement", "dashboard", "parametrage", "main-courante", "anticipation", "logistique", "flux-patients", "communication"];
  activeCrisisView = allowed.includes(viewName) ? viewName : "dashboard";
}

function isCrisisEventCreated() {
  const context = getCrisisContext();
  return Boolean(context.mode && context.subcategory);
}

function renderCrisisEventCreation() {
  const context = getCrisisContext();
  if (dom.crisisEventModeSelect instanceof HTMLSelectElement) {
    const selectedMode = context.mode || dom.crisisEventModeSelect.value || "HET";
    dom.crisisEventModeSelect.value = selectedMode;
    const subcategories = getCrisisSubcategories(selectedMode);
    if (dom.crisisEventSubcategorySelect instanceof HTMLSelectElement) {
      dom.crisisEventSubcategorySelect.innerHTML = subcategories.length > 0
        ? subcategories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")
        : '<option value="">Aucune sous-categorie</option>';
      const selectedSubcategory = subcategories.includes(context.subcategory) ? context.subcategory : (subcategories[0] || "");
      dom.crisisEventSubcategorySelect.value = selectedSubcategory;
    }
  }

  if (dom.crisisEventCoordinatorInput instanceof HTMLInputElement) {
    dom.crisisEventCoordinatorInput.value = context.coordinator || currentUser?.full_name || "";
  }
  if (dom.crisisEventTriggerInput instanceof HTMLInputElement) {
    dom.crisisEventTriggerInput.value = context.trigger || "";
  }
  if (dom.crisisEventObjectiveInput instanceof HTMLInputElement) {
    dom.crisisEventObjectiveInput.value = context.objective || "";
  }
  if (dom.crisisEventSummaryInput instanceof HTMLTextAreaElement) {
    dom.crisisEventSummaryInput.value = context.summary || "";
  }
  if (dom.crisisEventNextBriefAt instanceof HTMLInputElement) {
    dom.crisisEventNextBriefAt.value = toDatetimeLocalValue(new Date(context.nextBriefAt));
  }
}

function getCrisisContext() {
  if (!state.crisis || typeof state.crisis !== "object") {
    state.crisis = { context: createCrisisContext(), actions: [], subcategories: createDefaultCrisisSubcategories() };
  }
  state.crisis.context = createCrisisContext(state.crisis.context);
  return state.crisis.context;
}

function getCrisisActions() {
  if (!state.crisis || !Array.isArray(state.crisis.actions)) {
    state.crisis = { context: createCrisisContext(), actions: [], subcategories: createDefaultCrisisSubcategories() };
  }
  return state.crisis.actions;
}

function getCrisisSubcategories(mode) {
  if (!state.crisis || typeof state.crisis !== "object") {
    state.crisis = { context: createCrisisContext(), actions: [], subcategories: createDefaultCrisisSubcategories(), actionCatalog: createDefaultCrisisActionCatalog() };
  }
  const resolvedMode = mode === "Plan blanc" ? "Plan blanc" : "HET";
  const defaults = createDefaultCrisisSubcategories();
  if (!state.crisis.subcategories || typeof state.crisis.subcategories !== "object") {
    state.crisis.subcategories = defaults;
  }
  if (!Array.isArray(state.crisis.subcategories[resolvedMode])) {
    state.crisis.subcategories[resolvedMode] = [...defaults[resolvedMode]];
  }
  return state.crisis.subcategories[resolvedMode];
}

function getCrisisActionCatalog() {
  if (!state.crisis || typeof state.crisis !== "object") {
    state.crisis = {
      context: createCrisisContext(),
      actions: [],
      subcategories: createDefaultCrisisSubcategories(),
      actionCatalog: createDefaultCrisisActionCatalog(),
    };
  }
  if (!state.crisis.actionCatalog || typeof state.crisis.actionCatalog !== "object") {
    state.crisis.actionCatalog = createDefaultCrisisActionCatalog();
  }
  return state.crisis.actionCatalog;
}

function ensureCrisisActionBucket(mode, subcategory) {
  const resolvedMode = mode === "Plan blanc" ? "Plan blanc" : "HET";
  const resolvedSubcategory = String(subcategory || "").trim();
  const catalog = getCrisisActionCatalog();
  const defaults = createDefaultCrisisActionCatalog();
  if (!catalog[resolvedMode] || typeof catalog[resolvedMode] !== "object") {
    catalog[resolvedMode] = {};
  }
  if (!catalog[resolvedMode][resolvedSubcategory] || typeof catalog[resolvedMode][resolvedSubcategory] !== "object") {
    catalog[resolvedMode][resolvedSubcategory] = defaults[resolvedMode]?.[resolvedSubcategory]
      ? { ...defaults[resolvedMode][resolvedSubcategory] }
      : { anticipation: [], logistique: [], "flux-patients": [], communication: [] };
  }
  Object.keys(CRISIS_ACTION_DOMAIN_LABELS).forEach((domain) => {
    if (!Array.isArray(catalog[resolvedMode][resolvedSubcategory][domain])) {
      catalog[resolvedMode][resolvedSubcategory][domain] = [];
    }
  });
  return catalog[resolvedMode][resolvedSubcategory];
}

function getCrisisConfiguredActions(mode, subcategory, domain) {
  const bucket = ensureCrisisActionBucket(mode, subcategory);
  return Array.isArray(bucket[domain]) ? bucket[domain] : [];
}

function formatCrisisFunction(functionKey) {
  return CRISIS_FUNCTION_LABELS[functionKey] || "Gestion de crise";
}

function getCrisisModePreset(mode) {
  return CRISIS_MODE_PRESETS[mode] || CRISIS_MODE_PRESETS.HET;
}

function applyCrisisMode(mode) {
  const context = getCrisisContext();
  const resolvedMode = mode === "Plan blanc" ? "Plan blanc" : "HET";
  const preset = getCrisisModePreset(resolvedMode);
  const subcategories = getCrisisSubcategories(resolvedMode);
  context.mode = resolvedMode;
  if (!subcategories.includes(context.subcategory)) {
    context.subcategory = subcategories[0] || "";
  }
  ensureCrisisActionBucket(resolvedMode, context.subcategory);
  context.level = resolvedMode === "Plan blanc" ? "Rouge" : "Orange";
  context.trigger = context.trigger || (resolvedMode === "Plan blanc" ? "Evenement majeur / activation exceptionnelle" : "Episode de tension hospitaliere");
  context.objective = preset.priorities[0] || "";
  context.summary = context.summary || (resolvedMode === "Plan blanc"
    ? "Cellule activee, organisation immediate des renforts et capacites critiques."
    : "Tension en cours, pilotage resserre des flux et des ressources critiques.");
  saveState();
  renderCrisisModule();
}

function renderCrisisBulletList(container, items, functionKey, entryType, traceTitle) {
  if (!container) return;
  container.innerHTML = `
    <ul class="crisis-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    ${traceTitle ? `<div class="inline-actions crisis-quick-actions"><button type="button" class="secondary-btn" data-crisis-template-function="${escapeHtml(functionKey)}" data-crisis-template-title="${escapeHtml(traceTitle)}" data-crisis-template-type="${escapeHtml(entryType)}">Tracer dans la main courante</button></div>` : ""}
  `;
}

function renderCrisisResourceCards(container, resources, functionKey, traceTitle) {
  if (!container) return;
  container.innerHTML = `
    ${resources.map((item) => `<div class="commande-card"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>`).join("")}
    ${traceTitle ? `<div class="inline-actions crisis-quick-actions"><button type="button" class="secondary-btn" data-crisis-template-function="${escapeHtml(functionKey)}" data-crisis-template-title="${escapeHtml(traceTitle)}" data-crisis-template-type="Action">Tracer dans la main courante</button></div>` : ""}
  `;
}

function renderCrisisOperationalBoards() {
  const context = getCrisisContext();
  const resolvedMode = context.mode || "";
  const preset = getCrisisModePreset(resolvedMode || "HET");
  const subcategories = getCrisisSubcategories(resolvedMode || "HET");
  const activeSubcategory = subcategories.includes(context.subcategory) ? context.subcategory : (subcategories[0] || "");
  const configuredActionsByDomain = Object.fromEntries(Object.keys(CRISIS_ACTION_DOMAIN_LABELS).map((domain) => [
    domain,
    getCrisisConfiguredActions(resolvedMode || "HET", activeSubcategory, domain),
  ]));
  const actions = getCrisisActions();
  const alerts = actions.filter((action) => action.entryType === "Alerte").length;
  const decisions = actions.filter((action) => action.entryType === "Decision").length;
  const dueActions = actions.filter((action) => action.dueAt).length;

  if (dom.crisisModeSelect instanceof HTMLSelectElement) dom.crisisModeSelect.value = resolvedMode || "HET";
  if (dom.crisisSubcategorySelect instanceof HTMLSelectElement) {
    dom.crisisSubcategorySelect.innerHTML = subcategories.length > 0
      ? subcategories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")
      : '<option value="">Aucune sous-categorie</option>';
    dom.crisisSubcategorySelect.value = activeSubcategory;
  }
  if (dom.crisisSubcategoryModeSelect instanceof HTMLSelectElement) {
    dom.crisisSubcategoryModeSelect.value = resolvedMode || "HET";
  }
  if (dom.crisisConfiguredActionModeSelect instanceof HTMLSelectElement && !dom.crisisConfiguredActionModeSelect.value) {
    dom.crisisConfiguredActionModeSelect.value = resolvedMode || "HET";
  }
  const configuredMode = dom.crisisConfiguredActionModeSelect instanceof HTMLSelectElement
    ? (dom.crisisConfiguredActionModeSelect.value || resolvedMode || "HET")
    : (resolvedMode || "HET");
  const configuredSubcategories = getCrisisSubcategories(configuredMode);
  if (dom.crisisConfiguredActionSubcategorySelect instanceof HTMLSelectElement) {
    const currentConfiguredSubcategory = dom.crisisConfiguredActionSubcategorySelect.value;
    dom.crisisConfiguredActionSubcategorySelect.innerHTML = configuredSubcategories.length > 0
      ? configuredSubcategories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")
      : '<option value="">Aucune sous-categorie</option>';
    dom.crisisConfiguredActionSubcategorySelect.value = configuredSubcategories.includes(currentConfiguredSubcategory)
      ? currentConfiguredSubcategory
      : (configuredSubcategories[0] || "");
  }
  if (dom.crisisCoordinatorInput instanceof HTMLInputElement) dom.crisisCoordinatorInput.value = context.coordinator;
  if (dom.crisisNextBriefAt instanceof HTMLInputElement) dom.crisisNextBriefAt.value = toDatetimeLocalValue(new Date(context.nextBriefAt));
  if (dom.crisisSummaryInput instanceof HTMLTextAreaElement) dom.crisisSummaryInput.value = context.summary;

  if (dom.crisisModeValue) dom.crisisModeValue.textContent = resolvedMode || "A choisir";
  if (dom.crisisOpenedAtLabel) dom.crisisOpenedAtLabel.textContent = resolvedMode
    ? `${activeSubcategory ? `${activeSubcategory} · ` : ""}Activation ${new Date(context.openedAt).toLocaleString("fr-FR")}`
    : "Choisir HET ou Plan blanc";
  if (dom.crisisLevelValue) dom.crisisLevelValue.textContent = context.coordinator ? context.coordinator : "-";
  if (dom.crisisCoordinatorLabel) dom.crisisCoordinatorLabel.textContent = context.coordinator ? `Coordination: ${context.coordinator}` : "Coordination non renseignee";
  if (dom.crisisCriticalCount) dom.crisisCriticalCount.textContent = context.nextBriefAt ? new Date(context.nextBriefAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "-";
  if (dom.crisisNextBriefLabel) {
    dom.crisisNextBriefLabel.textContent = context.nextBriefAt
      ? `Prochain point: ${new Date(context.nextBriefAt).toLocaleString("fr-FR")}`
      : "Prochain point non programme";
  }

  if (dom.crisisWaitingRoomValue) dom.crisisWaitingRoomValue.textContent = String(Math.max(8, actions.length + 6));
  if (dom.crisisBedOccupancyValue) dom.crisisBedOccupancyValue.textContent = `${Math.min(99, 82 + decisions * 3)}%`;
  if (dom.crisisCriticalFlowValue) dom.crisisCriticalFlowValue.textContent = String(Math.max(2, alerts));

  renderCrisisBulletList(dom.crisisImmediatePriorities, preset.priorities.slice(0, 3), "dashboard", "Decision", resolvedMode ? `Priorites ${resolvedMode} partagees en cellule` : "Priorites partagees en cellule");
  renderCrisisBulletList(
    dom.crisisCommandRhythm,
    [context.summary || "Choisir un regime puis saisir une consigne simple.", activeSubcategory ? `Sous-categorie active: ${activeSubcategory}` : "Aucune sous-categorie selectionnee", context.trigger ? `Declencheur: ${context.trigger}` : `Alertes tracees: ${alerts} / decisions: ${decisions} / actions avec echeance: ${dueActions}`],
    "dashboard",
    "Information",
    resolvedMode ? "Resume cellule diffuse" : "Resume cellule a diffuser",
  );
  if (dom.crisisSubcategoryList) {
    const modeLabels = ["HET", "Plan blanc"];
    dom.crisisSubcategoryList.innerHTML = modeLabels.map((modeLabel) => {
      const items = getCrisisSubcategories(modeLabel);
      const isActiveMode = modeLabel === (resolvedMode || "HET");
      const cards = items.length > 0
        ? items.map((item) => {
            const isActive = isActiveMode && item === activeSubcategory;
            return `
              <div class="commande-card${isActive ? " commande-card--active" : ""}">
                <div class="commande-card-head">
                  <strong>${escapeHtml(item)}</strong>
                  ${isActive ? '<span class="badge badge-ok">Active</span>' : ""}
                </div>
                <div class="inline-actions">
                  <button type="button" class="secondary-btn" data-crisis-subcategory-select="${escapeHtml(modeLabel)}::${escapeHtml(item)}">Activer</button>
                  <button type="button" class="secondary-btn" data-crisis-subcategory-delete="${escapeHtml(modeLabel)}::${escapeHtml(item)}">Supprimer</button>
                </div>
              </div>
            `;
          }).join("")
        : '<p class="muted-text">Aucune sous-catégorie paramétrée.</p>';
      return `<div class="crisis-param-col"><h5>${escapeHtml(modeLabel)}</h5>${cards}</div>`;
    }).join("");
  }
  if (dom.crisisConfiguredActionList) {
    const targetMode = configuredMode;
    const targetSubcategory = dom.crisisConfiguredActionSubcategorySelect instanceof HTMLSelectElement
      ? dom.crisisConfiguredActionSubcategorySelect.value
      : (configuredSubcategories[0] || "");
    if (!targetSubcategory) {
      dom.crisisConfiguredActionList.innerHTML = '<p class="muted-text">Ajoutez d\'abord une sous-catégorie à l\'étape 1.</p>';
    } else {
      dom.crisisConfiguredActionList.innerHTML = Object.entries(CRISIS_ACTION_DOMAIN_LABELS).map(([domain, label]) => {
        const items = getCrisisConfiguredActions(targetMode, targetSubcategory, domain);
        const actionCards = items.length > 0
          ? items.map((item) => `
              <div class="commande-card">
                <div class="commande-card-head">
                  <span>${escapeHtml(item)}</span>
                  <button
                    type="button"
                    class="secondary-btn"
                    data-crisis-config-action-delete
                    data-crisis-config-mode="${escapeHtml(targetMode)}"
                    data-crisis-config-subcategory="${escapeHtml(targetSubcategory)}"
                    data-crisis-config-domain="${escapeHtml(domain)}"
                    data-crisis-config-title="${escapeHtml(item)}"
                  >✕</button>
                </div>
              </div>
            `).join("")
          : '<p class="muted-text">Aucune action.</p>';
        return `
          <div class="crisis-card-shell crisis-param-domain-panel">
            <h5>${escapeHtml(label)}</h5>
            <div class="commandes-list">${actionCards}</div>
            <form
              class="crisis-param-add-action-form"
              data-crisis-param-mode="${escapeHtml(targetMode)}"
              data-crisis-param-subcategory="${escapeHtml(targetSubcategory)}"
              data-crisis-param-domain="${escapeHtml(domain)}"
            >
              <input type="text" placeholder="Nouvelle action…" />
              <button type="submit">Ajouter</button>
            </form>
          </div>
        `;
      }).join("");
    }
  }
  renderCrisisBulletList(dom.crisisAnticipationBoard, preset.anticipation, "anticipation", "Information", "Projection H+2 / H+6 partagee avec la cellule");
  renderCrisisBulletList(
    dom.crisisMitigationBoard,
    configuredActionsByDomain.anticipation.length > 0 ? configuredActionsByDomain.anticipation : preset.mitigation,
    "anticipation",
    "Decision",
    activeSubcategory ? `Actions anticipation ${activeSubcategory}` : "Mesures preparatoires validees en cellule",
  );
  renderCrisisResourceCards(dom.crisisLogisticsBoard, preset.logistics, "logistique", "Etat des ressources sensibles actualise");
  renderCrisisBulletList(
    dom.crisisLogisticsActions,
    configuredActionsByDomain.logistique.length > 0 ? configuredActionsByDomain.logistique : preset.logisticsActions,
    "logistique",
    "Action",
    activeSubcategory ? `Actions logistiques ${activeSubcategory}` : "Ordres logistiques emis par la cellule",
  );
  renderCrisisBulletList(
    dom.crisisFlowBoard,
    configuredActionsByDomain["flux-patients"].length > 0 ? configuredActionsByDomain["flux-patients"] : preset.flow,
    "flux-patients",
    "Action",
    activeSubcategory ? `Actions flux patients ${activeSubcategory}` : "Mesures de fluidification activees",
  );
  renderCrisisBulletList(dom.crisisCommunicationContacts, preset.contacts, "communication", "Information", "Destinataires prioritaires rappeles a la cellule");
  renderCrisisBulletList(
    dom.crisisCommunicationBoard,
    configuredActionsByDomain.communication.length > 0
      ? configuredActionsByDomain.communication
      : [
          context.summary,
          `Declencheur: ${context.trigger}`,
          `Actions tracees avec echeance: ${dueActions}`,
        ],
    "communication",
    configuredActionsByDomain.communication.length > 0 ? "Action" : "Information",
    activeSubcategory ? `Actions communication ${activeSubcategory}` : "Message de situation diffuse aux interlocuteurs prioritaires",
  );

  if (dom.crisisActionOwner instanceof HTMLInputElement && !dom.crisisActionOwner.value && currentUser?.full_name) {
    dom.crisisActionOwner.value = currentUser.full_name;
  }
}

function upsertCrisisAction(actionInput) {
  const actions = getCrisisActions();
  actions.unshift(createCrisisAction(actionInput));
  saveState();
  renderCrisisModule();
}

function submitCrisisQuickAction(entryType = "Information") {
  const title = dom.crisisActionTitle instanceof HTMLInputElement ? dom.crisisActionTitle.value.trim() : "";
  if (!title) return;
  upsertCrisisAction({
    functionKey: dom.crisisActionFunction instanceof HTMLSelectElement ? dom.crisisActionFunction.value : "main-courante",
    title,
    owner: dom.crisisActionOwner instanceof HTMLInputElement
      ? dom.crisisActionOwner.value.trim()
      : (currentUser?.full_name || ""),
    dueAt: dom.crisisActionDueAt instanceof HTMLInputElement ? dom.crisisActionDueAt.value : "",
    notes: dom.crisisActionNotes instanceof HTMLTextAreaElement ? dom.crisisActionNotes.value.trim() : "",
    entryType,
  });
  if (dom.crisisActionTitle instanceof HTMLInputElement) {
    dom.crisisActionTitle.value = "";
    dom.crisisActionTitle.focus();
  }
}

function renderCrisisActionFeed() {
  const actions = [...getCrisisActions()].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });

  if (dom.crisisActionCount) {
    dom.crisisActionCount.textContent = String(actions.length);
  }
  if (dom.crisisActionPlannedCount) {
    dom.crisisActionPlannedCount.textContent = String(actions.filter((action) => action.entryType === "Decision").length);
  }
  if (dom.crisisActionDoneCount) {
    dom.crisisActionDoneCount.textContent = String(actions.filter((action) => action.entryType === "Alerte").length);
  }

  if (!dom.crisisActionList) return;
  dom.crisisActionList.innerHTML = "";

  if (actions.length === 0) {
    dom.crisisActionList.innerHTML = '<p class="muted-text">Aucune action crise enregistree pour le moment.</p>';
    return;
  }

  actions.forEach((action) => {
    const item = document.createElement("article");
    const tone = action.entryType === "Alerte"
      ? "is-alert"
      : action.entryType === "Decision"
        ? "is-decision"
        : action.entryType === "Action"
          ? "is-action"
          : "is-info";
    item.className = `crisis-timeline-item crisis-timeline-item--compact ${tone}`;
    const effectiveDate = action.dueAt || action.updatedAt || action.createdAt;
    const timeLabel = effectiveDate ? new Date(effectiveDate).toLocaleString("fr-FR") : "Sans echeance";
    item.innerHTML = `
      <strong>${escapeHtml(formatCrisisFunction(action.functionKey))}</strong>
      <div>
        <h4>${escapeHtml(action.title)}</h4>
        <p class="muted-text"><span class="crisis-entry-badge">${escapeHtml(action.entryType)}</span>${action.owner ? ` · ${escapeHtml(action.owner)}` : ""} · ${escapeHtml(timeLabel)}</p>
        ${action.notes ? `<p class="muted-text crisis-timeline-note">${escapeHtml(action.notes)}</p>` : ""}
        <div class="inline-actions crisis-action-row">
          <button type="button" class="secondary-btn" data-crisis-action-delete-id="${action.id}">Supprimer</button>
        </div>
      </div>
    `;
    dom.crisisActionList.appendChild(item);
  });
}

function renderCrisisModule() {
  if (!dom.crisisScreen || !dom.crisisNav) return;

  const eventCreated = isCrisisEventCreated();
  if (!eventCreated) {
    activeCrisisView = "creation-evenement";
  } else if (activeCrisisView === "creation-evenement") {
    activeCrisisView = "dashboard";
  }

  dom.crisisNav.querySelectorAll("button[data-crisis-view]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-crisis-view") === activeCrisisView);
  });

  dom.crisisNav.classList.toggle("is-hidden", !eventCreated);

  dom.crisisScreen.querySelectorAll("[data-crisis-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.getAttribute("data-crisis-view-panel") === activeCrisisView);
  });

  if (dom.crisisSidebar) {
    dom.crisisSidebar.classList.toggle("is-collapsed", crisisSidebarCollapsed);
  }

  if (dom.crisisWorkspace) {
    dom.crisisWorkspace.classList.toggle("is-sidebar-collapsed", crisisSidebarCollapsed);
  }

  if (dom.crisisSidebarToggle) {
    dom.crisisSidebarToggle.setAttribute("aria-expanded", crisisSidebarCollapsed ? "false" : "true");
    dom.crisisSidebarToggle.textContent = crisisSidebarCollapsed ? "Menu" : "Reduire";
  }

  renderCrisisEventCreation();

  renderCrisisOperationalBoards();
  renderCrisisActionFeed();
}

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

  const commands = Array.isArray(state.commands) ? state.commands : [];
  const todayKey = state.day?.date || new Date().toISOString().slice(0, 10);
  const dailyCommands = commands.filter((entry) => toLocalDateKey(entry.plannedAt) === todayKey);
  const plannedDone = dailyCommands.filter((entry) => entry.status === "Terminee").length;
  const planningPct = dailyCommands.length > 0 ? Math.round((plannedDone / dailyCommands.length) * 100) : 0;

  const verif = computeChecklistGlobalProgress();
  const dayItems = Array.isArray(state.day.items) ? state.day.items : [];
  const dayItemsDone = dayItems.filter((item) => item.done).length;
  const dayItemsPct = dayItems.length > 0 ? Math.round((dayItemsDone / dayItems.length) * 100) : 0;

  dom.dashboardSummary.innerHTML = `
    <div class="dashboard-kpi-card">
      <h4>Commandes du jour</h4>
      <p class="dashboard-kpi-value">${plannedDone} / ${dailyCommands.length}</p>
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

  if (dom.dashboardCommands) {
    dom.dashboardCommands.innerHTML = "";
    if (dailyCommands.length === 0) {
      dom.dashboardCommands.innerHTML = '<p class="muted-text">Aucune commande prevue pour ce jour.</p>';
    } else {
      dailyCommands
        .sort((left, right) => getLocalDateTimeMs(left.plannedAt) - getLocalDateTimeMs(right.plannedAt))
        .forEach((entry) => {
          const card = document.createElement("div");
          card.className = "commande-card";
          card.innerHTML = `
            <div class="commande-card-head">
              <strong>${escapeHtml(entry.title || "Commande")}</strong>
              <span class="badge ${entry.status === "Terminee" ? "badge-ok" : "badge-pending"}">${escapeHtml(entry.status)}</span>
            </div>
            <div class="commande-card-meta">
              <small>${escapeHtml(formatLocalDateTime(entry.plannedAt))}</small>
              <small>${escapeHtml(entry.assignee || "Sans referent")}</small>
              <small>${escapeHtml(entry.category || "Sans categorie")}</small>
            </div>
          `;
          dom.dashboardCommands.appendChild(card);
        });
    }
  }

  if (dom.verificationsPlannedList) {
    const planned = state.planning.filter((entry) => entry.sectorId);
    const sectors = state.templates.sectors.filter((sector) => planned.some((cmd) => cmd.sectorId === sector.id));
    dom.verificationsPlannedList.innerHTML = "";
    if (sectors.length === 0) {
      dom.verificationsPlannedList.innerHTML = '<p class="muted-text">Aucune verification journaliere prevue.</p>';
    } else {
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
  }

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

function addRecurrenceDate(plannedAt, recurrenceType, recurrenceEvery) {
  const normalizedRecurrenceType = normalizeRecurrenceType(recurrenceType);
  if (!plannedAt || normalizedRecurrenceType === "Aucune") return "";
  const base = parseLocalDateTime(plannedAt);
  if (!base) return "";
  const next = new Date(base);
  const step = Math.max(1, Number(recurrenceEvery) || 1);
  if (normalizedRecurrenceType === "Quotidienne") {
    next.setDate(next.getDate() + step);
  } else if (normalizedRecurrenceType === "Hebdomadaire") {
    next.setDate(next.getDate() + (step * 7));
  } else if (normalizedRecurrenceType === "Mensuelle") {
    next.setMonth(next.getMonth() + step);
  }
  return toDatetimeLocalValue(next);
}

function startOfWeekMonday(dateValue) {
  const date = parseLocalDateTime(dateValue);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function addWeeklyRecurrenceDate(plannedAt, recurrenceEvery, recurrenceWeekdays) {
  if (!plannedAt) return "";
  const base = parseLocalDateTime(plannedAt);
  if (!base) return "";

  const weekdays = Array.isArray(recurrenceWeekdays)
    ? [...new Set(recurrenceWeekdays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [];

  if (weekdays.length === 0) {
    return addRecurrenceDate(plannedAt, "Hebdomadaire", recurrenceEvery);
  }

  const stepWeeks = Math.max(1, Number(recurrenceEvery) || 1);
  const baseWeek = startOfWeekMonday(base);
  if (!baseWeek) return "";
  const maxDays = 370;

  for (let offset = 1; offset <= maxDays; offset += 1) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + offset);
    const day = candidate.getDay();
    if (!weekdays.includes(day)) continue;

    const candidateWeek = startOfWeekMonday(candidate);
    if (!candidateWeek) continue;
    const weekDiff = Math.floor((candidateWeek.getTime() - baseWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weekDiff % stepWeeks !== 0) continue;

    return toDatetimeLocalValue(candidate);
  }

  return addRecurrenceDate(plannedAt, "Hebdomadaire", recurrenceEvery);
}

function getSelectedCommandWeekdays() {
  if (!dom.commandRecurrenceWeekdays) return [];
  return Array.from(dom.commandRecurrenceWeekdays.querySelectorAll('input[type="checkbox"]'))
    .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
    .map((checkbox) => Number(checkbox.value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

function resetCommandWeekdaysSelection() {
  if (!dom.commandRecurrenceWeekdays) return;
  dom.commandRecurrenceWeekdays.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = false;
    }
  });
}

function updateCommandRecurrenceFields() {
  if (!(dom.commandRecurrenceType instanceof HTMLSelectElement) || !dom.commandRecurrenceWeekdays) return;
  const isWeekly = normalizeRecurrenceType(dom.commandRecurrenceType.value) === "Hebdomadaire";
  dom.commandRecurrenceWeekdays.classList.toggle("is-hidden", !isWeekly);
}

function formatRecurrenceText(entry) {
  const recurrenceType = normalizeRecurrenceType(entry.recurrenceType);
  const step = Number(entry.recurrenceEvery) || 1;
  if (recurrenceType !== "Hebdomadaire") {
    return `${recurrenceType} / pas ${step}${entry.recurrenceInfinite ? " / infini" : ""}`;
  }

  const weekdays = Array.isArray(entry.recurrenceWeekdays) ? entry.recurrenceWeekdays : [];
  const daysLabel = weekdays.length > 0
    ? weekdays.map((day) => WEEKDAY_LABELS[day]).filter(Boolean).join(", ")
    : "jour initial";
  return `Hebdomadaire / pas ${step} / ${daysLabel}${entry.recurrenceInfinite ? " / infini" : ""}`;
}

function parseLocalDateTime(dateValue) {
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : new Date(dateValue);
  }
  if (typeof dateValue !== "string") return null;
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateTimeMs(dateValue) {
  const parsed = parseLocalDateTime(dateValue);
  return parsed ? parsed.getTime() : Number.NaN;
}

function formatLocalDateTime(dateValue) {
  const parsed = parseLocalDateTime(dateValue);
  return parsed ? parsed.toLocaleString("fr-FR") : "Sans horaire";
}

function toLocalDateKey(dateValue) {
  const date = parseLocalDateTime(dateValue);
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCommandRecurrenceHorizon(anchorDate = new Date()) {
  const base = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? anchorDate
    : new Date();
  return new Date(base.getFullYear(), base.getMonth() + 3, 0, 23, 59, 59, 999);
}

function getNextRecurringPlannedAt(command) {
  const recurrenceType = normalizeRecurrenceType(command?.recurrenceType);
  if (!command?.plannedAt || recurrenceType === "Aucune") return "";
  if (recurrenceType === "Hebdomadaire") {
    return addWeeklyRecurrenceDate(command.plannedAt, command.recurrenceEvery, command.recurrenceWeekdays);
  }
  return addRecurrenceDate(command.plannedAt, recurrenceType, command.recurrenceEvery);
}

function getCommandDebugTarget() {
  const recurringCommands = (state.commands || []).filter((entry) => entry.recurrenceType !== "Aucune");
  if (commandDebugTargetId) {
    const direct = recurringCommands.find((entry) => entry.id === commandDebugTargetId);
    if (direct) return direct;
  }
  return recurringCommands[0] || null;
}

function getCommandSeriesList() {
  const seriesMap = new Map();
  (state.commands || []).forEach((entry) => {
    const seriesId = entry.seriesId || entry.id;
    const current = seriesMap.get(seriesId) || { seriesId, occurrences: [] };
    current.occurrences.push(entry);
    seriesMap.set(seriesId, current);
  });

  return [...seriesMap.values()]
    .map((series) => {
      const occurrences = [...series.occurrences].sort((a, b) => getLocalDateTimeMs(a.plannedAt) - getLocalDateTimeMs(b.plannedAt));
      const root = occurrences[0] || null;
      const nextOccurrence = occurrences.find((entry) => entry.status !== "Terminee") || occurrences[occurrences.length - 1] || null;
      const completedCount = occurrences.filter((entry) => entry.status === "Terminee").length;
      return {
        seriesId: series.seriesId,
        root,
        occurrences,
        nextOccurrence,
        completedCount,
        pendingCount: Math.max(0, occurrences.length - completedCount),
      };
    })
    .sort((a, b) => getLocalDateTimeMs(a.nextOccurrence?.plannedAt) - getLocalDateTimeMs(b.nextOccurrence?.plannedAt));
}

function ensureActiveCommandSeries(seriesList) {
  const allSeries = Array.isArray(seriesList) ? seriesList : getCommandSeriesList();
  if (allSeries.length === 0) {
    activeCommandSeriesId = "";
    return null;
  }
  const selected = allSeries.find((series) => series.seriesId === activeCommandSeriesId) || allSeries[0];
  activeCommandSeriesId = selected.seriesId;
  return selected;
}

function updateCommandSeries(seriesId, updater) {
  let changed = false;
  state.commands = (state.commands || []).map((entry) => {
    if (entry.seriesId !== seriesId) return entry;
    const nextEntry = updater({ ...entry });
    if (nextEntry !== entry) {
      changed = true;
    }
    return nextEntry;
  });
  return changed;
}

function renderCommandDebugPanel() {
  if (!dom.commandDebugContent) return;

  const target = getCommandDebugTarget();
  if (!target) {
    dom.commandDebugContent.innerHTML = "Aucune commande recurrente a diagnostiquer.";
    return;
  }

  const series = [...(state.commands || [])]
    .filter((entry) => entry.seriesId === target.seriesId)
    .sort((a, b) => getLocalDateTimeMs(a.plannedAt) - getLocalDateTimeMs(b.plannedAt));
  const nextPlannedAt = getNextRecurringPlannedAt(target);
  const sameDayDuplicates = series.filter((entry) => entry.id !== target.id && entry.plannedAt === target.plannedAt);
  const sameNextDuplicates = nextPlannedAt
    ? series.filter((entry) => entry.id !== target.id && entry.plannedAt === nextPlannedAt)
    : [];

  const seriesHtml = series.length > 0
    ? `<ul>${series.map((entry) => `<li>${escapeHtml(formatLocalDateTime(entry.plannedAt))} - ${escapeHtml(entry.status)} - iteration ${Number(entry.iteration || 1)}</li>`).join("")}</ul>`
    : "<p class=\"muted-text\">Aucune occurrence dans cette serie.</p>";

  dom.commandDebugContent.innerHTML = `
    <p><strong>Commande:</strong> ${escapeHtml(target.title || "Commande sans titre")}</p>
    <p><strong>Date source:</strong> ${escapeHtml(formatLocalDateTime(target.plannedAt))}</p>
    <p><strong>Recurrence:</strong> ${escapeHtml(formatRecurrenceText(target))}</p>
    <p><strong>Prochaine date calculee:</strong> ${escapeHtml(nextPlannedAt ? formatLocalDateTime(nextPlannedAt) : "Aucune")}</p>
    <p><strong>Doublons meme jour source:</strong> ${sameDayDuplicates.length}</p>
    <p><strong>Doublons sur prochaine date:</strong> ${sameNextDuplicates.length}</p>
    <p><strong>Occurrences de la serie:</strong> ${series.length}</p>
    ${seriesHtml}
  `;
}

function ensureRecurringCommandInstances(untilDate = getCommandRecurrenceHorizon(commandAgendaAnchor)) {
  if (!Array.isArray(state.commands) || !(untilDate instanceof Date) || Number.isNaN(untilDate.getTime())) {
    return false;
  }

  let createdAny = false;
  const untilTs = untilDate.getTime();
  const activeSeries = new Set(
    state.commands
      .filter((entry) => entry?.recurrenceInfinite && entry?.recurrenceType !== "Aucune" && entry?.plannedAt)
      .map((entry) => entry.seriesId),
  );

  activeSeries.forEach((seriesId) => {
    let guard = 0;
    let seriesItems = state.commands
      .filter((entry) => entry.seriesId === seriesId && entry.plannedAt)
      .sort((a, b) => getLocalDateTimeMs(a.plannedAt) - getLocalDateTimeMs(b.plannedAt));
    if (seriesItems.length === 0) return;

    let cursor = seriesItems[seriesItems.length - 1];

    while (guard < 1000) {
      guard += 1;

      const cursorTs = getLocalDateTimeMs(cursor.plannedAt);
      if (!Number.isFinite(cursorTs) || cursorTs >= untilTs) break;
      if (!cursor.recurrenceInfinite || cursor.recurrenceType === "Aucune") break;

      const nextPlannedAt = getNextRecurringPlannedAt(cursor);
      if (!nextPlannedAt || nextPlannedAt === cursor.plannedAt) break;

      const nextTs = getLocalDateTimeMs(nextPlannedAt);
      if (!Number.isFinite(nextTs) || nextTs > untilTs) break;

      const existing = state.commands.find((entry) => (
        entry.seriesId === seriesId
        && entry.plannedAt === nextPlannedAt
      ));
      if (existing) {
        cursor = existing;
        continue;
      }

      const created = createCommandItem({
        seriesId: cursor.seriesId,
        iteration: Math.max(1, Number(cursor.iteration || 1)) + 1,
        title: cursor.title,
        category: cursor.category,
        assignee: cursor.assignee,
        plannedAt: nextPlannedAt,
        priority: cursor.priority,
        status: "A realiser",
        recurrenceType: cursor.recurrenceType,
        recurrenceEvery: cursor.recurrenceEvery,
        recurrenceWeekdays: cursor.recurrenceWeekdays,
        recurrenceInfinite: cursor.recurrenceInfinite,
        notes: cursor.notes,
      });
      state.commands.push(created);
      createdAny = true;
      cursor = created;
    }
  });

  return createdAny;
}

function buildAgendaEvents(source, rangeStart, rangeEnd) {
  const entries = Array.isArray(source) ? source : [];
  const events = [];
  const projectedKeys = new Set();
  const concreteSeriesDates = new Set(
    entries
      .filter((entry) => entry?.plannedAt)
      .map((entry) => `${entry.seriesId || entry.id}::${entry.plannedAt}`),
  );

  entries.forEach((entry) => {
    if (!entry?.plannedAt) return;
    const planned = parseLocalDateTime(entry.plannedAt);
    if (!planned) return;

    if (planned >= rangeStart && planned <= rangeEnd) {
      events.push(entry);
    }

    const canProject = entry.recurrenceInfinite && entry.recurrenceType !== "Aucune";
    if (!canProject) return;

    let cursor = entry.plannedAt;
    for (let guard = 0; guard < 600; guard += 1) {
      const next = entry.recurrenceType === "Hebdomadaire"
        ? addWeeklyRecurrenceDate(cursor, entry.recurrenceEvery, entry.recurrenceWeekdays)
        : addRecurrenceDate(cursor, entry.recurrenceType, entry.recurrenceEvery);
      if (!next || next === cursor) break;

      const nextDate = parseLocalDateTime(next);
      if (!nextDate) break;
      if (nextDate > rangeEnd) break;

      if (nextDate >= rangeStart) {
        const recurrenceKey = `${entry.seriesId || entry.id}::${next}`;
        if (!concreteSeriesDates.has(recurrenceKey) && !projectedKeys.has(recurrenceKey)) {
          events.push({
            ...entry,
            id: `${entry.id}::proj::${next}`,
            plannedAt: next,
            status: "A realiser",
            validatedAt: "",
            _projected: true,
          });
          projectedKeys.add(recurrenceKey);
        }
      }

      cursor = next;
    }
  });

  return events;
}

function renderCommandAgenda(commands) {
  if (!dom.commandAgendaGrid || !dom.commandAgendaEvents || !dom.commandAgendaMonthLabel) return;
  const source = Array.isArray(commands) ? commands : [];

  const year = commandAgendaAnchor.getFullYear();
  const month = commandAgendaAnchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, lastDay.getDate(), 23, 59, 59, 999);
  const monthStartShift = (firstDay.getDay() + 6) % 7; // lundi=0
  const agendaEvents = buildAgendaEvents(source, monthStart, monthEnd);

  dom.commandAgendaMonthLabel.textContent = firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const eventsByDay = new Map();
  agendaEvents.forEach((entry) => {
    if (!entry?.plannedAt) return;
    const key = toLocalDateKey(entry.plannedAt);
    if (!key) return;
    const bucket = eventsByDay.get(key) || [];
    bucket.push(entry);
    eventsByDay.set(key, bucket);
  });

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const firstEventDayKey = [...eventsByDay.keys()].sort()[0] || "";
  const selectedInMonth = commandAgendaSelectedDayKey && commandAgendaSelectedDayKey.startsWith(monthPrefix)
    ? commandAgendaSelectedDayKey
    : "";
  if (!selectedInMonth) {
    commandAgendaSelectedDayKey = firstEventDayKey || toLocalDateKey(new Date(year, month, 1));
  } else if (!eventsByDay.has(commandAgendaSelectedDayKey) && firstEventDayKey) {
    commandAgendaSelectedDayKey = firstEventDayKey;
  }

  const weekLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  dom.commandAgendaGrid.innerHTML = weekLabels
    .map((label) => `<div class="command-agenda-weekday">${label}</div>`)
    .join("");

  const cells = 42;
  for (let i = 0; i < cells; i += 1) {
    const dayNumber = i - monthStartShift + 1;
    const inMonth = dayNumber >= 1 && dayNumber <= lastDay.getDate();
    const date = new Date(year, month, dayNumber);
    const key = toLocalDateKey(date);
    const dayEvents = inMonth ? (eventsByDay.get(key) || []) : [];
    const done = dayEvents.filter((e) => e.status === "Terminee").length;
    const pending = dayEvents.filter((e) => e.status !== "Terminee").length;
    const isSelected = key === commandAgendaSelectedDayKey;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `command-agenda-day ${inMonth ? "" : "is-out"} ${isSelected ? "is-selected" : ""}`.trim();
    cell.setAttribute("data-agenda-day-key", key);
    cell.disabled = !inMonth;
    cell.innerHTML = `
      <span class="command-agenda-daynum">${inMonth ? dayNumber : ""}</span>
      ${inMonth ? `<small>${dayEvents.length} cmd</small>` : ""}
      ${inMonth && dayEvents.length > 0 ? `<div class="command-agenda-markers"><span class="ok">${done}</span><span class="pending">${pending}</span></div>` : ""}
    `;
    dom.commandAgendaGrid.appendChild(cell);
  }

  const selectedEvents = eventsByDay.get(commandAgendaSelectedDayKey) || [];
  if (selectedEvents.length === 0) {
    const selectedDateLabel = commandAgendaSelectedDayKey
      ? commandAgendaSelectedDayKey.split("-").reverse().join("/")
      : "ce jour";
    dom.commandAgendaEvents.innerHTML = `<p class="muted-text">Aucune commande planifiee le ${escapeHtml(selectedDateLabel)}.</p>`;
    return;
  }

  dom.commandAgendaEvents.innerHTML = selectedEvents
    .sort((a, b) => getLocalDateTimeMs(a.plannedAt) - getLocalDateTimeMs(b.plannedAt))
    .map((entry) => {
      const at = formatLocalDateTime(entry.plannedAt);
      return `
        <div class="command-agenda-event-item">
          <strong>${escapeHtml(entry.title || "Commande")}</strong>
          <small>${escapeHtml(at)}</small>
          ${entry._projected ? '<small class="muted-text">Occurrence projetee</small>' : ""}
          <span class="badge ${entry.status === "Terminee" ? "badge-ok" : "badge-pending"}">${escapeHtml(entry.status)}</span>
        </div>
      `;
    })
    .join("");
}

function toDatetimeLocalValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function setCommandDueOffset(hours) {
  if (!(dom.commandPlannedAt instanceof HTMLInputElement)) return;
  const base = new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + Math.max(0, Number(hours) || 0));
  dom.commandPlannedAt.value = toDatetimeLocalValue(base);
}

function setCommandDueTomorrowMorning() {
  if (!(dom.commandPlannedAt instanceof HTMLInputElement)) return;
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  dom.commandPlannedAt.value = toDatetimeLocalValue(next);
}

function hasSavedSignature() {
  return Boolean(state.signature?.signerName?.trim() && state.signature?.imageData);
}

function getPendingCommandValidation() {
  if (!pendingCommandValidationId) return null;
  return (state.commands || []).find((entry) => entry.id === pendingCommandValidationId) || null;
}

function renderCommandValidationPanel() {
  if (!dom.commandValidationPanel || !dom.commandValidationTarget) return;
  const command = getPendingCommandValidation();
  const isOpen = Boolean(command);
  dom.commandValidationPanel.classList.toggle("is-hidden", !isOpen);
  if (!isOpen) {
    dom.commandValidationTarget.textContent = "Aucune commande selectionnee.";
    return;
  }

  dom.commandValidationTarget.textContent = `Validation en cours: ${command.title || "Commande sans titre"}`;
}

function openCommandValidation(commandId) {
  pendingCommandValidationId = commandId || "";
  renderCommandValidationPanel();
  window.dispatchEvent(new Event("resize"));
}

function closeCommandValidation() {
  pendingCommandValidationId = "";
  renderCommandValidationPanel();
}

function validateCommand(command) {
  if (!command || !hasSavedSignature()) {
    window.alert("Ajoutez une signature dans le Suivi des commandes avant validation.");
    return false;
  }
  const validatedAt = new Date().toISOString();
  command.status = "Terminee";
  command.validatedAt = validatedAt;
  command.validationSignature = {
    signerName: state.signature.signerName,
    signerRole: state.signature.signerRole,
    imageData: state.signature.imageData,
    signedAt: validatedAt,
  };
  command.updatedAt = validatedAt;
  ensureNextRecurringCommand(command);
  commandDebugTargetId = command.id;
  return true;
}

function ensureNextRecurringCommand(command) {
  if (!command || command.recurrenceType === "Aucune" || !command.recurrenceInfinite) return;
  if (command.status !== "Terminee") return;
  const nextIteration = Number(command.iteration || 1) + 1;
  const currentPlannedAt = command.plannedAt ? getLocalDateTimeMs(command.plannedAt) : 0;
  const alreadyExists = (state.commands || []).some((entry) => {
    if (entry.id === command.id || entry.seriesId !== command.seriesId) return false;
    const entryIteration = Number(entry.iteration || 1);
    const entryPlannedAt = entry.plannedAt ? getLocalDateTimeMs(entry.plannedAt) : 0;
    return entryIteration >= nextIteration || entryPlannedAt > currentPlannedAt || !entry.validatedAt;
  });
  if (alreadyExists) return;
  const nextPlannedAt = command.recurrenceType === "Hebdomadaire"
    ? addWeeklyRecurrenceDate(command.plannedAt, command.recurrenceEvery, command.recurrenceWeekdays)
    : addRecurrenceDate(command.plannedAt, command.recurrenceType, command.recurrenceEvery);
  state.commands.push(createCommandItem({
    seriesId: command.seriesId,
    iteration: nextIteration,
    title: command.title,
    category: command.category,
    assignee: command.assignee,
    plannedAt: nextPlannedAt,
    priority: command.priority,
    status: "A realiser",
    recurrenceType: command.recurrenceType,
    recurrenceEvery: command.recurrenceEvery,
    recurrenceWeekdays: command.recurrenceWeekdays,
    recurrenceInfinite: command.recurrenceInfinite,
    notes: command.notes,
  }));
}

function renderCommandesPanel() {
  if (!dom.commandsPlannedList) return;
  if (!Array.isArray(state.commands)) state.commands = [];

  const generated = ensureRecurringCommandInstances(getCommandRecurrenceHorizon(commandAgendaAnchor));
  if (generated) {
    saveState();
  }

  if (!dom.commandSubTabs || !dom.commandPlanningPanel || !dom.commandValidationDayPanel || !dom.commandOccurrencesPanel) return;

  dom.commandSubTabs.querySelectorAll("button[data-command-tab]").forEach((button) => {
    const tab = button.getAttribute("data-command-tab");
    button.classList.toggle("active", tab === activeCommandTab);
  });
  dom.commandPlanningPanel.classList.toggle("is-hidden", activeCommandTab !== "planning");
  dom.commandValidationDayPanel.classList.toggle("is-hidden", activeCommandTab !== "validation");
  dom.commandOccurrencesPanel.classList.toggle("is-hidden", activeCommandTab !== "occurrences");
  renderCommandValidationPanel();

  const filterStatus = dom.commandFilterStatus instanceof HTMLSelectElement ? dom.commandFilterStatus.value : "all";
  const search = dom.commandSearch instanceof HTMLInputElement ? dom.commandSearch.value.trim().toLowerCase() : "";

  const allSeries = getCommandSeriesList();
  const filteredSeries = allSeries
    .filter((series) => filterStatus === "all" || (series.nextOccurrence && series.nextOccurrence.status === filterStatus))
    .filter((series) => {
      const entry = series.root || series.nextOccurrence;
      if (!entry) return false;
      if (!search) return true;
      return [entry.title, entry.category, entry.assignee, entry.notes].join(" ").toLowerCase().includes(search);
    });
  const activeSeries = ensureActiveCommandSeries(filteredSeries.length > 0 ? filteredSeries : allSeries);
  const todayKey = toLocalDateKey(new Date());
  const dayOccurrences = [...(state.commands || [])]
    .filter((entry) => toLocalDateKey(entry.plannedAt) === todayKey)
    .sort((a, b) => getLocalDateTimeMs(a.plannedAt) - getLocalDateTimeMs(b.plannedAt));
  const dayPending = dayOccurrences.filter((entry) => entry.status !== "Terminee");
  const dayDone = dayOccurrences.filter((entry) => entry.status === "Terminee");

  dom.commandsPlannedList.innerHTML = "";
  if (filteredSeries.length === 0) {
    dom.commandsPlannedList.innerHTML = '<p class="muted-text">Aucune commande pour ce filtre.</p>';
  } else {
    filteredSeries.forEach((series) => {
      const entry = series.root || series.nextOccurrence;
      if (!entry) return;
      const card = document.createElement("div");
      card.className = "commande-card";
      card.setAttribute("data-command-debug-id", entry.id);
      card.setAttribute("data-command-series-id", series.seriesId);
      const dueText = series.nextOccurrence?.plannedAt ? formatLocalDateTime(series.nextOccurrence.plannedAt) : "Non planifiee";
      card.innerHTML = `
        <div class="commande-card-head">
          <strong>${escapeHtml(entry.title || "Commande sans titre")}</strong>
          <span class="badge ${series.pendingCount === 0 ? "badge-ok" : "badge-pending"}">${series.pendingCount === 0 ? "Terminee" : "A realiser"}</span>
        </div>
        <div class="commande-card-meta">
          <small>Prochaine echeance: ${escapeHtml(dueText)}</small>
          <small>Priorite: ${escapeHtml(entry.priority || "Normale")}</small>
          ${entry.category ? `<small>Categorie: ${escapeHtml(entry.category)}</small>` : ""}
          ${entry.assignee ? `<small>Responsable: ${escapeHtml(entry.assignee)}</small>` : ""}
          <small>Recurrence: ${escapeHtml(formatRecurrenceText(entry))}</small>
          <small>Occurrences: ${series.occurrences.length} (${series.completedCount} terminee(s))</small>
        </div>
        <div class="grid-form">
          <label>
            Prochaine date
            <input type="datetime-local" value="${escapeHtml(series.nextOccurrence?.plannedAt || entry.plannedAt || "")}" data-command-series-id="${series.seriesId}" data-command-series-field="plannedAt" />
          </label>
          <label>
            Recurrence
            <select data-command-series-id="${series.seriesId}" data-command-series-field="recurrenceType">
              ${["Aucune", "Quotidienne", "Hebdomadaire", "Mensuelle"].map((option) => `<option value="${option}" ${entry.recurrenceType === option ? "selected" : ""}>${option}</option>`).join("")}
            </select>
          </label>
          <label>
            Pas recurrence
            <input type="number" min="1" step="1" value="${Number(entry.recurrenceEvery) || 1}" data-command-series-id="${series.seriesId}" data-command-series-field="recurrenceEvery" />
          </label>
          <label>
            Infini
            <input type="checkbox" ${entry.recurrenceInfinite ? "checked" : ""} data-command-series-id="${series.seriesId}" data-command-series-field="recurrenceInfinite" />
          </label>
        </div>
        <div class="inline-actions">
          <button type="button" class="secondary-btn" data-open-command-series-id="${series.seriesId}">Ouvrir le suivi</button>
          <button type="button" class="secondary-btn" data-duplicate-command-series-id="${series.seriesId}">Dupliquer</button>
          <button type="button" class="secondary-btn" data-delete-command-series-id="${series.seriesId}">Supprimer</button>
        </div>
        <label>
          Notes
          <textarea rows="2" data-command-series-id="${series.seriesId}" data-command-series-field="notes">${escapeHtml(entry.notes || "")}</textarea>
        </label>
      `;
      dom.commandsPlannedList.appendChild(card);
    });
  }

  renderCommandAgenda(filteredSeries.flatMap((series) => series.occurrences));

  if (dom.commandsValidationSummary) {
    const total = dayOccurrences.length;
    const terminees = dayDone.length;
    const pending = dayPending.length;
    const completionPct = total > 0 ? Math.round((terminees / total) * 100) : 0;
    dom.commandsValidationSummary.innerHTML = `
      <div class="dashboard-kpi-card">
        <h4>Date</h4>
        <p class="dashboard-kpi-value">${escapeHtml(todayKey.split("-").reverse().join("/"))}</p>
        <small>Jour de validation</small>
      </div>
      <div class="dashboard-kpi-card">
        <h4>A valider</h4>
        <p class="dashboard-kpi-value">${pending}</p>
        <small>Commandes du jour</small>
      </div>
      <div class="dashboard-kpi-card">
        <h4>Validees</h4>
        <p class="dashboard-kpi-value">${terminees}</p>
        <div class="dashboard-kpi-bar"><span style="width:${completionPct}%"></span></div>
        <small>${completionPct}% du jour</small>
      </div>
    `;
  }

  if (dom.commandsValidationList) {
    dom.commandsValidationList.innerHTML = "";
    if (dayOccurrences.length === 0) {
      dom.commandsValidationList.innerHTML = '<p class="muted-text">Aucune commande prevue aujourd\'hui.</p>';
    } else {
      dayOccurrences.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "commande-card";
        const canValidate = !entry.validatedAt;
        card.innerHTML = `
          <div class="commande-card-head">
            <strong>${escapeHtml(entry.title || "Commande sans titre")}</strong>
            <span class="badge ${entry.status === "Terminee" ? "badge-ok" : "badge-pending"}">${escapeHtml(entry.status)}</span>
          </div>
          <div class="commande-card-meta">
            <small>Echeance: ${escapeHtml(entry.plannedAt ? formatLocalDateTime(entry.plannedAt) : "Non planifiee")}</small>
            ${entry.assignee ? `<small>Responsable: ${escapeHtml(entry.assignee)}</small>` : ""}
            ${entry.category ? `<small>Categorie: ${escapeHtml(entry.category)}</small>` : ""}
          </div>
          <div class="inline-actions command-tracking-actions">
            ${canValidate
              ? `<button type="button" data-open-command-validation-id="${entry.id}">Validation</button>`
              : `<button type="button" class="secondary-btn" disabled>Validation OK</button>`}
            <button type="button" class="secondary-btn" data-open-command-series-id="${entry.seriesId}">Voir les occurrences</button>
          </div>
        `;
        dom.commandsValidationList.appendChild(card);
      });
    }
  }

  if (dom.commandsValidationHistory) {
    dom.commandsValidationHistory.innerHTML = "";
    if (dayDone.length === 0) {
      dom.commandsValidationHistory.innerHTML = '<p class="muted-text">Aucune commande validee aujourd\'hui.</p>';
    } else {
      dayDone.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "commande-card";
        const validatedText = entry.validatedAt ? new Date(entry.validatedAt).toLocaleString("fr-FR") : "";
        card.innerHTML = `
          <div class="commande-card-head">
            <strong>${escapeHtml(entry.title || "Commande sans titre")}</strong>
            <span class="badge badge-ok">Terminee</span>
          </div>
          <div class="commande-card-meta">
            <small>Validee le ${escapeHtml(validatedText)}</small>
            ${entry.validationSignature?.signerName ? `<small>Signature: ${escapeHtml(entry.validationSignature.signerName)}</small>` : ""}
          </div>
        `;
        dom.commandsValidationHistory.appendChild(card);
      });
    }
  }

  if (dom.commandsTrackingSummary) {
    const total = allSeries.length;
    const aRealiser = allSeries.filter((series) => series.pendingCount > 0).length;
    const terminees = allSeries.filter((series) => series.pendingCount === 0).length;
    const completionPct = total > 0 ? Math.round((terminees / total) * 100) : 0;

    dom.commandsTrackingSummary.innerHTML = `
      <div class="dashboard-kpi-card">
        <h4>Total commandes</h4>
        <p class="dashboard-kpi-value">${total}</p>
        <small>Enregistrees</small>
      </div>
      <div class="dashboard-kpi-card">
        <h4>A realiser</h4>
        <p class="dashboard-kpi-value">${aRealiser}</p>
        <small>En attente</small>
      </div>
      <div class="dashboard-kpi-card">
        <h4>Terminees</h4>
        <p class="dashboard-kpi-value">${terminees}</p>
        <div class="dashboard-kpi-bar"><span style="width:${completionPct}%"></span></div>
        <small>${completionPct}% du total</small>
      </div>
    `;
  }

  if (dom.commandSeriesTabs) {
    dom.commandSeriesTabs.innerHTML = "";
    if (allSeries.length === 0) {
      dom.commandSeriesTabs.innerHTML = '<p class="muted-text">Aucune commande a suivre.</p>';
    } else {
      allSeries.forEach((series) => {
        const entry = series.root || series.nextOccurrence;
        if (!entry) return;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("data-command-series-tab", series.seriesId);
        button.classList.toggle("active", series.seriesId === activeCommandSeriesId);
        button.textContent = entry.title || "Commande";
        dom.commandSeriesTabs.appendChild(button);
      });
    }
  }

  if (dom.commandsTrackingList) {
    dom.commandsTrackingList.innerHTML = "";
    if (!activeSeries) {
      dom.commandsTrackingList.innerHTML = '<p class="muted-text">Aucune commande a suivre.</p>';
    } else {
      const header = document.createElement("div");
      header.className = "commande-card";
      header.innerHTML = `
        <div class="commande-card-head">
          <strong>${escapeHtml(activeSeries.root?.title || activeSeries.nextOccurrence?.title || "Commande")}</strong>
          <span class="badge ${activeSeries.pendingCount === 0 ? "badge-ok" : "badge-pending"}">${activeSeries.pendingCount === 0 ? "Terminee" : "A realiser"}</span>
        </div>
        <div class="commande-card-meta">
          <small>Occurrences: ${activeSeries.occurrences.length}</small>
          <small>Prochaine echeance: ${escapeHtml(activeSeries.nextOccurrence?.plannedAt ? formatLocalDateTime(activeSeries.nextOccurrence.plannedAt) : "Non planifiee")}</small>
          <small>Recurrence: ${escapeHtml(formatRecurrenceText(activeSeries.root || activeSeries.nextOccurrence || {}))}</small>
        </div>
      `;
      dom.commandsTrackingList.appendChild(header);

      [...activeSeries.occurrences].sort((a, b) => getLocalDateTimeMs(b.plannedAt) - getLocalDateTimeMs(a.plannedAt)).forEach((entry) => {
        const card = document.createElement("div");
        card.className = "commande-card";
        card.setAttribute("data-command-debug-id", entry.id);
        const validatedText = entry.validatedAt ? new Date(entry.validatedAt).toLocaleString("fr-FR") : "";
        const canValidate = !entry.validatedAt;
        const commentsOpen = openCommandCommentIds.has(entry.id);
        card.innerHTML = `
          <div class="commande-card-head">
            <strong>${escapeHtml(entry.title || "Commande sans titre")}</strong>
            <span class="badge ${entry.status === "Terminee" ? "badge-ok" : "badge-pending"}">${escapeHtml(entry.status)}</span>
          </div>
          ${entry.validatedAt ? `<p class="muted-text">Validee le ${escapeHtml(validatedText)}</p>` : ""}
          <div class="inline-actions command-tracking-actions">
            ${canValidate
              ? `<button type="button" data-open-command-validation-id="${entry.id}">Validation</button>`
              : `<button type="button" class="secondary-btn" disabled>Validation OK</button>`}
            <button type="button" class="secondary-btn" data-toggle-command-comments-id="${entry.id}">Commentaires</button>
          </div>
          ${pendingCommandValidationId === entry.id ? '<p class="muted-text">Panneau de signature ouvert pour cette commande.</p>' : ""}
          ${entry.validationSignature?.imageData ? `
            <div class="suivi-signature-wrap">
              <img src="${entry.validationSignature.imageData}" class="suivi-signature-preview" alt="Signature validation commande" />
              <div>
                <small>Signature: ${escapeHtml(entry.validationSignature.signerName || "Inconnu")}</small>
                ${entry.validationSignature.signerRole ? `<small>Fonction: ${escapeHtml(entry.validationSignature.signerRole)}</small>` : ""}
              </div>
            </div>
          ` : ""}
          <div class="${commentsOpen ? "" : "is-hidden"}">
            ${entry.notes ? `<p class="muted-text ticket-comment">${escapeHtml(entry.notes)}</p>` : ""}
            <label>
              Notes
              <textarea rows="2" data-command-tracking-notes-id="${entry.id}">${escapeHtml(entry.notes || "")}</textarea>
            </label>
          </div>
        `;
        dom.commandsTrackingList.appendChild(card);
      });
    }
  }
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
        ${isValidated && plan.validationSignature?.imageData ? `
          <div class="suivi-signature-wrap">
            <img src="${plan.validationSignature.imageData}" class="suivi-signature-preview" alt="Signature operateur" />
            <div>
              <small>Signature: ${escapeHtml(plan.validationSignature?.signerName || "Inconnu")}</small>
              ${plan.validationSignature?.signerRole ? `<small>Fonction: ${escapeHtml(plan.validationSignature.signerRole)}</small>` : ""}
            </div>
          </div>
        ` : ""}
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
  renderModuleShell();
  renderFormationModule();
  renderCrisisModule();
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
  renderUsersList();
}

function bindGlobalEvents() {
  if (dom.loginForm) {
    dom.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = dom.loginUsername instanceof HTMLInputElement ? dom.loginUsername.value.trim() : "";
      const password = dom.loginPassword instanceof HTMLInputElement ? dom.loginPassword.value : "";
      if (!username || !password) {
        showLoginError("Identifiant et mot de passe requis.");
        return;
      }
      try {
        currentUser = await login(username, password);
        normalizeTrainingState(await getTrainingContent());
        showLoginError("");
        if (dom.loginForm instanceof HTMLFormElement) {
          dom.loginForm.reset();
        }
        setActiveModule("dashboard");
        renderModuleShell();
        if (!appInitialized) {
          init();
        } else {
          await refreshUsers();
          rerenderAll();
        }
      } catch (error) {
        showLoginError(error.message);
      }
    });
  }

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener("click", async () => {
      await logout();
      window.location.reload();
    });
  }

  if (dom.dashboardMenuBtn && dom.dashboardMenu) {
    dom.dashboardMenuBtn.addEventListener("click", () => {
      const isHidden = dom.dashboardMenu.classList.toggle("is-hidden");
      dom.dashboardMenuBtn.setAttribute("aria-expanded", isHidden ? "false" : "true");
    });
  }

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (dom.dashboardMenuBtn && dom.dashboardMenu) {
      const clickedInsideMenu = dom.dashboardMenu.contains(target);
      const clickedMenuButton = dom.dashboardMenuBtn.contains(target);
      if (!clickedInsideMenu && !clickedMenuButton && !dom.dashboardMenu.classList.contains("is-hidden")) {
        dom.dashboardMenu.classList.add("is-hidden");
        dom.dashboardMenuBtn.setAttribute("aria-expanded", "false");
      }
    }

    const moduleName = target.getAttribute("data-open-module");
    if (moduleName) {
      setActiveModule(moduleName);
      if (dom.dashboardMenuBtn && dom.dashboardMenu) {
        dom.dashboardMenu.classList.add("is-hidden");
        dom.dashboardMenuBtn.setAttribute("aria-expanded", "false");
      }
      return;
    }

    const userId = target.getAttribute("data-toggle-user-id");
    if (!userId) return;
    const nextActive = target.getAttribute("data-toggle-user-active") === "1";
    try {
      await toggleUserActive(userId, nextActive);
      if (dom.userManagementStatus) {
        dom.userManagementStatus.textContent = "Utilisateur mis a jour.";
      }
      await refreshUsers();
    } catch (error) {
      if (dom.userManagementStatus) {
        dom.userManagementStatus.textContent = error.message;
      }
    }
  });

  if (dom.createUserForm) {
    dom.createUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await createUser({
          full_name: dom.createUserFullName instanceof HTMLInputElement ? dom.createUserFullName.value.trim() : "",
          username: dom.createUserUsername instanceof HTMLInputElement ? dom.createUserUsername.value.trim() : "",
          password: dom.createUserPassword instanceof HTMLInputElement ? dom.createUserPassword.value : "",
          role: dom.createUserRole instanceof HTMLSelectElement ? dom.createUserRole.value : "apprenant",
        });
        if (dom.createUserForm instanceof HTMLFormElement) {
          dom.createUserForm.reset();
        }
        if (dom.userManagementStatus) {
          dom.userManagementStatus.textContent = "Utilisateur cree avec succes.";
        }
        await refreshUsers();
      } catch (error) {
        if (dom.userManagementStatus) {
          dom.userManagementStatus.textContent = error.message;
        }
      }
    });
  }

  if (dom.formationTabs) {
    dom.formationTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const tab = target.getAttribute("data-formation-tab");
      if (!tab) return;
      setActiveFormationTab(tab);
      renderFormationModule();
    });
  }

  if (dom.crisisNav) {
    dom.crisisNav.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const viewName = target.getAttribute("data-crisis-view");
      if (!viewName) return;
      setActiveCrisisView(viewName);
      renderCrisisModule();
    });
  }

  if (dom.crisisEventModeSelect instanceof HTMLSelectElement) {
    dom.crisisEventModeSelect.addEventListener("change", () => {
      renderCrisisEventCreation();
    });
  }

  if (dom.crisisEventForm) {
    dom.crisisEventForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const targetMode = dom.crisisEventModeSelect instanceof HTMLSelectElement ? dom.crisisEventModeSelect.value : "HET";
      const subcategories = getCrisisSubcategories(targetMode);
      const targetSubcategory = dom.crisisEventSubcategorySelect instanceof HTMLSelectElement
        ? dom.crisisEventSubcategorySelect.value
        : (subcategories[0] || "");
      if (!targetSubcategory) return;

      const context = getCrisisContext();
      const resolvedMode = targetMode === "Plan blanc" ? "Plan blanc" : "HET";
      const preset = getCrisisModePreset(resolvedMode);
      const nextBriefDate = dom.crisisEventNextBriefAt instanceof HTMLInputElement
        ? parseLocalDateTime(dom.crisisEventNextBriefAt.value)
        : null;

      context.mode = resolvedMode;
      context.subcategory = targetSubcategory;
      context.level = resolvedMode === "Plan blanc" ? "Rouge" : "Orange";
      context.openedAt = new Date().toISOString();
      context.nextBriefAt = nextBriefDate ? nextBriefDate.toISOString() : context.nextBriefAt;
      context.coordinator = dom.crisisEventCoordinatorInput instanceof HTMLInputElement
        ? dom.crisisEventCoordinatorInput.value.trim()
        : "";
      context.trigger = dom.crisisEventTriggerInput instanceof HTMLInputElement
        ? dom.crisisEventTriggerInput.value.trim()
        : "";
      context.objective = dom.crisisEventObjectiveInput instanceof HTMLInputElement
        ? dom.crisisEventObjectiveInput.value.trim()
        : "";
      context.summary = dom.crisisEventSummaryInput instanceof HTMLTextAreaElement
        ? dom.crisisEventSummaryInput.value.trim()
        : "";

      if (!context.trigger) {
        context.trigger = resolvedMode === "Plan blanc"
          ? "Evenement majeur / activation exceptionnelle"
          : "Episode de tension hospitaliere";
      }
      if (!context.objective) {
        context.objective = preset.priorities[0] || "";
      }
      if (!context.summary) {
        context.summary = resolvedMode === "Plan blanc"
          ? "Cellule activee, organisation immediate des renforts et capacites critiques."
          : "Tension en cours, pilotage resserre des flux et des ressources critiques.";
      }

      ensureCrisisActionBucket(resolvedMode, targetSubcategory);
      activeCrisisView = "dashboard";
      saveState();
      renderCrisisModule();
    });
  }

  if (dom.crisisSidebarToggle) {
    dom.crisisSidebarToggle.addEventListener("click", () => {
      crisisSidebarCollapsed = !crisisSidebarCollapsed;
      renderCrisisModule();
    });
  }

  [
    [dom.crisisCoordinatorInput, "coordinator"],
    [dom.crisisSummaryInput, "summary"],
    [dom.crisisNextBriefAt, "nextBriefAt"],
  ].forEach(([element, key]) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return;
    element.addEventListener("input", () => {
      const context = getCrisisContext();
      context[key] = element.value;
      saveState();
      renderCrisisModule();
    });
  });

  if (dom.crisisModeSelect instanceof HTMLSelectElement) {
    dom.crisisModeSelect.addEventListener("change", () => {
      applyCrisisMode(dom.crisisModeSelect.value);
    });
  }

  if (dom.crisisSubcategorySelect instanceof HTMLSelectElement) {
    dom.crisisSubcategorySelect.addEventListener("change", () => {
      const context = getCrisisContext();
      context.subcategory = dom.crisisSubcategorySelect.value;
      saveState();
      renderCrisisModule();
    });
  }

  if (dom.crisisSubcategoryForm) {
    dom.crisisSubcategoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const targetMode = dom.crisisSubcategoryModeSelect instanceof HTMLSelectElement ? dom.crisisSubcategoryModeSelect.value : "HET";
      const name = dom.crisisSubcategoryName instanceof HTMLInputElement ? dom.crisisSubcategoryName.value.trim() : "";
      if (!name) return;
      const items = getCrisisSubcategories(targetMode);
      if (!items.includes(name)) {
        items.push(name);
      }
      ensureCrisisActionBucket(targetMode, name);
      const context = getCrisisContext();
      if (context.mode === targetMode && !context.subcategory) {
        context.subcategory = name;
      }
      saveState();
      renderCrisisModule();
      if (dom.crisisSubcategoryName instanceof HTMLInputElement) {
        dom.crisisSubcategoryName.value = "";
        dom.crisisSubcategoryName.focus();
      }
    });
  }

  if (dom.crisisConfiguredActionModeSelect instanceof HTMLSelectElement) {
    dom.crisisConfiguredActionModeSelect.addEventListener("change", () => {
      renderCrisisModule();
    });
  }

  if (dom.crisisConfiguredActionSubcategorySelect instanceof HTMLSelectElement) {
    dom.crisisConfiguredActionSubcategorySelect.addEventListener("change", () => {
      renderCrisisModule();
    });
  }

  /* Ajout d'une action inline par domaine (délégation) */
  if (dom.crisisScreen) {
    dom.crisisScreen.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.classList.contains("crisis-param-add-action-form")) return;
      event.preventDefault();
      const targetMode = form.getAttribute("data-crisis-param-mode") || "HET";
      const targetSubcategory = form.getAttribute("data-crisis-param-subcategory") || "";
      const targetDomain = form.getAttribute("data-crisis-param-domain") || "anticipation";
      const input = form.querySelector("input");
      const title = input instanceof HTMLInputElement ? input.value.trim() : "";
      if (!targetSubcategory || !title) return;
      const items = getCrisisConfiguredActions(targetMode, targetSubcategory, targetDomain);
      if (!items.includes(title)) items.push(title);
      saveState();
      renderCrisisModule();
    });
  }

  if (dom.crisisActionForm) {
    dom.crisisActionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCrisisQuickAction(dom.crisisActionStatus instanceof HTMLSelectElement ? dom.crisisActionStatus.value : "Information");
      if (dom.crisisActionForm instanceof HTMLFormElement) {
        dom.crisisActionForm.reset();
      }
      if (dom.crisisActionFunction instanceof HTMLSelectElement) {
        dom.crisisActionFunction.value = "main-courante";
      }
      if (dom.crisisActionStatus instanceof HTMLSelectElement) {
        dom.crisisActionStatus.value = "Information";
      }
      if (dom.crisisActionOwner instanceof HTMLInputElement) {
        dom.crisisActionOwner.value = currentUser?.full_name || "";
      }
    });
  }

  if (dom.crisisScreen) {
    dom.crisisScreen.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const templateButton = target.closest("[data-crisis-template-title]");
      if (templateButton instanceof HTMLElement) {
        upsertCrisisAction({
          functionKey: templateButton.getAttribute("data-crisis-template-function") || activeCrisisView,
          title: templateButton.getAttribute("data-crisis-template-title") || "Action crise",
          entryType: templateButton.getAttribute("data-crisis-template-type") || "Action",
          owner: currentUser?.full_name || "",
          notes: `Ajoute depuis ${formatCrisisFunction(templateButton.getAttribute("data-crisis-template-function") || activeCrisisView)}`,
        });
        return;
      }

      const modeButton = target.closest("[data-crisis-mode-choice]");
      if (modeButton instanceof HTMLElement) {
        applyCrisisMode(modeButton.getAttribute("data-crisis-mode-choice") || "HET");
        return;
      }

      const subcategorySelect = target.getAttribute("data-crisis-subcategory-select");
      if (subcategorySelect) {
        const [modeLabel, item] = subcategorySelect.split("::");
        applyCrisisMode(modeLabel || "HET");
        const context = getCrisisContext();
        context.subcategory = item || "";
        saveState();
        renderCrisisModule();
        return;
      }

      const subcategoryDelete = target.getAttribute("data-crisis-subcategory-delete");
      if (subcategoryDelete) {
        const [modeLabel, item] = subcategoryDelete.split("::");
        const items = getCrisisSubcategories(modeLabel || "HET");
        const nextItems = items.filter((entry) => entry !== item);
        state.crisis.subcategories[modeLabel || "HET"] = nextItems;
        if (state.crisis.actionCatalog?.[modeLabel || "HET"]) {
          delete state.crisis.actionCatalog[modeLabel || "HET"][item];
        }
        const context = getCrisisContext();
        if (context.mode === (modeLabel || "HET") && context.subcategory === item) {
          context.subcategory = nextItems[0] || "";
        }
        saveState();
        renderCrisisModule();
        return;
      }

      if (target.hasAttribute("data-crisis-config-action-delete")) {
        const modeLabel = target.getAttribute("data-crisis-config-mode") || "HET";
        const subcategory = target.getAttribute("data-crisis-config-subcategory") || "";
        const domain = target.getAttribute("data-crisis-config-domain") || "anticipation";
        const title = target.getAttribute("data-crisis-config-title") || "";
        ensureCrisisActionBucket(modeLabel, subcategory)[domain] = getCrisisConfiguredActions(modeLabel, subcategory, domain)
          .filter((entry) => entry !== title);
        saveState();
        renderCrisisModule();
        return;
      }

      const deleteId = target.getAttribute("data-crisis-action-delete-id");
      if (!deleteId) return;
      state.crisis.actions = getCrisisActions().filter((entry) => entry.id !== deleteId);
      saveState();
      renderCrisisModule();
    });
  }

  if (dom.creatorEditorTabs) {
    dom.creatorEditorTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const tab = target.getAttribute("data-creator-editor-tab");
      if (!tab) return;
      setActiveCreatorEditorTab(tab);
      renderCreatorEditorTabs();
    });
  }

  if (dom.trainingPageSize instanceof HTMLSelectElement) {
    dom.trainingPageSize.addEventListener("change", () => {
      trainingCatalogPage = 1;
      renderTrainingCatalog();
    });
  }

  if (dom.trainingLearnerCategorySelect instanceof HTMLSelectElement) {
    dom.trainingLearnerCategorySelect.addEventListener("change", () => {
      selectedLearnerCategoryId = dom.trainingLearnerCategorySelect instanceof HTMLSelectElement
        ? dom.trainingLearnerCategorySelect.value
        : "";
      selectedLearnerChapterId = "";
      selectedLearnerCourseId = "";
      trainingCatalogPage = 1;
      renderTrainingSelectors();
      renderTrainingSpotlight();
      renderTrainingCollections();
      renderTrainingCatalog();
    });
  }

  if (dom.trainingLearnerChapterSelect instanceof HTMLSelectElement) {
    dom.trainingLearnerChapterSelect.addEventListener("change", () => {
      selectedLearnerChapterId = dom.trainingLearnerChapterSelect instanceof HTMLSelectElement
        ? dom.trainingLearnerChapterSelect.value
        : "";
      selectedLearnerCourseId = "";
      trainingCatalogPage = 1;
      renderTrainingSelectors();
      renderTrainingSpotlight();
      renderTrainingCollections();
      renderTrainingCatalog();
    });
  }

  if (dom.trainingLearnerCourseSelect instanceof HTMLSelectElement) {
    dom.trainingLearnerCourseSelect.addEventListener("change", () => {
      selectedLearnerCourseId = dom.trainingLearnerCourseSelect instanceof HTMLSelectElement
        ? dom.trainingLearnerCourseSelect.value
        : "";
      trainingCatalogPage = 1;
      renderTrainingSpotlight();
      renderTrainingCollections();
      renderTrainingCatalog();
    });
  }

  if (dom.trainingSearchInput instanceof HTMLInputElement) {
    dom.trainingSearchInput.addEventListener("input", () => {
      trainingSearchTerm = dom.trainingSearchInput instanceof HTMLInputElement
        ? dom.trainingSearchInput.value
        : "";
      trainingCatalogPage = 1;
      renderTrainingSpotlight();
      renderTrainingCollections();
      renderTrainingCatalog();
    });
  }

  if (dom.closeTrainingReaderBtn) {
    dom.closeTrainingReaderBtn.addEventListener("click", () => {
      activeLearningCourseId = "";
      renderTrainingReader();
    });
  }

  if (dom.trainingPrevPageBtn) {
    dom.trainingPrevPageBtn.addEventListener("click", () => {
      trainingCatalogPage = Math.max(1, trainingCatalogPage - 1);
      renderTrainingCatalog();
    });
  }

  if (dom.trainingNextPageBtn) {
    dom.trainingNextPageBtn.addEventListener("click", () => {
      trainingCatalogPage += 1;
      renderTrainingCatalog();
    });
  }

  if (dom.courseCategorySelect instanceof HTMLSelectElement) {
    dom.courseCategorySelect.addEventListener("change", () => {
      renderTrainingSelectors();
    });
  }

  if (dom.editorCourseSelect instanceof HTMLSelectElement) {
    dom.editorCourseSelect.addEventListener("change", () => {
      selectedEditorCourseId = dom.editorCourseSelect.value;
      renderTrainingSelectors();
      renderEditorBlocks();
    });
  }

  if (dom.createCategoryForm) {
    dom.createCategoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = dom.newCategoryName instanceof HTMLInputElement ? dom.newCategoryName.value.trim() : "";
      if (!name) return;
      trainingState.categories = trainingState.categories || [];
      trainingState.categories.push({ id: trainingId(), name, chapters: [] });
      if (dom.newCategoryName instanceof HTMLInputElement) dom.newCategoryName.value = "";
      try {
        await persistTraining();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Categorie ajoutee.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.createChapterForm) {
    dom.createChapterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const categoryId = dom.chapterCategorySelect instanceof HTMLSelectElement ? dom.chapterCategorySelect.value : "";
      const name = dom.newChapterName instanceof HTMLInputElement ? dom.newChapterName.value.trim() : "";
      if (!categoryId || !name) return;
      const category = (trainingState.categories || []).find((entry) => entry.id === categoryId);
      if (!category) return;
      category.chapters = category.chapters || [];
      category.chapters.push({ id: trainingId(), name, courses: [] });
      if (dom.newChapterName instanceof HTMLInputElement) dom.newChapterName.value = "";
      try {
        await persistTraining();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Chapitre ajoute.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.createCourseForm) {
    dom.createCourseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const categoryId = dom.courseCategorySelect instanceof HTMLSelectElement ? dom.courseCategorySelect.value : "";
      const chapterId = dom.courseChapterSelect instanceof HTMLSelectElement ? dom.courseChapterSelect.value : "";
      const title = dom.newCourseTitle instanceof HTMLInputElement ? dom.newCourseTitle.value.trim() : "";
      const content = dom.newCourseContent instanceof HTMLTextAreaElement ? dom.newCourseContent.value.trim() : "";
      if (!categoryId || !chapterId || !title) return;
      const category = (trainingState.categories || []).find((entry) => entry.id === categoryId);
      const chapter = (category?.chapters || []).find((entry) => entry.id === chapterId);
      if (!chapter) return;
      chapter.courses = chapter.courses || [];
      const newCourse = {
        id: trainingId(),
        title,
        content,
        questions: [],
        blocks: [{ id: trainingId(), type: "text", content: content ? `<p>${escapeHtml(content)}</p>` : "<p>Nouveau bloc...</p>", questionId: "" }],
      };
      chapter.courses.push(newCourse);
      selectedEditorCourseId = newCourse.id;
      setActiveCreatorEditorTab("course");
      if (dom.createCourseForm instanceof HTMLFormElement) dom.createCourseForm.reset();
      try {
        await persistTraining();
        renderCreatorEditorTabs();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Cours cree. Passez a l'edition cours.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.createQuestionForm) {
    dom.createQuestionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const courseId = dom.questionCourseSelect instanceof HTMLSelectElement ? dom.questionCourseSelect.value : "";
      if (!courseId) return;
      const courseRow = getAllCourses().find((entry) => entry.course.id === courseId);
      if (!courseRow) return;
      const type = dom.newQuestionType instanceof HTMLSelectElement ? dom.newQuestionType.value : "standard";
      const clinicalCase = dom.newQuestionCase instanceof HTMLTextAreaElement ? dom.newQuestionCase.value.trim() : "";
      const text = dom.newQuestionText instanceof HTMLInputElement ? dom.newQuestionText.value.trim() : "";
      const options = [dom.newOption1, dom.newOption2, dom.newOption3, dom.newOption4]
        .map((el) => (el instanceof HTMLInputElement ? el.value.trim() : ""));
      const correctIndex = dom.questionCorrectIndex instanceof HTMLSelectElement ? Number(dom.questionCorrectIndex.value) : 0;
      const explanation = dom.newQuestionExplanation instanceof HTMLTextAreaElement ? dom.newQuestionExplanation.value.trim() : "";
      if (!text || options.some((option) => !option)) return;
      if (type === "clinical" && !clinicalCase) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Ajoutez le contexte du cas clinique.";
        return;
      }
      courseRow.course.questions = courseRow.course.questions || [];
      courseRow.course.questions.push({
        id: trainingId(),
        type,
        clinicalCase: type === "clinical" ? clinicalCase : "",
        text,
        options,
        correctIndex,
        explanation,
      });
      if (dom.createQuestionForm instanceof HTMLFormElement) dom.createQuestionForm.reset();
      try {
        await persistTraining();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Question ajoutee.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.addTextBlockBtn) {
    dom.addTextBlockBtn.addEventListener("click", async () => {
      const row = getCourseById(selectedEditorCourseId);
      if (!row) return;
      row.course.blocks = row.course.blocks || [];
      row.course.blocks.push({ id: trainingId(), type: "text", content: "<p>Nouveau bloc...</p>", questionId: "" });
      try {
        await persistTraining();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Bloc texte insere.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.addQuizBlockBtn) {
    dom.addQuizBlockBtn.addEventListener("click", async () => {
      const row = getCourseById(selectedEditorCourseId);
      if (!row) return;
      const questionId = dom.editorQuizQuestionSelect instanceof HTMLSelectElement
        ? dom.editorQuizQuestionSelect.value
        : "";
      if (!questionId) return;
      row.course.blocks = row.course.blocks || [];
      row.course.blocks.push({ id: trainingId(), type: "quiz", content: "", questionId });
      try {
        await persistTraining();
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = "Bloc quiz insere.";
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });
  }

  if (dom.editorBlocksList) {
    dom.editorBlocksList.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const blockId = target.getAttribute("data-block-rich-id");
      if (!blockId) return;
      const row = getCourseById(selectedEditorCourseId);
      if (!row) return;
      const block = (row.course.blocks || []).find((entry) => entry.id === blockId && entry.type === "text");
      if (!block) return;
      block.content = target.innerHTML;
    });

    dom.editorBlocksList.addEventListener("focusout", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const blockId = target.getAttribute("data-block-rich-id");
      if (!blockId) return;
      try {
        await persistTraining();
      } catch (error) {
        if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
      }
    });

    dom.editorBlocksList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = getCourseById(selectedEditorCourseId);
      if (!row) return;
      const blocks = row.course.blocks || [];

      const cmdEl = target.closest("[data-editor-cmd]");
      if (cmdEl instanceof HTMLElement) {
        const command = cmdEl.getAttribute("data-editor-cmd");
        const blockId = cmdEl.getAttribute("data-editor-block-id");
        if (!command || !blockId) return;
        const editor = dom.editorBlocksList.querySelector(`[data-block-rich-id="${blockId}"]`);
        if (!(editor instanceof HTMLElement)) return;
        editor.focus();

        if (command === "blockquote") {
          applyRichCommand("formatBlock", "blockquote");
        } else if (command === "link") {
          const url = window.prompt("Entrez l'URL du lien:", "https://");
          if (!url) return;
          applyRichCommand("createLink", url.trim());
        } else if (command === "video") {
          const source = window.prompt("Entrez un lien YouTube ou Vimeo:", "https://");
          const embed = toEmbedVideoUrl(source || "");
          if (!embed) {
            if (dom.formationBuilderStatus) {
              dom.formationBuilderStatus.textContent = "Lien video non supporte. Utilisez YouTube ou Vimeo.";
            }
            return;
          }
          applyRichCommand("insertHTML", `<div class=\"editor-video-embed\"><iframe src=\"${embed}\" title=\"Video\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></div>`);
        } else {
          applyRichCommand(command);
        }

        const block = blocks.find((entry) => entry.id === blockId && entry.type === "text");
        if (block) {
          block.content = editor.innerHTML;
          try {
            await persistTraining();
          } catch (error) {
            if (dom.formationBuilderStatus) dom.formationBuilderStatus.textContent = error.message;
          }
        }
        return;
      }

      const deleteId = target.getAttribute("data-delete-block-id");
      if (deleteId) {
        row.course.blocks = blocks.filter((block) => block.id !== deleteId);
        await persistTraining();
        return;
      }

      const moveId = target.getAttribute("data-move-block-id");
      if (!moveId) return;
      const direction = target.getAttribute("data-move-dir");
      const index = blocks.findIndex((block) => block.id === moveId);
      if (index < 0) return;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= blocks.length) return;
      const temp = blocks[index];
      blocks[index] = blocks[nextIndex];
      blocks[nextIndex] = temp;
      await persistTraining();
    });
  }

  if (dom.trainingCatalog) {
    dom.trainingCatalog.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const openCourseId = target.getAttribute("data-open-course-id");
      if (openCourseId) {
        activeLearningCourseId = openCourseId;
        renderTrainingReader();
        return;
      }
      const courseId = target.getAttribute("data-start-quiz-course-id");
      if (!courseId) return;
      const row = getAllCourses().find((entry) => entry.course.id === courseId);
      if (!row) return;
      if (getCourseQuizQuestions(row.course).length === 0) return;
      activeQuiz = { course: row.course, index: 0, answers: [] };
      renderQuiz();
    });
  }

  if (dom.trainingSpotlight) {
    dom.trainingSpotlight.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const openCourseId = target.getAttribute("data-open-course-id");
      if (openCourseId) {
        activeLearningCourseId = openCourseId;
        renderTrainingReader();
        return;
      }
      const courseId = target.getAttribute("data-start-quiz-course-id");
      if (!courseId) return;
      const row = getAllCourses().find((entry) => entry.course.id === courseId);
      if (!row || getCourseQuizQuestions(row.course).length === 0) return;
      activeQuiz = { course: row.course, index: 0, answers: [] };
      renderQuiz();
    });
  }

  if (dom.trainingReaderBlocks) {
    dom.trainingReaderBlocks.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const courseId = target.getAttribute("data-start-quiz-course-id");
      if (!courseId) return;
      const row = getAllCourses().find((entry) => entry.course.id === courseId);
      if (!row || getCourseQuizQuestions(row.course).length === 0) return;
      activeQuiz = { course: row.course, index: 0, answers: [] };
      renderQuiz();
    });
  }

  if (dom.quizOptions) {
    dom.quizOptions.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || !activeQuiz) return;
      const optionIndex = Number(target.getAttribute("data-quiz-option-index"));
      if (!Number.isInteger(optionIndex)) return;
      if (typeof activeQuiz.answers[activeQuiz.index] !== "undefined") return;
      activeQuiz.answers[activeQuiz.index] = optionIndex;
      renderQuiz();
    });
  }

  if (dom.nextQuizQuestionBtn) {
    dom.nextQuizQuestionBtn.addEventListener("click", async () => {
      if (!activeQuiz) return;
      const questions = getCourseQuizQuestions(activeQuiz.course);
      if (typeof activeQuiz.answers[activeQuiz.index] === "undefined") {
        return;
      }
      if (activeQuiz.index < questions.length - 1) {
        activeQuiz.index += 1;
        renderQuiz();
        return;
      }

      const score = questions.reduce((sum, question, index) => (
        sum + (activeQuiz.answers[index] === question.correctIndex ? 1 : 0)
      ), 0);
      const points = score * 10;
      try {
        const response = await saveTrainingAttempt({
          course_id: activeQuiz.course.id,
          course_title: activeQuiz.course.title,
          score,
          total: questions.length,
          points,
        });
        trainingState.attempts = [...(trainingState.attempts || []), response.attempt];
      } catch (error) {
        console.error(error);
      }

      dom.quizFeedback.textContent = `🎉 Quiz termine ! Score: ${score}/${questions.length}. Points gagnes: ${points}.`;
      renderTrainingStats();
      renderTrainingSpotlight();
      renderTrainingCollections();
      renderTrainingCatalog();
      renderTrainingReader();
      activeQuiz = null;
    });
  }

  if (dom.closeQuizBtn) {
    dom.closeQuizBtn.addEventListener("click", () => {
      activeQuiz = null;
      renderQuiz();
    });
  }

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

  if (dom.addCommandBtn) {
    dom.addCommandBtn.addEventListener("click", () => {
      const title = dom.commandTitle instanceof HTMLInputElement ? dom.commandTitle.value.trim() : "";
      if (!title) return;
      const plannedAt = dom.commandPlannedAt instanceof HTMLInputElement ? dom.commandPlannedAt.value : "";
      const recurrenceType = dom.commandRecurrenceType instanceof HTMLSelectElement ? dom.commandRecurrenceType.value : "Aucune";
      if (recurrenceType !== "Aucune" && !plannedAt) {
        window.alert("Veuillez renseigner une date/heure pour la recurrence.");
        return;
      }
      const command = createCommandItem({
        title,
        category: dom.commandCategory instanceof HTMLInputElement ? dom.commandCategory.value.trim() : "",
        assignee: dom.commandAssignee instanceof HTMLInputElement ? dom.commandAssignee.value.trim() : "",
        plannedAt,
        priority: dom.commandPriority instanceof HTMLSelectElement ? dom.commandPriority.value : "Normale",
        status: dom.commandStatus instanceof HTMLSelectElement ? dom.commandStatus.value : "A realiser",
        recurrenceType,
        recurrenceEvery: dom.commandRecurrenceEvery instanceof HTMLInputElement ? dom.commandRecurrenceEvery.value : 1,
        recurrenceWeekdays: getSelectedCommandWeekdays(),
        recurrenceInfinite: dom.commandRecurrenceInfinite instanceof HTMLInputElement ? dom.commandRecurrenceInfinite.checked : false,
        notes: dom.commandNotes instanceof HTMLTextAreaElement ? dom.commandNotes.value.trim() : "",
      });
      if (!Array.isArray(state.commands)) state.commands = [];
      state.commands.push(command);
      ensureRecurringCommandInstances(getCommandRecurrenceHorizon(commandAgendaAnchor));
      commandDebugTargetId = command.id;
      if (plannedAt) {
        const anchor = parseLocalDateTime(plannedAt);
        if (anchor) {
          commandAgendaAnchor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
          commandAgendaSelectedDayKey = toLocalDateKey(anchor);
        }
      }
      activeCommandTab = "planning";

      if (dom.commandForm instanceof HTMLFormElement) {
        dom.commandForm.reset();
      }
      if (dom.commandRecurrenceEvery instanceof HTMLInputElement) {
        dom.commandRecurrenceEvery.value = "1";
      }
      if (dom.commandPriority instanceof HTMLSelectElement) {
        dom.commandPriority.value = "Normale";
      }
      if (dom.commandStatus instanceof HTMLSelectElement) {
        dom.commandStatus.value = "A realiser";
      }
      if (dom.commandRecurrenceType instanceof HTMLSelectElement) {
        dom.commandRecurrenceType.value = "Aucune";
      }
      resetCommandWeekdaysSelection();
      updateCommandRecurrenceFields();
      renderCommandesPanel();
      renderDashboard();
      saveState();
    });
  }

  if (dom.commandDueIn2hBtn) {
    dom.commandDueIn2hBtn.addEventListener("click", () => {
      setCommandDueOffset(2);
    });
  }

  if (dom.commandDueIn8hBtn) {
    dom.commandDueIn8hBtn.addEventListener("click", () => {
      setCommandDueOffset(8);
    });
  }

  if (dom.commandDueTomorrowBtn) {
    dom.commandDueTomorrowBtn.addEventListener("click", () => {
      setCommandDueTomorrowMorning();
    });
  }

  if (dom.commandRecurrenceType instanceof HTMLSelectElement) {
    dom.commandRecurrenceType.addEventListener("change", () => {
      updateCommandRecurrenceFields();
    });
    updateCommandRecurrenceFields();
  }

  if (dom.commandSubTabs) {
    dom.commandSubTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const nextTab = target.getAttribute("data-command-tab");
      if (!nextTab) return;
      activeCommandTab = nextTab;
      renderCommandesPanel();
    });
  }

  if (dom.commandAgendaPrevMonthBtn) {
    dom.commandAgendaPrevMonthBtn.addEventListener("click", () => {
      commandAgendaAnchor = new Date(commandAgendaAnchor.getFullYear(), commandAgendaAnchor.getMonth() - 1, 1);
      renderCommandesPanel();
    });
  }

  if (dom.commandAgendaNextMonthBtn) {
    dom.commandAgendaNextMonthBtn.addEventListener("click", () => {
      commandAgendaAnchor = new Date(commandAgendaAnchor.getFullYear(), commandAgendaAnchor.getMonth() + 1, 1);
      renderCommandesPanel();
    });
  }

  if (dom.commandAgendaGrid) {
    dom.commandAgendaGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const dayBtn = target.closest("[data-agenda-day-key]");
      if (!(dayBtn instanceof HTMLButtonElement) || dayBtn.disabled) return;
      const dayKey = dayBtn.getAttribute("data-agenda-day-key") || "";
      if (!dayKey) return;
      commandAgendaSelectedDayKey = dayKey;
      renderCommandesPanel();
    });
  }

  if (dom.confirmCommandValidationBtn) {
    dom.confirmCommandValidationBtn.addEventListener("click", () => {
      const command = getPendingCommandValidation();
      if (!command) return;
      if (!validateCommand(command)) return;
      closeCommandValidation();
      renderCommandesPanel();
      renderDashboard();
      saveState();
    });
  }

  if (dom.cancelCommandValidationBtn) {
    dom.cancelCommandValidationBtn.addEventListener("click", () => {
      closeCommandValidation();
    });
  }

  if (dom.commandFilterStatus instanceof HTMLSelectElement) {
    dom.commandFilterStatus.addEventListener("change", () => {
      renderCommandesPanel();
    });
  }

  if (dom.commandSearch instanceof HTMLInputElement) {
    dom.commandSearch.addEventListener("input", () => {
      renderCommandesPanel();
    });
  }

  if (dom.commandsPlannedList) {
    dom.commandsPlannedList.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const seriesId = target.getAttribute("data-command-series-id");
      const field = target.getAttribute("data-command-series-field");
      if (!seriesId || !field) return;
      const updatedAt = new Date().toISOString();
      updateCommandSeries(seriesId, (entry) => {
        if (entry.status === "Terminee" && field !== "notes") return entry;
        const next = { ...entry, updatedAt };
        if (field === "recurrenceInfinite" && target instanceof HTMLInputElement) {
          next.recurrenceInfinite = target.checked;
        } else if (field === "recurrenceEvery" && target instanceof HTMLInputElement) {
          next.recurrenceEvery = Math.max(1, Number(target.value) || 1);
        } else if (field === "plannedAt" && target instanceof HTMLInputElement) {
          next.plannedAt = target.value;
        } else if (field === "notes") {
          next.notes = target.value;
        } else {
          next[field] = target.value;
        }
        return next;
      });
      ensureRecurringCommandInstances(getCommandRecurrenceHorizon(commandAgendaAnchor));
      renderCommandesPanel();
      saveState();
    });

    dom.commandsPlannedList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const debugCard = target.closest("[data-command-debug-id]");
      if (debugCard instanceof HTMLElement) {
        const debugId = debugCard.getAttribute("data-command-debug-id");
        if (debugId) {
          commandDebugTargetId = debugId;
          renderCommandDebugPanel();
        }
      }

      const openSeriesId = target.getAttribute("data-open-command-series-id");
      if (openSeriesId) {
        activeCommandSeriesId = openSeriesId;
        activeCommandTab = "occurrences";
        renderCommandesPanel();
        return;
      }

      const deleteSeriesId = target.getAttribute("data-delete-command-series-id");
      if (deleteSeriesId) {
        state.commands = (state.commands || []).filter((entry) => entry.seriesId !== deleteSeriesId);
        renderCommandesPanel();
        renderDashboard();
        saveState();
        return;
      }

      const duplicateSeriesId = target.getAttribute("data-duplicate-command-series-id");
      if (!duplicateSeriesId) return;
      const command = (state.commands || []).find((entry) => entry.seriesId === duplicateSeriesId);
      if (!command) return;
      state.commands.push(createCommandItem({
        title: `${command.title} (copie)`,
        category: command.category,
        assignee: command.assignee,
        plannedAt: command.plannedAt,
        priority: command.priority,
        status: "A realiser",
        recurrenceType: command.recurrenceType,
        recurrenceEvery: command.recurrenceEvery,
        recurrenceWeekdays: command.recurrenceWeekdays,
        recurrenceInfinite: command.recurrenceInfinite,
        notes: command.notes,
      }));
      renderCommandesPanel();
      renderDashboard();
      saveState();
    });
  }

  if (dom.commandsTrackingList) {
    dom.commandsTrackingList.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) return;
      const commandId = target.getAttribute("data-command-tracking-notes-id");
      if (!commandId) return;
      const command = (state.commands || []).find((entry) => entry.id === commandId);
      if (!command) return;
      command.notes = target.value;
      command.updatedAt = new Date().toISOString();
      saveState();
    });

    dom.commandsTrackingList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const debugCard = target.closest("[data-command-debug-id]");
      if (debugCard instanceof HTMLElement) {
        const debugId = debugCard.getAttribute("data-command-debug-id");
        if (debugId) {
          commandDebugTargetId = debugId;
          renderCommandDebugPanel();
        }
      }

      const toggleCommentsId = target.getAttribute("data-toggle-command-comments-id");
      if (toggleCommentsId) {
        if (openCommandCommentIds.has(toggleCommentsId)) {
          openCommandCommentIds.delete(toggleCommentsId);
        } else {
          openCommandCommentIds.add(toggleCommentsId);
        }
        renderCommandesPanel();
        return;
      }

      const commandId = target.getAttribute("data-open-command-validation-id");
      if (!commandId) return;
      activeCommandTab = "validation";
      openCommandValidation(commandId);
      renderCommandesPanel();
    });
  }

  if (dom.commandsValidationList) {
    dom.commandsValidationList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const openSeriesId = target.getAttribute("data-open-command-series-id");
      if (openSeriesId) {
        activeCommandSeriesId = openSeriesId;
        activeCommandTab = "occurrences";
        renderCommandesPanel();
        return;
      }

      const commandId = target.getAttribute("data-open-command-validation-id");
      if (!commandId) return;
      openCommandValidation(commandId);
      renderCommandesPanel();
    });
  }

  if (dom.commandSeriesTabs) {
    dom.commandSeriesTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const seriesId = target.getAttribute("data-command-series-tab");
      if (!seriesId) return;
      activeCommandSeriesId = seriesId;
      const series = getCommandSeriesList().find((entry) => entry.seriesId === seriesId);
      if (series?.root?.id) {
        commandDebugTargetId = series.root.id;
      }
      renderCommandesPanel();
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
  appInitialized = true;
  loadState();
  ensureRecurringCommandInstances(getCommandRecurrenceHorizon(commandAgendaAnchor));
  ensureActiveTemplate();
  ensureActiveChecklist();

  setTemplatesRenderHook(rerenderAll);
  setPlanningRenderHook(rerenderAll);
  setChecklistRenderHook(rerenderAll);

  bindTemplatesEvents();
  bindPlanningEvents();
  bindChecklistEvents();
  bindSignatureEvents();
  bindSuiviEvents();

  // Initialiser la collaboration
  initializeCollaboration();

  rerenderAll();
  saveState();

  if (dailyRolloverTimer) {
    clearInterval(dailyRolloverTimer);
  }
  dailyRolloverTimer = setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (state.day?.date === today) return;
    saveState();
    loadState();
    ensureActiveChecklist();
    rerenderAll();
    saveState();
  }, 60 * 1000);
}

async function initializeCollaboration() {
  const operatorName = currentUser?.full_name || currentUser?.username || "";
  const operatorRole = currentUser?.role || "";

  if (!operatorName) {
    console.warn("Pas de nom d'opérateur fourni, mode hors ligne");
    return;
  }

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

      if (Array.isArray(serverState.commands)) {
        state.commands = serverState.commands.map((entry) => createCommandItem(entry));
        ensureRecurringCommandInstances(getCommandRecurrenceHorizon(commandAgendaAnchor));
        console.log("✓ Commandes mises à jour depuis le serveur");
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

bindGlobalEvents();

async function bootstrap() {
  currentUser = await getCurrentUser();
  renderModuleShell();
  if (!currentUser) {
    return;
  }
  try {
    normalizeTrainingState(await getTrainingContent());
  } catch (error) {
    normalizeTrainingState({ categories: [], attempts: [] });
  }
  await refreshUsers();
  init();
}

bootstrap();
