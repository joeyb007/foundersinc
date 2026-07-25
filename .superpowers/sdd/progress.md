# B1 Orchestrator — SDD Progress Ledger

Plan: docs/superpowers/plans/2026-07-25-b1-convex-orchestrator.md
Branch: b1-orchestrator
Env note: no Convex login / ANTHROPIC_API_KEY / GITHUB_TOKEN — code + mocked pytest only; live verification deferred to user.

Grouping:
- Group A = plan Tasks 0,1,2 (Convex foundation + workflow + stubbed runOne)
- Group B = plan Tasks 3,4 (FastAPI agents + GitHub tool + pytest)
- Group C = plan Tasks 5,6,7 (wire runOne->FastAPI + decompose + seam)
- Task 8 (reviewer) = stretch, only if time

## Status
- Group A: complete (commit ed70af3..15504da, review clean). Minor debt: runs.listByEpic full-table scan (spec-mandated, fine at demo scale).
- (in progress) Group B — subagents no longer commit; changes left in working tree for user.

## Minor findings (for final review triage)
- runs.listByEpic does an unindexed runs.collect() then filters in memory (plan-mandated; ~4-20 rows at demo scale).
