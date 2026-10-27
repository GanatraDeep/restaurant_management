"use client";

import type {
  AggregatorItemMappingDto,
  AggregatorProvider,
  UpdateAggregatorConnectionDto,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AggregatorConnection {
  id: string;
  provider: AggregatorProvider;
  isEnabled: boolean;
  outletId: string | null;
  autoAccept: boolean;
  statusCallbackUrl: string | null;
  hasApiKey: boolean;
  lastOrderAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  mappings: number;
}

export interface AggregatorOrderRow {
  id: string;
  externalOrderId: string;
  state: "RECEIVED" | "FAILED";
  error: string | null;
  lastStatusSent: string | null;
  lastSyncError: string | null;
  createdAt: string;
  connection: { provider: AggregatorProvider };
  order: { id: string; orderNumber: string; status: string; acceptance: string; totalAmount: string } | null;
}

export interface AggregatorMapping {
  id: string;
  externalItemId: string;
  menuItem: { id: string; name: string };
}

const key = (branchId: string | null) => ["aggregators", branchId] as const;

export function useAggregators(branchId: string | null) {
  return useQuery({
    queryKey: key(branchId),
    queryFn: () =>
      api.get<{ connections: AggregatorConnection[]; orders: AggregatorOrderRow[] }>(
        `/aggregators?branchId=${branchId}`,
      ),
    enabled: !!branchId,
    refetchInterval: 30_000,
  });
}

export function useAggregatorMappings(branchId: string | null, connectionId: string | null) {
  return useQuery({
    queryKey: ["aggregators", branchId, "mappings", connectionId],
    queryFn: () => api.get<AggregatorMapping[]>(`/aggregators/${connectionId}/mappings?branchId=${branchId}`),
    enabled: !!branchId && !!connectionId,
  });
}

export function useAggregatorActions(branchId: string | null) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["aggregators", branchId] });
  const q = `?branchId=${branchId}`;
  return {
    connect: useMutation({
      mutationFn: (provider: AggregatorProvider) =>
        api.post<{ connection: AggregatorConnection; secret: string }>(`/aggregators/connect/${provider}${q}`),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, dto }: { id: string; dto: UpdateAggregatorConnectionDto }) =>
        api.patch<AggregatorConnection>(`/aggregators/${id}${q}`, dto),
      onSuccess: done,
    }),
    rotate: useMutation({
      mutationFn: (id: string) =>
        api.post<{ connection: AggregatorConnection; secret: string }>(`/aggregators/${id}/rotate-secret${q}`),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/aggregators/${id}${q}`), onSuccess: done }),
    test: useMutation({
      mutationFn: (id: string) => api.post<{ orderNumber?: string }>(`/aggregators/${id}/test-order${q}`),
      onSettled: done,
    }),
    retry: useMutation({
      mutationFn: (aggregatorOrderId: string) =>
        api.post<{ orderNumber?: string }>(`/aggregators/orders/${aggregatorOrderId}/retry${q}`),
      onSettled: done,
    }),
    upsertMapping: useMutation({
      mutationFn: ({ id, dto }: { id: string; dto: AggregatorItemMappingDto }) =>
        api.put<AggregatorMapping>(`/aggregators/${id}/mappings${q}`, dto),
      onSuccess: done,
    }),
    deleteMapping: useMutation({
      mutationFn: ({ id, mappingId }: { id: string; mappingId: string }) =>
        api.delete(`/aggregators/${id}/mappings/${mappingId}${q}`),
      onSuccess: done,
    }),
  };
}
