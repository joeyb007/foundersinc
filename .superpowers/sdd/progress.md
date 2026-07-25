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
- Group A: complete (commit ed70af3..15504da, review clean). Convex foundation + workflow + stub.
- Group B: SUPERSEDED by Group D. The single-call FastAPI agent (base.run_agent/github.open_pr) was replaced by the Claude Agent SDK coding executor per the user's pivot. Not separately committed.
- Group D: complete (FastAPI Agent SDK coding executor). Spec ✅; 3 Important + 2 Minor review findings all fixed; 11 pytest pass. UNCOMMITTED (user commits).
- Group C: complete (Convex callbacks appendPublic/finishPublic + fire-and-forget runOne + decompose + seam). Spec ✅; Important (decompose validation) + Minor (union dup) fixed by controller. UNCOMMITTED (user commits).
- Pivot log: roles expanded 4->12 (user); agents became real coding agents via Claude Agent SDK (user); no autonomous commits (user).
- NEXT: final whole-branch review, then hand to user for commit + live wiring.

## Minor findings (for final review triage)
- runs.listByEpic does an unindexed runs.collect() then filters in memory (plan-mandated; ~4-20 rows at demo scale).
- backend temp checkouts cleaned via rmtree in finally (fixed); convex_client lazy init now lock-guarded (fixed).
