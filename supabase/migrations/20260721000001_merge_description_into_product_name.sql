-- Move description into product_name on sales_order_items, then drop description column.
-- All 383 current rows have product_name = NULL and description = the actual product name.

-- 1. Copy description → product_name where product_name is empty
UPDATE sales_order_items
SET product_name = description
WHERE (product_name IS NULL OR product_name = '')
  AND description IS NOT NULL AND description != '';

-- 2. Drop the description column
ALTER TABLE sales_order_items DROP COLUMN description;

-- 3. Update the import RPC to write description into product_name instead
CREATE OR REPLACE FUNCTION public.admin_import_normalized_documents(
  p_documents jsonb,
  p_counter_seeds jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document jsonb;
  v_header jsonb;
  v_item jsonb;
  v_seed jsonb;
  v_id uuid;
  v_position integer;
  v_document_count integer := 0;
  v_item_count integer := 0;
  v_seed_count integer := 0;
  v_supersedes_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING MESSAGE = 'SERVICE_ROLE_REQUIRED';
  END IF;
  IF jsonb_typeof(p_documents) <> 'array'
    OR jsonb_typeof(p_counter_seeds) <> 'array'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'IMPORT_ARRAYS_REQUIRED';
  END IF;

  CREATE TEMPORARY TABLE tmp_imported_quotation_ids (
    quotation_number text PRIMARY KEY,
    document_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR v_document IN SELECT value FROM jsonb_array_elements(p_documents)
  LOOP
    v_header := v_document -> 'header';
    IF jsonb_typeof(v_document -> 'items') <> 'array'
      OR jsonb_array_length(v_document -> 'items') = 0
    THEN
      RAISE EXCEPTION USING MESSAGE = 'IMPORT_DOCUMENT_ITEMS_REQUIRED';
    END IF;

    IF v_header ->> 'kind' = 'commercial' THEN
      INSERT INTO public.commercial_documents (
        client_id, owner_id, type, source_flow, document_date,
        quotation_number, quotation_base_number, quotation_revision,
        is_current_revision, stage, client_address, so_number, note
      ) VALUES (
        (v_header ->> 'clientId')::uuid,
        (v_header ->> 'ownerId')::uuid,
        'Quotation',
        'RFQ / New Product',
        (v_header ->> 'documentDate')::date,
        v_header ->> 'quotationNumber',
        v_header ->> 'quotationBaseNumber',
        (v_header ->> 'quotationRevision')::integer,
        false,
        v_header ->> 'stage',
        v_header ->> 'clientAddress',
        v_header ->> 'soNumber',
        v_header ->> 'note'
      )
      RETURNING id INTO v_id;

      INSERT INTO tmp_imported_quotation_ids (quotation_number, document_id)
      VALUES (v_header ->> 'quotationNumber', v_id);

    ELSIF v_header ->> 'kind' = 'sales_order' THEN
      INSERT INTO public.sales_orders (
        so_number, customer_po_number, date, client_id, owner_id,
        type, tax_type, prototype_status, source, number_mode, total_value
      ) VALUES (
        v_header ->> 'soNumber',
        v_header ->> 'customerPoNumber',
        (v_header ->> 'date')::date,
        (v_header ->> 'clientId')::uuid,
        (v_header ->> 'ownerId')::uuid,
        (v_header ->> 'type')::public.so_type,
        nullif(v_header ->> 'taxType', '')::public.tax_type,
        nullif(v_header ->> 'prototypeStatus', '')::public.prototype_status,
        (v_header ->> 'source')::public.revenue_source,
        'Imported',
        nullif(v_header ->> 'totalValue', '')::numeric
      )
      RETURNING id INTO v_id;
    ELSE
      RAISE EXCEPTION USING MESSAGE = 'UNKNOWN_IMPORT_DOCUMENT_KIND';
    END IF;

    v_document_count := v_document_count + 1;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_document -> 'items')
    LOOP
      v_position := (v_item ->> 'linePosition')::integer;
      IF v_header ->> 'kind' = 'commercial' THEN
        INSERT INTO public.commercial_document_items (
          commercial_document_id, product_name, description,
          qty, uom, unit_price, line_total, line_position
        ) VALUES (
          v_id,
          null,
          v_item ->> 'description',
          (v_item ->> 'qty')::numeric,
          (v_item ->> 'uom')::public.uom_type,
          nullif(v_item ->> 'unitPrice', '')::numeric,
          nullif(v_item ->> 'lineTotal', '')::numeric,
          v_position
        );
      ELSE
        -- description column removed: write into product_name
        INSERT INTO public.sales_order_items (
          sales_order_id, product_name,
          qty, uom, unit_price, line_total, line_position
        ) VALUES (
          v_id,
          nullif(v_item ->> 'description', ''),
          (v_item ->> 'qty')::numeric,
          (v_item ->> 'uom')::public.uom_type,
          nullif(v_item ->> 'unitPrice', '')::numeric,
          nullif(v_item ->> 'lineTotal', '')::numeric,
          v_position
        );
      END IF;
      v_item_count := v_item_count + 1;
    END LOOP;
  END LOOP;

  -- Apply revision state only after every imported header exists.
  FOR v_document IN
    SELECT value
    FROM jsonb_array_elements(p_documents)
    WHERE value -> 'header' ->> 'kind' = 'commercial'
  LOOP
    v_header := v_document -> 'header';
    v_supersedes_id := NULL;
    IF nullif(v_header ->> 'supersedesQuotationNumber', '') IS NOT NULL THEN
      SELECT document_id INTO v_supersedes_id
      FROM tmp_imported_quotation_ids
      WHERE quotation_number = v_header ->> 'supersedesQuotationNumber';
    END IF;

    UPDATE public.commercial_documents
    SET
      is_current_revision = true,
      supersedes_id = v_supersedes_id
    WHERE id = (
      SELECT document_id FROM tmp_imported_quotation_ids
      WHERE quotation_number = v_header ->> 'quotationNumber'
    );
  END LOOP;

  -- Apply counter seeds
  FOR v_seed IN SELECT value FROM jsonb_array_elements(p_counter_seeds)
  LOOP
    INSERT INTO public.document_number_counters (document_type, year, next_number)
    VALUES (
      v_seed ->> 'documentType',
      (v_seed ->> 'year')::integer,
      (v_seed ->> 'nextNumber')::integer
    )
    ON CONFLICT (document_type, year)
    DO UPDATE SET next_number = GREATEST(
      document_number_counters.next_number,
      EXCLUDED.next_number
    );
    v_seed_count := v_seed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'documents', v_document_count,
    'items', v_item_count,
    'counter_seeds', v_seed_count
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.admin_import_normalized_documents(jsonb, jsonb) FROM authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.admin_import_normalized_documents(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_import_normalized_documents(jsonb, jsonb) TO service_role;
