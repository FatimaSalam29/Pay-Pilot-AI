// Pure invoice money + status rules. Kept free of UI/DB code so they can be unit tested.

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export type StoredStatus = "draft" | "sent" | "paid" | "cancelled";
export type EffectiveStatus = StoredStatus | "overdue";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineAmount(quantity: number, unitPrice: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return round2(q * p);
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
}

/**
 * Discount is a flat amount taken off the subtotal (never below zero);
 * tax is applied to the discounted amount.
 */
export function computeTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
  discount: number,
): Totals {
  const subtotal = round2(items.reduce((sum, i) => sum + lineAmount(i.quantity, i.unitPrice), 0));
  const safeDiscount = round2(Math.min(Math.max(discount || 0, 0), subtotal));
  const taxable = subtotal - safeDiscount;
  const rate = Math.max(taxRate || 0, 0);
  const taxAmount = round2((taxable * rate) / 100);
  return { subtotal, discount: safeDiscount, taxAmount, total: round2(taxable + taxAmount) };
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Paid and cancelled are final. Any other unpaid invoice past its due date is overdue.
 * "paid" is only ever returned when the stored status is paid (set by a verified payment).
 */
export function effectiveStatus(status: StoredStatus, dueDate: string, today: string): EffectiveStatus {
  if (status === "paid" || status === "cancelled") return status;
  if (dueDate < today) return "overdue";
  return status;
}

export interface InvoiceLike {
  status: StoredStatus;
  due_date: string;
  total: number;
  currency: string;
}

export interface DashboardStats {
  revenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

/** Sums only invoices in the given currency so different currencies are never added together. */
export function dashboardStats(invoices: InvoiceLike[], currency: string, today: string): DashboardStats {
  const stats: DashboardStats = {
    revenue: 0,
    paidCount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
  };
  for (const inv of invoices) {
    const s = effectiveStatus(inv.status, inv.due_date, today);
    const sameCurrency = inv.currency === currency;
    const amount = Number(inv.total) || 0;
    if (s === "paid") {
      stats.paidCount++;
      if (sameCurrency) stats.revenue += amount;
    } else if (s === "overdue") {
      stats.overdueCount++;
      if (sameCurrency) stats.overdueAmount += amount;
    } else if (s === "draft" || s === "sent") {
      stats.pendingCount++;
      if (sameCurrency) stats.pendingAmount += amount;
    }
  }
  stats.revenue = round2(stats.revenue);
  stats.pendingAmount = round2(stats.pendingAmount);
  stats.overdueAmount = round2(stats.overdueAmount);
  return stats;
}
