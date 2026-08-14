---
description: One round of the multi-hour unattended polish/upgrade loop — pick the least-recently-touched area, improve it for real (not just report), verify, commit
argument-hint: "[area]"
---

This is one round of a bounded, unattended polish-and-upgrade loop (driven externally by `.pi/scripts/pi-loop.sh`, see `.pi/docs/design.md` §10.5). You are running headless (`pi -p`, no human attending) — work autonomously, make a clean decision at every step, and never leave the working tree in an ambiguous state. The caller already checked out a dedicated branch before starting the loop; never switch branches, never touch `main` or `dev`.

Unlike `/audit` (`.pi/prompts/audit.md`), which only fixes clear/low-risk findings and reports everything else, this loop is explicitly allowed to make **real improvements** — refactors, added test coverage, safe dependency bumps, tightened types/error handling, doc/code drift fixes, small perf wins, removing dead code — as long as each change is verified before it's committed. It is not licensed to redesign anything or make a change it isn't confident is correct.

**0. Find or create the state directory.**

Look for an existing `.pi/work/system-polish-*/` directory. If one exists (from an earlier round in this same run), use it. Otherwise create `.pi/work/system-polish-<4-6 char random suffix>/` with a `log.md` file (header only) — this is the one exception to "pick a slug that describes the work": the slug is fixed as `system-polish` because every round in this run shares it, only the random suffix varies per run.

**1. Pick an area.**

If an area was given explicitly ($1), work on that. Otherwise read `log.md` in the state directory and pick whichever real subsystem has gone longest without an entry this run, or has never had one. Infer this repo's actual boundaries from its structure rather than assuming a fixed list, but concretely, in this repo, "subsystem" typically means one of: a `backend/src/openredius/<module>/` package (core/models/radius/schemas/api/services/ldap_sync/jobs), a frontend area (`src/pages/`, `src/api/resources/`, `src/components/`), `ansible/`, `deploy/`, a `docs/` chapter's accuracy against the code it describes, the `.pi/` harness itself, or test coverage for any of the above. Don't repeat the most-recently-touched area unless it's genuinely the only one left with real findings.

**2. Investigate that area thoroughly.**

Read the relevant code/config/tests/docs end to end. Look for real opportunities, not just problems: missing test coverage for existing behavior, outdated or drifted documentation, dead code, lint-level issues, weak error handling, types that are wider than they need to be, small inefficiencies, safe dependency updates (patch/minor only — check `bun outdated` / `uv lock --upgrade-package <pkg> --dry-run`-equivalent thinking, don't blindly bump majors), TODO/FIXME comments that are now safe to resolve.

**3. Classify every candidate change, then act.**

- **Safe to do now**: the change is well-scoped, you're confident it's correct, and it's verifiable by an existing check (test suite, typecheck, lint, or a manual read that leaves no real doubt). Make it, run the relevant verification for that part of the stack (see step 4), and commit it — one atomic, independently-revertable commit per change, conventional commit format (`.pi/skills/git/SKILL.md`).
- **Requires judgment** — a behavior change with no test covering it, an API/schema/migration change, anything touching auth/session/audit-log logic, deploy/infra config that affects production, a major dependency bump, or anything you are not fully confident is safe unattended: do NOT make the change. Only record it in the log (step 6) as a candidate for a human to pick up.

When genuinely unsure which bucket something falls in, treat it as judgment-required. Under-doing costs a longer human follow-up list; over-doing risks a bad unattended commit on autopilot for two hours.

**4. Verify before every commit.**

Run whichever of these actually applies to what you changed — see `docs/09-testing-quality.md` for the authoritative list:

- Frontend: `bun run verify` (from repo root).
- Backend: `cd backend && uv run pytest -q && uv run ruff check .` (skip `pytest -m integration` — it needs Postgres/FreeRADIUS, not assumed available headless).
- `.pi/` harness changes: `bun run typecheck:pi` and `.github/scripts/check-frontmatter.sh`.

If verification fails and you can't fix it within this round, revert the change rather than leaving it broken or uncommitted — step 5's clean-tree requirement covers this.

**5. Leave the tree clean.**

Before finishing, `git status --porcelain` must be empty — every change committed, or reverted if you decided not to keep it or couldn't verify it. The loop driver checks this after every round and stops the whole run if it isn't true.

**6. Append to the log, and commit that too.**

Append one entry to the state directory's `log.md`, in this exact shape:

```markdown
## YYYY-MM-DD HH:MM — <area>

- Commits: <N> (or "none")
- Improvements made: <one line each, or "none">
- Candidates reported (not done): <one line each, with why it needed judgment, or "none">
```

Use the actual current date/time (`date`) — don't guess it. Fold this into your last commit if you made one, or as a standalone `chore(polish): log round` commit if you made no code changes this round.

**7. Final message.**

End your response with a one-line summary (area, commit count, whether anything needs human judgment) — the loop driver's notification is built from this.

Area: $1
