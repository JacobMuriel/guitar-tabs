"use strict";

/* =========================================================================
   Guitar Tab Viewer — all logic.

   Two halves:
   1. The renderer (alphaTab + AlphaTex + chord diagrams). Unchanged behaviour.
   2. The library: a FOLDER ON DISK accessed with the File System Access API.
      Each saved song is one ".alphatex" file. The folder handle is remembered
      across reloads in IndexedDB; Chrome re-asks permission each session, which
      we handle with a "Reconnect" button.
   ========================================================================= */

/* =========================================================================
   1. Constants & starter example
   ========================================================================= */
const DRAFT_KEY = "guitarTabs.draft.v2";   // unsaved editor contents (localStorage)
const FILE_EXT  = ".alphatex";

const STARTER_TEX = `\\title "Welcome"
\\subtitle "Chord grids are drawn above the bars automatically"
\\tempo 73
.
:4 (0.6 2.5 2.4 0.3 0.2 0.1){ch "Em"} (0.6 2.5 2.4 0.3 0.2 0.1) (0.6 2.5 2.4 0.3 0.2 0.1) (0.6 2.5 2.4 0.3 0.2 0.1) |
(2.5 1.4 2.3 0.2 2.1){ch "B7"} (2.5 1.4 2.3 0.2 2.1) (2.5 1.4 2.3 0.2 2.1) (2.5 1.4 2.3 0.2 2.1) |
(0.4 2.3 3.2 0.1){ch "Dsus2"} (0.4 2.3 3.2 0.1) (0.4 2.3 3.2 0.1) (0.4 2.3 3.2 0.1) |
(3.6 2.5 0.4 0.3 0.2 3.1){ch "G"} (3.6 2.5 0.4 0.3 0.2 3.1) (3.6 2.5 0.4 0.3 0.2 3.1) (3.6 2.5 0.4 0.3 0.2 3.1) |`;

/* =========================================================================
   2. Element references
   ========================================================================= */
const el = {
  boot:        document.getElementById("boot"),
  folderLine:  document.getElementById("folder-line"),
  fsStatus:    document.getElementById("fs-status"),
  fsMsg:       document.getElementById("fs-msg"),
  btnConnect:  document.getElementById("btn-connect"),
  songList:    document.getElementById("song-list"),
  libActions:  document.getElementById("library-actions"),
  btnChange:   document.getElementById("btn-change"),
  tex:         document.getElementById("tex"),
  capo:        document.getElementById("capo"),
  capoLabel:   document.getElementById("capo-label"),
  chordNote:   document.getElementById("chord-note"),
  chordToggle: document.getElementById("chord-diagrams"),
  error:       document.getElementById("error"),
  alphatab:    document.getElementById("alphatab"),
  zoom:        document.getElementById("zoom"),
  zoomVal:     document.getElementById("zoom-val"),
  toast:       document.getElementById("toast"),
};

let api = null;                  // the AlphaTabApi instance
let errorShownForRender = false; // guards a generic error overwriting a detailed one
let chordDiagramsOn = true;      // toolbar toggle

let dirHandle = null;            // FileSystemDirectoryHandle for the library folder
let currentFile = null;         // filename (with extension) of the loaded song, or null
let fsState = "init";           // unsupported | nofolder | needpermission | connected

/* =========================================================================
   3. Tiny UI helpers
   ========================================================================= */
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove("show"), 1800);
}
function showError(title, detail) {
  el.error.innerHTML = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  el.error.appendChild(strong);
  if (detail) el.error.appendChild(document.createTextNode("\n" + detail));
  el.error.classList.add("show");
}
function clearError() {
  el.error.classList.remove("show");
  el.error.textContent = "";
}
function updateCapoLabel() {
  const v = el.capo.value.trim();
  if (v) {
    el.capoLabel.textContent = "🎼 Capo: " + v;
    el.capoLabel.classList.add("show");
  } else {
    el.capoLabel.classList.remove("show");
  }
}

/* =========================================================================
   4. Draft (unsaved editor contents) — kept in localStorage so a reload
      doesn't lose typing. This is NOT the library; the library is on disk.
   ========================================================================= */
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      tex: el.tex.value, capo: el.capo.value, currentFile,
    }));
  } catch (e) { /* ignore */ }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/* =========================================================================
   5. alphaTab setup + error formatting
   ========================================================================= */
