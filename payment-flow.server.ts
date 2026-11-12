// PayPal checkout flow for a shared invoice. Server-only.
// The share token identifies the invoice; amounts always come from the database, never the browser.
// An invoice turns paid only after PayPal confirms a COMPLETED capture of the exact amount.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { paypal, PayPalError, paypalEnvironment } from "@/lib/paypal.server";
import { checkOrderBeforeCapture, evaluateCapture, type PayPalOrderLike } from "@/lib/paypal-verify";

interface PayableInvoice {
  id: string;
  user_id: string;
  invoice_number: string | null;
  status: string;
  total: number;
  currency: string;
}

async function loadInvoice(token: string): Promise<PayableInvoice> {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, user_id, invoice_number, status, total, currency")
    .eq("share_token", token)
    .neq("status", "draft")
    .maybeSingle();
  if (error) throw new Error("Could not load invoice");
  if (!data) throw new Error("This invoice link is invalid or has been reset by the sender");
  return { ...data, total: Number(data.total) };
}

function expected(inv: PayableInvoice) {
  return { invoiceId: inv.id, total: inv.total, currency: inv.currency };
}

export type PaymentResult =
  | { status: "completed"; transactionId: string }
  | { status: "already_paid" }
  | { status: "pending"; message: string }
  | { status: "failed"; message: string; retryable: boolean }
  | { status: "cancelled" };

export async function createOrderForToken(token: string): Promise<{ orderId: string }> {
  const inv = await loadInvoice(token);
  if (inv.status === "paid") throw new Error("This invoice has already been paid");
  if (inv.status === "cancelled") throw new Error("This invoice was cancelled by the sender");
  if (!(inv.total > 0)) throw new Error("This invoice has nothing to pay");

  const order = await paypal<{ id: string; status: string }>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": crypto.randomUUID() },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: inv.id,
          custom_id: inv.id,
          description: `Invoice ${inv.invoice_number ?? ""}`.trim().slice(0, 127),
          amount: { currency_code: inv.currency, value: inv.total.toFixed(2) },
        },
      ],
      application_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
    }),
  });

  const { error } = await supabaseAdmin.from("payments").insert({
    user_id: inv.user_id,
    invoice_id: inv.id,
    provider: "paypal",
    environment: paypalEnvironment(),
    provider_order_id: order.id,
    amount: inv.total,
    currency: inv.currency,
    status: "pending",
  });
  if (error) {
    console.error("Failed to record pending payment", error);
    throw new Error("Could not start checkout");
  }
  return { orderId: order.id };
}

async function loadPayment(invoiceId: string, orderId: string) {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq("invoice_id", invoiceId)
    .eq("provider_order_id", orderId)
    .maybeSingle();
  return data;
}

async function markFailed(paymentId: string, reason: string, raw?: unknown) {
  await supabaseAdmin
    .from("payments")
    .update({ status: "failed", failure_reason: reason.slice(0, 500), ...(raw ? { raw: raw as never } : {}) })
    .eq("id", paymentId)
    .neq("status", "completed");
}

