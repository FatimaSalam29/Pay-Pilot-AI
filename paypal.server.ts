// Server-only PayPal access. Calls PayPal's REST API directly with your own app credentials.
// Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (server only). PAYPAL_ENVIRONMENT defaults to "sandbox".

export class PayPalError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`PayPal ${status}: ${body}`);
  }
  /** PayPal error "issue" codes, e.g. INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED. */
  get issues(): string[] {
    try {
      const j = JSON.parse(this.body) as { details?: { issue?: string }[]; name?: string };
      return [...(j.details?.map((d) => d.issue ?? "") ?? []), j.name ?? ""].filter(Boolean);
    } catch {
      return [];
    }
  }
}

export function paypalEnvironment(): "sandbox" | "live" {
  const env = (process.env["PAYPAL_ENVIRONMENT"] ?? "").toLowerCase();
  return env === "live" || env === "production" ? "live" : "sandbox";
}

export function paypalConfigured(): boolean {
  return Boolean(process.env["PAYPAL_CLIENT_ID"] && process.env["PAYPAL_CLIENT_SECRET"]);
}

const baseUrl = () => (paypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const id = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("PayPal is not connected yet");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PayPal token request failed [${res.status}]: ${text}`);
    throw new PayPalError(res.status, text);
  }
  const j = JSON.parse(text) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

export async function paypal<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PayPal request failed [${res.status}] ${path}: ${text}`);
    throw new PayPalError(res.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
