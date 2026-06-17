// ==========================================
// Nachbearbeitung: Transkript -> KI-Ausgabe
// Prompts & Profil in localStorage, KI über /api/fal-llm (fal, derselbe Key).
// ==========================================

const LS = {
  profile: "maestra_profile",
  voice: "maestra_voice",
  prompts: "maestra_prompts",
  customModel: "maestra_custom_model",
};

const D = window.MAESTRA_DEFAULTS || { voice: "", prompts: [] };

const state = {
  profile: loadJSON(LS.profile, { name: "", signatur: "", firma: "" }),
  voice: localStorage.getItem(LS.voice) || D.voice,
  prompts: loadJSON(LS.prompts, null) || deepClone(D.prompts),
  customModel: localStorage.getItem(LS.customModel) || "",
};

// --- DOM ---
const postSection = document.getElementById("post-section");
const promptSelect = document.getElementById("prompt-select");
const promptHint = document.getElementById("prompt-hint");
const llmModelSelect = document.getElementById("llm-model");
const toggleEditBtn = document.getElementById("toggle-prompt-edit");
const promptEditWrap = document.getElementById("prompt-edit-wrap");
const promptEditEl = document.getElementById("prompt-edit");
const generateBtn = document.getElementById("generate-btn");
const llmProgress = document.getElementById("llm-progress");
const llmProgressBar = document.getElementById("llm-progress-bar");
const llmProgressText = document.getElementById("llm-progress-text");
const llmResult = document.getElementById("llm-result");
const llmResultTitle = document.getElementById("llm-result-title");
const llmOutput = document.getElementById("llm-output");
const llmCopyBtn = document.getElementById("llm-copy-btn");
const transcriptEl = document.getElementById("transcript");

// Settings modal
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");
const settingsSave = document.getElementById("settings-save");
const profileNameEl = document.getElementById("profile-name");
const profileSignatureEl = document.getElementById("profile-signature");
const profileFirmaEl = document.getElementById("profile-firma");
const customModelEl = document.getElementById("custom-model");
const voiceEditEl = document.getElementById("voice-edit");
const promptListEl = document.getElementById("prompt-list");
const addPromptBtn = document.getElementById("add-prompt");
const resetPromptsBtn = document.getElementById("reset-prompts");
const resetVoiceBtn = document.getElementById("reset-voice");

// Prompt editor modal
const peOverlay = document.getElementById("prompt-editor-overlay");
const peClose = document.getElementById("prompt-editor-close");
const peTitle = document.getElementById("pe-title");
const peHint = document.getElementById("pe-hint");
const pePrompt = document.getElementById("pe-prompt");
const peSave = document.getElementById("pe-save");

// --- Init ---
renderPromptDropdown();
const sleepP = (ms) => new Promise((r) => setTimeout(r, ms));

// Hook: wird von app.js nach erfolgreicher Transkription aufgerufen
window.onTranscriptReady = function () {
  postSection.classList.remove("hidden");
  postSection.scrollIntoView({ behavior: "smooth", block: "start" });
};

// ==========================================
// Prompt-Auswahl
// ==========================================
function renderPromptDropdown() {
  const prev = promptSelect.value;
  promptSelect.innerHTML = "";
  state.prompts.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.title;
    promptSelect.appendChild(o);
  });
  if (prev && state.prompts.some((p) => p.id === prev)) promptSelect.value = prev;
  syncSelectedPrompt();
}

function currentPrompt() {
  return state.prompts.find((p) => p.id === promptSelect.value) || state.prompts[0];
}

function syncSelectedPrompt() {
  const p = currentPrompt();
  if (!p) return;
  promptHint.textContent = p.hint || "";
  promptEditEl.value = p.prompt;
}

promptSelect.addEventListener("change", syncSelectedPrompt);

toggleEditBtn.addEventListener("click", () => {
  const hidden = promptEditWrap.classList.toggle("hidden");
  toggleEditBtn.textContent = hidden
    ? "Prompt für diesen Lauf anpassen ▾"
    : "Prompt einklappen ▴";
});

// ==========================================
// Generierung
// ==========================================
generateBtn.addEventListener("click", generate);

