# ADR-004: Four-Stage Stabilization and Growth Program

**Date:** 2026-08-05  
**Status:** Approved  
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md`

## Context

The previous Priority 1 execution order put PWA and synchronization work before the database and workflow integrity gaps were resolved. The audit found that the application needs stronger atomic write contracts, reproducible engineering gates, bounded data contracts, and truthful analytics before optional realtime/PWA work.

## Decision

Approve the four-stage execution order:

1. Operational integrity
2. Engineering guardrails
3. Data and performance
4. Product intelligence

This order supersedes the old PWA-first priority order while preserving old files as historical evidence.

The following Stage 1 and Stage 4 decisions are also approved:

- Follow-up flows must explicitly choose between progressing an existing Task ID and creating a new Task.
- Future audit events may write nullable structured `activity_log.event_data`.
- Stage 4 may add `source_quotation_id` and an explicit Customer PO milestone date for new records.

Browser test dependency selection remains pending and is not authorized by this ADR.

## Consequences

- Stage 1 local implementation may begin.
- Remote Supabase changes, dependency installation, push, merge, and deployment still require separate exact-target approval.
- Realtime is reassessed only after Stage 4 acceptance.
