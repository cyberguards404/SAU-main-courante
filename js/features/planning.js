import {
  state,
  createPlanningItem,
  ensureActiveChecklist,
  getSectorById,
  saveState,
} from "../core/state.js?v=20260430-7";
import { dom, escapeHtml } from "../core/dom.js?v=20260430-7";

let rerenderAll = () => {};
let planningAgendaAnchor = new Date();
let planningAgendaSelectedDayKey = "";

export function setPlanningRenderHook(fn) {
  rerenderAll = fn;
}

function sectorName(sectorId) {
  return getSectorById(sectorId)?.name || "Secteur";
}

function toDateKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addPlanningRecurrenceDate(dateKey, recurrenceType, recurrenceEvery) {
  if (!dateKey || recurrenceType === "Aucune") return "";
  const [year, month, day] = String(dateKey).split("-").map((part) => Number(part));
  const base = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(base.getTime())) return "";
  const next = new Date(base);
  const step = Math.max(1, Number(recurrenceEvery) || 1);
  if (recurrenceType === "Quotidienne") {
    next.setDate(next.getDate() + step);
  } else if (recurrenceType === "Hebdomadaire") {
    next.setDate(next.getDate() + (step * 7));
  } else if (recurrenceType === "Mensuelle") {
    next.setMonth(next.getMonth() + step);
  } else {
    return "";
  }
  return toDateKey(next);
}

function buildPlanningAgendaEntries(rangeStart, rangeEnd) {
  const entries = [];
  const source = Array.isArray(state.planning) ? state.planning.filter((item) => item.sectorId) : [];

  source.forEach((item) => {
    let cursor = item.plannedDate || toDateKey(new Date());
    let iteration = Math.max(1, Number(item.iteration) || 1);

    for (let guard = 0; guard < 380; guard += 1) {
      const cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) break;

      if (cursorDate >= rangeStart && cursorDate <= rangeEnd) {
        const isDone = Array.isArray(item.validatedDates) && item.validatedDates.includes(cursor);
        entries.push({ item, occurrenceDate: cursor, iteration, isDone });
      }

      if (!item.recurrenceInfinite || item.recurrenceType === "Aucune") break;
      const next = addPlanningRecurrenceDate(cursor, item.recurrenceType, item.recurrenceEvery);
      if (!next || next === cursor) break;
      if (new Date(next).getTime() > rangeEnd.getTime()) break;
      cursor = next;
      iteration += 1;
    }
  });

  return entries;
}

function renderPlanningAgenda() {
  if (!dom.planningAgendaGrid || !dom.planningAgendaEvents || !dom.planningAgendaMonthLabel) return;

  const year = planningAgendaAnchor.getFullYear();
  const month = planningAgendaAnchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, lastDay.getDate(), 23, 59, 59, 999);
  const monthStartShift = (firstDay.getDay() + 6) % 7;
  const agendaEntries = buildPlanningAgendaEntries(monthStart, monthEnd);

  dom.planningAgendaMonthLabel.textContent = firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const entriesByDay = new Map();
  agendaEntries.forEach((entry) => {
    const bucket = entriesByDay.get(entry.occurrenceDate) || [];
    bucket.push(entry);
    entriesByDay.set(entry.occurrenceDate, bucket);
  });

  const firstEventDayKey = [...entriesByDay.keys()].sort()[0] || "";
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const selectedInMonth = planningAgendaSelectedDayKey && planningAgendaSelectedDayKey.startsWith(monthPrefix)
    ? planningAgendaSelectedDayKey
    : "";
  if (!selectedInMonth) {
    planningAgendaSelectedDayKey = firstEventDayKey || toDateKey(firstDay);
  } else if (!entriesByDay.has(planningAgendaSelectedDayKey) && firstEventDayKey) {
    planningAgendaSelectedDayKey = firstEventDayKey;
  }

  const weekLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  dom.planningAgendaGrid.innerHTML = weekLabels.map((label) => `<div class="command-agenda-weekday">${label}</div>`).join("");

  for (let i = 0; i < 42; i += 1) {
    const dayNumber = i - monthStartShift + 1;
    const inMonth = dayNumber >= 1 && dayNumber <= lastDay.getDate();
    const date = new Date(year, month, dayNumber);
    const key = toDateKey(date);
    const dayEntries = inMonth ? (entriesByDay.get(key) || []) : [];
    const done = dayEntries.filter((entry) => entry.isDone).length;
    const pending = dayEntries.filter((entry) => !entry.isDone).length;
    const isSelected = key === planningAgendaSelectedDayKey;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `command-agenda-day ${inMonth ? "" : "is-out"} ${isSelected ? "is-selected" : ""}`.trim();
    cell.setAttribute("data-planning-agenda-day-key", key);
    cell.disabled = !inMonth;
    cell.innerHTML = `
      <span class="command-agenda-daynum">${inMonth ? dayNumber : ""}</span>
      ${inMonth ? `<small>${dayEntries.length} verif</small>` : ""}
      ${inMonth && dayEntries.length > 0 ? `<div class="command-agenda-markers"><span class="ok">${done}</span><span class="pending">${pending}</span></div>` : ""}
    `;
    dom.planningAgendaGrid.appendChild(cell);
  }

  const selectedEntries = entriesByDay.get(planningAgendaSelectedDayKey) || [];
  if (selectedEntries.length === 0) {
    const label = planningAgendaSelectedDayKey ? planningAgendaSelectedDayKey.split("-").reverse().join("/") : "ce jour";
    dom.planningAgendaEvents.innerHTML = `<p class="muted-text">Aucune verification planifiee le ${escapeHtml(label)}.</p>`;
    return;
  }

  dom.planningAgendaEvents.innerHTML = selectedEntries
    .sort((left, right) => String(left.item.time || "").localeCompare(String(right.item.time || "")))
    .map(({ item, occurrenceDate, iteration, isDone }) => {
      const sector = getSectorById(item.sectorId);
      const when = `${occurrenceDate.split("-").reverse().join("/")}${item.time ? ` ${item.time}` : ""}`;
      const itemIndex = state.planning.indexOf(item);
      return `
        <div class="command-agenda-event-item">
          <strong>${escapeHtml(sector?.name || "Secteur")}</strong>
          <small>${escapeHtml(when)}</small>
          <small>Iteration ${iteration}</small>
          <span class="badge ${isDone ? "badge-ok" : "badge-pending"}">${isDone ? "Terminee" : "A faire"}</span>
          ${!isDone ? '<small>Validation via Checklist</small>' : ""}
        </div>
      `;
    })
    .join("");
}

