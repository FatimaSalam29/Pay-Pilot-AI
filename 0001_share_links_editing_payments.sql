-- Unguessable, revocable customer share links
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS invoices_share_token_key ON public.invoices(share_token);

-- Payment tracking extras
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_key ON public.payments(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public read of ONE invoice by its share token. Returns only what the customer needs to see.
-- Drafts are never exposed. No owner ids, internal notes or other invoices are returned.
CREATE OR REPLACE FUNCTION public.get_shared_invoice(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'invoice_number', i.invoice_number,
    'status', i.status,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'currency', i.currency,
    'subtotal', i.subtotal,
    'tax_rate', i.tax_rate,
    'tax_amount', i.tax_amount,
    'discount', i.discount,
    'total', i.total,
    'notes', i.notes,
    'paid_at', i.paid_at,
    'business', jsonb_build_object(
      'name', COALESCE(NULLIF(p.business_name, ''), NULLIF(p.full_name, ''), 'Your business'),
      'email', p.email,
      'phone', p.phone,
      'address', p.address
    ),
    'customer', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', c.name, 'company', c.company, 'email', c.email, 'address', c.address
    ) END,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'description', it.description, 'quantity', it.quantity, 'unit_price', it.unit_price
      ) ORDER BY it.position)
      FROM public.invoice_items it WHERE it.invoice_id = i.id
    ), '[]'::jsonb)
  )
  FROM public.invoices i
  LEFT JOIN public.profiles p ON p.id = i.user_id
  LEFT JOIN public.customers c ON c.id = i.customer_id AND c.user_id = i.user_id
  WHERE i.share_token = _token AND i.status <> 'draft'
$$;
REVOKE ALL ON FUNCTION public.get_shared_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_invoice(uuid) TO anon, authenticated, service_role;

-- Atomic invoice edit. Runs as the caller, so RLS and the paid-status guard still apply.
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(_invoice_id uuid, _invoice jsonb, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  pos integer := 0;
BEGIN
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'An invoice needs at least one service';
  END IF;

  UPDATE public.invoices SET
    customer_id = (_invoice->>'customer_id')::uuid,
    issue_date = (_invoice->>'issue_date')::date,
    due_date = (_invoice->>'due_date')::date,
    currency = _invoice->>'currency',
    subtotal = (_invoice->>'subtotal')::numeric,
    tax_rate = (_invoice->>'tax_rate')::numeric,
    tax_amount = (_invoice->>'tax_amount')::numeric,
    discount = (_invoice->>'discount')::numeric,
    total = (_invoice->>'total')::numeric,
    notes = NULLIF(_invoice->>'notes', '')
  WHERE id = _invoice_id
    AND user_id = auth.uid()
    AND status IN ('draft', 'sent');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your draft or sent invoices can be edited';
  END IF;

  DELETE FROM public.invoice_items WHERE invoice_id = _invoice_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, amount, position)
    VALUES (
      _invoice_id,
      item->>'description',
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'amount')::numeric,
      pos
    );
    pos := pos + 1;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.update_invoice_with_items(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, jsonb, jsonb) TO authenticated;