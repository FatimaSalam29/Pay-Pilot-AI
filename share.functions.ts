// Public, read-only access to ONE invoice by its share token.
// Uses the publishable key + a narrow database function that returns customer-safe fields only.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { paypalConfigured } from "@/lib/paypal.server";

export interface SharedInvoice {
  invoice_number: string | null;
  status: "sent" | "paid" | "cancelled";
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  notes: string | null;
  paid_at: string | null;
  business: { name: string; email: string | null; phone: string | null; address: string | null };
  customer: { name: string; company: string | null; email: string | null; address: string | null } | null;
  items: { description: string; quantity: number; unit_price: number }[];
}

export const getSharedInvoice = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ invoice: SharedInvoice | null; paymentsEnabled: boolean }> => {
    if (!z.string().uuid().safeParse(data.token).success) return { invoice: null, paymentsEnabled: false };
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await client.rpc("get_shared_invoice", { _token: data.token });
    if (error) {
      console.error("get_shared_invoice failed", error);
      throw new Error("Could not load invoice");
    }
    if (!row) return { invoice: null, paymentsEnabled: false };
    const inv = row as unknown as SharedInvoice;
    const n = (v: unknown) => Number(v) || 0;
    return {
      invoice: {
        ...inv,
        subtotal: n(inv.subtotal),
        tax_rate: n(inv.tax_rate),
        tax_amount: n(inv.tax_amount),
        discount: n(inv.discount),
        total: n(inv.total),
        items: (inv.items ?? []).map((i) => ({ ...i, quantity: n(i.quantity), unit_price: n(i.unit_price) })),
      },
      paymentsEnabled: paypalConfigured(),
    };
  });