export async function captureOrderForToken(token: string, orderId: string): Promise<PaymentResult> {
  const inv = await loadInvoice(token);
  const payment = await loadPayment(inv.id, orderId);
  if (!payment) return { status: "failed", message: "This checkout doesn't belong to this invoice", retryable: false };
  if (payment.status === "completed") return { status: "completed", transactionId: orderId };
  if (inv.status === "paid") return { status: "already_paid" };
  if (inv.status === "cancelled") {
    await markFailed(payment.id, "Invoice was cancelled before capture");
    return { status: "failed", message: "This invoice was cancelled by the sender", retryable: false };
  }

  // 1. Verify the approved order before moving any money.
  const before = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  const pre = checkOrderBeforeCapture(before, expected(inv));
  if (!pre.ok) {
    await markFailed(payment.id, pre.reason, before);
    return { status: "failed", message: pre.reason, retryable: true };
  }

  // 2. Capture (idempotent per order), or reuse an existing capture.
  let order: PayPalOrderLike = before;
  if (before.status !== "COMPLETED") {
    try {
      order = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { "PayPal-Request-Id": `capture-${orderId}` },
      });
    } catch (e) {
      if (e instanceof PayPalError && e.issues.includes("ORDER_ALREADY_CAPTURED")) {
        order = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
      } else if (e instanceof PayPalError && e.issues.includes("INSTRUMENT_DECLINED")) {
        await markFailed(payment.id, "Card or funding source was declined", { body: e.body });
        return { status: "failed", message: "Your payment method was declined. Please try another one.", retryable: true };
      } else if (e instanceof PayPalError && e.status >= 400 && e.status < 500) {
        // A definite rejection from PayPal: nothing was captured.
        const reason = `PayPal rejected the capture (${e.issues[0] ?? e.status})`;
        await markFailed(payment.id, reason, { body: e.body });
        return { status: "failed", message: "PayPal could not complete the payment. No money was taken.", retryable: true };
      } else {
        // Network error or PayPal 5xx: the capture MAY have happened. Ask PayPal what it knows
        // instead of guessing; never claim success or failure without its answer.
        try {
          order = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
        } catch {
          return {
            status: "pending",
            message: "We couldn't confirm the payment with PayPal yet. Please check again in a minute before paying a second time.",
          };
        }
        if (order.status !== "COMPLETED") {
          return {
            status: "pending",
            message: "PayPal hasn't confirmed this payment yet. Please check again in a minute before paying a second time.",
          };
        }
      }
    }
  }

  // 3. Verify the capture itself.
  const result = evaluateCapture(order, expected(inv));
  if (result.outcome === "failed") {
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed", failure_reason: result.reason, provider_capture_id: result.captureId, payer_email: result.payerEmail, raw: order as never })
      .eq("id", payment.id);
    return { status: "failed", message: result.reason, retryable: false };
  }
  if (result.outcome === "pending") {
    await supabaseAdmin
      .from("payments")
      .update({ status: "pending", failure_reason: result.reason, provider_capture_id: result.captureId, payer_email: result.payerEmail, raw: order as never })
      .eq("id", payment.id);
    return { status: "pending", message: result.reason };
  }

  // 4. Verified: record the payment and mark the invoice paid (trusted server role only).
  const { error: payErr } = await supabaseAdmin
    .from("payments")
    .update({
      status: "completed",
      failure_reason: null,
      provider_capture_id: result.captureId,
      payer_email: result.payerEmail,
      raw: order as never,
    })
    .eq("id", payment.id);
  if (payErr) console.error("Failed to record completed payment", payErr);

  const { error: invErr } = await supabaseAdmin
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", inv.id)
    .neq("status", "paid");
  if (invErr) console.error("Failed to mark invoice paid after verified capture", invErr);

  return { status: "completed", transactionId: result.captureId };
}

/** Payer closed the PayPal window. Recorded as cancelled only if PayPal confirms nothing was captured. */
export async function cancelOrderForToken(token: string, orderId: string): Promise<PaymentResult> {
  const inv = await loadInvoice(token);
  const payment = await loadPayment(inv.id, orderId);
  if (!payment || payment.status !== "pending") return { status: "cancelled" };
  const order = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (order.status === "COMPLETED") return captureOrderForToken(token, orderId);
  await supabaseAdmin
    .from("payments")
    .update({ status: "cancelled", failure_reason: "Payer cancelled at PayPal", raw: order as never })
    .eq("id", payment.id)
    .eq("status", "pending");
  return { status: "cancelled" };
}

/** Called when the PayPal button reports an error before capture (e.g. popup failure). */
export async function failOrderForToken(token: string, orderId: string, reason: string): Promise<void> {
  const inv = await loadInvoice(token);
  const payment = await loadPayment(inv.id, orderId);
  if (!payment || payment.status !== "pending") return;
  const order = await paypal<PayPalOrderLike>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (order.status === "COMPLETED") {
    await captureOrderForToken(token, orderId);
    return;
  }
  await markFailed(payment.id, `Checkout error: ${reason}`, order);
}
