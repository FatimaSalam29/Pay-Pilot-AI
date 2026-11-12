// Signed-in AI features. Both run as the user (RLS), so the AI only ever sees that user's records.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runModel } from "@/lib/ai.server";
import { AI_INVOICE_JSON_SCHEMA, normalizeAiInvoice } from "@/lib/ai-invoice";
import { buildFinanceSnapshot } from "@/lib/insights";
import { effectiveStatus, type StoredStatus } from "@/lib/invoice-math";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const parseInvoiceText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ text: z.string().trim().min(5, "Describe the invoice in a sentence or two").max(2000), today: isoDate, defaultCurrency: z.string().max(3) }).parse(d),
  )
  .handler(async ({ data }) => {
    const raw = await runModel({
      instructions: [
        "You extract invoice data from a freelancer's plain-language request.",
        `Today is ${data.today}. Resolve relative dates ("in two weeks", "end of month") against today and output YYYY-MM-DD.`,
        `If no currency is mentioned, use ${data.defaultCurrency}. "$" means USD unless another dollar is named.`,
        "A worth/price stated for a service is the unit price; quantity defaults to 1. Hours × rate means quantity = hours, unit_price = rate.",
        "Tax is a percentage. Discount is a flat amount in the invoice currency; if a percentage discount is given, convert it to an amount using the subtotal.",
        "Never invent values that were not stated: use null for unknown fields and an empty items list if no services are given.",
      ].join("\n"),
      input: data.text,
      json: { name: "invoice_draft", schema: AI_INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> },
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The AI response couldn't be read. Please rephrase and try again.");
    }
    return normalizeAiInvoice(parsed, data.today);
  });

const messageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ messages: z.array(messageSchema).min(1).max(20), today: isoDate }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [invRes, payRes, profRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("invoice_number, status, issue_date, due_date, currency, total, paid_at, customer:customers(name, company)")
        .order("issue_date", { ascending: false })
        .limit(300),
      supabase
        .from("payments")
        .select("status, amount, currency, created_at, provider_capture_id, provider_order_id, failure_reason, invoice:invoices(invoice_number)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("business_name, full_name, currency").maybeSingle(),
    ]);
    if (invRes.error || payRes.error) throw new Error("Couldn't load your records");

    type InvRow = { invoice_number: string | null; status: string; issue_date: string; due_date: string; currency: string; total: number; paid_at: string | null; customer: { name: string; company: string | null } | null };
    type PayRow = { status: string; amount: number; currency: string; created_at: string; provider_capture_id: string | null; provider_order_id: string | null; failure_reason: string | null; invoice: { invoice_number: string | null } | null };
    const invoices = (invRes.data ?? []) as unknown as InvRow[];
    const payments = (payRes.data ?? []) as unknown as PayRow[];

    const snapshot = buildFinanceSnapshot(
      invoices.map((i) => ({
        invoice_number: i.invoice_number,
        status: i.status as StoredStatus,
        issue_date: i.issue_date,
        due_date: i.due_date,
        currency: i.currency,
        total: Number(i.total),
        paid_at: i.paid_at,
        customer_name: i.customer?.name ?? null,
      })),
      payments.map((p) => ({
        invoice_number: p.invoice?.invoice_number ?? null,
        status: p.status,
        amount: Number(p.amount),
        currency: p.currency,
        created_at: p.created_at,
        transaction_id: p.provider_capture_id ?? p.provider_order_id,
      })),
      data.today,
    );

    const records = {
      business: profRes.data?.business_name || profRes.data?.full_name || null,
      default_currency: profRes.data?.currency ?? "USD",
      snapshot,
      invoices: invoices.map((i) => ({
        number: i.invoice_number,
        customer: i.customer?.name ?? null,
        company: i.customer?.company ?? null,
        status: effectiveStatus(i.status as StoredStatus, i.due_date, data.today),
        total: Number(i.total),
        currency: i.currency,
        issued: i.issue_date,
        due: i.due_date,
        paid_at: i.paid_at?.slice(0, 10) ?? null,
      })),
      payments: payments.map((p) => ({
        invoice: p.invoice?.invoice_number ?? null,
        status: p.status,
        amount: Number(p.amount),
        currency: p.currency,
        date: p.created_at.slice(0, 10),
        transaction_id: p.provider_capture_id ?? p.provider_order_id,
        failure_reason: p.failure_reason,
      })),
    };

    const answer = await runModel({
      instructions: [
        "You are PayPilot AI, a concise finance assistant for a freelancer.",
        "Answer ONLY from the JSON records provided below. Never invent invoices, customers, amounts or payments.",
        "If the records don't contain the answer, say so plainly.",
        "Statuses: 'overdue' = unpaid and past due; 'sent' = awaiting payment; 'paid' = confirmed by a verified PayPal payment; 'draft' = not sent yet.",
        "Never add amounts in different currencies together; report each currency separately.",
        "Refer to invoices by number (e.g. INV-0003) and format money with its currency. Use short markdown: bullet lists, bold key figures, no tables wider than 4 columns.",
        "When useful, end with one practical next step (e.g. who to follow up with first).",
        `Today is ${data.today}.`,
        "RECORDS:",
        JSON.stringify(records),
      ].join("\n"),
      input: data.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return { answer };
  });