function applyDefaults(item, sectorId) {
  const sector = getSectorById(sectorId);
  if (!sector) return;
  item.time = sector.planningDefaults.time || "";
  item.recurrenceType = sector.planningDefaults.recurrenceType || "Aucune";
  item.recurrenceEvery = Math.max(1, Number(sector.planningDefaults.recurrenceEvery) || 1);
  item.recurrenceInfinite = Boolean(sector.planningDefaults.recurrenceInfinite);
}

function findNextIterationExists(item) {
  const next = item.iteration + 1;
  return state.planning.some(
    (p) =>
      p.sectorId === item.sectorId &&
      p.time === item.time &&
      p.recurrenceType === item.recurrenceType &&
      p.iteration === next,
  );
}

function createNextIteration(item) {
  const copy = createPlanningItem(item.sectorId);
  copy.time = item.time;
  copy.recurrenceType = item.recurrenceType;
  copy.recurrenceEvery = item.recurrenceEvery;
  copy.recurrenceInfinite = item.recurrenceInfinite;
  copy.iteration = item.iteration + 1;
  const baseDateKey = item.plannedDate || toDateKey(new Date());
  copy.plannedDate = addPlanningRecurrenceDate(baseDateKey, item.recurrenceType, item.recurrenceEvery) || baseDateKey;
  return copy;
}

export function validatePlanning(index, dateKey) {
  const item = state.planning[index];
  if (!item) return;

  if (state.activeView !== "checklist") {
    window.alert("La validation d'une verification ne peut se faire que depuis la page Checklist.");
    state.activeView = "checklist";
    rerenderAll();
    return;
  }

  if (!state.signature.signerName.trim() || !state.signature.imageData) {
    window.alert("Enregistrez d'abord la signature avant de valider cette verification depuis la checklist.");
    return;
  }

  const validationDate = dateKey || item.plannedDate || toDateKey(new Date());

  if (!Array.isArray(item.validatedDates)) item.validatedDates = [];
  if (!item.validatedDates.includes(validationDate)) {
    item.validatedDates.push(validationDate);
  }

  // Pour la compatibilité avec la table admin (item sans récurrence), on garde aussi status
  if (item.recurrenceType === "Aucune" || !item.recurrenceInfinite) {
    item.status = "Terminee";
    item.validatedAt = new Date().toISOString();
    item.validationSignature = {
      signerName: state.signature.signerName,
      signerRole: state.signature.signerRole,
      imageData: state.signature.imageData,
      signedAt: item.validatedAt,
    };
  }

  ensureActiveChecklist();
  rerenderAll();
  saveState();
}

