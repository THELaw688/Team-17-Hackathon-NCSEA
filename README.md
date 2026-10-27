# Table 17 — NCSEA Hackathon

Shared repository for Table 17. This file is the contract for how we work: folder layout,
documentation standards, and collaboration rules. **Read it before your first commit.**

📋 **[CHANGELOG.md](CHANGELOG.md) — read it at the start of every task, update it at the end.**
It's the running log of what everyone (and everyone's AI) has changed.

🔗 **[docs/links.md](docs/links.md)** — hackathon slide deck, rules, and other shared links.

---

## For AI assistants

If you are an AI assistant (Claude Code, Copilot, Cursor, or anything else) working in this
repository, these rules apply to you as much as to the humans:

1. **Start every task by reading [CHANGELOG.md](CHANGELOG.md).** `git pull` first, then read the
   entries newer than the last one you saw, and check its **In progress** section so you don't
   work on something a teammate is already inside. This is how you find out what changed while you
   weren't running.
2. **End every task by adding a CHANGELOG entry** — what changed, why, which files, and anything
   others need to know. Commit it together with the code change. Never edit or delete someone
   else's entry; only add your own.
3. **Read this file**, then look at the folder you are about to touch before writing code.
4. **Match the surrounding code.** Naming, formatting, and comment density should look like the
   file you are editing, not like your defaults.
