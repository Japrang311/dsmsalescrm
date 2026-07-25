-- RFQ is retired from the product. Historical rows and columns remain intact
-- so existing commercial history is preserved and the change stays reversible.
drop function if exists public.create_quotation_from_rfq(uuid);
drop function if exists public.create_rfq(uuid, text, date, text, jsonb);