function initAlphaTab() {
  const settings = {
    core: {
      useWorkers: false,
      fontDirectory: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/font/",
      logLevel: 1,
    },
    display: {
      layoutMode: "page",
      scale: parseFloat(el.zoom.value),
    },
    notation: {},
  };
  api = new alphaTab.AlphaTabApi(el.alphatab, settings);

  api.error.on((err) => {
    console.error("alphaTab error:", err);
    const TIP = "\n\nTip: copy this whole message back to your chatbot and ask it to fix the AlphaTex.";
    const diag = formatDiagnostics(err);
    if (diag) {
      showError("Couldn't render this AlphaTex:", diag + TIP);
      errorShownForRender = true;
    } else if (!errorShownForRender) {
      const msg = (err && (err.message || err.toString())) || "Unknown error";
      showError("Couldn't render this AlphaTex.", cleanErrorMessage(msg) + TIP);
    }
  });
  api.scoreLoaded.on(() => clearError());
}
function cleanErrorMessage(msg) {
  return String(msg).split("\n").slice(0, 4).join("\n").trim();
}
function formatDiagnostics(err) {
  if (!err) return null;
  const groups = ["lexerDiagnostics", "parserDiagnostics", "semanticDiagnostics"];
  const lines = [];
  for (const g of groups) {
    const coll = err[g];
    if (!coll) continue;
    try {
      for (const d of coll) {
        if (d && typeof d.severity === "number" && d.severity < 1) continue;
        const sev = d.severity === 2 ? "Error" : d.severity === 1 ? "Warning" : "Note";
        const pos = d && d.start ? " (line " + d.start.line + ", col " + d.start.col + ")" : "";
        lines.push("• " + sev + pos + ": " + (d.message || "problem here"));
      }
    } catch (e) { /* not iterable */ }
  }
  return lines.length ? lines.join("\n") : null;
}

/* =========================================================================
   6. Chord diagrams — built-in fingering dictionary
   -------------------------------------------------------------------------
   Fret order matches alphaTab's \chord: high-e, B, G, D, A, low-E ("x"=muted).
   ========================================================================= */
const CHORD_LIBRARY = {
  "A": "0 2 2 2 0 x", "Am": "0 1 2 2 0 x", "A7": "0 2 0 2 0 x",
  "Amaj7": "0 2 1 2 0 x", "Am7": "0 1 0 2 0 x", "Asus2": "0 0 2 2 0 x", "Asus4": "0 3 2 2 0 x",
  "B": "2 4 4 4 2 x", "Bm": "2 3 4 4 2 x", "B7": "2 0 2 1 2 x", "Bm7": "2 0 2 0 2 x",
  "C": "0 1 0 2 3 x", "C7": "0 1 3 2 3 x", "Cmaj7": "0 0 0 2 3 x", "Cadd9": "3 3 0 2 3 x", "Cm": "3 4 5 5 3 x",
  "D": "2 3 2 0 x x", "Dm": "1 3 2 0 x x", "D7": "2 1 2 0 x x", "Dmaj7": "2 2 2 0 x x",
  "Dsus2": "0 3 2 0 x x", "Dsus4": "3 3 2 0 x x", "Dm7": "1 1 2 0 x x",
  "E": "0 0 1 2 2 0", "Em": "0 0 0 2 2 0", "E7": "0 0 1 0 2 0", "Em7": "0 0 0 0 2 0",
  "Emaj7": "0 0 1 1 2 0", "Esus4": "0 0 2 2 2 0",
  "F": "1 1 2 3 3 1", "Fm": "1 1 1 3 3 1", "Fmaj7": "0 1 2 3 x x", "F7": "1 1 2 1 3 1",
  "F#": "2 2 3 4 4 2", "F#m": "2 2 2 4 4 2", "F#m7": "2 2 2 2 4 2", "Gb": "2 2 3 4 4 2",
  "G": "3 0 0 0 2 3", "G7": "1 0 0 0 2 3", "Gmaj7": "2 0 0 0 2 3", "Gm": "3 3 3 5 5 3", "Gsus4": "3 1 0 0 3 3",
  "G#": "4 4 5 6 6 4", "G#m": "4 4 4 6 6 4", "Ab": "4 4 5 6 6 4",
  "A#": "3 3 3 3 1 x", "Bb": "3 3 3 3 1 x", "Bbm": "2 2 3 3 1 x", "A#m": "2 2 3 3 1 x",
  "C#": "4 6 6 6 4 x", "Db": "4 6 6 6 4 x", "C#m": "4 5 6 6 4 x",
  "D#": "x x 1 3 4 x", "Eb": "x x 1 3 4 x",
};
function lookupChord(name) {
  if (CHORD_LIBRARY[name]) return CHORD_LIBRARY[name];
  const norm = name.replace(/^([a-gA-G])/, (c) => c.toUpperCase());
  return CHORD_LIBRARY[norm] || null;
}

