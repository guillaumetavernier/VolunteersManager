---
name: commit
description: Create atomic git commits following Conventional Commits, ordered by dependency layers
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git reset *)
---

## Current state

```!
git add -N . 2>/dev/null
echo "=== STATUS ==="
git status --short
echo "=== RECENT LOG ==="
git log --oneline -10
```

## Workflow

1. **Gitignore** — if untracked files should not be committed (build artifacts, `.env`, IDE configs, `.DS_Store`, `node_modules/`, `__pycache__/`, `.venv/`, secrets, logs), add them to `.gitignore`, `git reset` those files, and commit `.gitignore` first. 

2. **Group and commit** — split changes into atomic commits, one logical change each. Order by dependency layer: Docs → DB migrations → Core/domain → Services → Presentation → Tests. Use `git add -p` when a file spans multiple concerns. Stage and commit each group immediately — do NOT ask for confirmation.

- `.claude/` and its contents are project files — always commit them.
- When done, `git status` must show no untracked or modified files (everything is either committed or gitignored).

## Commit messages

- Concise title, Conventional Commits format
- Add a body ONLY when the title doesn't capture a non-obvious choice, trade-off, or design decision
- No Co-Authored-By footer.

## Finish

Run `git reset` for any remaining intent-to-add files. Show `git log --oneline` with new commits.
