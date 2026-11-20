"use client";

import { use } from "react";
import { SopEditor } from "@/components/sop/sop-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { useSop } from "@/hooks/use-sop";

export default function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useSop(id);
  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />;
  return <SopEditor key={`${data.id}-${data.version}`} sop={data} />;
}
