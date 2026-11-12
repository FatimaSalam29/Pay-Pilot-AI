// Pure checks applied to PayPal responses before an invoice may become paid.
// Nothing here talks to PayPal; the server functions pass real API responses in.

export interface ExpectedPayment {
  invoiceId: string;
  total: number;
  currency: string;
}

interface Money {
  currency_code?: string;
  value?: string;
}

interface PayPalCapture {
  id?: string;
  status?: string;
  amount?: Money;
  status_details?: { reason?: string };
}

interface PayPalPurchaseUnit {
  custom_id?: string;
  reference_id?: string;
  amount?: Money;
  payments?: { captures?: PayPalCapture[] };
}

export interface PayPalOrderLike {
  id?: string;
  status?: string;
  purchase_units?: PayPalPurchaseUnit[];
  payer?: { email_address?: string };
}

/** PayPal amounts are decimal strings; compare in cents so 500 and "500.00" match. */
export function amountMatches(money: Money | undefined, expected: ExpectedPayment): boolean {
  if (!money?.value || !money.currency_code) return false;
  const cents = Math.round(Number(money.value) * 100);
  return (
    Number.isFinite(cents) &&
    cents === Math.round(expected.total * 100) &&
    money.currency_code.toUpperCase() === expected.currency.toUpperCase()
  );
}

/** Before capturing: the order must be approved, for this invoice, for exactly the invoice amount. */
export function checkOrderBeforeCapture(
  order: PayPalOrderLike,
  expected: ExpectedPayment,
): { ok: true } | { ok: false; reason: string } {
  const unit = order.purchase_units?.[0];
  if (!unit) return { ok: false, reason: "PayPal order has no purchase details" };
  if (unit.custom_id !== expected.invoiceId) return { ok: false, reason: "PayPal order belongs to a different invoice" };
  if (!amountMatches(unit.amount, expected))
    return { ok: false, reason: "The invoice amount changed after checkout started. Please refresh and pay again." };
  if (order.status !== "APPROVED" && order.status !== "COMPLETED")
    return { ok: false, reason: `Payment was not approved by the payer (status ${order.status ?? "unknown"})` };
  return { ok: true };
}

export type CaptureOutcome =
  | { outcome: "completed"; captureId: string; payerEmail: string | null }
  | { outcome: "pending"; captureId: string | null; payerEmail: string | null; reason: string }
  | { outcome: "failed"; captureId: string | null; payerEmail: string | null; reason: string };

/**
 * Only a COMPLETED order whose COMPLETED capture is for this invoice and exactly
 * the invoice amount counts as paid. Anything else is pending or failed.
 */
export function evaluateCapture(order: PayPalOrderLike, expected: ExpectedPayment): CaptureOutcome {
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const payerEmail = order.payer?.email_address ?? null;
  const captureId = capture?.id ?? null;

  if (!unit || !capture) return { outcome: "failed", captureId, payerEmail, reason: "PayPal returned no capture" };
  if (unit.custom_id !== expected.invoiceId)
    return { outcome: "failed", captureId, payerEmail, reason: "Capture belongs to a different invoice" };
  if (!amountMatches(capture.amount, expected))
    return { outcome: "failed", captureId, payerEmail, reason: "Captured amount does not match the invoice" };

  if (capture.status === "COMPLETED" && order.status === "COMPLETED" && captureId) {
    return { outcome: "completed", captureId, payerEmail };
  }
  if (capture.status === "PENDING") {
    return {
      outcome: "pending",
      captureId,
      payerEmail,
      reason: `PayPal is holding this payment (${capture.status_details?.reason ?? "pending review"})`,
    };
  }
  return {
    outcome: "failed",
    captureId,
    payerEmail,
    reason: `Payment ${String(capture.status ?? "failed").toLowerCase()}`,
  };
}
