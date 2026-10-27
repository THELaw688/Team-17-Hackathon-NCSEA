# Changelog

Running log of every meaningful change to this repository. It exists so that any teammate — human
or AI — can find out what happened while they were away without reading the whole git history.

Newest entries go at the **top**.

---

## How to use this file

**At the start of every task:**

1. `git pull` so you have everyone else's entries.
2. Read the entries above the line you last saw. They tell you what moved, what broke, and what
   someone is mid-way through.
3. Check the **In progress** section before starting — if someone is already in that file, talk to
   them instead of working in parallel.

**At the end of every task:**

1. Add one entry at the top of the log below, using the template.
2. Commit it *with* your code change, not as a separate commit — the log and the code should never
   disagree.

**If you are an AI assistant:** both steps are mandatory, not optional. Read this file before you
touch code, and append your entry before you report the task finished. Do not rewrite or delete
other people's entries — only add your own.

### Entry template

```markdown
### YYYY-MM-DD — Short title of the change
**Who:** Name (+ AI tool, if one did the work) · **Branch:** branch-name

- **What changed:** the actual change, in plain language
- **Why:** the reason, so nobody undoes it by accident
- **Files:** paths touched
- **Heads up:** anything others need to know — breaking changes, new env vars, new dependencies,
  follow-up work. Write "none" if there's nothing.
```

### Merge conflicts in this file

Two people adding entries at the top will conflict. **Keep both entries** — delete the conflict
markers, order the two by date, done. Never resolve a conflict here by discarding someone's entry.

---

## In progress

Add a line when you start something that will take a while, and remove it when you're done. This is
how we avoid two people rewriting the same file.

- _(nothing in progress)_

---

## Log

### 2026-10-27 — Add shared links file
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created `docs/links.md` holding hackathon reference links, starting with the
  organizers' Google Slides deck. Linked it from the top of the README.
- **Why:** One known place for shared links beats hunting through chat history mid-hackathon.
- **Files:** `docs/links.md`, `README.md`, `CHANGELOG.md`
- **Heads up:** AI assistants can't open Google Docs/Slides links — they need a signed-in session.
  If a linked document's contents matter, paste the relevant text into chat or into `docs/`.

### 2026-10-27 — Add presentation branch
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created the `presentation` branch off `main` for demo and judging materials —
  slides, demo script, screenshots, talking points. Documented it in the README's branch table,
  folder structure, and a short "working on the demo" section.
- **Why:** Presentation work and code work touch completely different files and happen on different
  schedules. Separating them means nobody editing slides collides with somebody editing code.
- **Files:** `README.md`, `CHANGELOG.md`
- **Heads up:** Demo materials go in a `presentation/` folder **on that branch**, not on `main`.
  Switch with `git checkout presentation`. It merges into `main` late or not at all.

### 2026-10-27 — Remove connection test files
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Deleted `test.txt` and `test2.txt`.
- **Why:** They only existed to prove the clone and push worked. That's confirmed, so they were
  noise in the repo root.
- **Files:** `test.txt`, `test2.txt` (both deleted)
- **Heads up:** The repo now contains only `README.md` and `CHANGELOG.md`. If you cloned earlier and
  still see the test files, `git pull` will remove them.

### 2026-10-27 — Add team README and changelog
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Added `README.md` with the team's documentation standards, collaboration rules,
  branch strategy, and agreed folder layout. Added this changelog and the protocol for keeping it.
- **Why:** The team is distributed and several people are working through AI assistants. A shared
  written contract plus a running log means everyone's tool starts from the same understanding
  instead of guessing.
- **Files:** `README.md`, `CHANGELOG.md`
- **Heads up:** The folder layout in the README is a *convention we agreed to*, not a description of
  folders that exist — the stack hasn't been chosen yet. Create folders as needed and keep the
  names. Copy `README.md` to `CLAUDE.md` / `.github/copilot-instructions.md` / `.cursorrules` so
  your own tool picks up the rules.

### 2026-10-27 — Set up branches and initial tag
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created `dev`, `feature/frontend`, and `feature/backend` branches, plus
  annotated tag `v0.0.1` marking initial setup.
- **Why:** Gives the team somewhere to work other than `main`, and a known-good point to fall back
  to during the demo.
- **Files:** none — branches and tags only
- **Heads up:** Base new work on `dev`, not `main`. Pull requests target `dev`.

### 2026-10-27 — Initial repository setup
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Cloned the empty repository locally, verified the GitHub connection with
  `test.txt` and `test2.txt`.
- **Why:** Confirming push access before the team starts committing real work.
- **Files:** `test.txt`, `test2.txt`
- **Heads up:** Both test files are scaffolding and can be deleted once real code lands.
