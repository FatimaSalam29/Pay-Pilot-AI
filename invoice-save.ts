// Browser-side invoice writes (RLS applies). Paid status is never written here.
import { supabase } from "@/integrations/supabase/client";
import type { InvoiceSubmit } from "@/components/invoice/InvoiceForm";

async function ensureCustomer(s: InvoiceSubmit): Promise<string> {
  const v = s.values;
  if (v.customerMode === "existing") return v.customerId;
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: v.newCustomer.name.trim(),
      email: v.newCustomer.email.trim() || null,
      company: v.newCustomer.company.trim() || null,
      address: v.newCustomer.address.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createInvoice(s: InvoiceSubmit, status: "draft" | "sent") {
  const customerId = await ensureCustomer(s);
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      customer_id: customerId,
      status,
      issue_date: s.values.issueDate,
      due_date: s.values.dueDate,
      currency: s.values.currency,
      subtotal: s.totals.subtotal,
      tax_rate: s.taxRate,
      tax_amount: s.totals.taxAmount,
      discount: s.totals.discount,
      total: s.totals.total,
      notes: s.values.notes.trim() || null,
    })
    .select("id, invoice_number")
    .single();
  if (error) throw error;

  const { error: itemsErr } = await supabase.from("invoice_items").insert(
    s.items.map((i, idx) => ({
      invoice_id: invoice.id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      amount: i.amount,
      position: idx,
    })),
  );
  if (itemsErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    throw itemsErr;
  }
  return invoice;
}

/** Atomic: invoice fields and all line items are replaced in one database transaction. */
export async function updateInvoice(invoiceId: string, s: InvoiceSubmit) {
  const customerId = await ensureCustomer(s);
  const { error } = await supabase.rpc("update_invoice_with_items", {
    _invoice_id: invoiceId,
    _invoice: {
      customer_id: customerId,
      issue_date: s.values.issueDate,
      due_date: s.values.dueDate,
      currency: s.values.currency,
      subtotal: s.totals.subtotal,
      tax_rate: s.taxRate,
      tax_amount: s.totals.taxAmount,
      discount: s.totals.discount,
      total: s.totals.total,
      notes: s.values.notes.trim(),
    },
    _items: s.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      amount: i.amount,
    })),
  });
  if (error) throw error;
}
