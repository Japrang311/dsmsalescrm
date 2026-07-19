# Task 4 Gate Review

**Verdict: CHANGES_REQUIRED**

## Important findings

1. **Important — the 16 KiB request limit is enforced only after the complete body is buffered.**  
   `supabase/functions/manage-team-member/index.ts:109-116` calls `request.text()` before `handleAdminRequest()` performs the byte check at `supabase/functions/manage-team-member/handler.ts:266-274`. An arbitrarily large or streaming POST can therefore consume Edge Function memory before the advertised limit can reject it. The pure-handler test covers an already-materialized string, so it cannot catch this adapter-level failure.  
   **Concrete fix:** read `request.body` incrementally in the Deno adapter, stop and cancel once the accumulated UTF-8 bytes exceed 16 KiB, and return `REQUEST_TOO_LARGE`; use `Content-Length` only as an early shortcut, not the sole guard. Add adapter-level tests for an oversized declared length and an oversized chunked stream.

2. **Important — failed Auth unban leaves the database active and can restore access through an old JWT while returning 502.**  
   `supabase/functions/manage-team-member/handler.ts:139-165` commits `account_status = active` before attempting the Auth unban. The implementation itself documents that an access JWT can remain valid until expiry (`supabase/functions/manage-team-member/index.ts:88-97`). Consequently, an old unexpired JWT that RLS blocked while the profile was inactive can pass the active-profile RLS boundary again even when unban fails and the endpoint reports `AUTH_REACTIVATION_INCOMPLETE`. The test at `supabase/functions/manage-team-member/index.test.ts:502-552` explicitly locks in the unsafe DB-first order for both directions.  
   **Concrete fix:** retain DB-first ordering for deactivation, but use Auth-unban-first then database activation for reactivation. If the database step fails after unban, the profile remains inactive and RLS stays fail-closed; make retries idempotent and add tests for both partial-failure directions.

3. **Important — owner eligibility is a policy check, not a database invariant, so role change can race an owner insert.**  
   `private.change_team_member_role` locks the profile and counts current ownership before changing the role (`supabase/migrations/20260718180929_add_account_lifecycle_functions.sql:562-602`), but owner-bearing tables only have foreign keys to `profiles`; they do not constrain the referenced profile to active Sales/Manager. The browser checks in `supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:35-44` and equivalent policies are not sufficient for service-role writes, and a concurrent insert can wait on the profile lock then complete after the demotion because the FK still exists. That can leave a newly Executive/Super-Admin/inactive profile owning business data immediately after the lifecycle RPC approved the change. The current lifecycle tests exercise rollback but not concurrent owner creation.  
   **Concrete fix:** enforce active Sales/Manager eligibility at the database write boundary for every `owner_id`/`sales_id` path (for example, a shared trigger that locks and validates the referenced profile on insert or owner reassignment), then add a two-transaction regression test proving a concurrent insert cannot commit after demotion/deactivation. Keep deterministic profile locking in transfer; it remains useful for transfer/status serialization.

## Gate summary

- [Pasti] The service-only RPC grants, active-Super-Admin checks, reference-count delete guard, and transactional transfer rollback are well covered by the supplied implementation and report.
- [Pasti] Findings 1 and 2 are directly visible in control-flow order.
- [Kemungkinan Besar] Finding 3 is exploitable under concurrency unless a database invariant outside the reviewed migrations exists; repository search found RLS validation but no owner-eligibility constraint/trigger.
- No broad tests were rerun during this read-only gate review.

---

# Task 4 Fix Wave 1 Re-review

**Verdict: APPROVED**

## Resolution of the three Important findings

1. **Resolved — the Edge adapter now enforces a truly bounded streaming read.**
   `body-reader.ts` rejects a valid oversized `Content-Length` before acquiring
   a reader, then counts raw `Uint8Array.byteLength` values while consuming a
   chunked body and cancels immediately above 16 KiB. `index.ts` uses this
   reader instead of `request.text()`, while the pure handler retains its
   independent materialized-body guard. The two focused adapter tests cover
   both the declared-length shortcut and an actual multi-chunk overflow.

2. **Resolved — reactivation is fail-closed and retry-safe for the modeled
   partial failures.** `handler.ts` unbans Auth before attempting database
   activation. An Auth failure makes no database call; a database failure
   leaves the profile transaction inactive and attempts a best-effort re-ban;
   and an `ACCOUNT_STATUS_UNCHANGED` retry succeeds after repeating the
   idempotent unban. Deactivation correctly remains database-first. The focused
   orchestration test asserts the exact call order and both partial-failure
   directions.

3. **Resolved — all six current operational owner paths share a database write
   invariant that serializes with role/status changes.** The append-only
   migration covers `clients.owner_id`, `tasks.owner_id`,
   `commercial_items.owner_id`, `sales_orders.owner_id`,
   `follow_up_logs.owner_id`, and `targets.sales_id` for insert/reassignment.
   The trigger locks the candidate profile `FOR SHARE`, which conflicts with
   the non-key profile update lock used by demotion/deactivation, and validates
   active `sales | manager` state only after any earlier profile mutation
   commits. The shared function is `SECURITY DEFINER`, fully schema-qualified
   under `search_path = ''`, and has execution revoked from `PUBLIC`, `anon`,
   `authenticated`, and `service_role`; trigger execution does not require a
   caller grant. The service-role six-table regression plus two-transaction
   demotion/deactivation cases exercise the required boundary. The original
   lifecycle/transfer functions remain compatible because their deterministic
   profile locks and trigger checks execute within the same transaction.

## Fixture and reset assessment

- [Pasti] The `super-admin-rls.test.ts` adjustment is legitimate. While the
  tested Sales profile is intentionally inactive, it creates the control
  target with the other still-active Sales/Manager fixture, then attempts the
  owner reassignment to the invalid destination. This preserves the production
  assertion instead of bypassing the new trigger.
- [Pasti] The new migration is append-only and the report records a successful
  fresh local reset through it; no prior migration was rewritten.

## Minor findings

1. **Minor — concurrency setup uses elapsed time instead of observing the lock.**
   `business-owner-invariant.test.ts` waits 150 ms before starting the second
   transaction. The one-second lock window makes the intended ordering highly
   likely locally, but a heavily loaded runner could start the second command
   first. A future hardening pass should synchronize on `pg_locks` or an
   explicit advisory/test barrier before launching the competing write.
2. **Minor — the trigger migration does not validate pre-existing rows.** It
   protects every future insert/reassignment, which fully resolves the reported
   race and is compatible with a clean reset, but an eventual hosted rollout
   should run a preflight query for already-invalid legacy owners before
   applying or relying on the invariant claim.

## Gate summary

- [Pasti] No Critical or Important finding remains from the original Task 4
  review.
- [Pasti] Fix Wave 1 is approved to advance to Task 5.
- No tests were rerun during this read-only re-review; the verdict uses source
  inspection and the focused evidence recorded in the updated implementation
  report.