export function renderPlanning() {
  if (!dom.planningBody) return;

  if (state.planning.length === 0) {
    const firstSector = state.templates.sectors[0];
    if (firstSector) {
      const item = createPlanningItem(firstSector.id);
      applyDefaults(item, firstSector.id);
      state.planning.push(item);
    }
  }

  const sectorOptions = state.templates.sectors
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
    .join("");

  dom.planningBody.innerHTML = "";

  state.planning.forEach((item, index) => {
    const validationText = item.validatedAt
      ? `Validee le ${new Date(item.validatedAt).toLocaleString("fr-FR")}`
      : "En attente";
    const signerText = item.validationSignature?.signerName
      ? `Signe par ${item.validationSignature.signerName}`
      : "Pas de signature";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="date" value="${escapeHtml(item.plannedDate || "")}" data-index="${index}" data-field="plannedDate" /></td>
      <td><input type="time" value="${escapeHtml(item.time || "")}" data-index="${index}" data-field="time" /></td>
      <td><select data-index="${index}" data-field="sectorId">${sectorOptions}</select></td>
      <td>
        <div class="inline-actions">
          <select class="mini-select" data-index="${index}" data-field="recurrenceType">
            ${["Aucune", "Quotidienne", "Hebdomadaire", "Mensuelle"]
              .map((r) => `<option ${item.recurrenceType === r ? "selected" : ""}>${r}</option>`)
              .join("")}
          </select>
          <input class="mini-number" type="number" min="1" step="1" value="${item.recurrenceEvery}" data-index="${index}" data-field="recurrenceEvery" />
        </div>
      </td>
      <td><input type="checkbox" data-index="${index}" data-field="recurrenceInfinite" ${item.recurrenceInfinite ? "checked" : ""} /></td>
      <td>
        <select data-index="${index}" data-field="status">
          ${["A faire", "En cours", "Terminee"].map((s) => `<option ${item.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="planning-validation">
        <small>Validation uniquement depuis Checklist</small>
        <small>${escapeHtml(validationText)}</small>
        <small>${escapeHtml(signerText)}</small>
      </td>
      <td><button type="button" class="secondary-btn" data-remove="${index}">Supprimer</button></td>
    `;

    tr.querySelector('[data-field="sectorId"]').value = item.sectorId;
    dom.planningBody.appendChild(tr);
  });

  renderPlanningAgenda();
}

export function bindPlanningEvents() {
  const addPlanningRowBtn = document.getElementById("addPlanningRow");
  if (!addPlanningRowBtn || !dom.planningBody) {
    return;
  }

  addPlanningRowBtn.addEventListener("click", () => {
    const firstSector = state.templates.sectors[0];
    if (!firstSector) return;
    const item = createPlanningItem(firstSector.id);
    applyDefaults(item, firstSector.id);
    state.planning.push(item);
    ensureActiveChecklist();
    rerenderAll();
    saveState();
  });

  dom.planningBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    const item = state.planning[index];
    if (!item || !field) return;

    if (field === "recurrenceInfinite" && target instanceof HTMLInputElement) {
      item.recurrenceInfinite = target.checked;
    } else if (field === "recurrenceEvery") {
      item.recurrenceEvery = Math.max(1, Number(target.value) || 1);
    } else {
      item[field] = target.value;
    }

    if (field === "sectorId") {
      applyDefaults(item, item.sectorId);
    }

    if (field === "status" && item.status === "Terminee" && !item.validatedAt) {
      item.status = "En cours";
      window.alert("Le statut 'Terminee' ne peut etre applique qu'apres validation depuis la page Checklist.");
      rerenderAll();
      return;
    }

    ensureActiveChecklist();
    rerenderAll();
    saveState();
  });

  dom.planningBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const remove = target.getAttribute("data-remove");
    if (remove !== null) {
      const removed = state.planning[Number(remove)];
      state.planning.splice(Number(remove), 1);
      Object.keys(state.checklistData).forEach((k) => {
        if (k.startsWith(`${removed?.id}::`)) {
          delete state.checklistData[k];
        }
      });
      ensureActiveChecklist();
      rerenderAll();
      saveState();
      return;
    }

  });

  if (dom.planningAgendaPrevMonthBtn) {
    dom.planningAgendaPrevMonthBtn.addEventListener("click", () => {
      planningAgendaAnchor = new Date(planningAgendaAnchor.getFullYear(), planningAgendaAnchor.getMonth() - 1, 1);
      renderPlanningAgenda();
    });
  }

  if (dom.planningAgendaNextMonthBtn) {
    dom.planningAgendaNextMonthBtn.addEventListener("click", () => {
      planningAgendaAnchor = new Date(planningAgendaAnchor.getFullYear(), planningAgendaAnchor.getMonth() + 1, 1);
      renderPlanningAgenda();
    });
  }

  if (dom.planningAgendaEvents) {
    dom.planningAgendaEvents.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const idxAttr = target.getAttribute("data-validate-planning-idx");
      const dateAttr = target.getAttribute("data-validate-planning-date");
      if (idxAttr !== null && dateAttr !== null) {
        window.alert("La validation des verifications se fait uniquement depuis la page Checklist.");
        state.activeView = "checklist";
        rerenderAll();
      }
    });
  }

  if (dom.planningAgendaGrid) {
    dom.planningAgendaGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const dayBtn = target.closest("[data-planning-agenda-day-key]");
      if (!(dayBtn instanceof HTMLButtonElement) || dayBtn.disabled) return;
      const dayKey = dayBtn.getAttribute("data-planning-agenda-day-key") || "";
      if (!dayKey) return;
      planningAgendaSelectedDayKey = dayKey;
      renderPlanningAgenda();
    });
  }
}

export function getPlannedSectors() {
  const ids = Array.from(new Set(state.planning.map((p) => p.sectorId).filter(Boolean)));
  return ids.map((id) => ({ id, name: sectorName(id) }));
}

export function getPlanningBySector(sectorId) {
  return state.planning.filter((p) => p.sectorId === sectorId);
}
