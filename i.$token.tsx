// Public customer page: /i/<token>. No login needed. Save as src/routes/i.$token.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CheckCircle2, FileX2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { PayPalCheckout } from "@/components/invoice/PayPalCheckout";
import { getSharedInvoice } from "@/lib/share.functions";
import { effectiveStatus, todayISO } from "@/lib/invoice-math";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/i/$token")({
  head: () => ({ meta: [{ title: "Invoice — PayPilot AI" }, { name: "robots", content: "noindex" }] }),
  loader: ({ params }) => getSharedInvoice({ data: { token: params.token } }),
  component: SharedInvoicePage,
  errorComponent: () => <Notice title="Couldn't load this invoice" text="Refresh the page or try again in a moment." />,
});

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md p-8 text-center">
        <FileX2 className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </Card>
    </main>
  );
}

function SharedInvoicePage() {
  const { invoice: inv, paymentsEnabled } = Route.useLoaderData();
  const { token } = Route.useParams();
  const router = useRouter();

  if (!inv) return <Notice title="Invoice not found" text="This link is invalid, or the sender has reset it. Ask them for a new link." />;

  const canPay = inv.status === "sent";
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <InvoiceDocument
          business={inv.business}
          customer={inv.customer}
          number={inv.invoice_number ?? "—"}
          issueDate={inv.issue_date}
          dueDate={inv.due_date}
          currency={inv.currency}
          items={inv.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unit_price }))}
          totals={{ subtotal: inv.subtotal, discount: inv.discount, taxAmount: inv.tax_amount, total: inv.total }}
          taxRate={inv.tax_rate}
          notes={inv.notes}
          status={effectiveStatus(inv.status, inv.due_date, todayISO())}
        />
        <Card className="p-6">
          {inv.status === "paid" && (
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Paid{inv.paid_at ? ` on ${formatDate(inv.paid_at)}` : ""}. Thank you!
            </p>
          )}
          {inv.status === "cancelled" && <p className="text-sm text-muted-foreground">This invoice was cancelled by the sender. No payment is needed.</p>}
          {canPay && paymentsEnabled && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Pay {formatMoney(inv.total, inv.currency)} securely with PayPal</p>
              <PayPalCheckout token={token} currency={inv.currency} onPaid={() => router.invalidate()} />
            </div>
          )}
          {canPay && !paymentsEnabled && (
            <p className="text-sm text-muted-foreground">Online payment is not set up yet. Please contact {inv.business.name} to pay this invoice.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
