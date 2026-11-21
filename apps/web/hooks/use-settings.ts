"use client";

import type {
  BranchSettingsDto,
  RestaurantSettingsDto,
  TaxMode,
  TaxRegime,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RestaurantSettings {
  id: string;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  upiVpa: string | null;
  upiPayeeName: string | null;
  receiptFooter: string | null;
  loyaltyPointValue: string;
  loyaltyEarnPerCurrency: number;
}

export interface BranchSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  gstNumber: string | null;
  country: string;
  taxRegime: TaxRegime;
  taxMode: TaxMode;
  taxLabel: string | null;
  taxId: string | null;
  autoConfirmOrders: boolean;
  autoConfirmReservations: boolean;
  qrPayFirst: boolean;
  qrOtpRequired: boolean;
  qrCollectGuestInfo: boolean;
  takeawayChargePerOrder: string;
  takeawayChargeOnDelivery: boolean;
  tokenEnabled: boolean;
  kioskToken: string | null;
  kioskDineInEnabled: boolean;
  kioskTakeawayEnabled: boolean;
  printerPaperWidthMm: 58 | 80;
  printerCodepage: "CP437" | "CP850" | "CP858" | "CP1252";
  printerColumns: number | null;
  printerConnection: "USB" | "NETWORK";
  printerHost: string | null;
  printerPort: number;
}

export function useSettings(branchId: string | null) {
  return useQuery({
    queryKey: ["settings", branchId],
    queryFn: () =>
      api.get<{ restaurant: RestaurantSettings; branch: BranchSettings }>(
        `/settings?branchId=${branchId}`,
      ),
    enabled: !!branchId,
  });
}

export interface AppDownloads {
  androidApkUrl: string | null;
  desktopAppUrl: string | null;
  desktopAppVersion: string | null;
}

/** Android / desktop app download links (owner only; the server checks too). */
export function useAppDownloads(enabled: boolean) {
  return useQuery({
    queryKey: ["settings", "apps"],
    queryFn: () => api.get<AppDownloads>("/settings/apps"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Branch switches every staff member's screens follow (GET /settings needs settings.manage). */
export function useBranchFeatures(branchId: string | null) {
  return useQuery({
    queryKey: ["settings", "features", branchId],
    queryFn: () =>
      api.get<{ tokenEnabled: boolean; takeawayChargePerOrder?: number; takeawayChargeOnDelivery?: boolean }>(
        `/settings/features?branchId=${branchId}`,
      ),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

// The restaurant's name + logo, readable by every signed-in staff member
// (GET /settings itself needs settings.manage) — used by the app shell.
export function useRestaurantBranding() {
  return useQuery({
    queryKey: ["settings", "branding"],
    queryFn: () => api.get<{ name: string; logoUrl: string | null }>("/settings/branding"),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateRestaurantSettings(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RestaurantSettingsDto) => api.patch("/settings/restaurant", dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", branchId] });
      queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
    },
  });
}

export function useUploadRestaurantLogo() {
  return useMutation({
    mutationFn: (file: File) => api.upload<{ url: string }>("/settings/restaurant/logo", file),
  });
}

export function useUpdateBranchSettings(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BranchSettingsDto) =>
      api.patch(`/settings/branch?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useSetKiosk(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "enable" | "rotate" | "disable") =>
      api.post<{ kioskToken: string | null }>(`/settings/kiosk/${action}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", branchId] }),
  });
}