5. **Never force-push, never rewrite shared history, never commit to `main` directly.** See
   [Collaboration](#collaboration) below.
6. **Do not commit secrets.** No API keys, tokens, passwords, or `.env` files — ever. If you need
   a secret, read it from an environment variable and document the variable name in the README.
7. **Explain what you changed and why** in the commit message, not just what file moved.
8. **Ask before large refactors.** Renaming shared modules or restructuring folders affects
   everyone on the team; raise it in chat first.
9. **If you are unsure what something does, say so** rather than guessing. A wrong confident
   answer costs the team more time than a question.

Each teammate should point their own tool at this file so the whole team gets the same behavior:

| Tool | How it picks this up |
|---|---|
| Claude Code | copy or symlink this file to `CLAUDE.md` in the repo root |
| GitHub Copilot | copy to `.github/copilot-instructions.md` |
| Cursor | copy to `.cursorrules` |

---

## Folder structure

> **Note:** the stack is not chosen yet, so this is the agreed starting convention rather than a
> description of what currently exists. Create folders as you need them and keep to these names so
> everyone can find things.

```
Team-17-Hackathon-NCSEA/
├── README.md           # this file — the team contract
├── CHANGELOG.md        # running log of changes — read at task start, update at task end
├── docs/               # design notes, diagrams, meeting notes, research
├── src/                # all application source code
│   ├── frontend/       # UI — pages, components, styles
│   ├── backend/        # API, business logic, database access
│   └── shared/         # types, constants, helpers used by both sides
├── data/               # sample and seed data (small files only, no large datasets)
├── tests/              # automated tests, mirroring the src/ layout
├── scripts/            # setup, build, and utility scripts
│   └── sync.ps1        # pull + commit + push in one command
└── presentation/       # demo materials — lives on the `presentation` branch

```

**Rules of thumb**

- **Anything that isn't code goes in `docs/`.** Sketches, decisions, links, screenshots.
- **If two parts of the app need the same thing, it belongs in `src/shared/`** — don't copy-paste
  it into both.
- **Tests mirror source.** `src/backend/scoring.py` is tested by `tests/backend/test_scoring.py`.
- **Large files don't belong in git.** Anything over ~10 MB should live in cloud storage with a
  link in `docs/`.
- **One concern per folder.** If you can't say in a sentence what a folder is for, it needs
  splitting or renaming.

---

## Documenting code

The goal is simple: **a teammate who has never seen your file should understand it in under a
minute.**

### Every file starts with a header comment

Say what the file does and why it exists — one to three lines, not an essay.

```python
"""Scoring engine for structural load calculations.

Takes a parsed building model and returns a per-member utilization ratio.
Used by the API layer in src/backend/api.py.
"""
```

### Every function that isn't obvious gets a docstring

Document the arguments, the return value, and anything surprising.

```python
def calculate_load(span_ft: float, load_psf: float) -> float:
    """Return the total distributed load in pounds for a single span.

    Args:
        span_ft: Clear span between supports, in feet.
        load_psf: Uniform load, in pounds per square foot.

    Returns:
        Total load in pounds. Assumes a 1-ft tributary width — callers
        handling wider tributaries must scale the result themselves.
    """
```

### Comment the *why*, not the *what*

```python
# BAD  — restates the code
# add 1 to the counter
counter += 1

# GOOD — explains the reasoning
# NCSEA spec counts the ground floor as level 1, not level 0
counter += 1
```

### Leave a trail for unfinished work

```python
# TODO(sam): handle multi-span continuous beams — currently single-span only
```

Use your own name in the `TODO` so we know who to ask.

### Document as you go

Write the docstring when you write the function. "I'll document it later" means it ships
undocumented — and at hackathon pace, undocumented code is code nobody else can use.

### Keep `docs/` current

When you make a real decision — the database, the framework, the data format — write a short note
in `docs/` saying what you chose and why. Future-you will not remember, and the alternatives you
rejected are worth recording.

---

## Collaboration

### Branches

| Branch | What it's for |
|---|---|
| `main` | Always working. Demo-ready at any moment. Never commit here directly. |
| `dev` | Integration branch. Features merge here first and get tested together. |
| `feature/frontend` | UI work. |
| `feature/backend` | API, data, and logic work. |
| `presentation` | Demo and judging materials — slides, script, screenshots, talking points. Kept off the code branches so slide edits never conflict with code. |

Need a branch of your own? Base it on `dev` and name it for what it does:

```bash
git checkout dev
git pull
git checkout -b feature/load-calculator
```

Working on the demo instead of code? Switch to the presentation branch:

```bash
git checkout presentation
git pull
```

Keep slides, the demo script, and screenshots in `presentation/` there. It merges into `main`
near the end, or never — it exists so presentation work and code work stay out of each other's way.

### The normal loop — one command

Everything is bundled into one script so nothing gets committed but left unpushed:

```powershell
.\scripts\sync.ps1 -Message "Add span input validation to the load form"
```

That pulls, stages everything, commits, and pushes your current branch, in that order. It warns you
if you forgot a CHANGELOG entry.

Pushing branches or tags too:

```powershell
.\scripts\sync.ps1 -Message "Set up project branches" -AllBranches -Tags
```

### The same thing by hand

If you'd rather run the commands yourself, or you're not on Windows:

```bash
git pull                      # start from everyone else's latest work
# ... make your changes ...
git add .
git commit -m "Add span input validation to the load form"
git push origin feature/load-calculator
```

Either way, open a pull request into `dev` on GitHub afterwards.

### Commit messages

- Write in the imperative: "Add span validation", not "added" or "adding".
- One logical change per commit. Don't bundle a bug fix with a refactor.
- Describe the effect, not the mechanics: "Fix crash on empty input" beats "Update line 42".

### Pull requests

- **Target `dev`**, not `main`.
- Say what changed and how you tested it, even if that was "clicked through it manually."
- **One teammate reviews before merge.** At hackathon speed a review can be two minutes — but
  someone other than the author should have looked at it.
- Merging to `main` happens when `dev` is stable and demo-ready.

### Automated staleness guards

Two things enforce "don't work off something old" so it doesn't depend on anyone remembering:

| Guard | What it does | Setup |
|---|---|---|
| `.githooks/pre-commit` | Fetches before every commit and **blocks** it if your branch is behind `origin`. | `git config core.hooksPath .githooks` — **run once per clone** |
| `.claude/settings.json` | Makes every Claude Code session pull and print the newest CHANGELOG entries before work starts. | none — works on clone |

Git deliberately won't auto-enable a hook that arrives in a repository, so the one-time config
command is unavoidable. Run it right after cloning:

```bash
git config core.hooksPath .githooks
```

Overrides, when you genuinely need them:

```bash
ALLOW_STALE=1 git commit -m "..."   # commit despite being behind
git commit --no-verify -m "..."     # skip all hooks
```

Merges and rebases are exempt — they're how you *stop* being behind. If you're offline the hook
warns and lets the commit through rather than stranding you.

Copilot and Cursor users get the git hook but not the session hook; those tools have no equivalent,
so the README rules are what they run on.

### Pull before you push, always

The most common way to lose work in a hackathon is two people editing the same file without
pulling. If git reports a conflict, don't guess and don't force-push — ask the other author. They
wrote that code twenty minutes ago and will know the answer immediately.

### Tags

We tag milestones so there's always a known-good version to fall back on during the demo.

```bash
git tag -a v0.1.0 -m "First working prototype"
git push --tags
```

`v0.0.1` marks the initial repository setup.

---

## Getting started

```bash
git clone https://github.com/THELaw688/Team-17-Hackathon-NCSEA.git
cd Team-17-Hackathon-NCSEA
git config core.hooksPath .githooks    # enables the staleness guard - do this once
git checkout dev
```

Windows users, once per machine, so `scripts/sync.ps1` can run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then read this file, read [CHANGELOG.md](CHANGELOG.md) to see where the project currently stands,
check `docs/` for decisions already made, and ask in team chat what needs doing before picking
something up.

### Every session after that

```bash
git pull                      # get everyone else's work and changelog entries
```

Read the new entries at the top of [CHANGELOG.md](CHANGELOG.md) before you start, and add your own
when you finish.
