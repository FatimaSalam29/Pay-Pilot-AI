import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import { ArrowUpRight, CheckCircle2, Clock3, AlertTriangle, FilePlus2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { invoicesQuery, profileQuery } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { dashboardStats, effectiveStatus, todayISO } from "@/lib/invoice-math";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — PayPilot AI" },
      { name: "description", content: "Revenue, paid, pending and overdue invoices at a glance." },
      { property: "og:title", content: "Dashboard — PayPilot AI" },
      { property: "og:description", content: "Revenue, paid, pending and overdue invoices at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(invoicesQuery()),
      context.queryClient.ensureQueryData(profileQuery()),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: profile } = useSuspenseQuery(profileQuery());
  const currency = profile?.currency ?? "USD";
  const today = todayISO();

  const stats = useMemo(() => dashboardStats(invoices, currency, today), [invoices, currency, today]);
  const otherCurrencies = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.currency).filter((c) => c !== currency))),
    [invoices, currency],
  );

  const chart = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
    return months.map((m) => {
      const key = format(m, "yyyy-MM");
      const sameCurrency = invoices.filter((i) => i.currency === currency);
      const invoiced = sameCurrency
        .filter((i) => i.status !== "cancelled" && i.issue_date.startsWith(key))
        .reduce((s, i) => s + Number(i.total), 0);
      const collected = sameCurrency
        .filter((i) => i.status === "paid" && i.paid_at && i.paid_at.startsWith(key))
        .reduce((s, i) => s + Number(i.total), 0);
      return { month: format(m, "MMM"), invoiced, collected };
    });
  }, [invoices, currency]);

  const totalOpen = stats.revenue + stats.pendingAmount + stats.overdueAmount;
  const pct = (n: number) => (totalOpen > 0 ? (n / totalOpen) * 100 : 0);

  const upcoming = invoices
    .filter((i) => {
      const s = effectiveStatus(i.status, i.due_date, today);
      return s === "sent" || s === "draft" || s === "overdue";
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  const greeting = profile?.business_name || profile?.full_name;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={format(new Date(), "EEEE, MMMM d")}
        title={greeting ? `Good to see you, ${greeting}` : "Your money, at a glance"}
        description="Track what you've earned, what's on the way, and what needs a nudge."
        actions={
          <Button asChild variant="hero">
            <Link to="/invoices/new">
              <FilePlus2 /> New invoice
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl bg-revenue p-6 text-sidebar-foreground shadow-elevated sm:col-span-2 xl:col-span-1">
          <div className="grid-lines absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-sidebar-muted">Total revenue</p>
              <span className="flex size-8 items-center justify-center rounded-full bg-signal text-signal-foreground">
                <TrendingUp className="size-4" />
              </span>
            </div>
            <p className="font-figure mt-4 text-3xl font-semibold">{formatMoney(stats.revenue, currency)}</p>
            <p className="mt-2 text-xs text-sidebar-muted">From verified payments · {currency}</p>
          </div>
        </div>
        <StatCard
          label="Paid invoices"
          value={String(stats.paidCount)}
          hint="Settled in full"
          icon={<CheckCircle2 className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Pending invoices"
          value={String(stats.pendingCount)}
          hint={`${formatMoney(stats.pendingAmount, currency)} awaiting payment`}
          icon={<Clock3 className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Overdue invoices"
          value={String(stats.overdueCount)}
          hint={`${formatMoney(stats.overdueAmount, currency)} past due`}
          icon={<AlertTriangle className="size-4" />}
          tone="danger"
        />
      </section>

      {otherCurrencies.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Amounts show {currency} only. You also have invoices in {otherCurrencies.join(", ")}.
        </p>
      )}

      <section className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Cash flow</h2>
              <p className="text-sm text-muted-foreground">Invoiced vs. collected, last 6 months</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-chart-1" /> Invoiced
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-chart-2" /> Collected
              </span>
            </div>
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fillInvoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  tickFormatter={(v) => formatMoney(v, currency, { compact: true })}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [formatMoney(v, currency), name === "invoiced" ? "Invoiced" : "Collected"]}
                />
                <Area type="monotone" dataKey="invoiced" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#fillInvoiced)" />
                <Area type="monotone" dataKey="collected" stroke="var(--color-chart-2)" strokeWidth={2.5} fill="url(#fillCollected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Collection health</h2>
          <p className="text-sm text-muted-foreground">Where your billed money sits</p>
          <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${pct(stats.revenue)}%` }} />
            <div className="bg-warning" style={{ width: `${pct(stats.pendingAmount)}%` }} />
            <div className="bg-danger" style={{ width: `${pct(stats.overdueAmount)}%` }} />
          </div>
          <dl className="mt-6 space-y-4 text-sm">
            <HealthRow color="bg-success" label="Collected" value={formatMoney(stats.revenue, currency)} pct={pct(stats.revenue)} />
            <HealthRow color="bg-warning" label="Pending" value={formatMoney(stats.pendingAmount, currency)} pct={pct(stats.pendingAmount)} />
            <HealthRow color="bg-danger" label="Overdue" value={formatMoney(stats.overdueAmount, currency)} pct={pct(stats.overdueAmount)} />
          </dl>
          <div className="mt-6 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            Invoices turn <span className="font-semibold text-success">Paid</span> only after a real payment is
            captured — never manually.
          </div>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-base font-semibold">Recent invoices</h2>
            <Link to="/invoices" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {invoices.length === 0 ? (
            <EmptyInvoices />
          ) : (
            <ul className="divide-y">
              {invoices.slice(0, 6).map((inv) => (
                <li key={inv.id}>
                  <Link
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inv.customer?.name ?? "No customer"}</p>
                      <p className="font-figure text-xs text-muted-foreground">
                        {inv.invoice_number} · due {formatDate(inv.due_date, "MMM d")}
                      </p>
                    </div>
                    <StatusBadge status={effectiveStatus(inv.status, inv.due_date, today)} />
                    <p className="font-figure w-28 text-right text-sm font-semibold">
                      {formatMoney(Number(inv.total), inv.currency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Coming due</h2>
          <p className="text-sm text-muted-foreground">Unpaid invoices by due date</p>
          {upcoming.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">Nothing outstanding. Nice.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {upcoming.map((inv) => {
                const s = effectiveStatus(inv.status, inv.due_date, today);
                return (
                  <li key={inv.id}>
                    <Link
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex w-11 flex-col items-center rounded-lg bg-muted py-1">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {formatDate(inv.due_date, "MMM")}
                        </span>
                        <span className="font-figure text-base font-semibold">{formatDate(inv.due_date, "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{inv.customer?.name ?? "No customer"}</p>
                        <p className={s === "overdue" ? "text-xs font-medium text-danger" : "text-xs text-muted-foreground"}>
                          {s === "overdue" ? "Overdue" : inv.invoice_number}
                        </p>
                      </div>
                      <p className="font-figure text-sm font-semibold">{formatMoney(Number(inv.total), inv.currency)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "success" | "warning" | "danger";
}) {
  const toneClass = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-full ${toneClass}`}>{icon}</span>
      </div>
      <p className="font-figure mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function HealthRow({ color, label, value, pct }: { color: string; label: string; value: string; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-2.5 rounded-full ${color}`} />
      <dt className="flex-1 text-muted-foreground">{label}</dt>
      <dd className="font-figure font-medium">{value}</dd>
      <dd className="font-figure w-12 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</dd>
    </div>
  );
}

function EmptyInvoices() {
  return (
    <div className="px-6 pb-10 pt-4 text-center">
      <p className="text-sm text-muted-foreground">No invoices yet. Your first one takes about a minute.</p>
      <Button asChild variant="signal" className="mt-4">
        <Link to="/invoices/new">
          <FilePlus2 /> Create your first invoice
        </Link>
      </Button>
    </div>
  );
}