async function generate() {
  const transcriptText = (transcriptEl.value || "").trim();
  if (!transcriptText) {
    alert("Es gibt noch kein Transkript.");
    return;
  }

  const rawPrompt = (promptEditWrap.classList.contains("hidden")
    ? currentPrompt().prompt
    : promptEditEl.value
  ).trim();

  const finalPrompt =
    fillProfile(rawPrompt) + "\n\n---\nTRANSKRIPT:\n" + transcriptText;
  const systemPrompt = fillProfile(state.voice);
  const model = (state.customModel || "").trim() || llmModelSelect.value;

  generateBtn.disabled = true;
  llmResult.classList.add("hidden");
  llmProgress.classList.remove("hidden");
  setLlmProgress(15, "Anfrage wird gestartet…");

  try {
    const output = await runLlm({ prompt: finalPrompt, system_prompt: systemPrompt, model });
    llmOutput.value = output.trim();
    llmResultTitle.textContent = currentPrompt().title;
    llmResult.classList.remove("hidden");
    setLlmProgress(100, "Fertig.");
    llmProgressText.style.color = "#22c55e";
    llmResult.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setLlmProgress(0, "Fehler: " + (err?.message || err));
    llmProgressText.style.color = "#ef4444";
  } finally {
    generateBtn.disabled = false;
  }
}

async function runLlm({ prompt, system_prompt, model }) {
  const submitRes = await fetch("/api/fal-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system_prompt, model }),
  });
  const submitTxt = await submitRes.text();
  if (!submitRes.ok) throw new Error(parseErr(submitTxt, submitRes.status));

  let submit;
  try { submit = JSON.parse(submitTxt); } catch { throw new Error("Ungültige Antwort (Submit)"); }
  const requestId = submit.request_id;
  const endpoint = submit.llm_endpoint || "openrouter/router";
  if (!requestId) throw new Error("Keine request_id erhalten");

  setLlmProgress(45, "Modell schreibt…");

  const intervalMs = 3000;
  const maxTries = 80; // ~4 Min
  for (let i = 0; i < maxTries; i++) {
    await sleepP(intervalMs);
    let statusRes;
    try {
      statusRes = await fetch("/api/fal-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: endpoint, request_id: requestId }),
      });
    } catch {
      continue;
    }
    const statusTxt = await statusRes.text();
    if (!statusRes.ok) throw new Error(parseErr(statusTxt, statusRes.status));

    let status;
    try { status = JSON.parse(statusTxt); } catch { throw new Error("Ungültige Antwort (Status)"); }

    if (status.status === "COMPLETED") {
      const out = status.result?.output;
      if (typeof out !== "string") throw new Error("Kein Text in der Antwort");
      return out;
    } else if (status.status === "IN_PROGRESS") {
      setLlmProgress(70, "Modell schreibt…");
    } else {
      setLlmProgress(50, "In der Warteschlange…");
    }
  }
  throw new Error("Zeitüberschreitung. Bitte erneut versuchen.");
}

function parseErr(txt, code) {
  try {
    const e = JSON.parse(txt);
    return e.detail?.[0]?.msg || e.detail || e.error || `Fehler ${code}`;
  } catch {
    return txt || `Fehler ${code}`;
  }
}

function setLlmProgress(pct, text) {
  llmProgressBar.style.width = pct + "%";
  llmProgressText.textContent = text;
  llmProgressText.style.color = "";
}

// ==========================================
// Platzhalter aus Profil
// ==========================================
function fillProfile(text) {
  const name = (state.profile.name || "").trim() || "mich";
  const firma = (state.profile.firma || "").trim();
  const sig =
    (state.profile.signatur || "").trim() ||
    ((state.profile.name || "").trim()
      ? "Alles Liebe, deine " + state.profile.name.trim()
      : "Alles Liebe");
  const firmaSuffix = firma ? " (" + firma + ")" : "";
  const datum = new Date().toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });
  return (text || "")
    .replaceAll("{{name}}", name)
    .replaceAll("{{signatur}}", sig)
    .replaceAll("{{firma_suffix}}", firmaSuffix)
    .replaceAll("{{firma}}", firma)
    .replaceAll("{{datum}}", datum);
}

// ==========================================
// Kopieren & Download (.txt / .md / .doc)
// ==========================================
llmCopyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(llmOutput.value);
  llmCopyBtn.textContent = "Kopiert!";
  setTimeout(() => (llmCopyBtn.textContent = "Kopieren"), 2000);
});

