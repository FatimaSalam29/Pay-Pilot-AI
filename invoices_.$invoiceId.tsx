import { useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, Loader2, Pencil, Printer, Send, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { ShareCard } from "@/components/invoice/ShareCard";
import { PaymentStatusBadge } from "@/components/app/PaymentStatusBadge";
import { invoicePaymentsQuery, invoiceQuery, profileQuery } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { effectiveStatus, todayISO } from "@/lib/invoice-math";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";

export const Route = createFileRoute("/_authenticated/invoices_/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — PayPilot AI" },
      { name: "description", content: "Invoice preview, PDF download, customer link and payment status." },
      { property: "og:title", content: "Invoice — PayPilot AI" },
      { property: "og:description", content: "Invoice preview, PDF download, customer link and payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [inv] = await Promise.all([
      context.queryClient.ensureQueryData(invoiceQuery(params.invoiceId)),
      context.queryClient.ensureQueryData(profileQuery()),
    ]);
    if (!inv) throw notFound();
  },
  notFoundComponent: () => (
    <div className="py-24 text-center">
      <h1 className="text-xl font-semibold">Invoice not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been deleted.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/invoices">Back to invoices</Link>
      </Button>
    </div>
  ),
  component: InvoiceDetail,
});

const STATUS_LABEL = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled" } as const;

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const { data: invoice } = useSuspenseQuery(invoiceQuery(invoiceId));
  const { data: profile } = useSuspenseQuery(profileQuery());
  const { data: payments = [] } = useQuery(invoicePaymentsQuery(invoiceId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  if (!invoice) return null;
  const status = effectiveStatus(invoice.status, invoice.due_date, todayISO());
  const isFinal = invoice.status === "paid" || invoice.status === "cancelled";
  const business = {
    name: profile?.business_name || profile?.full_name || "Your business",
    email: profile?.email,
    phone: profile?.phone,
    address: profile?.address,
  };
  const items = invoice.items.map((i) => ({
    description: i.description,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unit_price),
  }));
  const totals = {
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    taxAmount: Number(invoice.tax_amount),
    total: Number(invoice.total),
  };
  const completed = payments.find((p) => p.status === "completed");

  async function updateStatus(next: "sent" | "cancelled") {
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ status: next }).eq("id", invoiceId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "sent" ? "Marked as sent — your customer link is ready" : "Invoice cancelled");
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice deleted");
    queryClient.removeQueries({ queryKey: ["invoices", invoiceId] });
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    navigate({ to: "/invoices" });
  }

  async function pdf() {
    setPdfBusy(true);
    try {
      await downloadInvoicePdf({
        number: invoice!.invoice_number ?? "Invoice",
        statusLabel: STATUS_LABEL[status],
        issueDate: invoice!.issue_date,
        dueDate: invoice!.due_date,
        paidAt: invoice!.paid_at,
        currency: invoice!.currency,
        business,
        customer: invoice!.customer,
        items,
        totals,
        taxRate: Number(invoice!.tax_rate),
        notes: invoice!.notes,
      });
    } catch {
      toast.error("Couldn't create the PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="animate-rise">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button variant="outline" onClick={pdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
          </Button>
          {!isFinal && (
            <Button variant="outline" asChild>
              <Link to="/invoices/$invoiceId/edit" params={{ invoiceId }}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {invoice.status === "draft" && (
            <Button variant="hero" disabled={busy} onClick={() => updateStatus("sent")}>
              <Send /> Mark as sent
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <InvoiceDocument
          business={business}
          customer={invoice.customer}
          number={invoice.invoice_number ?? ""}
          issueDate={invoice.issue_date}
          dueDate={invoice.due_date}
          currency={invoice.currency}
          items={items}
          totals={totals}
          taxRate={Number(invoice.tax_rate)}
          notes={invoice.notes}
          status={status}
        />

        <aside className="no-print space-y-4">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Amount due</p>
            <p className="font-figure mt-2 text-3xl font-semibold">
              {invoice.status === "paid" ? formatMoney(0, invoice.currency) : formatMoney(totals.total, invoice.currency)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.status === "paid"
                ? `Paid ${formatDate(invoice.paid_at)}`
                : status === "overdue"
                  ? `Was due ${formatDate(invoice.due_date)}`
                  : `Due ${formatDate(invoice.due_date)}`}
            </p>
            {completed && (
              <p className="font-figure mt-3 truncate rounded-md bg-success-soft px-2.5 py-1.5 text-xs text-foreground">
                PayPal transaction {completed.provider_capture_id}
              </p>
            )}
          </Card>

          <ShareCard
            invoiceId={invoiceId}
            token={invoice.share_token}
            number={invoice.invoice_number ?? ""}
            customerEmail={invoice.customer?.email}
            businessName={business.name}
            status={invoice.status}
          />

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">PayPal payments</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your customer pays from their link. The invoice turns paid only after PayPal confirms the money.
                </p>
              </div>
            </div>
            {payments.length > 0 && (
              <ul className="mt-4 divide-y rounded-lg border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-figure truncate font-medium">{p.provider_capture_id ?? p.provider_order_id}</p>
                      <p className="text-muted-foreground">{formatDate(p.created_at)}{p.failure_reason && p.status !== "completed" ? ` · ${p.failure_reason}` : ""}</p>
                    </div>
                    <PaymentStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
              There's no manual "mark paid" switch — only a verified payment can do that.
            </div>
          </Card>

          {!isFinal && (
            <Card className="space-y-2 p-5">
              <p className="mb-1 text-sm font-semibold">Manage</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" disabled={busy}>
                    <Ban /> Cancel invoice
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel {invoice.invoice_number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The invoice stays in your records but is no longer counted as owed, and your customer can no longer pay it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={() => updateStatus("cancelled")}>Cancel invoice</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          )}

          {invoice.status !== "paid" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" disabled={busy}>
                  <Trash2 /> Delete invoice
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {invoice.invoice_number}?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the invoice, its line items and its payment attempts.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </aside>
      </div>
    </div>
  );
}
