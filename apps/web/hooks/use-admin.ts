"use client";

import type {
  AdminUpdateSubscriptionDto,
  PlatformSettingsDto,
  SubscriptionPlanDto,
  SubscriptionStatus,
  UpdateSubscriptionPlanDto,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SubscriptionPlan } from "@/hooks/use-billing";

// F Cartel super-admin console (/admin).

export interface AdminOverview {
  restaurants: number;
  noSubscription: number;
  trialing: number;
  active: number;
  expired: number;
  cancelled: number;
  revenueMinor: number;
  activePlans: number;
}

export interface AdminPlatformSettings {
  requireSubscription: boolean;
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  razorpayWebhookConfigured: boolean;
}

export interface AdminPlan extends SubscriptionPlan {
  _count: { subscriptions: number };
}

export interface AdminRestaurant {
  id: string;
  name: string;
  logoUrl: string | null;
  createdAt: string;
  branches: number;
  owner: { name: string; email: string | null } | null;
  subscription: {
    status: SubscriptionStatus | "NONE";
    plan: { id: string; name: string } | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    accessEndsAt: string | null;
    trialUsed: boolean;
    notes: string | null;
  } | null;
}

export interface AdminPayment {
  id: string;
  amountMinor: number;
  currency: string;
  status: "CREATED" | "PAID" | "FAILED";
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  plan: { name: string } | null;
  restaurant: { name: string };
}

export function useAdminOverview() {
  return useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.get<AdminOverview>("/admin/overview") });
}

export function useAdminSettings() {
  return useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get<AdminPlatformSettings>("/admin/settings") });
}

export function useUpdateAdminSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PlatformSettingsDto) => api.patch<AdminPlatformSettings>("/admin/settings", dto),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "settings"], data);
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

export function useAdminPlans() {
  return useQuery({ queryKey: ["admin", "plans"], queryFn: () => api.get<AdminPlan[]>("/admin/plans") });
}

export function useAdminPlanActions() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["billing", "plans"] });
  };
  return {
    create: useMutation({ mutationFn: (dto: SubscriptionPlanDto) => api.post("/admin/plans", dto), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, dto }: { id: string; dto: UpdateSubscriptionPlanDto }) => api.patch(`/admin/plans/${id}`, dto),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete<{ archived?: boolean; deleted?: boolean }>(`/admin/plans/${id}`),
      onSuccess: done,
    }),
  };
}

export function useAdminRestaurants(search: string) {
  return useQuery({
    queryKey: ["admin", "restaurants", search],
    queryFn: () => api.get<AdminRestaurant[]>(`/admin/restaurants?search=${encodeURIComponent(search)}`),
  });
}

export function useAdminUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ restaurantId, dto }: { restaurantId: string; dto: AdminUpdateSubscriptionDto }) =>
      api.patch<AdminRestaurant>(`/admin/restaurants/${restaurantId}/subscription`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

export function useAdminPayments() {
  return useQuery({ queryKey: ["admin", "payments"], queryFn: () => api.get<AdminPayment[]>("/admin/payments") });
}

// ─── Releases (approve-before-deploy) ───────────────────────────────────────

export interface AppRelease {
  id: string;
  tag: string;
  commitSha: string | null;
  message: string | null;
  author: string | null;
  url: string | null;
  status: "AVAILABLE" | "DEPLOYING" | "DEPLOYED" | "FAILED" | "SKIPPED";
  error: string | null;
  decidedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
}

export interface ReleasesOverview {
  currentVersion: string;
  updaterConfigured: boolean;
  updaterReachable: boolean;
  updater: { state: string; version: string | null; step: string | null; error: string | null } | null;
  releases: AppRelease[];
}

export function useReleases() {
  return useQuery({
    queryKey: ["admin", "releases"],
    queryFn: () => api.get<ReleasesOverview>("/admin/releases"),
    // Poll fast while a deploy runs (the backend restarts underneath it, so a
    // few failed polls in a row are expected), slowly otherwise.
    refetchInterval: (q) => {
      const d = q.state.data;
      const deploying = d?.releases.some((r) => r.status === "DEPLOYING");
      return deploying || q.state.status === "error" ? 3000 : 30_000;
    },
    retry: false,
  });
}

export function useReleaseActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["admin", "releases"] });
  return {
    deploy: useMutation({ mutationFn: (id: string) => api.post(`/admin/releases/${id}/deploy`), onSettled: done }),
    skip: useMutation({ mutationFn: (id: string) => api.post(`/admin/releases/${id}/skip`), onSettled: done }),
    add: useMutation({
      mutationFn: (dto: { tag: string; message?: string }) => api.post("/admin/releases", dto),
      onSuccess: done,
    }),
  };
}
