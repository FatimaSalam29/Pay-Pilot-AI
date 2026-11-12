// Real, text-based PDF invoices (selectable text, multi-page), generated in the browser with jsPDF.
// Call only from event handlers: jsPDF is loaded on demand so it never runs during SSR.
import { formatDate, formatMoney } from "@/lib/format";
import { lineAmount, type Totals } from "@/lib/invoice-math";

export interface PdfInvoiceData {
  number: string;
  statusLabel?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  paidAt?: string | null;
  business: { name: string; email?: string | null; phone?: string | null; address?: string | null };
  customer: { name: string; company?: string | null; email?: string | null; address?: string | null } | null;
  items: { description: string; quantity: number; unitPrice: number }[];
  totals: Totals;
  taxRate: number;
  notes?: string | null;
}

// Brand palette ("Private Ledger") as RGB for the PDF renderer.
const INK: [number, number, number] = [20, 44, 37];
const EVERGREEN: [number, number, number] = [24, 82, 66];
const SIGNAL: [number, number, number] = [186, 230, 100];
const MUTED: [number, number, number] = [104, 120, 112];
const RULE: [number, number, number] = [222, 228, 222];
const PANEL: [number, number, number] = [244, 246, 241];

const clean = (s: string) => s.replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-");
const money = (n: number, c: string) => clean(formatMoney(n, c));

export async function buildInvoicePdf(d: PdfInvoiceData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = 0;

  const text = (t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "right" | "center" } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? INK));
    doc.text(clean(t), x, yy, { align: opts.align ?? "left" });
  };
  const label = (t: string, x: number, yy: number, align: "left" | "right" = "left") =>
    text(t.toUpperCase(), x, yy, { size: 7.5, bold: true, color: MUTED, align });

  const ensureSpace = (needed: number) => {
    if (y + needed > H - 70) {
      doc.addPage();
      doc.setFillColor(...SIGNAL);
      doc.rect(0, 0, W, 4, "F");
      y = 56;
    }
  };

  // Header band
  doc.setFillColor(...EVERGREEN);
  doc.rect(0, 0, W, 6, "F");
  doc.setFillColor(...SIGNAL);
  doc.rect(0, 6, W, 3, "F");

  y = 64;
  label("From", M, y);
  text(d.business.name || "Your business", M, y + 18, { size: 14, bold: true });
  let by = y + 34;
  for (const line of [d.business.email, d.business.phone, ...(d.business.address?.split("\n") ?? [])]) {
    if (!line) continue;
    text(line, M, by, { size: 9.5, color: MUTED });
    by += 13;
  }

  text("Invoice", W - M, y + 14, { size: 26, bold: true, align: "right" });
  text(d.number, W - M, y + 32, { size: 10, color: MUTED, align: "right" });
  if (d.statusLabel) {
    const s = d.statusLabel.toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const w = doc.getTextWidth(s) + 18;
    const paid = d.statusLabel.toLowerCase() === "paid";
    doc.setFillColor(...(paid ? SIGNAL : PANEL));
    doc.roundedRect(W - M - w, y + 42, w, 18, 9, 9, "F");
    text(s, W - M - w / 2, y + 54, { size: 8, bold: true, color: paid ? INK : MUTED, align: "center" });
  }

  y = Math.max(by, y + 70) + 16;

  // Bill to / dates panel
  const billLines = d.customer
    ? [d.customer.company, d.customer.email, ...(d.customer.address?.split("\n") ?? [])].filter(Boolean) as string[]
    : [];
  const panelH = 44 + billLines.length * 12;
  doc.setFillColor(...PANEL);
  doc.roundedRect(M, y, W - 2 * M, panelH, 8, 8, "F");
  label("Bill to", M + 16, y + 20);
  text(d.customer?.name ?? "—", M + 16, y + 35, { size: 10.5, bold: true });
  billLines.forEach((l, i) => text(l, M + 16, y + 48 + i * 12, { size: 9, color: MUTED }));
  const colX = M + (W - 2 * M) * 0.55;
  label("Issued", colX, y + 20);
  text(formatDate(d.issueDate), colX, y + 35, { size: 10, bold: true });
  label(d.paidAt ? "Paid" : "Due", colX + 110, y + 20);
  text(formatDate(d.paidAt ?? d.dueDate), colX + 110, y + 35, { size: 10, bold: true });
  y += panelH + 30;

  // Items table
  const cQty = W - M - 210;
  const cPrice = W - M - 110;
  const cAmt = W - M;
  const descW = cQty - M - 40;
  label("Description", M, y);
  label("Qty", cQty, y, "right");
  label("Price", cPrice, y, "right");
  label("Amount", cAmt, y, "right");
  y += 8;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 18;

  const items = d.items.filter((i) => i.description.trim());
  for (const it of items) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(clean(it.description), descW) as string[];
    const rowH = Math.max(lines.length * 13, 13) + 12;
    ensureSpace(rowH);
    doc.setTextColor(...INK);
    doc.text(lines, M, y);
    text(String(it.quantity), cQty, y, { align: "right" });
    text(money(it.unitPrice, d.currency), cPrice, y, { align: "right" });
    text(money(lineAmount(it.quantity, it.unitPrice), d.currency), cAmt, y, { bold: true, align: "right" });
    y += rowH - 12;
    doc.setLineDashPattern([2, 2], 0);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 18;
  }

  // Totals
  ensureSpace(110);
  y += 4;
  const tl = W - M - 200;
  const row = (l: string, v: string) => {
    text(l, tl, y, { color: MUTED });
    text(v, W - M, y, { align: "right" });
    y += 17;
  };
  row("Subtotal", money(d.totals.subtotal, d.currency));
  if (d.totals.discount > 0) row("Discount", "-" + money(d.totals.discount, d.currency));
  if (d.taxRate > 0) row(`Tax (${d.taxRate}%)`, money(d.totals.taxAmount, d.currency));
  doc.setDrawColor(...RULE);
  doc.line(tl, y - 6, W - M, y - 6);
  y += 12;
  text(d.paidAt ? "Total paid" : "Total due", tl, y, { size: 11, bold: true });
  text(money(d.totals.total, d.currency), W - M, y, { size: 16, bold: true, align: "right" });
  y += 30;

  if (d.notes?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(clean(d.notes.trim()), W - 2 * M) as string[];
    ensureSpace(30 + lines.length * 13);
    doc.setDrawColor(...RULE);
    doc.line(M, y, W - M, y);
    y += 20;
    label("Notes", M, y);
    y += 15;
    doc.setTextColor(...MUTED);
    doc.text(lines, M, y);
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    text(`${d.number} · ${d.business.name}`, M, H - 30, { size: 8, color: MUTED });
    text(`Page ${p} of ${pages}`, W - M, H - 30, { size: 8, color: MUTED, align: "right" });
  }
  return doc;
}

export async function downloadInvoicePdf(d: PdfInvoiceData) {
  const doc = await buildInvoicePdf(d);
  doc.save(`${d.number || "invoice"}.pdf`);
}
