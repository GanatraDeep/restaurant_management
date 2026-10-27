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
