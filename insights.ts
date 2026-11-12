// Deterministic finance snapshot built from real invoice + payment rows.
// Shown on the assistant page and handed to the AI as its only source of facts.
import { effectiveStatus, round2, type StoredStatus } from "@/lib/invoice-math";

export interface SnapshotInvoice {
  invoice_number: string | null;
  status: StoredStatus;
  issue_date: string;
  due_date: string;
  currency: string;
  total: number;
  paid_at: string | null;
  customer_name: string | null;
}

export interface SnapshotPayment {
  invoice_number: string | null;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  transaction_id: string | null;
}

export interface CurrencyTotals {
  currency: string;
  revenue: number;
  outstanding: number;
  overdue: number;
}

export interface OverdueEntry {
  invoice_number: string;
  customer: string;
  amount: number;
  currency: string;
  due_date: string;
  days_overdue: number;
}

export interface FinanceSnapshot {
  today: string;
  counts: { total: number; draft: number; sent: number; overdue: number; paid: number; cancelled: number };
  byCurrency: CurrencyTotals[];
  overdue: OverdueEntry[];
  dueSoon: { invoice_number: string; customer: string; amount: number; currency: string; due_date: string }[];
  topOutstanding: { customer: string; amount: number; currency: string; invoices: number }[];
  payments: { completed: number; pending: number; failed: number; cancelled: number };
  paidLast30Days: { currency: string; amount: number }[];
  recentPayments: SnapshotPayment[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

export function buildFinanceSnapshot(
  invoices: SnapshotInvoice[],
  payments: SnapshotPayment[],
  today: string,
): FinanceSnapshot {
  const counts = { total: invoices.length, draft: 0, sent: 0, overdue: 0, paid: 0, cancelled: 0 };
  const cur = new Map<string, CurrencyTotals>();
  const overdue: OverdueEntry[] = [];
  const dueSoon: FinanceSnapshot["dueSoon"] = [];
  const owed = new Map<string, { customer: string; amount: number; currency: string; invoices: number }>();
  const paid30 = new Map<string, number>();

  for (const inv of invoices) {
    const s = effectiveStatus(inv.status, inv.due_date, today);
    counts[s]++;
    const t = cur.get(inv.currency) ?? { currency: inv.currency, revenue: 0, outstanding: 0, overdue: 0 };
    const amount = Number(inv.total) || 0;
    const customer = inv.customer_name ?? "No customer";
    const number = inv.invoice_number ?? "—";

    if (s === "paid") {
      t.revenue += amount;
      if (inv.paid_at && daysBetween(inv.paid_at.slice(0, 10), today) <= 30) {
        paid30.set(inv.currency, (paid30.get(inv.currency) ?? 0) + amount);
      }
    } else if (s === "overdue" || s === "sent") {
      t.outstanding += amount;
      if (s === "overdue") {
        t.overdue += amount;
        overdue.push({
          invoice_number: number,
          customer,
          amount,
          currency: inv.currency,
          due_date: inv.due_date,
          days_overdue: daysBetween(inv.due_date, today),
        });
      } else if (daysBetween(today, inv.due_date) <= 14) {
        dueSoon.push({ invoice_number: number, customer, amount, currency: inv.currency, due_date: inv.due_date });
      }
      const key = `${customer}|${inv.currency}`;
      const o = owed.get(key) ?? { customer, amount: 0, currency: inv.currency, invoices: 0 };
      o.amount += amount;
      o.invoices++;
      owed.set(key, o);
    }
    cur.set(inv.currency, t);
  }

  const payCounts = { completed: 0, pending: 0, failed: 0, cancelled: 0 };
  for (const p of payments) {
    if (p.status in payCounts) payCounts[p.status as keyof typeof payCounts]++;
  }

  return {
    today,
    counts,
    byCurrency: [...cur.values()].map((t) => ({
      currency: t.currency,
      revenue: round2(t.revenue),
      outstanding: round2(t.outstanding),
      overdue: round2(t.overdue),
    })),
    overdue: overdue.sort((a, b) => b.days_overdue - a.days_overdue),
    dueSoon: dueSoon.sort((a, b) => a.due_date.localeCompare(b.due_date)),
    topOutstanding: [...owed.values()]
      .map((o) => ({ ...o, amount: round2(o.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    payments: payCounts,
    paidLast30Days: [...paid30.entries()].map(([currency, amount]) => ({ currency, amount: round2(amount) })),
    recentPayments: [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
  };
}
