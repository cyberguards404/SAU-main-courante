import { state, saveState } from "../core/state.js";
import { dom } from "../core/dom.js";

let signatureCtx = null;
let drawing = false;
let moved = false;

export function renderSignature() {
  dom.signerName.value = state.signature.signerName;
  dom.signerRole.value = state.signature.signerRole;
  dom.signatureStatus.textContent = state.signature.signedAt
    ? `Signature enregistree le ${new Date(state.signature.signedAt).toLocaleString("fr-FR")}`
    : "Aucune signature enregistree.";
}

function pointerPos(event) {
  const rect = dom.signaturePad.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function resizePad() {
  const rect = dom.signaturePad.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const oldImage = state.signature.imageData;

  dom.signaturePad.width = Math.max(320, Math.floor(rect.width * dpr));
  dom.signaturePad.height = Math.max(180, Math.floor(rect.width * 0.28 * dpr));
  signatureCtx = dom.signaturePad.getContext("2d");
  signatureCtx.scale(dpr, dpr);
  signatureCtx.lineCap = "round";
  signatureCtx.lineJoin = "round";
  signatureCtx.strokeStyle = "#111827";
  signatureCtx.lineWidth = 2;
  signatureCtx.clearRect(0, 0, dom.signaturePad.width, dom.signaturePad.height);

  if (oldImage) {
    const img = new Image();
    img.onload = () => signatureCtx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = oldImage;
  }
}

export function bindSignatureEvents() {
  dom.signerName.addEventListener("input", () => {
    state.signature.signerName = dom.signerName.value;
    saveState();
  });

  dom.signerRole.addEventListener("input", () => {
    state.signature.signerRole = dom.signerRole.value;
    saveState();
  });

  dom.saveSignatureBtn.addEventListener("click", () => {
    state.signature.imageData = dom.signaturePad.toDataURL("image/png");
    state.signature.signedAt = new Date().toISOString();
    renderSignature();
    saveState();
  });

  dom.clearSignatureBtn.addEventListener("click", () => {
    const rect = dom.signaturePad.getBoundingClientRect();
    signatureCtx.clearRect(0, 0, rect.width, rect.height);
    state.signature.imageData = "";
    state.signature.signedAt = "";
    renderSignature();
    saveState();
  });

  dom.signaturePad.addEventListener("pointerdown", (event) => {
    if (!signatureCtx) return;
    event.preventDefault();
    drawing = true;
    moved = false;
    const p = pointerPos(event);
    signatureCtx.beginPath();
    signatureCtx.moveTo(p.x, p.y);
  });

  dom.signaturePad.addEventListener("pointermove", (event) => {
    if (!drawing || !signatureCtx) return;
    event.preventDefault();
    moved = true;
    const p = pointerPos(event);
    signatureCtx.lineTo(p.x, p.y);
    signatureCtx.stroke();
  });

  dom.signaturePad.addEventListener("pointerup", (event) => {
    if (!drawing || !signatureCtx) return;
    event.preventDefault();
    if (!moved) {
      const p = pointerPos(event);
      signatureCtx.beginPath();
      signatureCtx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      signatureCtx.fill();
    }
    drawing = false;
  });

  dom.signaturePad.addEventListener("pointerleave", () => {
    drawing = false;
  });

  window.addEventListener("resize", resizePad);
  resizePad();
}