function dlName(ext) {
  const slug = (currentPrompt().id || "ausgabe").replace(/[^a-z0-9-]/gi, "-");
  const date = new Date().toISOString().slice(0, 10);
  return `${date}_${slug}.${ext}`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("dl-txt").addEventListener("click", () => {
  download(new Blob([llmOutput.value], { type: "text/plain;charset=utf-8" }), dlName("txt"));
});
document.getElementById("dl-md").addEventListener("click", () => {
  download(new Blob([llmOutput.value], { type: "text/markdown;charset=utf-8" }), dlName("md"));
});
document.getElementById("dl-doc").addEventListener("click", () => {
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#222;}" +
    "h1{font-size:18pt;color:#8B1A6B;}h2{font-size:14pt;color:#8B1A6B;}h3{font-size:12pt;color:#5E1148;}" +
    "</style></head><body>" + mdToHtml(llmOutput.value) + "</body></html>";
  download(new Blob(["﻿" + html], { type: "application/msword" }), dlName("doc"));
});

function mdToHtml(md) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  const lines = (md || "").split(/\r?\n/);
  let html = "";
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      closeList();
      const lvl = m[1].length;
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
      html += `<li>${inline(m[1])}</li>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// ==========================================
// Einstellungen-Modal
// ==========================================
function openModal(el) { el.classList.remove("hidden"); }
function closeModal(el) { el.classList.add("hidden"); }

settingsBtn.addEventListener("click", () => {
  profileNameEl.value = state.profile.name || "";
  profileSignatureEl.value = state.profile.signatur || "";
  profileFirmaEl.value = state.profile.firma || "";
  customModelEl.value = state.customModel || "";
  voiceEditEl.value = state.voice || "";
  renderPromptList();
  openModal(settingsOverlay);
});
settingsClose.addEventListener("click", () => closeModal(settingsOverlay));
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeModal(settingsOverlay);
});

document.querySelectorAll(".mtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mtab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".mpanel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.mpanel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
  });
});

settingsSave.addEventListener("click", () => {
  state.profile = {
    name: profileNameEl.value.trim(),
    signatur: profileSignatureEl.value.trim(),
    firma: profileFirmaEl.value.trim(),
  };
  state.customModel = customModelEl.value.trim();
  state.voice = voiceEditEl.value;
  saveJSON(LS.profile, state.profile);
  localStorage.setItem(LS.customModel, state.customModel);
  localStorage.setItem(LS.voice, state.voice);
  closeModal(settingsOverlay);
  syncSelectedPrompt();
});

resetVoiceBtn.addEventListener("click", () => {
  voiceEditEl.value = D.voice;
});

// ==========================================
// Prompt-Liste verwalten
// ==========================================
function renderPromptList() {
  promptListEl.innerHTML = "";
  state.prompts.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "prompt-row";
    row.innerHTML =
      `<div class="prompt-row-info"><span class="prompt-row-title"></span>` +
      `<span class="prompt-row-hint"></span></div>` +
      `<div class="prompt-row-actions">` +
      `<button class="btn btn-secondary btn-small" data-act="edit">Bearbeiten</button>` +
      `<button class="btn-icon" data-act="del" title="Löschen">&times;</button></div>`;
    row.querySelector(".prompt-row-title").textContent = p.title;
    row.querySelector(".prompt-row-hint").textContent = p.hint || "";
    row.querySelector('[data-act="edit"]').addEventListener("click", () => editPrompt(idx));
    row.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (confirm(`Prompt „${p.title}" löschen?`)) {
        state.prompts.splice(idx, 1);
        persistPrompts();
        renderPromptList();
        renderPromptDropdown();
      }
    });
    promptListEl.appendChild(row);
  });
}

let editingIndex = -1; // -1 = neuer Prompt

function editPrompt(idx) {
  editingIndex = idx;
  const p = state.prompts[idx];
  peTitle.value = p.title;
  peHint.value = p.hint || "";
  pePrompt.value = p.prompt;
  openModal(peOverlay);
}

addPromptBtn.addEventListener("click", () => {
  editingIndex = -1;
  peTitle.value = "";
  peHint.value = "";
  pePrompt.value =
    "AUFGABE: \n\nKONTEXT: \n\nGRENZEN: \n\nQUALITÄT: ";
  openModal(peOverlay);
});

peClose.addEventListener("click", () => closeModal(peOverlay));
peOverlay.addEventListener("click", (e) => {
  if (e.target === peOverlay) closeModal(peOverlay);
});

peSave.addEventListener("click", () => {
  const title = peTitle.value.trim();
  if (!title) { alert("Bitte einen Titel vergeben."); return; }
  const data = { title, hint: peHint.value.trim(), prompt: pePrompt.value };
  if (editingIndex === -1) {
    data.id = "custom-" + Date.now();
    state.prompts.push(data);
  } else {
    data.id = state.prompts[editingIndex].id;
    state.prompts[editingIndex] = data;
  }
  persistPrompts();
  renderPromptList();
  renderPromptDropdown();
  closeModal(peOverlay);
});

resetPromptsBtn.addEventListener("click", () => {
  if (confirm("Alle Prompts auf den Standard zurücksetzen? Eigene Prompts gehen verloren.")) {
    state.prompts = deepClone(D.prompts);
    persistPrompts();
    renderPromptList();
    renderPromptDropdown();
  }
});

function persistPrompts() {
  saveJSON(LS.prompts, state.prompts);
}

// ==========================================
// Helpers
// ==========================================
function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
