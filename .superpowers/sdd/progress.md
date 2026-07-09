# Multi-Currency Capture — Progress Ledger

Plan: docs/superpowers/plans/2026-07-09-multi-currency-capture.md
Base commit: c1e4dfd
Branch: staging
Execution: subagent-driven (subagents code; controller does live infra + browser verify)

## Tasks
- [x] Task 1: schema + types
- [x] Task 2: currency list + money formatter
- [x] Task 3: ingest conversion
- [x] Task 4: settings picker + App wiring
- [x] Task 5: dashboard display
- [x] Task 6: transactions page display

## Log
Task 1: complete (commit 2cddda6, review clean). Migration NOT yet applied to live DB.
Task 2: complete (commit 2997757, review clean). Note: implementer added harmless `?? 2` fallback. IDR shows 2 decimals (ISO-correct); spec doc's "IDR zero-decimal" claim is inaccurate — correct spec later, no code change.
Migration 005 APPLIED to live project jvpkyswpmmoperqeyydm (columns verified nullable).
Task 3: code reviewed clean (commit bfd4564). PENDING live deploy + SGD smoke test before marking complete.
Ingest DEPLOYED to live (version 12, verify_jwt=false). SGD smoke test deferred to browser session with Task 4 verify.
Task 4: complete (commit 8429a15, App wiring + settings picker verified via tsc/build).
Task 5: complete (commit f95bf9b). Controller review caught a breakdown-chart inconsistency (foreign records summed as account currency in the chart while excluded from headline) — fixed in follow-up commit 16b8f56. tsc clean.
Task 6: complete (commit fa62d37, review clean). Transactions page mirrors dashboard: period/day totals exclude foreign, per-row amounts in own currency, FX detail rows + retry. tsc clean, build ok.

ALL 6 TASKS CODE-COMPLETE. Remaining: live SGD→MYR smoke test + browser UI verification; correct spec doc IDR "zero-decimal" claim.
