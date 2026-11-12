// Payments history. Save as src/routes/_authenticated/payments.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { PaymentStatusBadge } from "@/components/app/PaymentStatusBadge";
import { formatDate, formatMoney } from "@/lib/format";

interface PaymentRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  environment: string;
  provider_order_id: string | null;
  provider_capture_id: string | null;
  failure_reason: string | null;
  created_at: string;
  invoice: { id: string; invoice_number: string | null; customer: { name: string } | null } | null;
}

const paymentsQuery = () =>
  queryOptions({
    queryKey: ["payments"],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, status, amount, currency, environment, provider_order_id, provider_capture_id, failure_reason, created_at, invoice:invoices(id, invoice_number, customer:customers(name))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — PayPilot AI" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(paymentsQuery()),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: rows } = useSuspenseQuery(paymentsQuery());
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const received: Record<string, number> = {};
  rows.filter((r) => r.status === "completed").forEach((r) => (received[r.currency] = (received[r.currency] ?? 0) + Number(r.amount)));
  const receivedText = Object.entries(received).map(([c, v]) => formatMoney(v, c)).join(" · ") || "—";

  return (
    <div>
      <PageHeader title="Payments" description="Every PayPal payment attempt, with its transaction ID and result." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-xs text-muted-foreground">Received</p><p className="mt-1 text-xl font-semibold">{receivedText}</p></Card>
        <Card className="p-5"><p className="text-xs text-muted-foreground">Successful</p><p className="mt-1 text-xl font-semibold">{count("completed")}</p></Card>
        <Card className="p-5"><p className="text-xs text-muted-foreground">Failed or cancelled</p><p className="mt-1 text-xl font-semibold">{count("failed") + count("cancelled")}</p></Card>
      </div>
      {rows.length === 0 ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No payments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Payments appear here when a customer pays an invoice from its share link.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Customer</TableHead>
                <TableHead>Transaction ID</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell>
                    {r.invoice ? <Link to="/invoices/$invoiceId" params={{ invoiceId: r.invoice.id }} className="font-medium underline-offset-4 hover:underline">{r.invoice.invoice_number ?? "Invoice"}</Link> : "—"}
                  </TableCell>
                  <TableCell>{r.invoice?.customer?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.provider_capture_id ?? r.provider_order_id ?? "—"}<span className="ml-2 text-muted-foreground">{r.environment}</span></TableCell>
                  <TableCell className="text-right">{formatMoney(Number(r.amount), r.currency)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={r.status} />
                    {r.failure_reason && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{r.failure_reason}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
