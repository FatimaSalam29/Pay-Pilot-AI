import { useMemo, useState, type ReactNode } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2, UserPlus, Users, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import type { Customer, Profile } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { computeTotals, lineAmount, SUPPORTED_CURRENCIES, todayISO, type Totals } from "@/lib/invoice-math";
import { parseInvoiceText } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export interface LineItem {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceFormValues {
  customerMode: "existing" | "new";
  customerId: string;
  newCustomer: { name: string; email: string; company: string; address: string };
  issueDate: string;
  dueDate: string;
  currency: string;
  items: LineItem[];
  taxRate: string;
  discount: string;
  notes: string;
}

export interface InvoiceSubmit {
  values: InvoiceFormValues;
  items: { description: string; quantity: number; unitPrice: number; amount: number }[];
  totals: Totals;
  taxRate: number;
}

export const newLine = (p: Partial<LineItem> = {}): LineItem => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitPrice: "",
  ...p,
});

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function defaultFormValues(customers: Customer[], profile: Profile | null): InvoiceFormValues {
  return {
    customerMode: customers.length ? "existing" : "new",
    customerId: customers[0]?.id ?? "",
    newCustomer: { name: "", email: "", company: "", address: "" },
    issueDate: todayISO(),
    dueDate: todayISO(addDays(new Date(), 14)),
    currency: (SUPPORTED_CURRENCIES as readonly string[]).includes(profile?.currency ?? "") ? profile!.currency : "USD",
    items: [newLine()],
    taxRate: "0",
    discount: "0",
    notes: "Thank you for your business!",
  };
}

