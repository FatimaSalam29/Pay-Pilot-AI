import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capturePayPalOrder, cancelPayPalOrder, createPayPalOrder, reportPayPalError } from "@/lib/paypal.functions";
import type { PaymentResult } from "@/lib/payment-flow.server";

interface PayPalButtonsInstance {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
}
interface PayPalNamespace {
  Buttons: (opts: Record<string, unknown>) => PayPalButtonsInstance;
}
declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;
let sdkCurrency = "";

function loadSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  if (sdkPromise && sdkCurrency === currency) return sdkPromise;
  sdkCurrency = currency;
  document.querySelectorAll("script[data-paypal-sdk]").forEach((s) => s.remove());
  delete window.paypal;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    s.async = true;
    s.dataset.paypalSdk = "true";
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal failed to load")));
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal failed to load"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

type UiState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "done"; result: PaymentResult; orderId?: string };

export function PayPalCheckout({
  token,
  currency,
  onPaid,
}: {
  token: string;
  currency: string;
  onPaid: () => void;
}) {
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
  const create = useServerFn(createPayPalOrder);
  const capture = useServerFn(capturePayPalOrder);
  const cancel = useServerFn(cancelPayPalOrder);
  const report = useServerFn(reportPayPalError);
  const ref = useRef<HTMLDivElement>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [ui, setUi] = useState<UiState>({ kind: "idle" });
  const lastOrder = useRef<string | null>(null);

  function finish(result: PaymentResult | undefined, orderId?: string) {
    if (!result) return;
    setUi({ kind: "done", result, orderId });
    if (result.status === "completed" || result.status === "already_paid") onPaid();
  }

  useEffect(() => {
    if (!clientId || ui.kind !== "idle") return;
    let buttons: PayPalButtonsInstance | null = null;
    let alive = true;
    loadSdk(clientId, currency)
      .then((pp) => {
        if (!alive || !ref.current) return;
        ref.current.innerHTML = "";
        buttons = pp.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay", height: 44 },
          createOrder: async () => {
            const res = await create({ data: { token } });
            if (!res) throw new Error("Could not start checkout");
            lastOrder.current = res.orderId;
            return res.orderId;
          },
          onApprove: async ({ orderID }: { orderID: string }) => {
            setUi({ kind: "processing" });
            try {
              finish(await capture({ data: { token, orderId: orderID } }), orderID);
            } catch (e) {
              finish({ status: "pending", message: e instanceof Error ? e.message : "We couldn't confirm the payment yet." }, orderID);
            }
          },
          onCancel: async ({ orderID }: { orderID: string }) => {
            try {
              finish(await cancel({ data: { token, orderId: orderID } }), orderID);
            } catch {
              finish({ status: "cancelled" }, orderID);
            }
          },
          onError: async (err: unknown) => {
            const reason = err instanceof Error ? err.message : "PayPal checkout error";
            const orderId = lastOrder.current;
            if (orderId) {
              try { await report({ data: { token, orderId, reason: reason.slice(0, 280) } }); } catch { /* logged server-side */ }
            }
            finish({ status: "failed", message: reason.startsWith("PayPal is unavailable") || reason.includes("No money") ? reason : "PayPal checkout couldn't finish. No money was taken.", retryable: true }, orderId ?? undefined);
          },
        });
        return buttons.render(ref.current).then(() => alive && setSdkReady(true));
      })
      .catch((e: unknown) => alive && setSdkError(e instanceof Error ? e.message : "PayPal failed to load"));
    return () => {
      alive = false;
      buttons?.close?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currency, token, ui.kind]);

  if (!clientId) {
    return <Notice tone="muted" title="Online payment isn't available yet" body="The sender hasn't finished connecting PayPal. Please contact them to arrange payment." />;
  }

  if (ui.kind === "processing") {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
        <Loader2 className="size-5 animate-spin text-primary" />
        Confirming your payment with PayPal — please don't close this page.
      </div>
    );
  }

  if (ui.kind === "done") {
    const r = ui.result;
    if (r.status === "completed" || r.status === "already_paid") {
      return (
        <div className="rounded-xl bg-success-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-success" /> Payment confirmed by PayPal
          </p>
          {r.status === "completed" && <p className="font-figure mt-1 text-xs text-muted-foreground">Transaction {r.transactionId}</p>}
        </div>
      );
    }
    if (r.status === "pending") {
      return (
        <div className="space-y-3">
          <Notice tone="warning" title="Payment not confirmed yet" body={r.message} />
          {ui.orderId && (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                setUi({ kind: "processing" });
                try {
                  finish(await capture({ data: { token, orderId: ui.orderId! } }), ui.orderId);
                } catch (e) {
                  finish({ status: "pending", message: e instanceof Error ? e.message : r.message }, ui.orderId);
                }
              }}
            >
              <RefreshCw /> Check payment status
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Notice
          tone={r.status === "cancelled" ? "muted" : "warning"}
          title={r.status === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}
          body={r.status === "cancelled" ? "You closed PayPal before paying. Nothing was charged." : r.message}
        />
        {(r.status === "cancelled" || r.retryable) && (
          <Button variant="outline" className="w-full" onClick={() => { setSdkReady(false); setUi({ kind: "idle" }); }}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {sdkError ? (
        <Notice tone="warning" title="PayPal couldn't load" body="Check your connection or disable ad blockers for this page, then refresh." />
      ) : (
        <>
          {!sdkReady && (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading PayPal…
            </div>
          )}
          <div ref={ref} className="min-h-0" />
        </>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" /> Paid securely through PayPal. We never see your card details.
      </p>
    </div>
  );
}

function Notice({ tone, title, body }: { tone: "muted" | "warning"; title: string; body: string }) {
  return (
    <div className={tone === "warning" ? "rounded-xl bg-warning-soft p-4 text-sm" : "rounded-xl bg-muted p-4 text-sm"}>
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className={tone === "warning" ? "size-4 text-warning" : "size-4 text-muted-foreground"} /> {title}
      </p>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}
