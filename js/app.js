// ==========================================
// Transkription — Teilnehmer-Variante
// fal-only. Der API-Key liegt serverseitig (Netlify FAL_KEY) und wird hier
// NIE gebraucht. Die Teilnehmerin gibt nichts ein ausser der Datei.
// ==========================================

// --- State ---
let selectedFile = null;

// --- Helper ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- DOM ---
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileInfo = document.getElementById("file-info");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const removeFileBtn = document.getElementById("remove-file");
const languageSelect = document.getElementById("language");
const modelSelect = document.getElementById("model");
const timestampsCheckbox = document.getElementById("timestamps");
const diarizeCheckbox = document.getElementById("diarize");
const diarizeRow = document.getElementById("diarize-row");
const diarizeHint = document.getElementById("diarize-hint");
const startBtn = document.getElementById("start-btn");
const progressSection = document.getElementById("progress-section");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const resultSection = document.getElementById("result-section");
const transcript = document.getElementById("transcript");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");

// --- Init ---
syncDiarizeAvailability();
updateStartButton();

// Service Worker registrieren (macht die App installierbar / offline-fähig)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// --- Modell-Wechsel: Speaker-Trennung nur bei Whisper ---
modelSelect.addEventListener("change", syncDiarizeAvailability);

function syncDiarizeAvailability() {
  if (!diarizeCheckbox) return;
  const supportsDiarize = modelSelect.value === "fal-ai/whisper";
  diarizeCheckbox.disabled = !supportsDiarize;
  if (!supportsDiarize && diarizeCheckbox.checked) {
    diarizeCheckbox.checked = false;
  }
  if (diarizeRow) diarizeRow.style.opacity = supportsDiarize ? "" : "0.45";
  if (diarizeHint) {
    diarizeHint.textContent = supportsDiarize
      ? "Erkennt verschiedene Sprecher und kennzeichnet sie als „Sprecher 1“, „Sprecher 2“ … Sprecheranzahl wird automatisch erkannt."
      : "Nur mit dem Whisper-Modell verfügbar — oben „Whisper Large v3“ als Modell wählen.";
  }
}

// --- Drag & Drop ---
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    handleFile(fileInput.files[0]);
  }
});

removeFileBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInfo.classList.add("hidden");
  fileInput.value = "";
  updateStartButton();
});

function handleFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const validExts = ["mp3", "mp4", "m4a", "wav", "ogg", "webm", "mov"];

  if (!validExts.includes(ext)) {
    alert("Dieses Dateiformat wird nicht unterstützt.\nErlaubt: MP3, MP4, M4A, WAV, OGG, WEBM");
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  fileInfo.classList.remove("hidden");
  updateStartButton();
}

// --- Start ---
startBtn.addEventListener("click", startTranscription);

async function startTranscription() {
  if (!selectedFile) return;

  startBtn.disabled = true;
  progressSection.classList.remove("hidden");
  resultSection.classList.add("hidden");

  try {
    await transcribeWithFal();
  } catch (err) {
    const msg = err?.message || err?.detail || JSON.stringify(err) || "Unbekannter Fehler";
    updateProgress(0, `Fehler: ${msg}`);
    progressText.style.color = "#ef4444";
  } finally {
    startBtn.disabled = false;
  }
}

// ==========================================
// UPLOAD  (klein = ein Stück, gross = Multipart)
// ==========================================

const FAL_MULTIPART_THRESHOLD = 90 * 1024 * 1024; // 90 MB

async function uploadFileToFal(file) {
  const contentType = file.type || "application/octet-stream";

  if (file.size > FAL_MULTIPART_THRESHOLD) {
    return await falMultipartUpload(file, contentType);
  }

  updateProgress(10, "Upload wird vorbereitet...");
  const initResponse = await fetch("/api/fal-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: file.name, content_type: contentType }),
  });

  if (!initResponse.ok) {
    throw new Error(`Upload-Init fehlgeschlagen: ${await initResponse.text()}`);
  }

  const { upload_url, file_url } = await initResponse.json();

  updateProgress(30, "Datei wird hochgeladen...");
  let uploadResponse;
  try {
    uploadResponse = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
  } catch (uploadErr) {
    throw new Error(`Datei-Upload Netzwerkfehler: ${uploadErr.message}`);
  }

  if (!uploadResponse.ok) {
    throw new Error(`Datei-Upload fehlgeschlagen (${uploadResponse.status})`);
  }

  return file_url;
}

