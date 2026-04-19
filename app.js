const STORAGE_KEY = "main-courante-data";

const checklistLabels = [
  "Box 1",
  "Box 2",
  "Box 3",
  "Box 4",
  "Secteur A",
  "Secteur B",
  "Secteur C",
  "Secteur D",
];

const state = {
  layout: "desktop",
  day: {
    date: new Date().toISOString().slice(0, 10),
    owner: "",
    notes: "",
  },
  planning: [],
  checklist: checklistLabels.map((label) => ({ label, done: false })),
};

const appLayout = document.getElementById("appLayout");
const displayModeToggle = document.getElementById("displayModeToggle");
const dayDate = document.getElementById("dayDate");
const dayOwner = document.getElementById("dayOwner");
const dayNotes = document.getElementById("dayNotes");
const planningBody = document.getElementById("planningBody");
const checklistContainer = document.getElementById("checklistContainer");
const completionText = document.getElementById("completionText");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(state, parsed);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!Array.isArray(state.checklist) || state.checklist.length !== checklistLabels.length) {
    state.checklist = checklistLabels.map((label) => ({ label, done: false }));
  }
}

function applyLayout() {
  const mobile = state.layout === "mobile";
  appLayout.classList.toggle("mobile-layout", mobile);
  appLayout.classList.toggle("desktop-layout", !mobile);
  displayModeToggle.textContent = mobile ? "Mode PC" : "Mode smartphone";
}

function renderPlanning() {
  planningBody.innerHTML = "";

  if (state.planning.length === 0) {
    state.planning.push({ time: "", task: "", sector: "", status: "À faire" });
  }

  state.planning.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="time" value="${item.time}" data-field="time" data-index="${index}" /></td>
      <td><input type="text" value="${item.task}" data-field="task" data-index="${index}" placeholder="Commande ou tâche" /></td>
      <td><input type="text" value="${item.sector}" data-field="sector" data-index="${index}" placeholder="Secteur" /></td>
      <td>
        <select data-field="status" data-index="${index}">
          ${["À faire", "En cours", "Terminée"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td><button type="button" data-remove="${index}" class="secondary-btn">Supprimer</button></td>
    `;
    planningBody.appendChild(tr);
  });
}

function renderChecklist() {
  checklistContainer.innerHTML = "";

  state.checklist.forEach((item, index) => {
    const row = document.createElement("label");
    row.className = "check-item";
    row.innerHTML = `
      <span>${item.label}</span>
      <input type="checkbox" data-check-index="${index}" ${item.done ? "checked" : ""} />
    `;
    checklistContainer.appendChild(row);
  });

  const done = state.checklist.filter((item) => item.done).length;
  completionText.textContent = `${done} / ${state.checklist.length} vérifications réalisées`;
}

function syncDayForm() {
  dayDate.value = state.day.date;
  dayOwner.value = state.day.owner;
  dayNotes.value = state.day.notes;
}

function initEvents() {
  displayModeToggle.addEventListener("click", () => {
    state.layout = state.layout === "desktop" ? "mobile" : "desktop";
    applyLayout();
    save();
  });

  document.getElementById("addPlanningRow").addEventListener("click", () => {
    state.planning.push({ time: "", task: "", sector: "", status: "À faire" });
    renderPlanning();
    save();
  });

  planningBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (Number.isNaN(index) || !field || !state.planning[index]) return;
    state.planning[index][field] = target.value;
    save();
  });

  planningBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeIndex = target.getAttribute("data-remove");
    if (removeIndex === null) return;

    state.planning.splice(Number(removeIndex), 1);
    renderPlanning();
    save();
  });

  checklistContainer.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    const index = Number(target.dataset.checkIndex);
    if (Number.isNaN(index) || !state.checklist[index]) return;
    state.checklist[index].done = target.checked;
    renderChecklist();
    save();
  });

  document.getElementById("resetChecklist").addEventListener("click", () => {
    state.checklist = state.checklist.map((item) => ({ ...item, done: false }));
    renderChecklist();
    save();
  });

  [
    [dayDate, "date"],
    [dayOwner, "owner"],
    [dayNotes, "notes"],
  ].forEach(([element, key]) => {
    element.addEventListener("input", () => {
      state.day[key] = element.value;
      save();
    });
  });
}

function init() {
  load();
  applyLayout();
  syncDayForm();
  renderPlanning();
  renderChecklist();
  initEvents();
  save();
}

init();
