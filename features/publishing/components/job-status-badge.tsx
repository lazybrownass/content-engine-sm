import type { PublishingJobStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<PublishingJobStatus, "default" | "secondary" | "outline" | "destructive"> = {
  SCHEDULED: "secondary",
  DISPATCHED: "outline",
  PUBLISHED: "default",
  PUBLISH_UNCONFIRMED: "destructive",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

export function JobStatusBadge({ status }: { status: PublishingJobStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="text-[10px]">
      {formatEnumLabel(status)}
    </Badge>
  );
}
