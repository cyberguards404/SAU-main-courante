import {
  state,
  createPlanningItem,
  ensureActiveChecklist,
  getSectorById,
  saveState,
} from "../core/state.js";
import { dom, escapeHtml } from "../core/dom.js";

let rerenderAll = () => {};

export function setPlanningRenderHook(fn) {
  rerenderAll = fn;
}

function sectorName(sectorId) {
  return getSectorById(sectorId)?.name || "Secteur";
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
  return copy;
}

export function validatePlanning(index) {
  const item = state.planning[index];
  if (!item) return;

  if (!state.signature.signerName.trim() || !state.signature.imageData) {
    window.alert("Ajoutez une signature dans la checklist (validation generale) avant validation.");
    state.activeView = "checklist";
    rerenderAll();
    return;
  }

  item.status = "Terminee";
  item.validatedAt = new Date().toISOString();
  item.validationSignature = {
    signerName: state.signature.signerName,
    signerRole: state.signature.signerRole,
    imageData: state.signature.imageData,
    signedAt: item.validatedAt,
  };

  if (item.recurrenceType !== "Aucune" && item.recurrenceInfinite && !findNextIterationExists(item)) {
    state.planning.push(createNextIteration(item));
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
        <button type="button" data-validate="${index}">${item.validatedAt ? "Revalider" : "Valider"}</button>
        <small>${escapeHtml(validationText)}</small>
        <small>${escapeHtml(signerText)}</small>
      </td>
      <td><button type="button" class="secondary-btn" data-remove="${index}">Supprimer</button></td>
    `;

    tr.querySelector('[data-field="sectorId"]').value = item.sectorId;
    dom.planningBody.appendChild(tr);
  });
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
      validatePlanning(index);
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

    const validate = target.getAttribute("data-validate");
    if (validate !== null) {
      validatePlanning(Number(validate));
    }
  });
}

export function getPlannedSectors() {
  const ids = Array.from(new Set(state.planning.map((p) => p.sectorId).filter(Boolean)));
  return ids.map((id) => ({ id, name: sectorName(id) }));
}

export function getPlanningBySector(sectorId) {
  return state.planning.filter((p) => p.sectorId === sectorId);
}
