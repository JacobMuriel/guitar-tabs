# 🎸 Guitar Tab Viewer

A personal guitar-tab viewer and library. Paste **AlphaTex** (a text format for tab
notation) and it renders a clean tab sheet — standard notation, tablature, **chord
fingering diagrams above each bar**, and **lyrics** under the staff. Your songs are saved
as files in a **folder on your Mac** (point it at iCloud Drive to sync across devices).

It's a plain static site — no framework, no build step, no backend, no API keys, no AI.
The only network use is loading the alphaTab library + music fonts from a CDN.

## Files

| File | What it is |
|------|------------|
| `index.html` | Page structure only |
| `style.css` | All styling (dark, minimal) |
| `app.js` | All logic (rendering + the folder library) |
| `render.yaml` | Optional Render deploy config |

## Browser requirement (Chrome)

The library reads and writes files in a folder using the **File System Access API**
(`window.showDirectoryPicker`), which **only works in Google Chrome** (and other Chromium
browsers like Edge/Brave). Open the site in Chrome. In a browser that doesn't support it
(e.g. Safari), the viewer still renders tabs, but a clear message explains that saving to a
folder needs Chrome.

## The library (folder on disk)

- **First visit:** click **Choose library folder…** and pick a folder (tip: one inside
  iCloud Drive so it syncs). Chrome remembers the folder across reloads.
- **Each song is one `.alphatex` file** in that folder; the filename is the song name.
- The sidebar lists every `.alphatex` file. Click one to load + render it.
- **Save** writes the file. New song → it asks for a name; an already-loaded song → it
  overwrites that file.
- **Delete** (the ✕) removes the file, with a confirm.
- **Change folder…** (bottom of the sidebar) re-picks the folder.
- **Permissions:** for security, Chrome re-asks permission to the folder once per session.
  When that happens you'll see a **Reconnect folder** button — click it and choose Allow.

### Capo

The capo field is a **reminder label only** (it never transposes). It's stored inside the
song file as a first line `// capo: 7th fret` — a comment alphaTab ignores — so each file
stays self-contained.

## Chord diagrams

When your tab **names** a chord on a beat with `{ch "Em"}`, the app draws the **fingering
grid above that bar** automatically, filling the fingering from a built-in dictionary of
common chords. If a chord name isn't known, its name still shows and a small note tells you;
you can supply your own voicing with a `\chord ("name" …)` line. Toggle the grids with the
**Chord diagrams** checkbox.

When asking a chatbot to turn a tab screenshot into AlphaTex, include:

> Mark every chord change with `{ch "ChordName"}` using standard chord names, so the viewer
> can draw the fingering diagrams.

## How tabs get made

The app does **not** use AI. The workflow: screenshot a tab → ask a chatbot to convert it to
AlphaTex → paste the AlphaTex here → Save. AlphaTex docs:
https://alphatab.net/docs/alphatex/introduction

## Run it locally (optional)

The File System Access API needs a secure context, so use a local server (not a `file://`
double-click):

```bash
cd guitar-tabs
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome
```

## Deploy on Render (static site)

The repo is already a deployable static site. Two ways:

### Option A — dashboard (simplest)

1. Push this repo to GitHub (done — `JacobMuriel/guitar-tabs`).
2. Go to https://dashboard.render.com → **New +** → **Static Site**.
3. Connect GitHub and pick the **guitar-tabs** repo.
4. Fill in:
   - **Name:** `guitar-tab-viewer` (becomes part of the URL)
   - **Branch:** `main`
   - **Build Command:** *(leave empty)*
   - **Publish Directory:** `.`  ← a single dot (the repo root, where `index.html` lives)
5. Click **Create Static Site**. Render builds and gives you a URL like
   `https://guitar-tab-viewer.onrender.com` — served over HTTPS (which the folder API needs).
6. Open that URL in **Chrome** and bookmark it.

### Option B — Blueprint (uses `render.yaml`)

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the **guitar-tabs** repo. Render reads `render.yaml` and proposes the static site.
3. Click **Apply**.

Every push to `main` auto-redeploys.