export function InvoiceForm({
  customers,
  profile,
  initial,
  number,
  showAi,
  renderActions,
}: {
  customers: Customer[];
  profile: Profile | null;
  initial: InvoiceFormValues;
  number: string;
  showAi?: boolean;
  /** Receives a `submit` helper that validates and returns the payload (or null on error). */
  renderActions: (submit: () => InvoiceSubmit | null) => ReactNode;
}) {
  const [v, setV] = useState<InvoiceFormValues>(initial);
  const set = <K extends keyof InvoiceFormValues>(k: K, val: InvoiceFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const numericItems = v.items.map((i) => ({ description: i.description, quantity: num(i.quantity), unitPrice: num(i.unitPrice) }));
  const totals = useMemo(
    () => computeTotals(numericItems, num(v.taxRate), num(v.discount)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(numericItems), v.taxRate, v.discount],
  );

  const selectedCustomer = v.customerMode === "existing" ? customers.find((c) => c.id === v.customerId) ?? null : null;
  const previewCustomer = v.customerMode === "existing" ? selectedCustomer : v.newCustomer.name ? v.newCustomer : null;

  const updateItem = (key: string, patch: Partial<LineItem>) =>
    setV((p) => ({ ...p, items: p.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  function validate(): string | null {
    if (v.customerMode === "existing" && !v.customerId) return "Choose a customer";
    if (v.customerMode === "new" && !v.newCustomer.name.trim()) return "Enter the customer's name";
    if (v.customerMode === "new" && v.newCustomer.email && !/^\S+@\S+\.\S+$/.test(v.newCustomer.email))
      return "Customer email looks invalid";
    if (!v.dueDate) return "Pick a due date";
    if (v.dueDate < v.issueDate) return "Due date can't be before the issue date";
    const real = numericItems.filter((i) => i.description.trim());
    if (real.length === 0) return "Add at least one service";
    if (real.some((i) => i.quantity <= 0)) return "Quantities must be greater than zero";
    if (real.some((i) => i.unitPrice < 0)) return "Prices can't be negative";
    if (num(v.taxRate) < 0 || num(v.taxRate) > 100) return "Tax rate must be between 0 and 100";
    if (num(v.discount) < 0) return "Discount can't be negative";
    if (totals.total <= 0) return "Invoice total must be greater than zero";
    return null;
  }

  function submit(): InvoiceSubmit | null {
    const err = validate();
    if (err) {
      toast.error(err);
      return null;
    }
    return {
      values: v,
      items: numericItems
        .filter((i) => i.description.trim())
        .map((i) => ({ description: i.description.trim(), quantity: i.quantity, unitPrice: i.unitPrice, amount: lineAmount(i.quantity, i.unitPrice) })),
      totals,
      taxRate: num(v.taxRate),
    };
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {showAi && <AiPanel customers={customers} profile={profile} onApply={(patch) => setV((p) => ({ ...p, ...patch }))} />}

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Customer</h2>
            <div className="flex rounded-lg border p-0.5 text-xs">
              <button
                type="button"
                disabled={customers.length === 0}
                onClick={() => set("customerMode", "existing")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors disabled:opacity-40",
                  v.customerMode === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Users className="size-3.5" /> Existing
              </button>
              <button
                type="button"
                onClick={() => set("customerMode", "new")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
                  v.customerMode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <UserPlus className="size-3.5" /> New
              </button>
            </div>
          </div>

          {v.customerMode === "existing" ? (
            <div className="space-y-1.5">
              <Label>Bill to</Label>
              <Select value={v.customerId} onValueChange={(id) => set("customerId", id)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` · ${c.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *">
                <Input value={v.newCustomer.name} onChange={(e) => set("newCustomer", { ...v.newCustomer, name: e.target.value })} placeholder="Jane Cooper" maxLength={120} />
              </Field>
              <Field label="Email">
                <Input type="email" value={v.newCustomer.email} onChange={(e) => set("newCustomer", { ...v.newCustomer, email: e.target.value })} placeholder="jane@acme.com" maxLength={200} />
              </Field>
              <Field label="Company">
                <Input value={v.newCustomer.company} onChange={(e) => set("newCustomer", { ...v.newCustomer, company: e.target.value })} placeholder="Acme Inc." maxLength={120} />
              </Field>
              <Field label="Address">
                <Input value={v.newCustomer.address} onChange={(e) => set("newCustomer", { ...v.newCustomer, address: e.target.value })} placeholder="City, Country" maxLength={300} />
              </Field>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Issue date">
              <Input type="date" value={v.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={v.dueDate} min={v.issueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </Field>
            <Field label="Currency">
              <Select value={v.currency} onValueChange={(c) => set("currency", c)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set("dueDate", todayISO(addDays(new Date(v.issueDate + "T00:00:00"), d)))}
                className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                Net {d}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Services</h2>
          <div className="space-y-3">
            {v.items.map((item, idx) => (
              <div key={item.key} className="grid grid-cols-[90px_1fr_36px] items-end gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[90px_130px_1fr_36px]">
                <div className="col-span-3 space-y-1 sm:col-span-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Service {idx + 1}</span>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    placeholder="Website design, 10 pages"
                    maxLength={300}
                    aria-label="Description"
                    className="bg-card"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Qty</span>
                  <Input type="number" min="0" step="any" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} aria-label="Quantity" className="font-figure bg-card" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Price</span>
                  <Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })} placeholder="0.00" aria-label="Unit price" className="font-figure bg-card" />
                </div>
                <p className="font-figure col-span-2 pb-2 text-right text-sm font-semibold sm:col-span-1 sm:row-start-2 sm:col-start-3">
                  {formatMoney(lineAmount(num(item.quantity), num(item.unitPrice)), v.currency)}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={v.items.length === 1}
                  onClick={() => set("items", v.items.filter((i) => i.key !== item.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => set("items", [...v.items, newLine()])}>
            <Plus /> Add service
          </Button>

          <div className="mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
            <Field label="Tax rate (%)">
              <Input type="number" min="0" max="100" step="0.01" value={v.taxRate} onChange={(e) => set("taxRate", e.target.value)} className="font-figure" />
            </Field>
            <Field label={`Discount (${v.currency})`}>
              <Input type="number" min="0" step="0.01" value={v.discount} onChange={(e) => set("discount", e.target.value)} className="font-figure" />
            </Field>
          </div>
          <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/70 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total due</span>
            <span className="font-figure text-xl font-semibold">{formatMoney(totals.total, v.currency)}</span>
          </div>
        </Card>

        <Card className="p-6">
          <Field label="Notes for the customer">
            <Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
          </Field>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">{renderActions(submit)}</div>
      </div>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live preview</p>
        <InvoiceDocument
          business={{
            name: profile?.business_name || profile?.full_name || "Your business",
            email: profile?.email,
            phone: profile?.phone,
            address: profile?.address,
          }}
          customer={previewCustomer}
          number={number}
          issueDate={v.issueDate}
          dueDate={v.dueDate}
          currency={v.currency}
          items={numericItems}
          totals={totals}
          taxRate={num(v.taxRate)}
          notes={v.notes}
        />
      </div>
    </div>
  );
}

const EXAMPLE =
  "Create an invoice for John Doe for website development worth $500, with a $10 discount, 5% tax and due date 23 November 2026.";

function AiPanel({
  customers,
  profile,
  onApply,
}: {
  customers: Customer[];
  profile: Profile | null;
  onApply: (patch: Partial<InvoiceFormValues>) => void;
}) {
  const parse = useServerFn(parseInvoiceText);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);

  async function run() {
    if (text.trim().length < 5) {
      toast.error("Describe the invoice in a sentence or two");
      return;
    }
    setBusy(true);
    setWarnings([]);
    try {
      const { value, warnings: w } = await parse({
        data: { text, today: todayISO(), defaultCurrency: profile?.currency ?? "USD" },
      });
      const patch: Partial<InvoiceFormValues> = {};
      if (value.customerName) {
        const match = customers.find((c) => c.name.trim().toLowerCase() === value.customerName!.toLowerCase());
        if (match) {
          patch.customerMode = "existing";
          patch.customerId = match.id;
        } else {
          patch.customerMode = "new";
          patch.newCustomer = {
            name: value.customerName,
            email: value.customerEmail ?? "",
            company: value.customerCompany ?? "",
            address: "",
          };
        }
      }
      if (value.items.length) {
        patch.items = value.items.map((i) =>
          newLine({ description: i.description, quantity: String(i.quantity), unitPrice: i.unit_price ? String(i.unit_price) : "" }),
        );
      }
      patch.taxRate = String(value.taxRate);
      patch.discount = String(value.discount);
      if (value.dueDate) patch.dueDate = value.dueDate;
      if (value.currency) patch.currency = value.currency;
      if (value.notes) patch.notes = value.notes;
      onApply(patch);
      setWarnings(w);
      setFilled(true);
      toast.success(w.length ? "Form filled — please check the highlighted notes" : "Form filled — review and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="relative overflow-hidden border-primary/25 p-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-signal-gradient" />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Describe it — AI fills the form</h2>
          <p className="text-xs text-muted-foreground">Nothing is saved until you review and click save.</p>
        </div>
      </div>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder={EXAMPLE}
        aria-label="Describe the invoice"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="hero" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} {filled ? "Regenerate" : "Generate invoice"}
        </Button>
        {!text && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>
            Try the example
          </Button>
        )}
      </div>
      {warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-lg bg-warning-soft p-3 text-xs text-foreground">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
