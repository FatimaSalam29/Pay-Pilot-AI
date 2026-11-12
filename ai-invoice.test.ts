import { describe, expect, it } from "vitest";
import { normalizeAiInvoice } from "./ai-invoice";

const TODAY = "2026-11-09";

describe("AI invoice validation", () => {
  it("accepts the John Doe example as extracted", () => {
    const { value, warnings } = normalizeAiInvoice(
      {
        customer_name: "John Doe",
        customer_email: null,
        customer_company: null,
        items: [{ description: "Website development", quantity: 1, unit_price: 500 }],
        tax_rate: 5,
        discount: 10,
        due_date: "2026-11-23",
        currency: "USD",
        notes: null,
      },
      TODAY,
    );
    expect(warnings).toEqual([]);
    expect(value.customerName).toBe("John Doe");
    expect(value.items).toEqual([{ description: "Website development", quantity: 1, unit_price: 500 }]);
    expect(value.taxRate).toBe(5);
    expect(value.discount).toBe(10);
    expect(value.dueDate).toBe("2026-11-23");
  });

  it("rejects a tax rate above 100%", () => {
    const { value, warnings } = normalizeAiInvoice({ items: [{ description: "x", quantity: 1, unit_price: 10 }], tax_rate: 150 }, TODAY);
    expect(value.taxRate).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("caps a discount larger than the subtotal", () => {
    const { value } = normalizeAiInvoice({ items: [{ description: "x", quantity: 2, unit_price: 10 }], discount: 50 }, TODAY);
    expect(value.discount).toBe(20);
  });

  it("drops a due date in the past", () => {
    const { value } = normalizeAiInvoice({ items: [{ description: "x", quantity: 1, unit_price: 1 }], due_date: "2026-01-01" }, TODAY);
    expect(value.dueDate).toBeNull();
  });

  it("drops an impossible date", () => {
    const { value } = normalizeAiInvoice({ items: [{ description: "x", quantity: 1, unit_price: 1 }], due_date: "2026-02-30" }, TODAY);
    expect(value.dueDate).toBeNull();
  });

  it("rejects currencies PayPal invoices don't support here", () => {
    const { value } = normalizeAiInvoice({ items: [{ description: "x", quantity: 1, unit_price: 1 }], currency: "PKR" }, TODAY);
    expect(value.currency).toBeNull();
  });

  it("sets a missing quantity to 1", () => {
    const { value } = normalizeAiInvoice({ items: [{ description: "Logo", quantity: 0, unit_price: 80 }] }, TODAY);
    expect(value.items[0]!.quantity).toBe(1);
  });

  it("warns when no services were found", () => {
    const { value, warnings } = normalizeAiInvoice({ customer_name: "A", items: [] }, TODAY);
    expect(value.items).toEqual([]);
    expect(warnings.some((w) => w.includes("No services"))).toBe(true);
  });
});
