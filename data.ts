import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { StoredStatus } from "@/lib/invoice-math";

export type Customer = Tables<"customers">;
export type Profile = Tables<"profiles">;
export type InvoiceItem = Tables<"invoice_items">;
export type Invoice = Omit<Tables<"invoices">, "status"> & { status: StoredStatus };
export type InvoiceWithCustomer = Invoice & {
  customer: Pick<Customer, "id" | "name" | "email" | "company"> | null;
};
export type InvoiceFull = Invoice & { customer: Customer | null; items: InvoiceItem[] };

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export const profileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile | null> => {
      const uid = await currentUserId();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const customersQuery = () =>
  queryOptions({
    queryKey: ["customers"],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const invoicesQuery = () =>
  queryOptions({
    queryKey: ["invoices"],
    queryFn: async (): Promise<InvoiceWithCustomer[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customer:customers(id, name, email, company)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceWithCustomer[];
    },
  });

export type Payment = Tables<"payments">;
export type PaymentWithInvoice = Payment & {
  invoice: { id: string; invoice_number: string | null; customer: { name: string } | null } | null;
};

export const paymentsQuery = () =>
  queryOptions({
    queryKey: ["payments"],
    queryFn: async (): Promise<PaymentWithInvoice[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, invoice:invoices(id, invoice_number, customer:customers(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentWithInvoice[];
    },
  });

export const invoicePaymentsQuery = (invoiceId: string) =>
  queryOptions({
    queryKey: ["payments", "invoice", invoiceId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const invoiceQuery = (id: string) =>
  queryOptions({
    queryKey: ["invoices", id],
    queryFn: async (): Promise<InvoiceFull | null> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customer:customers(*), items:invoice_items(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const full = data as unknown as InvoiceFull;
      full.items = [...(full.items ?? [])].sort((a, b) => a.position - b.position);
      return full;
    },
  });
