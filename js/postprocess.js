// ==========================================
// Nachbearbeitung: Transkript -> KI-Ausgaben
// Mehrfachauswahl: mehrere Prompts ankreuzen, alle werden erstellt.
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
const promptChecklist = document.getElementById("prompt-checklist");
const llmModelSelect = document.getElementById("llm-model");
const generateBtn = document.getElementById("generate-btn");
const llmProgress = document.getElementById("llm-progress");
const llmProgressBar = document.getElementById("llm-progress-bar");
const llmProgressText = document.getElementById("llm-progress-text");
const llmResults = document.getElementById("llm-results");
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

const sleepP = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Init ---
renderPromptChecklist();

// Hook: wird von app.js nach erfolgreicher Transkription aufgerufen
window.onTranscriptReady = function () {
  postSection.classList.remove("hidden");
  postSection.scrollIntoView({ behavior: "smooth", block: "start" });
};

// ==========================================
// Prompt-Auswahl (Checkboxen)
// ==========================================
function renderPromptChecklist() {
  const checkedIds = new Set(
    [...promptChecklist.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value)
  );
  promptChecklist.innerHTML = "";

  state.prompts.forEach((p) => {
    const row = document.createElement("label");
    row.className = "check-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = p.id;
    if (checkedIds.has(p.id)) cb.checked = true;
    const info = document.createElement("div");
    info.className = "check-info";
    const t = document.createElement("span");
    t.className = "check-title";
    t.textContent = p.title;
    const h = document.createElement("span");
    h.className = "check-hint";
    h.textContent = p.hint || "";
    info.appendChild(t);
    info.appendChild(h);
    row.appendChild(cb);
    row.appendChild(info);
    promptChecklist.appendChild(row);
  });
}

function selectedPrompts() {
  const ids = [...promptChecklist.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
  return state.prompts.filter((p) => ids.includes(p.id));
}

// ==========================================
// Generierung (alle ausgewählten nacheinander)
// ==========================================
generateBtn.addEventListener("click", generateAll);

async function generateAll() {
  const transcriptText = (transcriptEl.value || "").trim();
  if (!transcriptText) {
    alert("Es gibt noch kein Transkript.");
    return;
  }
  const chosen = selectedPrompts();
  if (!chosen.length) {
    alert("Bitte kreuze mindestens einen Text an.");
    return;
  }

  const systemPrompt = fillProfile(state.voice);
  const model = (state.customModel || "").trim() || llmModelSelect.value;

  generateBtn.disabled = true;
  llmResults.innerHTML = "";
  llmProgress.classList.remove("hidden");
  llmProgressText.style.color = "";

  for (let i = 0; i < chosen.length; i++) {
    const p = chosen[i];
    const pct = Math.round(((i) / chosen.length) * 100);
    setLlmProgress(Math.max(8, pct), `Erstelle ${i + 1}/${chosen.length}: ${p.title} …`);
    const finalPrompt = fillProfile(p.prompt) + "\n\n---\nTRANSKRIPT:\n" + transcriptText;
    try {
      const output = await runLlm({ prompt: finalPrompt, system_prompt: systemPrompt, model });
      addResultCard(p, output.trim(), false);
    } catch (err) {
      addResultCard(p, "Fehler: " + (err?.message || err), true);
    }
  }

  setLlmProgress(100, `Fertig – ${chosen.length} Text${chosen.length > 1 ? "e" : ""} erstellt.`);
  llmProgressText.style.color = "#22c55e";
  generateBtn.disabled = false;
  if (llmResults.firstChild) llmResults.firstChild.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addResultCard(prompt, text, isError) {
  const card = document.createElement("div");
  card.className = "result-card" + (isError ? " result-card-error" : "");

  const head = document.createElement("div");
  head.className = "result-header";
  const title = document.createElement("h2");
  title.textContent = prompt.title;
  head.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  const ta = document.createElement("textarea");
  ta.className = "llm-output";
  ta.value = text;

  if (!isError) {
    const copyBtn = mkBtn("Kopieren", "btn-secondary", async () => {
      await navigator.clipboard.writeText(ta.value);
      copyBtn.textContent = "Kopiert!";
      setTimeout(() => (copyBtn.textContent = "Kopieren"), 2000);
    });
    const txtBtn = mkBtn(".txt", "btn-secondary", () =>
      download(new Blob([ta.value], { type: "text/plain;charset=utf-8" }), dlName(prompt.id, "txt"))
    );
    const mdBtn = mkBtn(".md", "btn-secondary", () =>
      download(new Blob([ta.value], { type: "text/markdown;charset=utf-8" }), dlName(prompt.id, "md"))
    );
    const docBtn = mkBtn("Word", "btn-primary", () =>
      download(new Blob(["﻿" + docHtml(ta.value)], { type: "application/msword" }), dlName(prompt.id, "doc"))
    );
    actions.append(copyBtn, txtBtn, mdBtn, docBtn);
  }

  head.appendChild(actions);
  card.appendChild(head);
  card.appendChild(ta);
  llmResults.appendChild(card);
}

function mkBtn(label, variant, onClick) {
  const b = document.createElement("button");
  b.className = `btn ${variant} btn-small`;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
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
// Download-Helfer
// ==========================================
function dlName(id, ext) {
  const slug = (id || "ausgabe").replace(/[^a-z0-9-]/gi, "-");
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

function docHtml(text) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#222;}" +
    "h1{font-size:18pt;color:#8B1A6B;}h2{font-size:14pt;color:#8B1A6B;}h3{font-size:12pt;color:#5E1148;}" +
    "</style></head><body>" + mdToHtml(text) + "</body></html>"
  );
}

function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  const lines = (md || "").split(/\r?\n/);
  let html = "";
  let list = null;
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

// --- Downloads für das reine Transkript (Schritt 1) ---
function txName(ext) {
  let base = "transkript";
  try {
    if (typeof selectedFile !== "undefined" && selectedFile && selectedFile.name) {
      base = selectedFile.name.replace(/\.[^.]+$/, "") + "_transkript";
    }
  } catch {}
  return `${base}.${ext}`;
}
const txMdBtn = document.getElementById("tx-dl-md");
const txDocBtn = document.getElementById("tx-dl-doc");
if (txMdBtn) {
  txMdBtn.addEventListener("click", () =>
    download(new Blob([transcriptEl.value], { type: "text/markdown;charset=utf-8" }), txName("md"))
  );
}
if (txDocBtn) {
  txDocBtn.addEventListener("click", () =>
    download(new Blob(["﻿" + docHtml(transcriptEl.value)], { type: "application/msword" }), txName("doc"))
  );
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
});

resetVoiceBtn.addEventListener("click", () => { voiceEditEl.value = D.voice; });

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
        renderPromptChecklist();
      }
    });
    promptListEl.appendChild(row);
  });
}

let editingIndex = -1;

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
  pePrompt.value = "AUFGABE: \n\nKONTEXT: \n\nGRENZEN: \n\nQUALITÄT: ";
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
  renderPromptChecklist();
  closeModal(peOverlay);
});

resetPromptsBtn.addEventListener("click", () => {
  if (confirm("Alle Prompts auf den Standard zurücksetzen? Eigene Prompts gehen verloren.")) {
    state.prompts = deepClone(D.prompts);
    persistPrompts();
    renderPromptList();
    renderPromptChecklist();
  }
});

function persistPrompts() { saveJSON(LS.prompts, state.prompts); }

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
function saveJSON(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
