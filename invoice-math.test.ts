import { describe, expect, it } from "vitest";
import { computeTotals, dashboardStats, effectiveStatus } from "./invoice-math";

describe("computeTotals", () => {
  it("multiplies quantity by price for each line", () => {
    const t = computeTotals(
      [
        { quantity: 3, unitPrice: 120 },
        { quantity: 1.5, unitPrice: 80 },
      ],
      0,
      0,
    );
    expect(t.subtotal).toBe(480);
    expect(t.total).toBe(480);
  });

  it("applies tax after the discount", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 1000 }], 10, 100);
    expect(t.discount).toBe(100);
    expect(t.taxAmount).toBe(90);
    expect(t.total).toBe(990);
  });

  it("never lets the discount exceed the subtotal", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 50 }], 0, 80);
    expect(t.discount).toBe(50);
    expect(t.total).toBe(0);
  });
});

describe("effectiveStatus", () => {
  it("marks an unpaid invoice past its due date as overdue", () => {
    expect(effectiveStatus("sent", "2026-01-01", "2026-01-02")).toBe("overdue");
  });

  it("is not overdue on the due date itself", () => {
    expect(effectiveStatus("sent", "2026-01-02", "2026-01-02")).toBe("sent");
  });

  it("keeps a paid invoice paid even after the due date", () => {
    expect(effectiveStatus("paid", "2026-01-01", "2026-03-01")).toBe("paid");
  });
});

describe("dashboardStats", () => {
  it("counts only paid invoices as revenue, and never mixes currencies", () => {
    const s = dashboardStats(
      [
        { status: "paid", due_date: "2026-01-01", total: 500, currency: "USD" },
        { status: "paid", due_date: "2026-01-01", total: 900, currency: "EUR" },
        { status: "sent", due_date: "2026-12-01", total: 200, currency: "USD" },
        { status: "sent", due_date: "2026-01-01", total: 300, currency: "USD" },
        { status: "cancelled", due_date: "2026-01-01", total: 999, currency: "USD" },
      ],
      "USD",
      "2026-06-01",
    );
    expect(s.revenue).toBe(500);
    expect(s.paidCount).toBe(2);
    expect(s.pendingCount).toBe(1);
    expect(s.pendingAmount).toBe(200);
    expect(s.overdueCount).toBe(1);
    expect(s.overdueAmount).toBe(300);
  });
});
