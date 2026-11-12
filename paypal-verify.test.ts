import { describe, expect, it } from "vitest";
import { amountMatches, checkOrderBeforeCapture, evaluateCapture } from "./paypal-verify";

const expected = { invoiceId: "inv-1", total: 522, currency: "USD" };

function capturedOrder(over: { orderStatus?: string; captureStatus?: string; value?: string; custom?: string } = {}) {
  return {
    id: "ORDER1",
    status: over.orderStatus ?? "COMPLETED",
    payer: { email_address: "buyer@example.com" },
    purchase_units: [
      {
        custom_id: over.custom ?? "inv-1",
        amount: { currency_code: "USD", value: "522.00" },
        payments: {
          captures: [
            { id: "CAP1", status: over.captureStatus ?? "COMPLETED", amount: { currency_code: "USD", value: over.value ?? "522.00" } },
          ],
        },
      },
    ],
  };
}

describe("PayPal payment verification", () => {
  it("matches amounts in cents regardless of formatting", () => {
    expect(amountMatches({ currency_code: "USD", value: "522.00" }, expected)).toBe(true);
    expect(amountMatches({ currency_code: "USD", value: "521.99" }, expected)).toBe(false);
    expect(amountMatches({ currency_code: "EUR", value: "522.00" }, expected)).toBe(false);
  });

  it("marks paid only for a completed capture of the exact invoice amount", () => {
    const r = evaluateCapture(capturedOrder(), expected);
    expect(r).toEqual({ outcome: "completed", captureId: "CAP1", payerEmail: "buyer@example.com" });
  });

  it("never treats an underpaid capture as paid", () => {
    expect(evaluateCapture(capturedOrder({ value: "1.00" }), expected).outcome).toBe("failed");
  });

  it("never treats a capture for another invoice as paid", () => {
    expect(evaluateCapture(capturedOrder({ custom: "inv-2" }), expected).outcome).toBe("failed");
  });

  it("keeps a held (pending) capture unpaid", () => {
    expect(evaluateCapture(capturedOrder({ captureStatus: "PENDING", orderStatus: "COMPLETED" }), expected).outcome).toBe("pending");
  });

  it("treats a declined capture as failed", () => {
    expect(evaluateCapture(capturedOrder({ captureStatus: "DECLINED" }), expected).outcome).toBe("failed");
  });

  it("refuses to capture an order that the payer has not approved", () => {
    const r = checkOrderBeforeCapture({ ...capturedOrder(), status: "CREATED" }, expected);
    expect(r.ok).toBe(false);
  });

  it("refuses to capture when the invoice total changed after checkout started", () => {
    const r = checkOrderBeforeCapture({ ...capturedOrder(), status: "APPROVED" }, { ...expected, total: 600 });
    expect(r.ok).toBe(false);
  });
});
