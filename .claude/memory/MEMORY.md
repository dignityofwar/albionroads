# Memory Index

- [Docs folder is the architecture reference](albionroads-docs.md) — read docs/ before re-exploring; update it when changing interfaces; root README drifts
- [Dev workflow](albionroads-dev-workflow.md) — build/run/test commands; shared isn't watched by pnpm dev; server tests mock pg.Pool entirely and run serially
- [Gotchas & invariants](albionroads-gotchas.md) — server-owned positions, full-array WS broadcasts, sender-exclusion trap on split edits, delete+reinsert paths, handles-win rotation healing, room-lock chokepoint + guard-SQL test dispatch, bundled COLRv1 emoji font (re-subset when adding emoji), known schema drift
- [Backend deploy pipeline](albionroads-deploy-pipeline-rollout.md) — live since 27 Jul 2026: Actions → webhook → the target box; the off-repo infra facts, plus what update.sh does is still unverified
- [Duplicate zones in the catalogue](albionroads-catalogue-duplicates.md) — upstream lists some zones twice under one-letter spelling variants; a wrong first letter silently becomes a wrong map shape
- [Metrics conventions](albionroads-metrics-conventions.md) — /metrics output grouped by topic sections; live-state gauges over day buckets; counters for monotonic totals; global/per-room naming pairs
- [Map icon reader](albionroads-icon-reader.md) — chest colour comes from lid hue not correlation; small/large is the clearing; templates are tied to specific cached screenshots; the tabulated reference errs both ways

- [Pool query inside a transaction self-deadlocks](albionroads-pool-transaction-deadlock.md) — the 2026-08-06 outage; use the checked-out client, never the pool, between BEGIN and COMMIT; health must not fail on the new counters

Note: this memory lives in the repo at `.claude/memory/` (wired via `autoMemoryDirectory` in `.claude/settings.json`) so it's shared via git across machines and collaborators.