async function falMultipartUpload(file, contentType) {
  updateProgress(5, "Grosse Datei — Upload wird vorbereitet...");

  const initRes = await fetch("/api/fal-upload-multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: file.name, content_type: contentType }),
  });

  if (!initRes.ok) {
    throw new Error(`Multipart-Init fehlgeschlagen (${initRes.status}): ${await initRes.text()}`);
  }

  const { upload_url, file_url } = await initRes.json();
  if (!upload_url || !file_url) {
    throw new Error("Multipart-Init: keine Upload-URL erhalten");
  }

  const parsed = new URL(upload_url);
  const chunkSize = 10 * 1024 * 1024; // 10 MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  const parts = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const partNumber = i + 1;
    const partUrl = `${parsed.origin}${parsed.pathname}/${partNumber}${parsed.search}`;

    let part = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(partUrl, { method: "PUT", body: chunk });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const txt = await r.text();
        let parsedPart = {};
        try { parsedPart = JSON.parse(txt); } catch { parsedPart = {}; }
        const etag = parsedPart.etag || r.headers.get("ETag") || r.headers.get("etag");
        part = { partNumber: parsedPart.partNumber || partNumber, etag };
        break;
      } catch (e) {
        if (attempt === 3) {
          throw new Error(`Teil ${partNumber}/${totalChunks} fehlgeschlagen: ${e.message}`);
        }
        await sleep(1000 * attempt);
      }
    }

    parts.push(part);
    const pct = 5 + Math.round((partNumber / totalChunks) * 35);
    updateProgress(pct, `Datei wird hochgeladen... (${partNumber}/${totalChunks} Teile)`);
  }

  updateProgress(42, "Upload wird abgeschlossen...");
  const completeUrl = `${parsed.origin}${parsed.pathname}/complete${parsed.search}`;
  const completeRes = await fetch(completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
  });

  if (!completeRes.ok) {
    throw new Error(`Upload-Abschluss fehlgeschlagen (${completeRes.status}): ${await completeRes.text()}`);
  }

  return file_url;
}

// ==========================================
// TRANSKRIPTION  (Queue: einreichen -> pollen -> Ergebnis)
// ==========================================

async function transcribeWithFal() {
  const falModel = modelSelect.value;
  const language = languageSelect.value;
  const useDiarize =
    !!(diarizeCheckbox && diarizeCheckbox.checked) && falModel === "fal-ai/whisper";

  // Schritt 1: Upload
  const file_url = await uploadFileToFal(selectedFile);

  // Schritt 2: in die Queue stellen
  updateProgress(50, "Transkription wird gestartet...");

  let input;
  if (falModel === "fal-ai/wizper") {
    input = { audio_url: file_url, task: "transcribe", chunk_level: "segment", version: "3" };
  } else {
    input = { audio_url: file_url, task: "transcribe", chunk_level: "segment" };
    if (useDiarize) input.diarize = true;
  }
  if (language !== "auto") input.language = language;

  let submitResponse;
  try {
    submitResponse = await fetch("/api/fal-transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: falModel, input }),
    });
  } catch (fetchErr) {
    throw new Error(`Transkription Netzwerkfehler: ${fetchErr.message}`);
  }

  const submitText = await submitResponse.text();
  if (!submitResponse.ok) {
    throw new Error(`fal.ai Fehler (${submitResponse.status}): ${parseFalError(submitText)}`);
  }

  let submitData;
  try {
    submitData = JSON.parse(submitText);
  } catch {
    throw new Error("Ungültige Antwort von fal.ai (Submit)");
  }

  const requestId = submitData.request_id;
  if (!requestId) throw new Error("Keine request_id von fal.ai erhalten");

  // Schritt 3: pollen
  updateProgress(60, "Transkription läuft... (bei langen Aufnahmen etwas Geduld)");

  let data = null;
  const intervalMs = 4000;
  const maxTries = 225; // ~15 Min

  for (let i = 0; i < maxTries; i++) {
    await sleep(intervalMs);

    let statusResponse;
    try {
      statusResponse = await fetch("/api/fal-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: falModel, request_id: requestId }),
      });
    } catch (pollErr) {
      continue;
    }

    const statusText = await statusResponse.text();
    if (!statusResponse.ok) {
      throw new Error(`Status-Abfrage fehlgeschlagen (${statusResponse.status}): ${parseFalError(statusText)}`);
    }

    let statusData;
    try {
      statusData = JSON.parse(statusText);
    } catch {
      throw new Error("Ungültige Antwort von fal.ai (Status)");
    }

    if (statusData.status === "COMPLETED") {
      data = statusData.result;
      break;
    } else if (statusData.status === "IN_PROGRESS") {
      updateProgress(80, "Transkription läuft...");
    } else {
      const pos = statusData.queue_position != null ? ` (Position ${statusData.queue_position})` : "";
      updateProgress(65, `In der Warteschlange${pos}...`);
    }
  }

  if (!data) {
    throw new Error("Zeitüberschreitung — die Transkription hat zu lange gedauert. Bitte erneut versuchen.");
  }

  // Ergebnis formatieren
  const hasSpeakers =
    (data.diarization_segments && data.diarization_segments.length > 0) ||
    (data.chunks && data.chunks.some((c) => c && c.speaker != null));

  if (useDiarize && hasSpeakers) {
    showResult(formatDiarized(data, timestampsCheckbox.checked));
  } else if (timestampsCheckbox.checked && data.chunks && data.chunks.length > 0) {
    const text = data.chunks
      .map((chunk) => {
        const start = chunk.timestamp?.[0] ?? 0;
        return `[${formatTimestamp(start)}] ${chunk.text.trim()}`;
      })
      .join("\n");
    showResult(text);
  } else {
    showResult(data.text || "");
  }
}

