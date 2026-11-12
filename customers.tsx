import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { customersQuery, invoicesQuery, profileQuery } from "@/lib/data";
import { formatMoney, initials } from "@/lib/format";
import { effectiveStatus, todayISO } from "@/lib/invoice-math";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — PayPilot AI" },
      { name: "description", content: "Manage the clients you invoice and see what each one owes." },
      { property: "og:title", content: "Customers — PayPilot AI" },
      { property: "og:description", content: "Manage the clients you invoice and see what each one owes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(customersQuery()),
      context.queryClient.ensureQueryData(invoicesQuery()),
      context.queryClient.ensureQueryData(profileQuery()),
    ]),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: customers } = useSuspenseQuery(customersQuery());
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: profile } = useSuspenseQuery(profileQuery());
  const currency = profile?.currency ?? "USD";
  const [q, setQ] = useState("");
  const today = todayISO();

  const summary = useMemo(() => {
    const map = new Map<string, { count: number; paid: number; outstanding: number }>();
    for (const inv of invoices) {
      if (!inv.customer_id || inv.currency !== currency) continue;
      const s = effectiveStatus(inv.status, inv.due_date, today);
      const row = map.get(inv.customer_id) ?? { count: 0, paid: 0, outstanding: 0 };
      row.count++;
      if (s === "paid") row.paid += Number(inv.total);
      else if (s !== "cancelled") row.outstanding += Number(inv.total);
      map.set(inv.customer_id, row);
    }
    return map;
  }, [invoices, currency, today]);

  const filtered = customers.filter((c) =>
    [c.name, c.email, c.company].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="Everyone you bill, with their totals at a glance."
        actions={<AddCustomerDialog />}
      />

      <div className="relative mb-4 md:w-80">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {customers.length === 0 ? "No customers yet. Add one, or create an invoice for a new customer." : "No matches."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const s = summary.get(c.id) ?? { count: 0, paid: 0, outstanding: 0 };
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.company || "Individual"}</p>
                  </div>
                </div>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="mt-4 flex items-center gap-2 truncate text-sm text-muted-foreground hover:text-foreground">
                    <Mail className="size-3.5 shrink-0" /> {c.email}
                  </a>
                )}
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Invoices</dt>
                    <dd className="font-figure mt-0.5 text-sm font-semibold">{s.count}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd className="font-figure mt-0.5 text-sm font-semibold text-success">{formatMoney(s.paid, currency, { compact: true })}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Owed</dt>
                    <dd className="font-figure mt-0.5 text-sm font-semibold">{formatMoney(s.outstanding, currency, { compact: true })}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddCustomerDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", address: "" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) { toast.error("Email looks invalid"); return; }
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Customer added");
    setForm({ name: "", email: "", company: "", phone: "", address: "" });
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="hero">
          <UserPlus /> Add customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="c-company">Company</Label>
            <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="c-address">Address</Label>
            <Textarea id="c-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" variant="hero" disabled={saving}>
              Save customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
