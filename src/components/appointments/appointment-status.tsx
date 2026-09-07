import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/lib/types";

const statusConfig: Record<
  AppointmentStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "info" | "neutral" | "secondary" }
> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Cancelled", variant: "neutral" },
  rescheduled: { label: "Rescheduled", variant: "secondary" },
  "no-show": { label: "No Show", variant: "destructive" },
};

interface StatusBadgeProps {
  status: AppointmentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
