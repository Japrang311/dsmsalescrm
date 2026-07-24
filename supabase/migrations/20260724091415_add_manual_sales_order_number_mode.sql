-- Existing Auto values remain valid historical data. New Sales Orders use
-- Manual, while Hariff Backdate remains the audited historical exception.
alter type public.document_number_mode
  add value if not exists 'Manual' after 'Auto';
