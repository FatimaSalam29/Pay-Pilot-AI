import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "paid" | "sent" | "overdue" | "cancelled" }> = {
  completed: { label: "Successful", variant: "paid" },
  pending: { label: "Pending", variant: "sent" },
  failed: { label: "Failed", variant: "overdue" },
  cancelled: { label: "Cancelled", variant: "cancelled" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, variant: "cancelled" as const };
  return (
    <Badge variant={m.variant} className="gap-1.5 rounded-full px-2.5 font-medium">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {m.label}
    </Badge>
  );
}
