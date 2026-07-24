-- Allow non-executive Sales Order editors to correct externally assigned SO
-- numbers from the app. RLS remains the trusted boundary: Sales can update
-- only their own SO rows, while Manager/Super Admin can update permitted rows;
-- Top Executive is not included in sales_orders_update.
grant update (so_number) on table public.sales_orders to authenticated;
