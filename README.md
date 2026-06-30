# 🎸 Guitar Tab Viewer

A personal, self-contained guitar-tab viewer and library. It's a **single HTML file** —
just double-click `guitar-tabs.html` to open it in your browser. No server, no install,
no build step, no accounts, no API keys.

## What it does

- **Two kinds of tab in one library:**
  - **AlphaTex** — paste the text format into the editor and it renders a clean tab sheet
    below: standard notation, tablature, **chord fingering diagrams above each bar**, and
    **lyrics** under the staff.
  - **PDF** — click **Open PDF…** to load a PDF tab, view it rendered in the same viewer, and
    save it to your library next to your AlphaTex songs. (Note: the app can't *convert* a PDF
    into editable AlphaTex — that still needs the chatbot route below — it stores and displays
    the PDF as-is.)
- **Friendly errors.** If a paste won't parse, you get a plain-English message with the line
  number — copy it back to a chatbot and ask it to fix the AlphaTex.
- **Library.** Save songs to your browser, click them in the sidebar to reload, delete with
  a confirm.
- **Backups.** Export your whole library to one `.json` file and import it back later (handy
  because browser storage can get wiped).
- **Zoom** slider and a **Capo** note field (just a reminder label — it never transposes
  anything).

## Chord diagrams (the fingering grids)

When your tab **names** a chord on a beat with `{ch "Em"}`, the app draws the **fingering
grid above that bar** automatically — you don't have to define how to play the chord. It
fills the fingering in from a built-in dictionary of common chords (open chords, 7ths, sus,
barre chords, sharps/flats). If a chord name isn't in the dictionary, its name still shows
and a small note tells you; you can supply your own voicing with a `\chord ("name" …)` line.

Toggle this off any time with the **Chord diagrams** checkbox in the toolbar.

The one thing the tab needs is the `{ch "…"}` chord markers. So when you ask a chatbot to
make the AlphaTex (below), include this in your request:

> Mark every chord change on the beat with `{ch "ChordName"}` (e.g. `{ch "Em"}`, `{ch "B7"}`),
> using standard chord names, so the viewer can draw the fingering diagrams.

## How tabs get made

The app does **not** use AI itself. The intended workflow:

1. Take a screenshot of a tab.
2. Chat with Claude (or any chatbot) and ask it to convert it to **AlphaTex**.
3. Paste the AlphaTex into this app and render.

## AlphaTex quick reference

```
\title "Song Name"
\subtitle "Artist"
\tempo 90
.
\chord ("C" 0 1 0 2 3 x)
\chord ("G" 3 0 0 0 2 3)
(0.1 1.2 0.3 2.4 3.5){ch "C" lyrics "Twin-"} (0.1 1.2 0.3){lyrics "kle"} |
```

- `fret.string` — e.g. `3.6` is fret 3 on the 6th (low E) string. String 1 = high E.
- `\chord ("Name" e B G D A E)` — fret per string, high-to-low; `x` = muted.
- `{ch "Name"}` on a beat shows the chord (and its diagram if defined).
- `{lyrics "word"}` on a beat shows a lyric syllable underneath.

Full docs: https://alphatab.net/docs/alphatex/introduction

## Tech notes

- Rendering is done by [alphaTab](https://alphatab.net) (`@coderline/alphatab`), loaded from
  the jsDelivr CDN at a **pinned version (1.8.3)** so a future library update can't silently
  break the file. The only requirement is an internet connection so the library and its music
  fonts can load.
- Songs live in your browser's `localStorage`, scoped to this file on this computer. Use
  Export regularly if the songs matter to you.
