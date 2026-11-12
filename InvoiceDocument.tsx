import { StatusBadge } from "@/components/app/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import { lineAmount, type EffectiveStatus, type Totals } from "@/lib/invoice-math";
import { cn } from "@/lib/utils";

export interface InvoiceDocumentProps {
  business: { name: string; email?: string | null | undefined; phone?: string | null | undefined; address?: string | null | undefined };
  customer: { name: string; email?: string | null | undefined; company?: string | null | undefined; address?: string | null | undefined } | null;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  totals: Totals;
  taxRate: number;
  notes?: string | null;
  status?: EffectiveStatus;
  className?: string;
}

export function InvoiceDocument(p: InvoiceDocumentProps) {
  const visibleItems = p.items.filter((i) => i.description.trim() || i.unitPrice);
  return (
    <article
      className={cn(
        "print-area relative overflow-hidden rounded-2xl border bg-paper text-foreground shadow-elevated",
        p.className,
      )}
    >
      <div className="h-1.5 bg-signal-gradient" />
      <div className="p-6 sm:p-10">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">From</p>
            <p className="mt-1 font-display text-lg font-semibold">{p.business.name || "Your business"}</p>
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {p.business.email && <p>{p.business.email}</p>}
              {p.business.phone && <p>{p.business.phone}</p>}
              {p.business.address && <p className="whitespace-pre-line">{p.business.address}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <h2 className="font-display text-3xl font-semibold tracking-tight">Invoice</h2>
            <p className="font-figure mt-1 text-sm text-muted-foreground">{p.number}</p>
            {p.status && (
              <div className="mt-3 sm:flex sm:justify-end">
                <StatusBadge status={p.status} />
              </div>
            )}
          </div>
        </header>

        <section className="mt-8 grid gap-6 rounded-xl bg-muted/60 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Bill to</p>
            {p.customer ? (
              <div className="mt-1 text-sm">
                <p className="font-semibold">{p.customer.name}</p>
                {p.customer.company && <p className="text-muted-foreground">{p.customer.company}</p>}
                {p.customer.email && <p className="text-muted-foreground">{p.customer.email}</p>}
                {p.customer.address && (
                  <p className="whitespace-pre-line text-muted-foreground">{p.customer.address}</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No customer selected</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Issued</p>
            <p className="mt-1 text-sm font-medium">{formatDate(p.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Due</p>
            <p className="mt-1 text-sm font-medium">{formatDate(p.dueDate)}</p>
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 font-semibold">Description</th>
              <th className="pb-3 text-right font-semibold">Qty</th>
              <th className="pb-3 text-right font-semibold">Price</th>
              <th className="pb-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  Add a service to see it here
                </td>
              </tr>
            )}
            {visibleItems.map((item, idx) => (
              <tr key={idx} className="border-b border-dashed last:border-0">
                <td className="py-3 pr-4">{item.description || "Untitled service"}</td>
                <td className="font-figure py-3 text-right">{item.quantity}</td>
                <td className="font-figure py-3 text-right">{formatMoney(item.unitPrice, p.currency)}</td>
                <td className="font-figure py-3 text-right font-medium">
                  {formatMoney(lineAmount(item.quantity, item.unitPrice), p.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-figure">{formatMoney(p.totals.subtotal, p.currency)}</dd>
            </div>
            {p.totals.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="font-figure">−{formatMoney(p.totals.discount, p.currency)}</dd>
              </div>
            )}
            {p.taxRate > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({p.taxRate}%)</dt>
                <dd className="font-figure">{formatMoney(p.totals.taxAmount, p.currency)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t pt-3">
              <dt className="font-semibold">Total due</dt>
              <dd className="font-figure text-xl font-semibold">{formatMoney(p.totals.total, p.currency)}</dd>
            </div>
          </dl>
        </div>

        {p.notes && (
          <div className="mt-8 border-t pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{p.notes}</p>
          </div>
        )}
      </div>
    </article>
  );
}
