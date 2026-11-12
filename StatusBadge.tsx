import { Badge } from "@/components/ui/badge";
import type { EffectiveStatus } from "@/lib/invoice-math";

const LABELS: Record<EffectiveStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  return (
    <Badge variant={status} className="gap-1.5 rounded-full px-2.5 font-medium">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </Badge>
  );
}
