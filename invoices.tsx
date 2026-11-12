import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FilePlus2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { invoicesQuery } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { effectiveStatus, todayISO, type EffectiveStatus } from "@/lib/invoice-math";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — PayPilot AI" },
      { name: "description", content: "All your invoices with status, due dates and totals." },
      { property: "og:title", content: "Invoices — PayPilot AI" },
      { property: "og:description", content: "All your invoices with status, due dates and totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQuery()),
  component: InvoicesPage,
});

const FILTERS: { key: "all" | "pending" | EffectiveStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

function InvoicesPage() {
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const today = todayISO();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices
      .map((inv) => ({ inv, status: effectiveStatus(inv.status, inv.due_date, today) }))
      .filter(({ status }) =>
        filter === "all" ? true : filter === "pending" ? status === "sent" : status === filter,
      )
      .filter(({ inv }) =>
        !term
          ? true
          : [inv.invoice_number, inv.customer?.name, inv.customer?.company, inv.customer?.email]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(term)),
      );
  }, [invoices, filter, q, today]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      const s = effectiveStatus(inv.status, inv.due_date, today);
      const k = s === "sent" ? "pending" : s;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [invoices, today]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Every invoice you've created, with live status."
        actions={
          <Button asChild variant="hero">
            <Link to="/invoices/new">
              <FilePlus2 /> New invoice
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="font-figure ml-1.5 text-xs opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or number" className="pl-9" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {invoices.length === 0 ? "You haven't created any invoices yet." : "No invoices match this view."}
            </p>
            {invoices.length === 0 && (
              <Button asChild variant="signal" className="mt-4">
                <Link to="/invoices/new">
                  <FilePlus2 /> Create invoice
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-semibold">Invoice</th>
                  <th className="px-6 py-3 font-semibold">Customer</th>
                  <th className="px-6 py-3 font-semibold">Issued</th>
                  <th className="px-6 py-3 font-semibold">Due</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ inv, status }) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate({ to: "/invoices/$invoiceId", params: { invoiceId: inv.id } })}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="font-figure px-6 py-4 font-medium">
                      <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }} onClick={(e) => e.stopPropagation()}>
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{inv.customer?.name ?? "—"}</p>
                      {inv.customer?.company && <p className="text-xs text-muted-foreground">{inv.customer.company}</p>}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issue_date)}</td>
                    <td className={cn("px-6 py-4", status === "overdue" ? "font-medium text-danger" : "text-muted-foreground")}>
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={status} />
                    </td>
                    <td className="font-figure px-6 py-4 text-right font-semibold">
                      {formatMoney(Number(inv.total), inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