function parseFalError(responseText) {
  try {
    const errData = JSON.parse(responseText);
    return errData.detail?.[0]?.msg || errData.detail || errData.error || responseText;
  } catch {
    return responseText;
  }
}

// ==========================================
// SPEAKER-TRENNUNG: Chunks + Diarisierung -> "Sprecher 1: ..."
// ==========================================

function segStart(seg) { return seg.timestamp?.[0] ?? seg.start ?? 0; }
function segEnd(seg) { return seg.timestamp?.[1] ?? seg.end ?? Infinity; }

function speakerForTime(t, segments) {
  for (const s of segments) {
    if (t >= segStart(s) && t < segEnd(s)) return s.speaker;
  }
  let best = null;
  let bestDist = Infinity;
  for (const s of segments) {
    const dist = Math.abs(segStart(s) - t);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return best ? best.speaker : null;
}

function formatDiarized(data, withTimestamps) {
  const chunks = data.chunks || [];
  const segments = data.diarization_segments || [];
  if (!chunks.length) return data.text || "";

  const speakerMap = {};
  let counter = 0;
  const labelFor = (raw) => {
    const key = raw == null ? "?" : String(raw);
    if (!(key in speakerMap)) {
      counter += 1;
      speakerMap[key] = `Sprecher ${counter}`;
    }
    return speakerMap[key];
  };

  const lines = [];
  let curSpeaker = null;
  let buffer = [];
  let bufferStart = 0;

  const flush = () => {
    if (!buffer.length) return;
    const prefix = withTimestamps ? `[${formatTimestamp(bufferStart)}] ` : "";
    lines.push(`${prefix}${curSpeaker}: ${buffer.join(" ").replace(/\s+/g, " ").trim()}`);
    buffer = [];
  };

  for (const chunk of chunks) {
    const start = chunk.timestamp?.[0] ?? 0;
    const raw = chunk.speaker != null ? chunk.speaker : speakerForTime(start, segments);
    const label = labelFor(raw);
    if (label !== curSpeaker) {
      flush();
      curSpeaker = label;
      bufferStart = start;
    }
    buffer.push((chunk.text || "").trim());
  }
  flush();

  return lines.join("\n\n");
}

// ==========================================
// RESULT & HELPERS
// ==========================================

function showResult(text) {
  transcript.value = text;
  resultSection.classList.remove("hidden");
  updateProgress(100, "Transkription abgeschlossen!");
  progressText.style.color = "#22c55e";
}

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(transcript.value);
  copyBtn.textContent = "Kopiert!";
  setTimeout(() => (copyBtn.textContent = "Kopieren"), 2000);
});

downloadBtn.addEventListener("click", () => {
  const baseName = selectedFile
    ? selectedFile.name.replace(/\.[^.]+$/, "")
    : "transkript";
  const blob = new Blob([transcript.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}_transkript.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

function updateStartButton() {
  startBtn.disabled = !selectedFile;
}

function updateProgress(percent, text) {
  progressBar.style.width = `${percent}%`;
  progressText.textContent = text;
  progressText.style.color = "";
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
