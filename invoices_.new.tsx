import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { InvoiceForm, defaultFormValues, type InvoiceSubmit } from "@/components/invoice/InvoiceForm";
import { customersQuery, profileQuery } from "@/lib/data";
import { createInvoice } from "@/lib/invoice-save";

export const Route = createFileRoute("/_authenticated/invoices_/new")({
  head: () => ({
    meta: [
      { title: "New invoice — PayPilot AI" },
      { name: "description", content: "Create a professional invoice by hand or describe it and let AI fill it in." },
      { property: "og:title", content: "New invoice — PayPilot AI" },
      { property: "og:description", content: "Create a professional invoice in under a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(customersQuery()),
      context.queryClient.ensureQueryData(profileQuery()),
    ]),
  component: NewInvoice,
});

function NewInvoice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: customers } = useSuspenseQuery(customersQuery());
  const { data: profile } = useSuspenseQuery(profileQuery());
  const [initial] = useState(() => defaultFormValues(customers, profile));
  const [saving, setSaving] = useState<null | "draft" | "sent">(null);

  async function save(payload: InvoiceSubmit | null, status: "draft" | "sent") {
    if (!payload) return;
    setSaving(status);
    try {
      const invoice = await createInvoice(payload, status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
      toast.success(`${invoice.invoice_number} ${status === "draft" ? "saved as draft" : "created"}`);
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save invoice");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Invoice generator"
        title="New invoice"
        description="Describe the job for AI, or fill in the details yourself — the invoice updates live on the right."
      />
      <InvoiceForm
        customers={customers}
        profile={profile}
        initial={initial}
        number="INV-XXXX"
        showAi
        renderActions={(submit) => (
          <>
            <Button variant="outline" onClick={() => save(submit(), "draft")} disabled={!!saving}>
              {saving === "draft" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
            </Button>
            <Button variant="hero" onClick={() => save(submit(), "sent")} disabled={!!saving}>
              {saving === "sent" ? <Loader2 className="animate-spin" /> : <Send />} Create invoice
            </Button>
          </>
        )}
      />
    </div>
  );
}
