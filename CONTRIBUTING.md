# Contributing to ModSearch

Contributions from the community are warmly welcomed!

Ways to contribute:

- **[Open an issue](https://github.com/flyzstu/modsearch/issues).** Bugs, ideas, a confusing error message, docs that read wrong.
- **[Submit a Pull Request](https://github.com/flyzstu/modsearch/pulls).** New provider integrations, bug fixes, test expansions, and optimizations.

---

## Getting set up

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # vite lib build to dist/
pnpm lint        # Biome
```

Requires Node 22.13+. CI runs the full gate on macOS, Linux, and Windows (Node 22 and 24). The README's "Platform support" section covers what each platform includes.

## Tests never go online

Unit tests must not touch the network. The keyed HTTP engines (Tavily, Exa,
Firecrawl) are exercised with a stubbed `fetch`, a page fetch runs against the
loopback server from `startLocalPage` in `src/testing/helpers.ts`, and the
`agy`/`grok` subprocess engines are replaced with fake CLIs that echo canned
envelopes. A fake CLI is a POSIX shell script, so the suites that spawn one run
on Unix only and are skipped on Windows. Real `agy`/`grok` calls spend quota and
are end-to-end checks, not unit tests, so they stay out of `pnpm test`. See
`docs/testing.md`.

Tests are co-located: modules have an adjacent `*.test.ts`. Add or update a
test in the same commit as any behavior change.

## Commits

Follow `docs/commit.md`: Conventional Commits, one change per commit, imperative
summary under 72 characters, no trailing period. Do not mix a pure refactor or
formatting pass with a behavior change.

The architecture lives in `AGENTS.md` if you need the lay of the land.