/* Add inline chord diagrams + auto-define named-but-undefined chords.
   Done at RENDER time only — what you type/save stays clean. */
function prepareTex(tex) {
  if (!chordDiagramsOn) { showChordNote([]); return tex; }

  const refs = [];
  const seenRef = new Set();
  let m;
  const reRef = /ch\s+"([^"]+)"/g;
  while ((m = reRef.exec(tex))) {
    const n = m[1].trim();
    if (n && !seenRef.has(n)) { seenRef.add(n); refs.push(n); }
  }
  const defined = new Set();
  const reDef = /\\chord\s*\(\s*"([^"]+)"/g;
  while ((m = reDef.exec(tex))) defined.add(m[1].trim());

  const newDefs = [];
  const missing = [];
  for (const name of refs) {
    if (defined.has(name)) continue;
    const frets = lookupChord(name);
    if (frets) newDefs.push('\\chord ("' + name + '" ' + frets + ')');
    else missing.push(name);
  }
  showChordNote(missing);

  const hasChords = refs.length > 0 || defined.size > 0;
  if (!hasChords) return tex;

  const lines = tex.split(/\r?\n/);
  let dot = lines.findIndex((l) => l.trim() === ".");
  if (dot === -1) {
    let last = -1;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === "") continue;
      if (t.startsWith("\\")) last = i; else break;
    }
    const at = last + 1;
    lines.splice(at, 0, ".");
    dot = at;
  }
  if (newDefs.length) lines.splice(dot + 1, 0, ...newDefs);
  if (!/\\chordDiagramsInScore/.test(tex)) lines.splice(dot, 0, "\\chordDiagramsInScore true");
  return lines.join("\n");
}
function showChordNote(missing) {
  if (!el.chordNote) return;
  if (missing && missing.length) {
    el.chordNote.textContent =
      "No built-in fingering for: " + missing.join(", ") +
      ' — its name still shows; add \\chord ("name" …) to draw its grid.';
    el.chordNote.classList.add("show");
  } else {
    el.chordNote.classList.remove("show");
  }
}

/* =========================================================================
   7. Rendering
   ========================================================================= */
function render() {
  const tex = el.tex.value;
  updateCapoLabel();
  errorShownForRender = false;
  if (!tex.trim()) {
    clearError();
    showChordNote([]);
    api.tex("");
    return;
  }
  clearError();
  try {
    const elements = new Map();
    if (chordDiagramsOn) elements.set(alphaTab.NotationElement.ChordDiagrams, false);
    api.settings.notation.elements = elements;
    api.updateSettings();
    api.tex(prepareTex(tex));
  } catch (e) {
    showError("Couldn't render this AlphaTex.", cleanErrorMessage(e.message || e));
  }
}
let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 450);
  saveDraft();
}
let zoomTimer = null;
function applyZoom() {
  const z = parseFloat(el.zoom.value);
  el.zoomVal.textContent = Math.round(z * 100) + "%";
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    if (api) {
      api.settings.display.scale = z;
      api.updateSettings();
      api.render();
    }
  }, 150);
}

/* =========================================================================
   8. Filenames & the capo line stored inside each file
   ========================================================================= */
// Strip characters that aren't allowed in filenames (kept readable).
function sanitizeName(name) {
  return String(name).replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}
function fileToName(filename) { return filename.replace(/\.alphatex$/i, ""); }
function nameToFile(name) { return sanitizeName(name) + FILE_EXT; }

// A song file may start with "// capo: <text>" — a comment alphaTab ignores.
function splitCapo(fileText) {
  const lines = fileText.split(/\r?\n/);
  const m = lines[0] && lines[0].match(/^\/\/\s*capo:\s*(.*)$/i);
  if (m) return { capo: m[1].trim(), body: lines.slice(1).join("\n").replace(/^\n/, "") };
  return { capo: "", body: fileText };
}
function composeFile(body, capo) {
  const c = (capo || "").trim();
  return c ? "// capo: " + c + "\n" + body : body;
}
function guessTitle(tex) {
  const m = tex.match(/\\title\s+"([^"]+)"/);
  return m ? m[1] : "Untitled";
}

/* =========================================================================
   9. IndexedDB — remembers the folder handle across reloads
   ========================================================================= */
const IDB_DB = "guitarTabs", IDB_STORE = "handles", HANDLE_KEY = "libraryDir";
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const rq = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* =========================================================================
   10. File System Access layer (folder of .alphatex files)
   ========================================================================= */
