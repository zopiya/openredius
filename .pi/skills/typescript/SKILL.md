---
name: typescript
description: TypeScript patterns — strict types, async boundaries, modules, toolchain defaults, and review checks
---

# TypeScript

Use this skill when planning, building, reviewing, or testing TypeScript code.
Project conventions win. If choosing a new framework, dependency, runtime, or
version, verify current official docs before deciding; this file is a fallback,
not a source of latest truth.

## Community Defaults

- TypeScript strict mode for production code.
- ESM-first modules unless the repo is already CommonJS.
- Runtime: use the repo runtime; otherwise prefer the active Node LTS for
  compatibility, or Bun only when the project already leans Bun.
- Package manager: follow lockfile/package metadata; otherwise npm for simple
  projects, pnpm for workspaces.
- Tests: Vitest for Vite/native ESM projects, Jest only when already established,
  Playwright for browser E2E.
- Formatting/linting: repo config first; otherwise Prettier + ESLint.

## Decision Rules

- App framework: extend the existing framework. For greenfield, escalate to a
  planning pass (`.pi/agents/planner.md`, or think it through in-session for
  smaller cases) and compare options against product shape, deployment, team
  familiarity, and ecosystem maturity.
- Shared types: expose stable exported types only at module/API boundaries; keep
  internal helper types local.
- Runtime validation: TypeScript types do not validate external data. Use the
  repo's schema tool, or a small local validator for narrow inputs.
- Async flows: centralize retries, cancellation, and timeout behavior at I/O
  boundaries, not deep in pure functions.
- State/data fetching: follow existing app architecture; do not introduce a new
  state library for one feature.

## Boundary Checks

- Validate API, CLI, config, environment, file-system, and webhook inputs.
- Use `unknown` and narrow instead of `any`.
- Check optional/null values before access.
- Do not leak stack traces, tokens, or internal paths through errors.
- Keep request/response transport shapes separate from domain objects when the
  repo already has that separation.

## Toolchain Checks

Use repository commands first. Common fallbacks:

```bash
tsc --noEmit
eslint .
prettier --check .
vitest run
```

### OpenRedius

- Runtime/package manager is **bun** (`package.json` + `bunfig.toml` at repo
  root) — never suggest npm/pnpm/yarn or add one alongside it.
- No ESLint/Prettier configured — match the existing style in `src/` instead of
  introducing a linter unbidden.
- Canonical gate: `bun run verify` (`tsc -b` + 13-route smoke + 21 interaction
  tests + prototype-fidelity audit). `bun test` alone runs just the interaction
  tests. Full command list: `docs/09-testing-quality.md`.
- Data layer: `src/api/resources` — currently mock, switches to `http` per
  resource from M5 (ADR-0005, `docs/05-frontend-design.md`); keep the resource
  function signature stable across that switch.
- Design system (`src/styles/radius-admin.css`) is ported 1:1 from the original
  prototype — don't introduce Tailwind or a new component-styling approach (see
  root `README.md` "与原型的一处工程差异").

## Avoid

- Adding `any`, non-null assertions, or broad type casts to silence errors.
- Mixing ESM and CJS casually.
- Introducing framework-specific abstractions into domain logic.
- Changing public exports without compatibility review.

## Review Checklist

- Public exports and types remain backward compatible unless approved.
- Promise rejections and async boundary failures are handled.
- Validation exists where runtime data enters the system.
- Tests cover behavior and edge cases, not private implementation.
