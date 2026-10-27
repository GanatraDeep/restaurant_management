"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPayments } from "@/hooks/use-admin";
import { formatDate, formatPlanPrice } from "@/lib/billing";

const VARIANT = { PAID: "secondary", CREATED: "outline", FAILED: "destructive" } as const;
const LABEL = { PAID: "Paid", CREATED: "Started", FAILED: "Failed" } as const;

export default function AdminPaymentsPage() {
  const { data, isLoading } = useAdminPayments();

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!data?.length) return <Card className="p-8 text-center text-sm text-muted-foreground">No payments yet.</Card>;

  return (
    <Card className="p-0">
      <ul className="divide-y divide-border text-sm">
        {data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{p.restaurant.name}</p>
              <p className="text-xs break-all text-muted-foreground">
                {p.plan?.name ?? "Plan"} · {formatDate(p.paidAt ?? p.createdAt)} · {p.razorpayPaymentId ?? p.razorpayOrderId}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium tabular-nums text-foreground">{formatPlanPrice(p.amountMinor, p.currency)}</span>
              <Badge variant={VARIANT[p.status]}>{LABEL[p.status]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
