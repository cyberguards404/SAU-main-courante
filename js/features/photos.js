import { state, createId, saveState } from "../core/state.js?v=20260430-7";
import { dom, escapeHtml } from "../core/dom.js?v=20260430-7";

export function renderPhotos() {
  dom.photoGallery.innerHTML = "";
  state.photos.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}" />
      <small>${new Date(photo.createdAt).toLocaleString("fr-FR")}</small>
      <textarea rows="2" data-photo-id="${photo.id}">${escapeHtml(photo.note || "")}</textarea>
      <button type="button" class="secondary-btn" data-remove-photo-id="${photo.id}">Supprimer</button>
    `;
    dom.photoGallery.appendChild(card);
  });
}

export function bindPhotosEvents() {
  dom.photoInput.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.files) return;

    for (const file of Array.from(target.files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      state.photos.unshift({
        id: createId(),
        name: file.name || "photo",
        dataUrl,
        createdAt: new Date().toISOString(),
        note: "",
      });
    }

    dom.photoInput.value = "";
    renderPhotos();
    saveState();
  });

  dom.photoGallery.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    const photo = state.photos.find((p) => p.id === target.dataset.photoId);
    if (!photo) return;
    photo.note = target.value;
    saveState();
  });

  dom.photoGallery.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeId = target.getAttribute("data-remove-photo-id");
    if (!removeId) return;
    state.photos = state.photos.filter((p) => p.id !== removeId);
    renderPhotos();
    saveState();
  });
}
