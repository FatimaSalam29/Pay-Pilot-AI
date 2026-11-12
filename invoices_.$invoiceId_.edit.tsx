import { useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { InvoiceForm, newLine, type InvoiceFormValues, type InvoiceSubmit } from "@/components/invoice/InvoiceForm";
import { customersQuery, invoiceQuery, profileQuery, type InvoiceFull } from "@/lib/data";
import { updateInvoice } from "@/lib/invoice-save";

export const Route = createFileRoute("/_authenticated/invoices_/$invoiceId_/edit")({
  head: () => ({
    meta: [
      { title: "Edit invoice — PayPilot AI" },
      { name: "description", content: "Update services, prices, dates and customer details on an invoice." },
      { property: "og:title", content: "Edit invoice — PayPilot AI" },
      { property: "og:description", content: "Update an existing invoice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [inv] = await Promise.all([
      context.queryClient.ensureQueryData(invoiceQuery(params.invoiceId)),
      context.queryClient.ensureQueryData(customersQuery()),
      context.queryClient.ensureQueryData(profileQuery()),
    ]);
    if (!inv) throw notFound();
  },
  notFoundComponent: () => (
    <div className="py-24 text-center">
      <h1 className="text-xl font-semibold">Invoice not found</h1>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/invoices">Back to invoices</Link>
      </Button>
    </div>
  ),
  component: EditInvoice,
});

function toFormValues(inv: InvoiceFull): InvoiceFormValues {
  return {
    customerMode: "existing",
    customerId: inv.customer_id ?? "",
    newCustomer: { name: "", email: "", company: "", address: "" },
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    currency: inv.currency,
    items: inv.items.length
      ? inv.items.map((i) => newLine({ description: i.description, quantity: String(Number(i.quantity)), unitPrice: String(Number(i.unit_price)) }))
      : [newLine()],
    taxRate: String(Number(inv.tax_rate)),
    discount: String(Number(inv.discount)),
    notes: inv.notes ?? "",
  };
}

function EditInvoice() {
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: invoice } = useSuspenseQuery(invoiceQuery(invoiceId));
  const { data: customers } = useSuspenseQuery(customersQuery());
  const { data: profile } = useSuspenseQuery(profileQuery());
  const [initial] = useState(() => (invoice ? toFormValues(invoice) : null));
  const [saving, setSaving] = useState(false);

  if (!invoice || !initial) return null;

  if (invoice.status === "paid" || invoice.status === "cancelled") {
    return (
      <div className="py-24 text-center">
        <h1 className="text-xl font-semibold">{invoice.invoice_number} can't be edited</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invoice.status === "paid" ? "Paid invoices are locked to keep your records accurate." : "Cancelled invoices are kept as a record."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/invoices/$invoiceId" params={{ invoiceId }}>Back to invoice</Link>
        </Button>
      </div>
    );
  }

  async function save(payload: InvoiceSubmit | null) {
    if (!payload) return;
    setSaving(true);
    try {
      await updateInvoice(invoiceId, payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
      toast.success(`${invoice!.invoice_number} updated`);
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-rise">
      <Link to="/invoices/$invoiceId" params={{ invoiceId }} className="no-print mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to {invoice.invoice_number}
      </Link>
      <PageHeader
        eyebrow="Edit invoice"
        title={invoice.invoice_number ?? "Invoice"}
        description={
          invoice.status === "sent"
            ? "This invoice was already sent. Your customer's link will show the updated version straight away."
            : "Changes appear in the preview as you type."
        }
      />
      <InvoiceForm
        customers={customers}
        profile={profile}
        initial={initial}
        number={invoice.invoice_number ?? ""}
        renderActions={(submit) => (
          <>
            <Button variant="outline" asChild>
              <Link to="/invoices/$invoiceId" params={{ invoiceId }}>Discard</Link>
            </Button>
            <Button variant="hero" onClick={() => save(submit())} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
            </Button>
          </>
        )}
      />
    </div>
  );
}
