-- Expand client_search_index to include owner_id so the client picker in
-- Create dialogs (RFQ, Quotation, SO, Prototype) can resolve the owner
-- of any client regardless of clients_select's ownership rule.
--
-- Problem: when a Sales Order's owner_id differs from the client's
-- owner_id (owner mismatch from Sheet import), the client picker in
-- Create dialogs used listClients() which is scoped by clients_select
-- RLS — the client doesn't appear. The SO edit page already fixed this
-- by using searchClients() → client_search_index, but the picker didn't.
--
-- Fix: add owner_id to the view so searchClients() can return it, then
-- switch useClientResolution() to use searchClients() instead of
-- listClients().

drop view if exists public.client_search_index;

create view public.client_search_index
with (security_invoker = false) as
select id, name, owner_id
from public.clients
where public.current_user_role() is not null;

revoke all privileges on table public.client_search_index from public, anon;
grant select on table public.client_search_index to authenticated, service_role;