// Ask for read/write permission, prompting only if needed (needs a user gesture
// for the prompt — call this from a click handler).
async function ensurePermission(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}
async function listAlphatexFiles(handle) {
  const names = [];
  for await (const [name, h] of handle.entries()) {
    if (h.kind === "file" && /\.alphatex$/i.test(name)) names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}
async function readFileText(handle, filename) {
  const fh = await handle.getFileHandle(filename);
  const f = await fh.getFile();
  return await f.text();
}
async function writeFileText(handle, filename, contents) {
  const fh = await handle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(contents);
  await w.close();
}
async function deleteFileEntry(handle, filename) {
  await handle.removeEntry(filename);
}

/* =========================================================================
   11. Library UI state machine
   ========================================================================= */
function setFsState(state) {
  fsState = state;
  el.fsStatus.classList.remove("show", "error");
  el.libActions.classList.remove("show");

  if (state === "unsupported") {
    el.folderLine.textContent = "Needs Google Chrome";
    el.fsStatus.classList.add("show", "error");
    el.fsMsg.textContent =
      "Saving to a folder uses the File System Access API, which only works in " +
      "Google Chrome (and other Chromium browsers). This browser doesn't support it, " +
      "so the library is disabled here. The viewer still works — paste AlphaTex and " +
      "render — but to save songs to a folder, open this site in Chrome.";
  } else if (state === "nofolder") {
    el.folderLine.textContent = "A folder on your Mac";
    el.fsStatus.classList.add("show");
    el.fsMsg.textContent =
      "Pick a folder to keep your songs in. Tip: choose one inside iCloud Drive so " +
      "your tabs sync across devices. Each song is saved as a .alphatex file.";
    el.btnConnect.textContent = "Choose library folder…";
  } else if (state === "needpermission") {
    el.folderLine.textContent = dirHandle ? dirHandle.name : "Folder";
    el.fsStatus.classList.add("show");
    el.fsMsg.textContent =
      "Chrome needs your permission again this session to use “" +
      (dirHandle ? dirHandle.name : "your folder") + "”. Click Reconnect and choose Allow.";
    el.btnConnect.textContent = "Reconnect folder";
  } else if (state === "connected") {
    el.folderLine.textContent = "📁 " + (dirHandle ? dirHandle.name : "Folder");
    el.libActions.classList.add("show");
  }
}

function renderSongList(files) {
  el.songList.innerHTML = "";
  if (!files || files.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "No songs in this folder yet. Paste AlphaTex and press “Save…”.";
    el.songList.appendChild(note);
    return;
  }
  files.forEach((filename) => {
    const item = document.createElement("div");
    item.className = "song-item" + (filename === currentFile ? " active" : "");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = fileToName(filename);
    name.title = fileToName(filename);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Delete this song file";
    del.addEventListener("click", (ev) => { ev.stopPropagation(); deleteSongFile(filename); });

    item.appendChild(name);
    item.appendChild(del);
    item.addEventListener("click", () => loadSongFile(filename));
    el.songList.appendChild(item);
  });
}

async function refreshList() {
  if (!dirHandle) return;
  try {
    const files = await listAlphatexFiles(dirHandle);
    renderSongList(files);
  } catch (e) {
    console.error("List failed", e);
    setFsState("needpermission");   // permission likely lapsed
  }
}

/* =========================================================================
   12. Library actions (connect / load / save / delete / new)
   ========================================================================= */
async function chooseFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirHandle = handle;
    await idbSet(HANDLE_KEY, handle);
    setFsState("connected");
    await refreshList();
    showToast("Library folder connected");
  } catch (e) {
    if (e && e.name === "AbortError") return;   // user cancelled the picker
    console.error(e);
    showError("Couldn't open that folder.", (e && e.message) || "");
  }
}

async function reconnectFolder() {
  if (!dirHandle) return chooseFolder();
  const ok = await ensurePermission(dirHandle);
  if (ok) {
    setFsState("connected");
    await refreshList();
  } else {
    showError("Permission needed",
      "Chrome didn't grant access to the folder. Click Reconnect again and choose Allow, " +
      "or use “Change folder” to pick it fresh.");
  }
}

// The connect button does different things depending on state.
function onConnectClick() {
  if (fsState === "needpermission") return reconnectFolder();
  return chooseFolder();
}

async function loadSongFile(filename) {
  if (!dirHandle) return;
  try {
    const text = await readFileText(dirHandle, filename);
    const { capo, body } = splitCapo(text);
    el.tex.value = body;
    el.capo.value = capo;
    currentFile = filename;
    updateCapoLabel();
    saveDraft();
    renderSongList(await listAlphatexFiles(dirHandle));
    render();
  } catch (e) {
    console.error(e);
    showError("Couldn't open that song.", (e && e.message) || "");
  }
}

async function saveSong() {
  if (fsState === "unsupported") {
    showError("Saving needs Chrome.", "This browser can't write to a folder. Open the site in Chrome.");
    return;
  }
  if (!dirHandle) {
    showError("Choose a library folder first.", "Use the “Choose library folder…” button in the sidebar.");
    return;
  }
  if (!el.tex.value.trim()) {
    showError("Nothing to save.", "Paste some AlphaTex into the editor first.");
    return;
  }

  // New song → ask for a name. Existing song → overwrite its file.
  let filename = currentFile;
  if (!filename) {
    const name = prompt("Save song as:", guessTitle(el.tex.value));
    if (name === null) return;
    const clean = sanitizeName(name);
    if (!clean) return;
    filename = nameToFile(clean);
  }

  try {
    if (!(await ensurePermission(dirHandle))) { setFsState("needpermission"); return; }
    await writeFileText(dirHandle, filename, composeFile(el.tex.value.trim(), el.capo.value));
    currentFile = filename;
    saveDraft();
    await refreshList();
    showToast('Saved “' + fileToName(filename) + '”');
  } catch (e) {
    console.error(e);
    showError("Couldn't save.", (e && e.message) || "");
  }
}

async function deleteSongFile(filename) {
  if (!dirHandle) return;
  if (!confirm('Delete “' + fileToName(filename) + '”?\nThis removes the file from your folder.')) return;
  try {
    if (!(await ensurePermission(dirHandle))) { setFsState("needpermission"); return; }
    await deleteFileEntry(dirHandle, filename);
    if (currentFile === filename) currentFile = null;
    saveDraft();
    await refreshList();
    showToast('Deleted “' + fileToName(filename) + '”');
  } catch (e) {
    console.error(e);
    showError("Couldn't delete.", (e && e.message) || "");
  }
}

function newSong() {
  currentFile = null;
  el.tex.value = "";
  el.capo.value = "";
  updateCapoLabel();
  saveDraft();
  refreshList();          // clears the active highlight
  render();
  el.tex.focus();
}

/* =========================================================================
   13. Wire up events & boot
   ========================================================================= */
function wireEvents() {
  document.getElementById("btn-render").addEventListener("click", render);
  document.getElementById("btn-save").addEventListener("click", saveSong);
  document.getElementById("btn-new").addEventListener("click", newSong);
  el.btnConnect.addEventListener("click", onConnectClick);
  el.btnChange.addEventListener("click", chooseFolder);

  el.tex.addEventListener("input", scheduleRender);
  el.capo.addEventListener("input", () => { updateCapoLabel(); saveDraft(); });
  el.zoom.addEventListener("input", applyZoom);
  el.chordToggle.addEventListener("change", () => {
    chordDiagramsOn = el.chordToggle.checked;
    render();
  });
}

async function initLibrary() {
  if (!("showDirectoryPicker" in window)) { setFsState("unsupported"); return; }
  let saved = null;
  try { saved = await idbGet(HANDLE_KEY); } catch (e) { /* ignore */ }
  if (!saved) { setFsState("nofolder"); return; }

  dirHandle = saved;
  try {
    // queryPermission doesn't need a gesture; requestPermission (the prompt) does.
    const perm = await dirHandle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      setFsState("connected");
      await refreshList();
    } else {
      setFsState("needpermission");   // user must click Reconnect this session
    }
  } catch (e) {
    console.error(e);
    setFsState("needpermission");
  }
}

function boot() {
  if (typeof alphaTab === "undefined" || !alphaTab.AlphaTabApi) {
    el.boot.textContent =
      "Couldn't load the notation engine. Check your internet connection and reload.";
    return;
  }
  initAlphaTab();
  wireEvents();

  // Restore unsaved draft, else show the starter example.
  const draft = loadDraft();
  if (draft && (draft.tex || draft.capo)) {
    el.tex.value = draft.tex || "";
    el.capo.value = draft.capo || "";
    currentFile = draft.currentFile || null;
  } else {
    el.tex.value = STARTER_TEX;
  }

  el.zoomVal.textContent = Math.round(parseFloat(el.zoom.value) * 100) + "%";
  updateCapoLabel();
  render();
  initLibrary();   // async; updates the sidebar when ready

  api.renderFinished.on(() => { el.boot.style.display = "none"; });
  setTimeout(() => { el.boot.style.display = "none"; }, 2500);
}

boot();
